package com.example.obchod.core.data

import com.example.obchod.core.model.Cart
import com.example.obchod.core.model.Order
import com.example.obchod.core.model.PaymentMethod
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.Path

interface CartApi {
    @GET("api/cart")
    suspend fun getCart(): Cart

    @DELETE("api/cart/items/{itemId}")
    suspend fun removeItem(@Path("itemId") itemId: String): Cart

    @POST("api/orders")
    suspend fun createOrder(@Body request: CreateOrderRequest): Order
}

data class CreateOrderRequest(val paymentMethod: PaymentMethod)
