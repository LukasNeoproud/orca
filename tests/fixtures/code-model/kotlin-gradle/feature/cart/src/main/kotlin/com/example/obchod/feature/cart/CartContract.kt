package com.example.obchod.feature.cart

import com.example.obchod.core.model.CartItem

data class CartState(
    val items: List<CartItem> = emptyList(),
    val totalCents: Long = 0,
    val isLoading: Boolean = true,
)

sealed interface CartIntent {
    data object Refresh : CartIntent

    data class RemoveItem(val itemId: String) : CartIntent

    data object Checkout : CartIntent

    data object Back : CartIntent
}

sealed interface CartEffect {
    data object NavigateToCheckout : CartEffect

    data object NavigateBack : CartEffect
}
