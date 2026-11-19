package com.example.obchod.feature.checkout

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.obchod.core.data.CartRepository
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class CheckoutViewModel(private val repository: CartRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(CheckoutState())
    val state: StateFlow<CheckoutState> = mutableState

    private val effectChannel = Channel<CheckoutEffect>(Channel.BUFFERED)
    val effects = effectChannel.receiveAsFlow()

    fun onIntent(intent: CheckoutIntent) {
        when (intent) {
            is CheckoutIntent.SelectPayment -> mutableState.update { it.copy(paymentMethod = intent.method) }
            CheckoutIntent.Pay -> pay()
            CheckoutIntent.Back -> effectChannel.trySend(CheckoutEffect.NavigateBack)
        }
    }

    private fun pay() {
        if (mutableState.value.isPlacingOrder) {
            return
        }
        mutableState.update { it.copy(isPlacingOrder = true) }
        viewModelScope.launch {
            val order = repository.placeOrder(mutableState.value.paymentMethod)
            mutableState.update { it.copy(isPlacingOrder = false) }
            effectChannel.send(CheckoutEffect.OrderPlaced(order.id))
        }
    }
}
