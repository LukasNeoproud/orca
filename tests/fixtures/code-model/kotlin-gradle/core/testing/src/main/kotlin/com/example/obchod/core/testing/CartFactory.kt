package com.example.obchod.core.testing

import com.example.obchod.core.model.Cart
import com.example.obchod.core.model.CartItem

fun cartOf(vararg items: Pair<String, Int>): Cart =
    Cart(
        items.mapIndexed { index, (name, quantity) ->
            CartItem(id = "item-$index", name = name, quantity = quantity, unitPriceCents = 100)
        },
    )
