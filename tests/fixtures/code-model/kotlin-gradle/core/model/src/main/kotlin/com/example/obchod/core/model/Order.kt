package com.example.obchod.core.model

enum class PaymentMethod {
    Card,
    CashOnDelivery,
}

data class Order(
    val id: String,
    val totalCents: Long,
    val paymentMethod: PaymentMethod,
)
