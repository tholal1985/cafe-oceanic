package com.restaurant.kiosk.data.remote

import com.restaurant.kiosk.data.model.*
import io.ktor.client.call.body
import io.ktor.client.request.*
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.contentType
import kotlinx.serialization.json.*
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SupabaseApi @Inject constructor(
    private val supabaseClient: SupabaseClient
) {
    private val baseUrl get() = supabaseClient.supabaseUrl
    private val restUrl get() = "$baseUrl/rest/v1"
    private val authUrl get() = "$baseUrl/auth/v1"
    private val functionsUrl get() = "$baseUrl/functions/v1"

    suspend fun signIn(email: String, password: String): AuthResponse {
        val client = supabaseClient.buildAnonClient()
        val response = client.post("$authUrl/token?grant_type=password") {
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject {
                put("email", email)
                put("password", password)
            })
        }
        if (!response.status.value.toString().startsWith("2")) {
            val error = response.body<SupabaseError>()
            throw Exception(error.message)
        }
        return response.body()
    }

    suspend fun signOut(token: String) {
        val client = supabaseClient.buildClient(token)
        client.post("$authUrl/logout")
    }

    suspend fun getCategories(): List<Category> {
        val client = supabaseClient.buildAnonClient()
        return client.get("$restUrl/categories") {
            parameter("is_active", "eq.true")
            parameter("order", "display_order.asc")
        }.body()
    }

    suspend fun getProducts(categoryId: String? = null): List<Product> {
        val client = supabaseClient.buildAnonClient()
        return client.get("$restUrl/products") {
            parameter("is_available", "eq.true")
            parameter("order", "display_order.asc")
            if (categoryId != null) parameter("category_id", "eq.$categoryId")
        }.body()
    }

    suspend fun getProductAddons(productId: String): List<Addon> {
        val client = supabaseClient.buildAnonClient()
        val joins = client.get("$restUrl/product_addons") {
            parameter("product_id", "eq.$productId")
            parameter("select", "addon_id")
        }.body<List<JsonObject>>()
        val addonIds = joins.mapNotNull { it["addon_id"]?.jsonPrimitive?.content }
        if (addonIds.isEmpty()) return emptyList()
        return client.get("$restUrl/addons") {
            parameter("id", "in.(${addonIds.joinToString(",")})")
            parameter("is_available", "eq.true")
        }.body()
    }

    suspend fun createOrder(
        items: List<CartItem>,
        orderType: String,
        customerPhone: String?
    ): Order {
        val client = supabaseClient.buildAnonClient()
        val totalPrice = items.sumOf { it.itemTotal }
        val orderBody = buildJsonObject {
            put("total_price", totalPrice)
            put("status", "pending")
            put("order_type", orderType)
            if (customerPhone != null) put("customer_phone", customerPhone)
        }
        val orderResponse = client.post("$restUrl/orders") {
            contentType(ContentType.Application.Json)
            setBody(orderBody)
        }.body<List<JsonObject>>().first()

        val orderId = orderResponse["id"]!!.jsonPrimitive.content
        val orderNumber = orderResponse["order_number"]!!.jsonPrimitive.content

        val orderItemsBody = buildJsonArray {
            items.forEach { cartItem ->
                addJsonObject {
                    put("order_id", orderId)
                    put("product_id", cartItem.product.id)
                    put("product_name", cartItem.product.name)
                    put("product_price", cartItem.product.price)
                    put("quantity", cartItem.quantity)
                    put("item_total", cartItem.itemTotal)
                    put("addons", buildJsonArray {
                        cartItem.selectedAddons.forEach { addon ->
                            addJsonObject {
                                put("id", addon.id)
                                put("name", addon.name)
                                put("price", addon.price)
                            }
                        }
                    })
                }
            }
        }

        client.post("$restUrl/order_items") {
            contentType(ContentType.Application.Json)
            setBody(orderItemsBody)
        }

        return getOrderById(orderId)
    }

    suspend fun getOrderById(orderId: String): Order {
        val client = supabaseClient.buildAnonClient()
        val orders = client.get("$restUrl/orders") {
            parameter("id", "eq.$orderId")
            parameter("select", "*,order_items(*)")
        }.body<List<Order>>()
        return orders.first()
    }

    suspend fun getOrderByNumber(orderNumber: String): Order {
        val client = supabaseClient.buildAnonClient()
        val orders = client.get("$restUrl/orders") {
            parameter("order_number", "eq.$orderNumber")
            parameter("select", "*,order_items(*)")
        }.body<List<Order>>()
        return orders.first()
    }

    suspend fun getOrders(status: String? = null, limit: Int = 50): List<Order> {
        val client = supabaseClient.buildClient()
        return client.get("$restUrl/orders") {
            parameter("select", "*,order_items(*)")
            parameter("order", "created_at.desc")
            parameter("limit", limit)
            if (status != null) parameter("status", "eq.$status")
        }.body()
    }

    suspend fun updateOrderStatus(orderId: String, status: String) {
        val client = supabaseClient.buildClient()
        client.patch("$restUrl/orders") {
            parameter("id", "eq.$orderId")
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject { put("status", status) })
        }
    }

    suspend fun getSuggestedProducts(): List<SuggestedProduct> {
        val client = supabaseClient.buildAnonClient()
        return client.get("$restUrl/suggested_products") {
            parameter("is_active", "eq.true")
            parameter("order", "display_order.asc")
            parameter("select", "*,product:products(*)")
        }.body()
    }

    suspend fun getPromotionalGifts(): List<PromotionalGift> {
        val client = supabaseClient.buildAnonClient()
        return client.get("$restUrl/promotional_gifts") {
            parameter("is_active", "eq.true")
            parameter("order", "priority.asc")
            parameter("select", "*,product:products(*)")
        }.body()
    }

    suspend fun getSystemCurrency(): CurrencyConfig {
        val client = supabaseClient.buildAnonClient()
        val settings = client.get("$restUrl/system_settings") {
            parameter("setting_key", "eq.currency")
        }.body<List<SystemSetting>>()
        val setting = settings.firstOrNull() ?: return CurrencyConfig()
        return try {
            val obj = setting.settingValue.jsonObject
            CurrencyConfig(
                code = obj["code"]?.jsonPrimitive?.content ?: "MVR",
                symbol = obj["symbol"]?.jsonPrimitive?.content ?: "ر.م",
                symbolPosition = obj["symbolPosition"]?.jsonPrimitive?.content ?: "after",
                decimalPlaces = obj["decimalPlaces"]?.jsonPrimitive?.int ?: 2,
                thousandSeparator = obj["thousandSeparator"]?.jsonPrimitive?.content ?: ","
            )
        } catch (e: Exception) {
            CurrencyConfig()
        }
    }

    suspend fun initiatePayment(
        orderId: String,
        amount: Double,
        currency: String,
        paymentMethod: String,
        customerPhone: String? = null
    ): JsonObject {
        val client = supabaseClient.buildAnonClient()
        return client.post("$functionsUrl/initiate-payment") {
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject {
                put("orderId", orderId)
                put("amount", amount)
                put("currency", currency)
                put("paymentMethod", paymentMethod)
                if (customerPhone != null) put("customerPhone", customerPhone)
                put("redirectUrl", "restaurantkiosk://payment")
                put("callbackUrl", "$functionsUrl/payment-webhook")
            })
        }.body()
    }

    suspend fun verifyPayment(transactionId: String): JsonObject {
        val client = supabaseClient.buildAnonClient()
        return client.post("$functionsUrl/verify-payment") {
            contentType(ContentType.Application.Json)
            setBody(buildJsonObject { put("transactionId", transactionId) })
        }.body()
    }

    suspend fun getAdminUser(userId: String): AdminUser? {
        val client = supabaseClient.buildClient()
        val users = client.get("$restUrl/admin_users") {
            parameter("id", "eq.$userId")
        }.body<List<AdminUser>>()
        return users.firstOrNull()
    }
}
