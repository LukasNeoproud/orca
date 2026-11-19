package com.example.obchod.core.data

import com.example.obchod.core.model.Cart
import com.example.obchod.core.model.Order
import com.example.obchod.core.model.PaymentMethod

class CartRepository(private val api: CartApi) {
    private var cached: Cart? = null

    suspend fun loadCart(forceRefresh: Boolean = false): Cart {
        val current = cached
        if (current != null && !forceRefresh) {
            return current
        }
        return api.getCart().also { cached = it }
    }

    suspend fun removeItem(itemId: String): Cart {
        val updated = api.removeItem(itemId)
        cached = updated
        return updated
    }

    suspend fun placeOrder(paymentMethod: PaymentMethod): Order {
        val order = api.createOrder(CreateOrderRequest(paymentMethod))
        cached = null
        return order
    }
}
