package com.restaurant.kiosk.data.repository

import com.restaurant.kiosk.data.model.*
import com.restaurant.kiosk.data.remote.SupabaseApi
import com.restaurant.kiosk.data.remote.SupabaseClient
import kotlinx.serialization.json.JsonObject
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class KioskRepository @Inject constructor(
    private val api: SupabaseApi,
    private val supabaseClient: SupabaseClient
) {
    suspend fun signIn(email: String, password: String): Result<AuthResponse> {
        return try {
            val response = api.signIn(email, password)
            supabaseClient.setAuthToken(response.accessToken)
            Result.Success(response)
        } catch (e: Exception) {
            Result.Error(e.message ?: "Sign in failed")
        }
    }

    suspend fun signOut(): Result<Unit> {
        return try {
            val token = supabaseClient.getAuthToken()
            if (token != null) api.signOut(token)
            supabaseClient.setAuthToken(null)
            Result.Success(Unit)
        } catch (e: Exception) {
            supabaseClient.setAuthToken(null)
            Result.Success(Unit)
        }
    }

    suspend fun getCategories(): Result<List<Category>> {
        return try {
            Result.Success(api.getCategories())
        } catch (e: Exception) {
            Result.Error(e.message ?: "Failed to load categories")
        }
    }

    suspend fun getProducts(categoryId: String? = null): Result<List<Product>> {
        return try {
            val products = api.getProducts(categoryId)
            val productsWithAddons = products.map { product ->
                val addons = try { api.getProductAddons(product.id) } catch (e: Exception) { emptyList() }
                product.copy(addons = addons)
            }
            Result.Success(productsWithAddons)
        } catch (e: Exception) {
            Result.Error(e.message ?: "Failed to load products")
        }
    }

    suspend fun createOrder(
        items: List<CartItem>,
        orderType: String,
        customerPhone: String?
    ): Result<Order> {
        return try {
            Result.Success(api.createOrder(items, orderType, customerPhone))
        } catch (e: Exception) {
            Result.Error(e.message ?: "Failed to create order")
        }
    }

    suspend fun getOrderById(orderId: String): Result<Order> {
        return try {
            Result.Success(api.getOrderById(orderId))
        } catch (e: Exception) {
            Result.Error(e.message ?: "Order not found")
        }
    }

    suspend fun getOrderByNumber(orderNumber: String): Result<Order> {
        return try {
            Result.Success(api.getOrderByNumber(orderNumber))
        } catch (e: Exception) {
            Result.Error(e.message ?: "Order not found")
        }
    }

    suspend fun getOrders(status: String? = null, limit: Int = 50): Result<List<Order>> {
        return try {
            Result.Success(api.getOrders(status, limit))
        } catch (e: Exception) {
            Result.Error(e.message ?: "Failed to load orders")
        }
    }

    suspend fun updateOrderStatus(orderId: String, status: String): Result<Unit> {
        return try {
            api.updateOrderStatus(orderId, status)
            Result.Success(Unit)
        } catch (e: Exception) {
            Result.Error(e.message ?: "Failed to update order")
        }
    }

    suspend fun getSuggestedProducts(): Result<List<SuggestedProduct>> {
        return try {
            Result.Success(api.getSuggestedProducts())
        } catch (e: Exception) {
            Result.Error(e.message ?: "Failed to load suggestions")
        }
    }

    suspend fun getPromotionalGifts(): Result<List<PromotionalGift>> {
        return try {
            Result.Success(api.getPromotionalGifts())
        } catch (e: Exception) {
            Result.Error(e.message ?: "Failed to load gifts")
        }
    }

    suspend fun getSystemCurrency(): Result<CurrencyConfig> {
        return try {
            Result.Success(api.getSystemCurrency())
        } catch (e: Exception) {
            Result.Success(CurrencyConfig())
        }
    }

    suspend fun initiatePayment(
        orderId: String,
        amount: Double,
        currency: String,
        paymentMethod: String,
        customerPhone: String? = null
    ): Result<JsonObject> {
        return try {
            Result.Success(api.initiatePayment(orderId, amount, currency, paymentMethod, customerPhone))
        } catch (e: Exception) {
            Result.Error(e.message ?: "Payment initiation failed")
        }
    }

    suspend fun verifyPayment(transactionId: String): Result<JsonObject> {
        return try {
            Result.Success(api.verifyPayment(transactionId))
        } catch (e: Exception) {
            Result.Error(e.message ?: "Payment verification failed")
        }
    }

    suspend fun getAdminUser(userId: String): Result<AdminUser?> {
        return try {
            Result.Success(api.getAdminUser(userId))
        } catch (e: Exception) {
            Result.Error(e.message ?: "Failed to fetch user")
        }
    }

    fun isAuthenticated(): Boolean = supabaseClient.getAuthToken() != null
}
