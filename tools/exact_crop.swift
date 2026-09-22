import Foundation
import AppKit

if CommandLine.arguments.count != 7 {
    fputs("usage: exact_crop.swift <input> <x> <y> <w> <h> <output>\n", stderr)
    exit(1)
}

let input = CommandLine.arguments[1]
let x = Int(CommandLine.arguments[2])!
let y = Int(CommandLine.arguments[3])!
let w = Int(CommandLine.arguments[4])!
let h = Int(CommandLine.arguments[5])!
let output = CommandLine.arguments[6]

let url = URL(fileURLWithPath: input)
guard let image = NSImage(contentsOf: url),
      let tiff = image.tiffRepresentation,
      let bitmap = NSBitmapImageRep(data: tiff),
      let cgImage = bitmap.cgImage else {
    fputs("failed to load image\n", stderr)
    exit(2)
}

let imgW = cgImage.width
let imgH = cgImage.height
let imgWf = CGFloat(imgW)
let imgHf = CGFloat(imgH)
let cropRect = CGRect(x: x, y: y, width: w, height: h)

guard cropRect.minX >= 0, cropRect.minY >= 0, cropRect.maxX <= imgWf, cropRect.maxY <= imgHf else {
    fputs("crop rect out of bounds\n", stderr)
    exit(3)
}

guard let cropped = cgImage.cropping(to: cropRect) else {
    fputs("failed to crop\n", stderr)
    exit(4)
}

let rep = NSBitmapImageRep(cgImage: cropped)
guard let data = rep.representation(using: .png, properties: [:]) else {
    fputs("failed to encode png\n", stderr)
    exit(5)
}

try data.write(to: URL(fileURLWithPath: output))
