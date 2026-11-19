package com.example.obchod.feature.checkout

import com.example.obchod.core.model.PaymentMethod

data class CheckoutState(
    val totalCents: Long = 0,
    val paymentMethod: PaymentMethod = PaymentMethod.Card,
    val isPlacingOrder: Boolean = false,
)

sealed interface CheckoutIntent {
    data class SelectPayment(val method: PaymentMethod) : CheckoutIntent

    data object Pay : CheckoutIntent

    data object Back : CheckoutIntent
}

sealed interface CheckoutEffect {
    data class OrderPlaced(val orderId: String) : CheckoutEffect

    data object NavigateBack : CheckoutEffect
}
