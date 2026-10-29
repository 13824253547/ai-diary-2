const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function readPackageVersion(packageName) {
  const packagePath = path.join(root, 'node_modules', packageName, 'package.json');
  return JSON.parse(fs.readFileSync(packagePath, 'utf8')).version;
}

function assertVersion(packageName, expectedVersion) {
  const actualVersion = readPackageVersion(packageName);
  if (actualVersion !== expectedVersion) {
    throw new Error(
      `Expected ${packageName}@${expectedVersion}, found ${packageName}@${actualVersion}. ` +
        'Review the iOS motion API patch before upgrading this dependency.',
    );
  }
}

function replaceBlock(source, filePath, startMarker, endMarker, replacement = '') {
  const start = source.indexOf(startMarker);
  if (start === -1) {
    return source;
  }

  const end = source.indexOf(endMarker, start);
  if (end === -1) {
    throw new Error(`Could not find patch boundary in ${path.relative(root, filePath)}.`);
  }

  return source.slice(0, start) + replacement + source.slice(end);
}

function replaceText(source, oldText, newText) {
  if (!source.includes(oldText)) {
    return source;
  }
  return source.replace(oldText, newText);
}

function writeIfChanged(filePath, nextSource) {
  if (fs.readFileSync(filePath, 'utf8') !== nextSource) {
    fs.writeFileSync(filePath, nextSource);
  }
}

function pruneExpoLocation() {
  assertVersion('expo-location', '57.0.22');

  const iosRoot = path.join(root, 'node_modules/expo-location/ios');
  const modulePath = path.join(iosRoot, 'LocationModule.swift');
  let source = fs.readFileSync(modulePath, 'utf8');

  source = replaceText(source, 'import CoreMotion\n', '');
  source = replaceText(source, 'private let EVENT_MOTION_ACTIVITY_CHANGED = "Expo.motionActivityChanged"\n', '');
  source = replaceText(source, '  private lazy var motionActivityStreamers = [Int: MotionActivityStreamer]()\n', '');
  source = replaceText(source, '          MotionActivityPermissionRequester()\n', '');
  source = replaceText(
    source,
    '    Events(EVENT_LOCATION_CHANGED, EVENT_HEADING_CHANGED, EVENT_LOCATION_ERROR, EVENT_MOTION_ACTIVITY_CHANGED)',
    '    Events(EVENT_LOCATION_CHANGED, EVENT_HEADING_CHANGED, EVENT_LOCATION_ERROR)',
  );
  source = replaceBlock(
    source,
    modulePath,
    '    AsyncFunction("watchMotionActivityImplAsync")',
    '    AsyncFunction("removeWatchAsync")',
  );
  source = replaceText(
    source,
    `      if let streamer = motionActivityStreamers[watchId] {
        streamer.stopStreaming()
      }
      motionActivityStreamers[watchId] = nil
`,
    '',
  );
  source = replaceText(source, '      locationStreamers[watchId] = nil\n\n    }', '      locationStreamers[watchId] = nil\n    }');
  source = replaceBlock(
    source,
    modulePath,
    '    AsyncFunction("getMotionActivityPermissionsAsync")',
    '    AsyncFunction("getPermissionsAsync")',
  );
  writeIfChanged(modulePath, source);

  const exceptionsPath = path.join(iosRoot, 'LocationExceptions.swift');
  let exceptions = fs.readFileSync(exceptionsPath, 'utf8');
  exceptions = replaceBlock(
    exceptions,
    exceptionsPath,
    '  internal final class MotionActivityUnavailable: Exception {',
    '\n}',
  );
  exceptions = replaceText(exceptions, '\n\n\n}', '\n\n}');
  writeIfChanged(exceptionsPath, exceptions);

  for (const relativePath of [
    'Requesters/MotionActivityPermissionRequester.swift',
    'Providers/MotionActivityStreamer.swift',
  ]) {
    const filePath = path.join(iosRoot, relativePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  const remainingFiles = [
    modulePath,
    exceptionsPath,
    path.join(iosRoot, 'Requesters/MotionActivityPermissionRequester.swift'),
    path.join(iosRoot, 'Providers/MotionActivityStreamer.swift'),
  ].filter((filePath) => fs.existsSync(filePath));
  const remainingMotionReferences = remainingFiles.some((filePath) =>
    /CoreMotion|CMMotion|MotionActivity|EVENT_MOTION_ACTIVITY_CHANGED/.test(
      fs.readFileSync(filePath, 'utf8'),
    ),
  );
  if (remainingMotionReferences) {
    throw new Error('Expo Location still contains iOS motion activity references after pruning.');
  }
}

function pruneReanimated() {
  assertVersion('react-native-reanimated', '4.5.1');
  assertVersion('expo-modules-autolinking', '57.0.13');

  const reanimatedRoot = path.join(root, 'node_modules/react-native-reanimated');
  const headerPath = path.join(reanimatedRoot, 'apple/reanimated/apple/sensor/ReanimatedSensor.h');
  let header = fs.readFileSync(headerPath, 'utf8');
  header = replaceText(
    header,
    '#import <reanimated/apple/sensor/ReanimatedSensorType.h>',
    '#import <Foundation/Foundation.h>\n#import <reanimated/apple/sensor/ReanimatedSensorType.h>',
  );
  header = replaceText(
    header,
    `#if !TARGET_OS_TV && !TARGET_OS_OSX
#import <CoreMotion/CoreMotion.h>
#endif

`,
    '',
  );
  header = replaceText(
    header,
    `#if !TARGET_OS_TV && !TARGET_OS_OSX
  CMMotionManager *_motionManager;
#endif
`,
    '',
  );
  writeIfChanged(headerPath, header);

  const implementationPath = path.join(reanimatedRoot, 'apple/reanimated/apple/sensor/ReanimatedSensor.m');
  const implementation = `#import <reanimated/apple/sensor/ReanimatedSensor.h>

@implementation ReanimatedSensor

- (instancetype)init:(ReanimatedSensorType)sensorType
             interval:(int)interval
    iosReferenceFrame:(int)iosReferenceFrame
               setter:(void (^)(double[], int))setter
{
  self = [super init];
  if (self) {
    _sensorType = sensorType;
    _interval = interval;
    _referenceFrame = iosReferenceFrame;
    _setter = setter;
  }
  return self;
}

- (bool)initialize
{
  return false;
}

- (bool)initializeGyroscope
{
  return false;
}

- (bool)initializeAccelerometer
{
  return false;
}

- (bool)initializeGravity
{
  return false;
}

- (bool)initializeMagnetometer
{
  return false;
}

- (bool)initializeOrientation
{
  return false;
}

- (void)cancel
{
}

@end
`;
  writeIfChanged(implementationPath, implementation);

  const spmConfigPath = path.join(
    root,
    'node_modules/expo-modules-autolinking/external-configs/ios/react-native-reanimated/spm.config.json',
  );
  const spmConfig = fs.readFileSync(spmConfigPath, 'utf8');
  const nextSpmConfig = spmConfig.replace('"QuartzCore", "CoreMotion", "CoreGraphics"', '"QuartzCore", "CoreGraphics"');
  writeIfChanged(spmConfigPath, nextSpmConfig);

  const sensorHeader = fs.readFileSync(headerPath, 'utf8');
  const sensorImplementation = fs.readFileSync(implementationPath, 'utf8');
  if (/CoreMotion|CMMotion/.test(sensorHeader) || /CoreMotion|CMMotion/.test(sensorImplementation)) {
    throw new Error('Reanimated still contains iOS Core Motion references after pruning.');
  }
}

pruneExpoLocation();
pruneReanimated();
