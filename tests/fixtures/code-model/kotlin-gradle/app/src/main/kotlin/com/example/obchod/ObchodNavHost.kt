package com.example.obchod

import androidx.compose.runtime.Composable
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.example.obchod.feature.cart.CartScreen
import com.example.obchod.feature.checkout.CheckoutScreen

object Routes {
    const val CART = "cart"
    const val CHECKOUT = "checkout"
    const val ORDER_DONE = "order/{orderId}"
}

@Composable
fun ObchodNavHost() {
    val navController = rememberNavController()

    NavHost(navController = navController, startDestination = Routes.CART) {
        composable(Routes.CART) {
            CartScreen(
                viewModel = viewModel(),
                onNavigateToCheckout = { navController.navigate(Routes.CHECKOUT) },
                onNavigateBack = { navController.popBackStack() },
            )
        }
        composable(Routes.CHECKOUT) {
            CheckoutScreen(
                viewModel = viewModel(),
                onOrderPlaced = { orderId -> navController.navigate("order/$orderId") },
                onNavigateBack = { navController.popBackStack() },
            )
        }
        composable(Routes.ORDER_DONE) { entry ->
            OrderDoneScreen(orderId = entry.arguments?.getString("orderId").orEmpty())
        }
    }
}
