import SwiftUI
import RealityKit
import ARKit



import simd
// ...existing code...
struct ARViewContainer: UIViewRepresentable {
    @Binding var snapshotImage: UIImage?
    @Binding var pdfURL: URL?

    func makeCoordinator() -> Coordinator {
        Coordinator(snapshotImage: $snapshotImage, pdfURL: $pdfURL)
    }

    func makeUIView(context: Context) -> ARView {
        let arView = ARView(frame: .zero)
        let config = ARWorldTrackingConfiguration()
        config.planeDetection = [.horizontal]
        arView.session.run(config, options: [])
        arView.addCoaching()

        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handleTap(_:)))
        arView.addGestureRecognizer(tap)
        let pinch = UIPinchGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handlePinch(_:)))
        arView.addGestureRecognizer(pinch)
        let pan = UIPanGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.handlePan(_:)))
        arView.addGestureRecognizer(pan)

        context.coordinator.arView = arView
        NotificationCenter.default.addObserver(context.coordinator, selector: #selector(Coordinator.takeSnapshot), name: .takeARSnapshot, object: nil)

        // Load box state if available
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            context.coordinator.loadBoxState()
        }

        return arView
    }

    func updateUIView(_ uiView: ARView, context: Context) {}

    class Coordinator: NSObject {
        weak var arView: ARView?
        var boxEntity: ModelEntity?
        @Binding var snapshotImage: UIImage?
        @Binding var pdfURL: URL?

        init(snapshotImage: Binding<UIImage?>, pdfURL: Binding<URL?>) {
            _snapshotImage = snapshotImage
            _pdfURL = pdfURL
        }

        // Save box state to UserDefaults
        func saveBoxState() {
            guard let box = boxEntity, let anchor = box.anchor else { return }
            let pos = anchor.position
            let scale = box.scale.x
            let measurement = scale * 0.3
            let data = BoxSessionData(position: pos, scale: scale, measurement: measurement)
            BoxSessionStore.save(box: data)
        }

        // Load box state from UserDefaults
        func loadBoxState() {
            guard let arView = arView, let data = BoxSessionStore.load() else { return }
            if boxEntity == nil {
                let box = MeshResource.generateBox(size: 0.3)
                let material = SimpleMaterial(color: .blue, isMetallic: false)
                let entity = ModelEntity(mesh: box, materials: [material])
                entity.generateCollisionShapes(recursive: true)
                let anchor = AnchorEntity(world: data.position)
                anchor.addChild(entity)
                arView.scene.addAnchor(anchor)
                entity.scale = SIMD3<Float>(repeating: data.scale)
                boxEntity = entity
            } else {
                boxEntity?.anchor?.position = data.position
                boxEntity?.scale = SIMD3<Float>(repeating: data.scale)
            }
        }

        @objc func handleTap(_ sender: UITapGestureRecognizer) {
            guard let arView = arView else { return }
            let location = sender.location(in: arView)
            if let result = arView.raycast(from: location, allowing: .estimatedPlane, alignment: .horizontal).first {
                let position = simd_make_float3(result.worldTransform.columns.3)
                if boxEntity == nil {
                    let box = MeshResource.generateBox(size: 0.3)
                    let material = SimpleMaterial(color: .blue, isMetallic: false)
                    let entity = ModelEntity(mesh: box, materials: [material])
                    entity.generateCollisionShapes(recursive: true)
                    let anchor = AnchorEntity(world: position)
                    anchor.addChild(entity)
                    arView.scene.addAnchor(anchor)
                    boxEntity = entity
                } else {
                    boxEntity?.anchor?.position = position
                }
                saveBoxState()
            }
        }

        @objc func handlePinch(_ sender: UIPinchGestureRecognizer) {
            guard let box = boxEntity else { return }
            if sender.state == .changed {
                let scale = Float(sender.scale)
                box.scale = SIMD3<Float>(repeating: scale)
            }
            if sender.state == .ended {
                sender.scale = 1.0
                saveBoxState()
            }
        }

        @objc func handlePan(_ sender: UIPanGestureRecognizer) {
            guard let arView = arView, let box = boxEntity else { return }
            let location = sender.location(in: arView)
            if sender.state == .began || sender.state == .changed {
                if let result = arView.raycast(from: location, allowing: .estimatedPlane, alignment: .horizontal).first {
                    let position = simd_make_float3(result.worldTransform.columns.3)
                    box.anchor?.position = position
                }
            }
            if sender.state == .ended {
                saveBoxState()
            }
        }

        @objc func takeSnapshot() {
            guard let arView = arView else { return }
            arView.snapshot(saveToHDR: false) { image in
                guard let image = image else { return }
                // Annotate image with box dimensions
                let annotated = self.annotate(image: image)
                self.snapshotImage = annotated
                ImageSaver().writeToPhotoAlbum(image: annotated)
                // Also create PDF
                if let pdfURL = self.createPDF(from: annotated) {
                    self.pdfURL = pdfURL
                }
            }
        }

        func annotate(image: UIImage) -> UIImage {
            UIGraphicsBeginImageContextWithOptions(image.size, false, 0)
            image.draw(at: .zero)
            // Draw box dimensions if available
            if let box = boxEntity {
                let size = box.scale.x * 0.3 // base size is 0.3m
                let text = String(format: "Box: %.2f m", size)
                let attrs: [NSAttributedString.Key: Any] = [
                    .font: UIFont.boldSystemFont(ofSize: 40),
                    .foregroundColor: UIColor.red,
                    .backgroundColor: UIColor.white.withAlphaComponent(0.7)
                ]
                let textRect = CGRect(x: 30, y: 30, width: 400, height: 60)
                text.draw(in: textRect, withAttributes: attrs)
            }
            let annotated = UIGraphicsGetImageFromCurrentImageContext()
            UIGraphicsEndImageContext()
            return annotated ?? image
        }

        func createPDF(from image: UIImage) -> URL? {
            let pdfData = NSMutableData()
            let pdfRect = CGRect(origin: .zero, size: image.size)
            UIGraphicsBeginPDFContextToData(pdfData, pdfRect, nil)
            UIGraphicsBeginPDFPage()
            image.draw(in: pdfRect)
            UIGraphicsEndPDFContext()
            let tempURL = FileManager.default.temporaryDirectory.appendingPathComponent("RoomSnapAR.pdf")
            do {
                try pdfData.write(to: tempURL, options: .atomic)
                return tempURL
            } catch {
                return nil
            }
        }
    }
}

extension ARView {
    func addCoaching() {
        let coachingOverlay = ARCoachingOverlayView()
        coachingOverlay.session = self.session
        coachingOverlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        coachingOverlay.goal = .horizontalPlane
        self.addSubview(coachingOverlay)
    }
}
