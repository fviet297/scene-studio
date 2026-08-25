import AppKit
import Foundation
import Vision

let inputDirectory = URL(fileURLWithPath: CommandLine.arguments[1])
let outputFile = URL(fileURLWithPath: CommandLine.arguments[2])
let files = try FileManager.default.contentsOfDirectory(
    at: inputDirectory,
    includingPropertiesForKeys: nil
).filter { $0.pathExtension == "png" }.sorted { $0.lastPathComponent < $1.lastPathComponent }

var output = ""
for (index, file) in files.enumerated() {
    guard let image = NSImage(contentsOf: file),
          let cgImage = image.cgImage(forProposedRect: nil, context: nil, hints: nil) else {
        continue
    }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.recognitionLanguages = ["vi-VN"]
    request.usesLanguageCorrection = true
    let handler = VNImageRequestHandler(cgImage: cgImage)
    try handler.perform([request])
    let text = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string }.joined(separator: "\n")
    output += "\n\n--- PAGE \(index + 1) \(file.lastPathComponent) ---\n\(text)"
}
try output.write(to: outputFile, atomically: true, encoding: .utf8)
