plugins {
    id("obchod.android.feature")
}

android {
    namespace = "com.example.obchod.feature.cart"
}

dependencies {
    implementation(projects.core.data)

    implementation(platform(libs.compose.bom))
    implementation(libs.lifecycle.viewmodel.compose)

    testImplementation(projects.core.testing)
    testImplementation(libs.junit)
}
