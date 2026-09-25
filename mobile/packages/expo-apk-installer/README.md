# Expo APK installer

`installApk(localApkPath)` accepts a fully downloaded APK in the app's cache or files directory. It accepts an absolute path or a `file://` URI, such as an Expo FileSystem download URI. It opens Android's per-app unknown-source settings if permission is missing, then shows the system install confirmation. The promise resolves after the installer reports success and rejects on cancellation, permission denial, missing file, or installer failure. Only one installation request may be active at a time.

The caller owns the downloaded file and should keep it until the promise settles. Android does not allow this module to install silently.
