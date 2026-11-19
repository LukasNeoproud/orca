package com.example.obchod.core.model

data class CartItem(
    val id: String,
    val name: String,
    val quantity: Int,
    val unitPriceCents: Long,
) {
    val totalCents: Long
        get() = quantity * unitPriceCents
}

data class Cart(val items: List<CartItem>) {
    val totalCents: Long
        get() = items.sumOf { it.totalCents }

    val isEmpty: Boolean
        get() = items.isEmpty()
}
