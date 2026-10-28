// Extracts the three flower-and-pedestal layers from the original composite.
// Usage: swift tools/build-growth-flower-cutouts.swift /absolute/path/to/repository
import CoreGraphics
import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

struct Bounds {
    var left = Int.max
    var top = Int.max
    var right = 0
    var bottom = 0
}

func loadPixels(_ image: CGImage) throws -> [UInt8] {
    var result = [UInt8](repeating: 0, count: image.width * image.height * 4)
    guard let context = CGContext(
        data: &result,
        width: image.width,
        height: image.height,
        bitsPerComponent: 8,
        bytesPerRow: image.width * 4,
        space: CGColorSpaceCreateDeviceRGB(),
        bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
    ) else {
        throw NSError(domain: "GrowthArtwork", code: 1)
    }
    context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
    return result
}

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
let sourceURL = root.appendingPathComponent("assets/restored/growth-flowers-locked.png")
let outputDirectory = root.appendingPathComponent("assets/restored/growth-flower-cutouts")
try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
guard let source = CGImageSourceCreateWithURL(sourceURL as CFURL, nil),
      let sourceImage = CGImageSourceCreateImageAtIndex(source, 0, nil),
      sourceImage.width == 462, sourceImage.height == 495 else {
    throw NSError(domain: "GrowthArtwork", code: 5)
}
let sourcePixels = try loadPixels(sourceImage)
let handler = VNImageRequestHandler(url: sourceURL)
let request = VNGenerateForegroundInstanceMaskRequest()
try handler.perform([request])
guard let observation = request.results?.first,
      observation.allInstances.count >= 3 else {
    throw NSError(domain: "GrowthArtwork", code: 6)
}
let context = CIContext()
let ids = observation.allInstances.sorted()
let names = ["open-flower-a.png", "open-flower-b.png", "locked-gray-brown-bud.png"]

for (index, id) in ids.prefix(3).enumerated() {
    let buffer = try observation.generateScaledMaskForImage(forInstances: [id], from: handler)
    let ciImage = CIImage(cvPixelBuffer: buffer)
    guard let maskImage = context.createCGImage(ciImage, from: ciImage.extent) else {
        throw NSError(domain: "GrowthArtwork", code: 7)
    }
    let mask = try loadPixels(maskImage)
    var bounds = Bounds()
    for y in 0..<sourceImage.height {
        for x in 0..<sourceImage.width where mask[(y * sourceImage.width + x) * 4] > 8 {
            bounds.left = min(bounds.left, x)
            bounds.top = min(bounds.top, y)
            bounds.right = max(bounds.right, x)
            bounds.bottom = max(bounds.bottom, y)
        }
    }
    guard bounds.left != Int.max else { throw NSError(domain: "GrowthArtwork", code: 8) }
    let width = bounds.right - bounds.left + 1
    let height = bounds.bottom - bounds.top + 1
    var cutout = [UInt8](repeating: 0, count: width * height * 4)
    for y in 0..<height {
        for x in 0..<width {
            let sourceIndex = ((bounds.top + y) * sourceImage.width + bounds.left + x) * 4
            let targetIndex = (y * width + x) * 4
            let alpha = mask[sourceIndex]
            for channel in 0..<3 {
                cutout[targetIndex + channel] = UInt8(UInt16(sourcePixels[sourceIndex + channel]) * UInt16(alpha) / 255)
            }
            cutout[targetIndex + 3] = alpha
        }
    }
    try save(makeImage(cutout, width: width, height: height), to: outputDirectory.appendingPathComponent(names[index]))
}
