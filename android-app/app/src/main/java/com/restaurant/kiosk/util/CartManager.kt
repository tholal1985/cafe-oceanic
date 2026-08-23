package com.restaurant.kiosk.util

import com.restaurant.kiosk.data.model.Addon
import com.restaurant.kiosk.data.model.CartItem
import com.restaurant.kiosk.data.model.CurrencyConfig
import com.restaurant.kiosk.data.model.Product
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class CartManager @Inject constructor() {

    private val _cartItems = MutableStateFlow<List<CartItem>>(emptyList())
    val cartItems: StateFlow<List<CartItem>> = _cartItems.asStateFlow()

    private val _currentOrderId = MutableStateFlow<String?>(null)
    val currentOrderId: StateFlow<String?> = _currentOrderId.asStateFlow()

    fun addToCart(product: Product, quantity: Int, selectedAddons: List<Addon>) {
        val itemTotal = (product.price + selectedAddons.sumOf { it.price }) * quantity
        val newItem = CartItem(
            id = UUID.randomUUID().toString(),
            product = product,
            quantity = quantity,
            selectedAddons = selectedAddons,
            itemTotal = itemTotal
        )
        val current = _cartItems.value.toMutableList()
        val existingIndex = current.indexOfFirst { it.product.id == product.id && it.selectedAddons == selectedAddons }
        if (existingIndex >= 0) {
            val existing = current[existingIndex]
            val newQty = existing.quantity + quantity
            current[existingIndex] = existing.copy(
                quantity = newQty,
                itemTotal = (product.price + selectedAddons.sumOf { it.price }) * newQty
            )
        } else {
            current.add(newItem)
        }
        _cartItems.value = current
    }

    fun removeFromCart(itemId: String) {
        _cartItems.value = _cartItems.value.filter { it.id != itemId }
    }

    fun updateQuantity(itemId: String, quantity: Int) {
        if (quantity <= 0) {
            removeFromCart(itemId)
            return
        }
        _cartItems.value = _cartItems.value.map { item ->
            if (item.id == itemId) {
                val unitPrice = item.product.price + item.selectedAddons.sumOf { it.price }
                item.copy(quantity = quantity, itemTotal = unitPrice * quantity)
            } else item
        }
    }

    fun clearCart() {
        _cartItems.value = emptyList()
        _currentOrderId.value = null
    }

    fun setCurrentOrderId(orderId: String?) {
        _currentOrderId.value = orderId
    }

    fun getCartTotal(): Double = _cartItems.value.sumOf { it.itemTotal }

    fun getItemCount(): Int = _cartItems.value.sumOf { it.quantity }
}

fun CurrencyConfig.format(amount: Double): String {
    val formatted = String.format("%.${decimalPlaces}f", amount)
    val parts = formatted.split(".")
    val intPart = parts[0].reversed().chunked(3).joinToString(thousandSeparator).reversed()
    val decimalPart = if (decimalPlaces > 0) ".${parts.getOrElse(1) { "0".repeat(decimalPlaces) }}" else ""
    val number = "$intPart$decimalPart"
    return if (symbolPosition == "before") "$symbol$number" else "$number $symbol"
}
