package com.example.obchod.feature.cart

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import com.example.obchod.core.ui.PrimaryButton
import com.example.obchod.core.ui.R as UiR

@Composable
fun CartScreen(
    viewModel: CartViewModel,
    onNavigateToCheckout: () -> Unit,
    onNavigateBack: () -> Unit,
) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                CartEffect.NavigateToCheckout -> onNavigateToCheckout()
                CartEffect.NavigateBack -> onNavigateBack()
            }
        }
    }

    Column {
        Text(stringResource(UiR.string.cart_title))
        if (state.items.isEmpty()) {
            Text(stringResource(UiR.string.cart_empty))
        } else {
            Text(pluralStringResource(UiR.plurals.cart_items, state.items.size, state.items.size))
            Text(stringResource(UiR.string.cart_total, formatPrice(state.totalCents)))
        }
        PrimaryButton(
            text = stringResource(UiR.string.cart_checkout),
            onClick = { viewModel.onIntent(CartIntent.Checkout) },
            enabled = state.items.isNotEmpty(),
        )
    }
}

internal fun formatPrice(cents: Long): String = "%d.%02d".format(cents / 100, cents % 100)
