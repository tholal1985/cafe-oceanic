package com.restaurant.kiosk.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Category(
    val id: String,
    val name: String,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("display_order") val displayOrder: Int = 0,
    @SerialName("is_active") val isActive: Boolean = true,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class Product(
    val id: String,
    @SerialName("category_id") val categoryId: String? = null,
    val name: String,
    val description: String? = null,
    val price: Double,
    @SerialName("image_url") val imageUrl: String? = null,
    @SerialName("is_available") val isAvailable: Boolean = true,
    @SerialName("display_order") val displayOrder: Int = 0,
    val recipe: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    val addons: List<Addon> = emptyList()
)

@Serializable
data class Addon(
    val id: String,
    val name: String,
    val price: Double,
    @SerialName("is_available") val isAvailable: Boolean = true
)

@Serializable
data class Order(
    val id: String,
    @SerialName("order_number") val orderNumber: String,
    @SerialName("total_price") val totalPrice: Double,
    val status: String,
    @SerialName("payment_method") val paymentMethod: String? = null,
    @SerialName("order_type") val orderType: String = "dine-in",
    @SerialName("customer_phone") val customerPhone: String? = null,
    @SerialName("created_at") val createdAt: String,
    @SerialName("updated_at") val updatedAt: String? = null,
    val items: List<OrderItem> = emptyList()
)

@Serializable
data class OrderItem(
    val id: String,
    @SerialName("order_id") val orderId: String,
    @SerialName("product_id") val productId: String,
    @SerialName("product_name") val productName: String,
    @SerialName("product_price") val productPrice: Double,
    val quantity: Int,
    val addons: List<OrderAddon> = emptyList(),
    @SerialName("item_total") val itemTotal: Double,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class OrderAddon(
    val id: String,
    val name: String,
    val price: Double
)

@Serializable
data class AdminUser(
    val id: String,
    val email: String,
    @SerialName("full_name") val fullName: String? = null,
    @SerialName("is_active") val isActive: Boolean = true,
    @SerialName("last_login_at") val lastLoginAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null,
    val roles: List<UserRole> = emptyList()
)

@Serializable
data class UserRole(
    val id: String,
    val name: String,
    @SerialName("display_name") val displayName: String,
    val description: String? = null,
    @SerialName("is_active") val isActive: Boolean = true
)

@Serializable
data class SuggestedProduct(
    val id: String,
    @SerialName("product_id") val productId: String,
    @SerialName("suggestion_type") val suggestionType: String,
    @SerialName("display_text") val displayText: String? = null,
    @SerialName("display_order") val displayOrder: Int = 0,
    @SerialName("is_active") val isActive: Boolean = true,
    val product: Product? = null
)

@Serializable
data class PromotionalGift(
    val id: String,
    @SerialName("product_id") val productId: String,
    @SerialName("minimum_order_value") val minimumOrderValue: Double,
    @SerialName("gift_title") val giftTitle: String,
    @SerialName("gift_description") val giftDescription: String? = null,
    @SerialName("is_active") val isActive: Boolean = true,
    val priority: Int = 0,
    val product: Product? = null
)

@Serializable
data class PaymentTransaction(
    val id: String,
    @SerialName("order_id") val orderId: String,
    @SerialName("transaction_reference") val transactionReference: String? = null,
    val amount: Double,
    val currency: String,
    val status: String,
    @SerialName("payment_method") val paymentMethod: String? = null,
    @SerialName("error_message") val errorMessage: String? = null,
    @SerialName("initiated_at") val initiatedAt: String? = null,
    @SerialName("completed_at") val completedAt: String? = null,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class SystemSetting(
    val id: String,
    @SerialName("setting_key") val settingKey: String,
    @SerialName("setting_value") val settingValue: kotlinx.serialization.json.JsonElement,
    @SerialName("setting_type") val settingType: String? = null,
    val description: String? = null
)

@Serializable
data class AuthResponse(
    @SerialName("access_token") val accessToken: String,
    @SerialName("refresh_token") val refreshToken: String,
    @SerialName("token_type") val tokenType: String,
    @SerialName("expires_in") val expiresIn: Int,
    val user: AuthUser
)

@Serializable
data class AuthUser(
    val id: String,
    val email: String? = null,
    @SerialName("created_at") val createdAt: String? = null
)

@Serializable
data class SupabaseError(
    val message: String,
    val hint: String? = null,
    val details: String? = null,
    val code: String? = null
)

data class CartItem(
    val id: String = java.util.UUID.randomUUID().toString(),
    val product: Product,
    val quantity: Int,
    val selectedAddons: List<Addon>,
    val itemTotal: Double = product.price * quantity + selectedAddons.sumOf { it.price } * quantity
)

data class CurrencyConfig(
    val code: String = "MVR",
    val symbol: String = "ر.م",
    val symbolPosition: String = "after",
    val decimalPlaces: Int = 2,
    val thousandSeparator: String = ","
)

sealed class Result<out T> {
    data class Success<T>(val data: T) : Result<T>()
    data class Error(val message: String, val code: Int? = null) : Result<Nothing>()
    object Loading : Result<Nothing>()
}
