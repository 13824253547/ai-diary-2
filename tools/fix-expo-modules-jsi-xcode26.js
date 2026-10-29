#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const projectRoot = process.cwd();
const expoModulesRoot = path.join(
  projectRoot,
  "node_modules",
  "expo-modules-jsi",
  "apple",
  "Sources"
);

function walk(dir, predicate, results = []) {
  if (!fs.existsSync(dir)) {
    return results;
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, predicate, results);
    } else if (predicate(fullPath)) {
      results.push(fullPath);
    }
  }
  return results;
}

function replaceInFile(filePath, transform) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const original = fs.readFileSync(filePath, "utf8");
  const next = transform(original);

  if (next === original) {
    return false;
  }

  fs.writeFileSync(filePath, next);
  return true;
}

function getXcodeVersion() {
  try {
    const output = execSync("xcodebuild -version", {
      cwd: projectRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const match = output.match(/Xcode\s+([0-9.]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

if (!fs.existsSync(expoModulesRoot)) {
  console.log("[fix-expo-modules-jsi-xcode26] expo-modules-jsi not found, skipping");
  process.exit(0);
}

const xcodeVersion = getXcodeVersion();
if (!xcodeVersion || !/^26\.0(?:\.|$)/.test(xcodeVersion)) {
  console.log(
    `[fix-expo-modules-jsi-xcode26] current Xcode ${xcodeVersion ?? "unknown"} does not need this patch`
  );
  process.exit(0);
}

let changedFiles = 0;

const swiftFiles = walk(
  path.join(expoModulesRoot, "ExpoModulesJSI"),
  (filePath) => filePath.endsWith(".swift")
);

for (const filePath of swiftFiles) {
  const didChange = replaceInFile(filePath, (source) =>
    source.replace(/weak let runtime:/g, "weak var runtime:")
  );
  if (didChange) {
    changedFiles += 1;
  }
}

const eventEmitterPath = path.join(
  projectRoot, "node_modules", "expo-modules-core", "ios", "Core", "Events", "EventEmitter.swift"
);
if (replaceInFile(eventEmitterPath, (source) =>
  source
    .replaceAll("nonisolated(unsafe) weak let emitter = self", "let emitter = NonisolatedUnsafeWeakVar(self)")
    .replaceAll("nonisolated(unsafe) weak var emitter = self", "let emitter = NonisolatedUnsafeWeakVar(self)")
    .replaceAll("guard let emitter else {", "guard let emitter = emitter.value else {")
    .replaceAll("guard let emitter, let appContext else {", "guard let emitter = emitter.value, let appContext else {")
)) {
  changedFiles += 1;
}

const sharedObjectRegistryPath = path.join(
  projectRoot, "node_modules", "expo-modules-core", "ios", "Core", "SharedObjects", "SharedObjectRegistry.swift"
);
if (replaceInFile(sharedObjectRegistryPath, (source) =>
  source.replace("private weak let appContext: AppContext?", "nonisolated(unsafe) private weak var appContext: AppContext?")
)) {
  changedFiles += 1;
}

const sendableClassPatches = [
  {
    filePath: path.join(
      expoModulesRoot,
      "ExpoModulesJSI",
      "Runtime",
      "JavaScriptPropNameID.swift"
    ),
    from:
      "public final class JavaScriptPropNameID: JavaScriptType {",
    to:
      "public final class JavaScriptPropNameID: JavaScriptType, @unchecked Sendable {",
  },
  {
    filePath: path.join(
      expoModulesRoot,
      "ExpoModulesJSI",
      "Runtime",
      "Values",
      "JavaScriptValue.swift"
    ),
    from:
      "public final class JavaScriptValue: JavaScriptType, Equatable, Escapable {",
    to:
      "public final class JavaScriptValue: JavaScriptType, @unchecked Sendable, Equatable, Escapable {",
  },
  {
    filePath: path.join(
      expoModulesRoot,
      "ExpoModulesJSI",
      "Runtime",
      "Values",
      "JavaScriptError.swift"
    ),
    from:
      "public final class JavaScriptError: Error, Sendable {",
    to:
      "public final class JavaScriptError: Error, @unchecked Sendable {",
  },
];

for (const patch of sendableClassPatches) {
  if (
    replaceInFile(patch.filePath, (source) => source.replace(patch.from, patch.to))
  ) {
    changedFiles += 1;
  }
}

const runtimePath = path.join(
  expoModulesRoot,
  "ExpoModulesJSI",
  "Runtime",
  "JavaScriptRuntime.swift"
);
const jsiVersion = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "node_modules", "expo-modules-jsi", "package.json"), "utf8")
).version;

if (jsiVersion === "57.1.0") {
  // Swift 6.2.1 does not honor unsafe local-let captures here. These JSI
  // callbacks are synchronous; reuse the library's existing capture wrapper.
  if (replaceInFile(runtimePath, (source) => {
    let next = source;
    for (const pointer of ["thisPtr", "argumentsPtr", "resultPtr"]) {
      next = next.replaceAll(
        `nonisolated(unsafe) let ${pointer} = ${pointer}`,
        `let ${pointer} = NonisolatedUnsafeVar(${pointer})`
      );
    }
    return next
      .replaceAll("writeJSIValue(to: resultPtr)", "writeJSIValue(to: resultPtr.value)")
      .replaceAll("UnsafeMutablePointer(mutating: thisPtr).move()", "UnsafeMutablePointer(mutating: thisPtr.value).move()")
      .replaceAll("JavaScriptValuesBuffer(runtime, start: argumentsPtr, count: argumentsCount)", "JavaScriptValuesBuffer(runtime, start: argumentsPtr.value, count: argumentsCount)")
      .replaceAll("JavaScriptUnownedValue(runtime.pointee, thisPtr)", "JavaScriptUnownedValue(runtime.pointee, thisPtr.value)");
  })) {
    changedFiles += 1;
  }
}

const runtimeSchedulerHeader = path.join(
  expoModulesRoot,
  "ExpoModulesJSI-Cxx",
  "include",
  "RuntimeScheduler.h"
);

if (
  replaceInFile(runtimeSchedulerHeader, (source) =>
    source.replace(/SWIFT_RETURNS_RETAINED\s+/g, "")
  )
) {
  changedFiles += 1;
}

const packageSwiftPath = path.join(
  projectRoot,
  "node_modules",
  "expo-modules-jsi",
  "apple",
  "Package.swift"
);

if (
  replaceInFile(packageSwiftPath, (source) =>
    source
      .replace(
        /\n\s*\/\/ Enable some upcoming features[\s\S]*?\.enableUpcomingFeature\("InferIsolatedConformances"\),\n/g,
        "\n"
      )
      .replace(
        /(?:          "-Xfrontend",\n          "-strict-concurrency=minimal",\n)+/g,
        ""
      )
      .replace(
        /(\.interoperabilityMode\(\.Cxx\),\s*\.unsafeFlags\(\[\n)/,
        '$1          "-Xfrontend",\n          "-strict-concurrency=minimal",\n'
      )
  )
) {
  changedFiles += 1;
}

console.log(
  `[fix-expo-modules-jsi-xcode26] ${changedFiles > 0 ? "patched" : "checked"} ${changedFiles} file(s)`
);
