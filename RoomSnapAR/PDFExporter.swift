import UIKit
import PDFKit

class PDFExporter {
    static func exportPlan(box: BoxSessionData?, snapshot: UIImage?) -> URL? {
        let pdfMetaData = [
            kCGPDFContextCreator: "RoomSnap AR",
            kCGPDFContextAuthor: "RoomSnap AR",
            kCGPDFContextTitle: "RoomSnap AR Plan"
        ]
        let format = UIGraphicsPDFRendererFormat()
        format.documentInfo = pdfMetaData as [String: Any]
        let pageWidth = 612.0
        let pageHeight = 792.0
        let pageRect = CGRect(x: 0, y: 0, width: pageWidth, height: pageHeight)
        let renderer = UIGraphicsPDFRenderer(bounds: pageRect, format: format)
        let data = renderer.pdfData { ctx in
            ctx.beginPage()
            // App name and date
            let title = "RoomSnap AR Plan"
            let date = DateFormatter.localizedString(from: Date(), dateStyle: .medium, timeStyle: .short)
            let attrs: [NSAttributedString.Key: Any] = [
                .font: UIFont.boldSystemFont(ofSize: 24)
            ]
            title.draw(at: CGPoint(x: 40, y: 30), withAttributes: attrs)
            date.draw(at: CGPoint(x: 40, y: 65), withAttributes: [.font: UIFont.systemFont(ofSize: 16)])
            // Snapshot or layout
            if let image = snapshot {
                let maxWidth: CGFloat = 300
                let scale = maxWidth / image.size.width
                let imgRect = CGRect(x: 40, y: 100, width: maxWidth, height: image.size.height * scale)
                image.draw(in: imgRect)
            }
            // Box measurements
            var y = 120 + (snapshot != nil ? 200 : 0)
            let sectionTitle = "Box Measurements:"
            sectionTitle.draw(at: CGPoint(x: 40, y: CGFloat(y)), withAttributes: [.font: UIFont.boldSystemFont(ofSize: 18)])
            y += 30
            if let box = box {
                let pos = box.position
                let dim = String(format: "Position: [%.2f, %.2f, %.2f] m", pos.x, pos.y, pos.z)
                let scale = String(format: "Scale: %.2f", box.scale)
                let measurement = String(format: "Size: %.2f m", box.measurement)
                dim.draw(at: CGPoint(x: 50, y: CGFloat(y)), withAttributes: nil)
                y += 24
                scale.draw(at: CGPoint(x: 50, y: CGFloat(y)), withAttributes: nil)
                y += 24
                measurement.draw(at: CGPoint(x: 50, y: CGFloat(y)), withAttributes: nil)
            } else {
                let none = "No box placed."
                none.draw(at: CGPoint(x: 50, y: CGFloat(y)), withAttributes: nil)
            }
        }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("RoomSnapAR-Plan.pdf")
        do {
            try data.write(to: url)
            return url
        } catch {
            return nil
        }
    }
}
