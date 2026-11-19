package com.example.obchod

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import com.example.obchod.core.ui.R as UiR

@Composable
fun OrderDoneScreen(orderId: String) {
    Text(stringResource(UiR.string.checkout_done, orderId))
}
