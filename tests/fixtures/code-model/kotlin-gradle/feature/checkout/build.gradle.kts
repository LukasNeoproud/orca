plugins {
    id("obchod.android.feature")
}

android {
    namespace = "com.example.obchod.feature.checkout"
}

dependencies {
    implementation(project(":core:data"))
    // A feature that depends on another feature: the layering rules are expected to flag this edge.
    implementation(project(":feature:cart"))

    implementation(platform(libs.compose.bom))
    implementation(libs.lifecycle.viewmodel.compose)
}
