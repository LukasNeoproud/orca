package com.example.obchod.feature.cart

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.example.obchod.core.data.CartRepository
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

class CartViewModel(private val repository: CartRepository) : ViewModel() {
    private val mutableState = MutableStateFlow(CartState())
    val state: StateFlow<CartState> = mutableState

    private val effectChannel = Channel<CartEffect>(Channel.BUFFERED)
    val effects = effectChannel.receiveAsFlow()

    init {
        onIntent(CartIntent.Refresh)
    }

    fun onIntent(intent: CartIntent) {
        when (intent) {
            CartIntent.Refresh -> load(forceRefresh = true)
            is CartIntent.RemoveItem -> remove(intent.itemId)
            CartIntent.Checkout -> {
                if (mutableState.value.items.isNotEmpty()) {
                    effectChannel.trySend(CartEffect.NavigateToCheckout)
                }
            }
            CartIntent.Back -> effectChannel.trySend(CartEffect.NavigateBack)
        }
    }

    private fun load(forceRefresh: Boolean) {
        viewModelScope.launch {
            val cart = repository.loadCart(forceRefresh)
            mutableState.update { it.copy(items = cart.items, totalCents = cart.totalCents, isLoading = false) }
        }
    }

    private fun remove(itemId: String) {
        viewModelScope.launch {
            val cart = repository.removeItem(itemId)
            mutableState.update { it.copy(items = cart.items, totalCents = cart.totalCents) }
        }
    }
}
