import android.graphics.ImageFormat;
import android.media.Image;
import android.media.MediaCodec;
import android.media.MediaFormat;
import java.nio.ByteBuffer;
import java.nio.file.Files;
import java.nio.file.Paths;

public final class CodecSmoke {
  private static int channel(Image.Plane plane, int x, int y) {
    ByteBuffer bytes = plane.getBuffer();
    return bytes.get(y * plane.getRowStride() + x * plane.getPixelStride()) & 0xff;
  }

  private static String color(Image image) {
    if (image == null || image.getFormat() != ImageFormat.YUV_420_888) {
      return "pixel=unavailable";
    }
    int x = image.getWidth() / 2;
    int y = image.getHeight() / 2;
    Image.Plane[] planes = image.getPlanes();
    int luma = channel(planes[0], x, y);
    int u = channel(planes[1], x / 2, y / 2);
    int v = channel(planes[2], x / 2, y / 2);
    int c = Math.max(0, luma - 16);
    int red = (298 * c + 409 * (v - 128) + 128) >> 8;
    int green = (298 * c - 100 * (u - 128) - 208 * (v - 128) + 128) >> 8;
    int blue = (298 * c + 516 * (u - 128) + 128) >> 8;
    if (red <= green + 50 || red <= blue + 50) {
      throw new IllegalStateException("decoded center is not red: " + red + "," + green + "," + blue);
    }
    return "rgb=" + red + "," + green + "," + blue;
  }

  public static void main(String[] args) throws Exception {
    String codec = args[0];
    String mime = codec.equals("h264") ? MediaFormat.MIMETYPE_VIDEO_AVC
        : codec.equals("hevc") ? MediaFormat.MIMETYPE_VIDEO_HEVC
        : MediaFormat.MIMETYPE_VIDEO_AV1;
    byte[] sample = Files.readAllBytes(Paths.get(args[1]));
    MediaCodec decoder = MediaCodec.createDecoderByType(mime);
    try {
      decoder.configure(MediaFormat.createVideoFormat(mime, 64, 48), null, null, 0);
      decoder.start();
      MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
      boolean queuedSample = false;
      boolean queuedEnd = false;
      boolean decoded = false;
      String pixel = "pixel=unavailable";
      long deadline = System.nanoTime() + 10_000_000_000L;
      while (System.nanoTime() < deadline && !decoded) {
        int input = decoder.dequeueInputBuffer(20_000);
        if (input >= 0 && !queuedSample) {
          decoder.getInputBuffer(input).put(sample);
          decoder.queueInputBuffer(input, 0, sample.length, 0, 0);
          queuedSample = true;
        } else if (input >= 0 && !queuedEnd) {
          decoder.queueInputBuffer(input, 0, 0, 1, MediaCodec.BUFFER_FLAG_END_OF_STREAM);
          queuedEnd = true;
        }
        int output = decoder.dequeueOutputBuffer(info, 20_000);
        if (output >= 0) {
          if (info.size > 0) {
            Image image = decoder.getOutputImage(output);
            try {
              pixel = color(image);
            } finally {
              if (image != null) image.close();
            }
            decoded = true;
          }
          decoder.releaseOutputBuffer(output, false);
        }
      }
      if (!decoded) throw new IllegalStateException("No decoded frame before timeout");
      MediaFormat output = decoder.getOutputFormat();
      int width = output.getInteger(MediaFormat.KEY_WIDTH);
      int height = output.getInteger(MediaFormat.KEY_HEIGHT);
      if (width != 64 || height != 48) {
        throw new IllegalStateException("Wrong decoded size: " + width + "x" + height);
      }
      System.out.println("PASS codec=" + codec + " decoder=" + decoder.getName() + " size=" + width + "x" + height + " " + pixel);
    } finally {
      decoder.stop();
      decoder.release();
    }
  }
}
