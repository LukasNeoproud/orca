// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "ObchodKit",
    defaultLocalization: "en",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "CartFeature", targets: ["CartFeature"]),
        .library(name: "CheckoutFeature", targets: ["CheckoutFeature"]),
    ],
    targets: [
        .target(name: "Model"),
        .target(name: "Networking", dependencies: ["Model"]),
        .target(name: "DesignSystem"),
        .target(name: "CartFeature", dependencies: ["Model", "Networking", "DesignSystem"]),
        // A feature that depends on another feature: the layering rules are expected to flag this edge.
        .target(name: "CheckoutFeature", dependencies: ["Model", "Networking", "DesignSystem", "CartFeature"]),
        .testTarget(name: "CartFeatureTests", dependencies: ["CartFeature"]),
    ]
)
