package com.example.obchod.feature.checkout

import androidx.compose.foundation.layout.Column
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.res.stringResource
import com.example.obchod.core.ui.PrimaryButton
import com.example.obchod.core.ui.R as UiR
import com.example.obchod.feature.cart.formatPrice

@Composable
fun CheckoutScreen(
    viewModel: CheckoutViewModel,
    onOrderPlaced: (orderId: String) -> Unit,
    onNavigateBack: () -> Unit,
) {
    val state by viewModel.state.collectAsState()

    LaunchedEffect(viewModel) {
        viewModel.effects.collect { effect ->
            when (effect) {
                is CheckoutEffect.OrderPlaced -> onOrderPlaced(effect.orderId)
                CheckoutEffect.NavigateBack -> onNavigateBack()
            }
        }
    }

    Column {
        Text(stringResource(UiR.string.checkout_title))
        PrimaryButton(
            text = stringResource(UiR.string.checkout_pay, formatPrice(state.totalCents)),
            onClick = { viewModel.onIntent(CheckoutIntent.Pay) },
            enabled = !state.isPlacingOrder,
        )
    }
}
