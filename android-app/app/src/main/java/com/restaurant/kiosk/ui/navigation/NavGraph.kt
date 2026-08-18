package com.restaurant.kiosk.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.restaurant.kiosk.ui.screens.admin.dashboard.AdminDashboardScreen
import com.restaurant.kiosk.ui.screens.admin.login.AdminLoginScreen
import com.restaurant.kiosk.ui.screens.admin.orders.AdminOrdersScreen
import com.restaurant.kiosk.ui.screens.admin.products.AdminProductsScreen
import com.restaurant.kiosk.ui.screens.checkout.CheckoutScreen
import com.restaurant.kiosk.ui.screens.kitchen.KitchenDisplayScreen
import com.restaurant.kiosk.ui.screens.menu.MenuScreen
import com.restaurant.kiosk.ui.screens.payment.PaymentScreen
import com.restaurant.kiosk.ui.screens.tracking.OrderTrackingScreen
import com.restaurant.kiosk.ui.screens.welcome.WelcomeScreen

sealed class Screen(val route: String) {
    object Welcome : Screen("welcome")
    object Menu : Screen("menu/{categoryId}") {
        fun createRoute(categoryId: String = "all") = "menu/$categoryId"
    }
    object Checkout : Screen("checkout")
    object Payment : Screen("payment/{orderId}") {
        fun createRoute(orderId: String) = "payment/$orderId"
    }
    object OrderTracking : Screen("tracking/{orderId}") {
        fun createRoute(orderId: String) = "tracking/$orderId"
    }
    object AdminLogin : Screen("admin/login")
    object AdminDashboard : Screen("admin/dashboard")
    object AdminOrders : Screen("admin/orders")
    object AdminProducts : Screen("admin/products")
    object KitchenDisplay : Screen("kitchen")
}

@Composable
fun KioskNavGraph() {
    val navController = rememberNavController()

    NavHost(
        navController = navController,
        startDestination = Screen.Welcome.route
    ) {
        composable(Screen.Welcome.route) {
            WelcomeScreen(
                onCategorySelected = { categoryId ->
                    navController.navigate(Screen.Menu.createRoute(categoryId))
                },
                onAdminLogin = {
                    navController.navigate(Screen.AdminLogin.route)
                },
                onKitchenDisplay = {
                    navController.navigate(Screen.KitchenDisplay.route)
                }
            )
        }

        composable(
            route = Screen.Menu.route,
            arguments = listOf(navArgument("categoryId") { type = NavType.StringType })
        ) { backStackEntry ->
            val categoryId = backStackEntry.arguments?.getString("categoryId") ?: "all"
            MenuScreen(
                initialCategoryId = if (categoryId == "all") null else categoryId,
                onCheckout = { navController.navigate(Screen.Checkout.route) },
                onBack = { navController.popBackStack() }
            )
        }

        composable(Screen.Checkout.route) {
            CheckoutScreen(
                onBack = { navController.popBackStack() },
                onProceedToPayment = { orderId ->
                    navController.navigate(Screen.Payment.createRoute(orderId)) {
                        popUpTo(Screen.Checkout.route) { inclusive = true }
                    }
                }
            )
        }

        composable(
            route = Screen.Payment.route,
            arguments = listOf(navArgument("orderId") { type = NavType.StringType })
        ) { backStackEntry ->
            val orderId = backStackEntry.arguments?.getString("orderId") ?: return@composable
            PaymentScreen(
                orderId = orderId,
                onPaymentComplete = { completedOrderId ->
                    navController.navigate(Screen.OrderTracking.createRoute(completedOrderId)) {
                        popUpTo(Screen.Welcome.route)
                    }
                },
                onBack = { navController.popBackStack() }
            )
        }

        composable(
            route = Screen.OrderTracking.route,
            arguments = listOf(navArgument("orderId") { type = NavType.StringType })
        ) { backStackEntry ->
            val orderId = backStackEntry.arguments?.getString("orderId") ?: return@composable
            OrderTrackingScreen(
                orderId = orderId,
                onNewOrder = {
                    navController.navigate(Screen.Welcome.route) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.AdminLogin.route) {
            AdminLoginScreen(
                onLoginSuccess = {
                    navController.navigate(Screen.AdminDashboard.route) {
                        popUpTo(Screen.AdminLogin.route) { inclusive = true }
                    }
                },
                onBack = { navController.popBackStack() }
            )
        }

        composable(Screen.AdminDashboard.route) {
            AdminDashboardScreen(
                onNavigateToOrders = { navController.navigate(Screen.AdminOrders.route) },
                onNavigateToProducts = { navController.navigate(Screen.AdminProducts.route) },
                onNavigateToKitchen = { navController.navigate(Screen.KitchenDisplay.route) },
                onLogout = {
                    navController.navigate(Screen.Welcome.route) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.AdminOrders.route) {
            AdminOrdersScreen(onBack = { navController.popBackStack() })
        }

        composable(Screen.AdminProducts.route) {
            AdminProductsScreen(onBack = { navController.popBackStack() })
        }

        composable(Screen.KitchenDisplay.route) {
            KitchenDisplayScreen(onBack = { navController.popBackStack() })
        }
    }
}
