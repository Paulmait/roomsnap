import SwiftUI

struct ContentView: View {
    @State private var showShareSheet = false
    @State private var snapshotImage: UIImage?
    @State private var pdfURL: URL?
    @Environment(\.scenePhase) var scenePhase

    @State private var boxSession: BoxSessionData? = BoxSessionStore.load()

    var body: some View {
        ZStack {
            ARViewContainer(snapshotImage: $snapshotImage, pdfURL: $pdfURL)
                .edgesIgnoringSafeArea(.all)
            VStack {
                Spacer()
                HStack(spacing: 30) {
                    Button(action: takeScreenshot) {
                        Image(systemName: "camera.circle.fill")
                            .resizable()
                            .frame(width: 60, height: 60)
                            .foregroundColor(.white)
                            .shadow(radius: 4)
                    }
                    Button(action: exportPDF) {
                        Image(systemName: "doc.richtext")
                            .resizable()
                            .frame(width: 50, height: 50)
                            .foregroundColor(.white)
                            .shadow(radius: 4)
                    }
                }
                .padding(.bottom, 30)
                Text("Tap to place, pinch to resize, drag to move the box.")
                    .padding()
                    .background(Color.black.opacity(0.5))
                    .foregroundColor(.white)
                    .cornerRadius(10)
                    .padding(.bottom, 10)
            }
        }
        .sheet(isPresented: $showShareSheet) {
            if let pdfURL = pdfURL {
                ShareSheet(activityItems: [pdfURL])
            } else if let image = snapshotImage {
                ShareSheet(activityItems: [image])
            }
        }
        .onAppear {
            boxSession = BoxSessionStore.load()
        }
    }

    private func takeScreenshot() {
        NotificationCenter.default.post(name: .takeARSnapshot, object: nil)
    }

    private func exportPDF() {
        // Use last snapshot if available, else blank
        let box = BoxSessionStore.load()
        let pdf = PDFExporter.exportPlan(box: box, snapshot: snapshotImage)
        if let pdf = pdf {
            self.pdfURL = pdf
            self.showShareSheet = true
        }
    }
}

struct ShareSheet: UIViewControllerRepresentable {
    var activityItems: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }
    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

extension Notification.Name {
    static let takeARSnapshot = Notification.Name("takeARSnapshot")
}
}
