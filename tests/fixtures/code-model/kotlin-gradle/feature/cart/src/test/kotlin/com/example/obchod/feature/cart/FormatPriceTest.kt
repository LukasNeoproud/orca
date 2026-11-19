package com.example.obchod.feature.cart

import org.junit.Assert.assertEquals
import org.junit.Test

class FormatPriceTest {
    @Test
    fun padsCents() {
        assertEquals("12.05", formatPrice(1205))
    }
}
