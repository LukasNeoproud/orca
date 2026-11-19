package com.example.obchod.core.data

import com.example.obchod.core.testing.cartOf
import org.junit.Assert.assertEquals
import org.junit.Test

class CartRepositoryTest {
    @Test
    fun totalAddsUpItems() {
        val cart = cartOf("tea" to 2, "cup" to 1)

        assertEquals(3, cart.items.sumOf { it.quantity })
    }
}
