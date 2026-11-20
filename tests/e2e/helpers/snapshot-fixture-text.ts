/** A 5×7 pixel font for the few capitals the invented snapshot screens print. */
const GLYPHS: Record<string, readonly string[]> = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100']
}

const GLYPH_COLUMNS = 5
const GLYPH_GAP = 1

/** One text line as square dots of `scale` pixels, with its top-left corner at `x`, `y`. */
export function textDots(
  text: string,
  origin: { x: number; y: number; scale: number }
): { x: number; y: number; width: number; height: number }[] {
  const { scale } = origin
  return [...text].flatMap((character, index) => {
    const rows = GLYPHS[character]
    if (!rows && character !== ' ') {
      throw new Error(`No glyph for ${character}`)
    }
    const left = origin.x + index * (GLYPH_COLUMNS + GLYPH_GAP) * scale
    return (rows ?? []).flatMap((row, rowIndex) =>
      [...row].flatMap((bit, column) =>
        bit === '1'
          ? [
              {
                x: left + column * scale,
                y: origin.y + rowIndex * scale,
                width: scale,
                height: scale
              }
            ]
          : []
      )
    )
  })
}
