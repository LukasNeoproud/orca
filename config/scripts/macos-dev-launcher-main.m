#import <Foundation/Foundation.h>

int main(int argc, const char *argv[]) {
  @autoreleasepool {
    NSBundle *bundle = NSBundle.mainBundle;
    NSString *resources = bundle.resourcePath;
    NSString *configurationPath = [resources stringByAppendingPathComponent:@"launch.json"];
    NSError *error = nil;
    NSData *data = [NSData dataWithContentsOfFile:configurationPath options:0 error:&error];
    NSDictionary *configuration = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:&error] : nil;
    if (![configuration isKindOfClass:NSDictionary.class]) {
      NSLog(@"Orca Dev: cannot read launcher configuration: %@", error);
      return 1;
    }
    NSString *nodePath = configuration[@"nodePath"];
    NSString *repoRoot = configuration[@"repoRoot"];
    NSString *scriptPath = [resources stringByAppendingPathComponent:@"macos-dev-launcher.mjs"];
    if (![nodePath isKindOfClass:NSString.class] || ![repoRoot isKindOfClass:NSString.class] ||
        ![NSFileManager.defaultManager isExecutableFileAtPath:nodePath] ||
        ![NSFileManager.defaultManager fileExistsAtPath:scriptPath]) {
      NSLog(@"Orca Dev: launcher resources or Node are unavailable. Rebuild the launcher.");
      return 1;
    }
    NSMutableArray<NSString *> *arguments = [NSMutableArray arrayWithObjects:scriptPath, configurationPath, nil];
    for (int index = 1; index < argc; index++) {
      NSString *argument = [NSString stringWithUTF8String:argv[index]];
      if ([argument isEqualToString:@"--check"]) {
        printf("Orca Dev launcher configuration is valid.\n");
        return 0;
      }
      [arguments addObject:argument];
    }
    NSString *logDirectory = [NSHomeDirectory() stringByAppendingPathComponent:@"Library/Logs/Orca Dev"];
    if (![NSFileManager.defaultManager createDirectoryAtPath:logDirectory withIntermediateDirectories:YES attributes:nil error:&error]) {
      NSLog(@"Orca Dev: cannot create log directory: %@", error);
      return 1;
    }
    NSString *logPath = [logDirectory stringByAppendingPathComponent:@"launcher.log"];
    if (![NSFileManager.defaultManager fileExistsAtPath:logPath]) {
      [NSFileManager.defaultManager createFileAtPath:logPath contents:nil attributes:nil];
    }
    NSFileHandle *log = [NSFileHandle fileHandleForWritingAtPath:logPath];
    if (!log) {
      NSLog(@"Orca Dev: cannot open %@", logPath);
      return 1;
    }
    [log seekToEndOfFile];
    // Request protected-folder access as Orca Dev, before launching a shell or detached service.
    if (![NSData dataWithContentsOfFile:[repoRoot stringByAppendingPathComponent:@"package.json"] options:0 error:&error]) {
      NSString *message = [NSString stringWithFormat:@"%@ Orca Dev: cannot access %@: %@\nAllow Orca Dev access to Documents in System Settings > Privacy & Security > Files and Folders.\n", NSDate.date, repoRoot, error];
      [log writeData:[message dataUsingEncoding:NSUTF8StringEncoding]];
      NSLog(@"%@", message);
      return 1;
    }
    NSTask *task = [[NSTask alloc] init];
    task.executableURL = [NSURL fileURLWithPath:nodePath];
    task.arguments = arguments;
    task.standardOutput = log;
    task.standardError = log;
    if (![task launchAndReturnError:&error]) {
      NSString *message = [NSString stringWithFormat:@"%@ Orca Dev: cannot start Node: %@\n", NSDate.date, error];
      [log writeData:[message dataUsingEncoding:NSUTF8StringEncoding]];
      return 1;
    }
    [task waitUntilExit];
    return task.terminationStatus;
  }
}
