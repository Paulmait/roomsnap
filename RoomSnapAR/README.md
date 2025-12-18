# RoomSnap AR

RoomSnap AR is a SwiftUI + RealityKit iOS app for virtual furniture placement and room design. Features:

- Full-screen AR camera view
- Plane detection with visual indicators
- Tap to place a resizable virtual box (furniture placeholder)
- Pinch to resize the box
- Drag to move the box
- Designed for easy extension to more virtual furniture and room design features

## Structure
- `RoomSnapARApp.swift`: App entry point
- `ContentView.swift`: Main SwiftUI view
- `ARViewContainer.swift`: AR logic and gesture handling
- `Models/`: For future 3D models
- `Resources/`: For future assets

## Usage
1. Open the project in Xcode.
2. Build and run on a real iOS device (ARKit requires a real device).
3. Move your device to detect a horizontal plane.
4. Tap to place a box, pinch to resize, drag to move.

No third-party dependencies required.
