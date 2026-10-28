// Creates a clean warm background with subtle sparkles for dynamic flower layers.
// Usage: swift tools/build-growth-flower-background.swift /absolute/path/to/repository
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

func makeImage(_ pixels: [UInt8], width: Int, height: Int) throws -> CGImage {
    guard let provider = CGDataProvider(data: Data(pixels) as CFData),
          let result = CGImage(
            width: width,
            height: height,
            bitsPerComponent: 8,
            bitsPerPixel: 32,
            bytesPerRow: width * 4,
            space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.premultipliedLast.rawValue),
            provider: provider,
            decode: nil,
            shouldInterpolate: true,
            intent: .defaultIntent
          ) else {
        throw NSError(domain: "GrowthArtwork", code: 2)
    }
    return result
}

func save(_ image: CGImage, to url: URL) throws {
    guard let destination = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil) else {
        throw NSError(domain: "GrowthArtwork", code: 3)
    }
    CGImageDestinationAddImage(destination, image, nil)
    guard CGImageDestinationFinalize(destination) else {
        throw NSError(domain: "GrowthArtwork", code: 4)
    }
}

let root = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
let assetPath = root.appendingPathComponent("assets/restored/growth-flowers-locked.png")
let outputPath = root.appendingPathComponent("assets/restored/growth-flower-cutouts/background.png")
guard let source = CGImageSourceCreateWithURL(assetPath as CFURL, nil),
      let sourceImage = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    throw NSError(domain: "GrowthArtwork", code: 5)
}
var output = [UInt8](repeating: 0, count: sourceImage.width * sourceImage.height * 4)
for index in stride(from: 0, to: output.count, by: 4) {
    output[index] = 255
    output[index + 1] = 243
    output[index + 2] = 229
    output[index + 3] = 255
}

let sparkles: [(x: Int, y: Int, radius: Int, strength: Double)] = [
    (23, 34, 9, 0.42), (109, 22, 7, 0.34), (258, 37, 8, 0.34),
    (362, 26, 9, 0.46), (432, 68, 7, 0.36), (18, 194, 8, 0.32),
    (440, 220, 9, 0.37), (29, 318, 8, 0.40), (425, 352, 9, 0.36),
    (48, 459, 9, 0.42), (385, 472, 8, 0.35), (317, 448, 6, 0.30),
]
for sparkle in sparkles {
    for offsetY in -sparkle.radius...sparkle.radius {
        for offsetX in -sparkle.radius...sparkle.radius {
            let x = sparkle.x + offsetX
            let y = sparkle.y + offsetY
            guard x >= 0, y >= 0, x < sourceImage.width, y < sourceImage.height else { continue }
            let distance = Double(offsetX * offsetX + offsetY * offsetY)
            let alpha = sparkle.strength * exp(-distance / Double(sparkle.radius * sparkle.radius) * 3)
            let index = (y * sourceImage.width + x) * 4
            for channel in 0..<3 {
                let original = Double(output[index + channel])
                output[index + channel] = UInt8((original * (1 - alpha) + 255 * alpha).rounded())
            }
        }
    }
}

try save(makeImage(output, width: sourceImage.width, height: sourceImage.height), to: outputPath)
