package com.restaurant.kiosk.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.restaurant.kiosk.data.model.*
import com.restaurant.kiosk.data.repository.KioskRepository
import com.restaurant.kiosk.util.CartManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class SharedViewModel @Inject constructor(
    val cartManager: CartManager,
    private val repository: KioskRepository
) : ViewModel() {

    private val _currency = MutableStateFlow(CurrencyConfig())
    val currency: StateFlow<CurrencyConfig> = _currency.asStateFlow()

    init {
        loadCurrency()
    }

    private fun loadCurrency() {
        viewModelScope.launch {
            when (val result = repository.getSystemCurrency()) {
                is Result.Success -> _currency.value = result.data
                else -> {}
            }
        }
    }
}

@HiltViewModel
class WelcomeViewModel @Inject constructor(
    private val repository: KioskRepository
) : ViewModel() {

    private val _categories = MutableStateFlow<List<Category>>(emptyList())
    val categories: StateFlow<List<Category>> = _categories.asStateFlow()

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    init {
        loadCategories()
    }

    fun loadCategories() {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            when (val result = repository.getCategories()) {
                is Result.Success -> _categories.value = result.data
                is Result.Error -> _error.value = result.message
                else -> {}
            }
            _isLoading.value = false
        }
    }
}

@HiltViewModel
class MenuViewModel @Inject constructor(
    private val repository: KioskRepository,
    val cartManager: CartManager
) : ViewModel() {

    private val _categories = MutableStateFlow<List<Category>>(emptyList())
    val categories: StateFlow<List<Category>> = _categories.asStateFlow()

    private val _products = MutableStateFlow<List<Product>>(emptyList())
    val products: StateFlow<List<Product>> = _products.asStateFlow()

    private val _selectedCategoryId = MutableStateFlow<String?>(null)
    val selectedCategoryId: StateFlow<String?> = _selectedCategoryId.asStateFlow()

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _searchQuery = MutableStateFlow("")
    val searchQuery: StateFlow<String> = _searchQuery.asStateFlow()

    private val _suggestedProducts = MutableStateFlow<List<SuggestedProduct>>(emptyList())
    val suggestedProducts: StateFlow<List<SuggestedProduct>> = _suggestedProducts.asStateFlow()

    val filteredProducts: StateFlow<List<Product>> = combine(_products, _searchQuery) { products, query ->
        if (query.isBlank()) products
        else products.filter { it.name.contains(query, ignoreCase = true) || it.description?.contains(query, ignoreCase = true) == true }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init {
        loadData()
    }

    private fun loadData() {
        viewModelScope.launch {
            loadCategories()
            loadSuggestions()
        }
    }

    fun loadCategories() {
        viewModelScope.launch {
            when (val result = repository.getCategories()) {
                is Result.Success -> _categories.value = result.data
                else -> {}
            }
        }
    }

    fun selectCategory(categoryId: String?) {
        _selectedCategoryId.value = categoryId
        loadProducts(categoryId)
    }

    fun loadProducts(categoryId: String? = _selectedCategoryId.value) {
        viewModelScope.launch {
            _isLoading.value = true
            when (val result = repository.getProducts(categoryId)) {
                is Result.Success -> _products.value = result.data
                else -> {}
            }
            _isLoading.value = false
        }
    }

    fun setSearchQuery(query: String) {
        _searchQuery.value = query
    }

    private fun loadSuggestions() {
        viewModelScope.launch {
            when (val result = repository.getSuggestedProducts()) {
                is Result.Success -> _suggestedProducts.value = result.data
                else -> {}
            }
        }
    }
}

@HiltViewModel
class CheckoutViewModel @Inject constructor(
    val cartManager: CartManager,
    private val repository: KioskRepository
) : ViewModel() {

    private val _isCreatingOrder = MutableStateFlow(false)
    val isCreatingOrder: StateFlow<Boolean> = _isCreatingOrder.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _promotionalGifts = MutableStateFlow<List<PromotionalGift>>(emptyList())
    val promotionalGifts: StateFlow<List<PromotionalGift>> = _promotionalGifts.asStateFlow()

    val eligibleGifts: StateFlow<List<PromotionalGift>> = combine(
        _promotionalGifts, cartManager.cartItems
    ) { gifts, items ->
        val total = items.sumOf { it.itemTotal }
        gifts.filter { it.minimumOrderValue <= total }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    init {
        loadGifts()
    }

    private fun loadGifts() {
        viewModelScope.launch {
            when (val result = repository.getPromotionalGifts()) {
                is Result.Success -> _promotionalGifts.value = result.data
                else -> {}
            }
        }
    }

    fun createOrder(
        orderType: String,
        customerPhone: String?,
        onSuccess: (String) -> Unit
    ) {
        viewModelScope.launch {
            _isCreatingOrder.value = true
            _error.value = null
            val items = cartManager.cartItems.value
            when (val result = repository.createOrder(items, orderType, customerPhone)) {
                is Result.Success -> {
                    cartManager.setCurrentOrderId(result.data.id)
                    onSuccess(result.data.id)
                }
                is Result.Error -> _error.value = result.message
                else -> {}
            }
            _isCreatingOrder.value = false
        }
    }
}

@HiltViewModel
class PaymentViewModel @Inject constructor(
    private val repository: KioskRepository
) : ViewModel() {

    private val _order = MutableStateFlow<Order?>(null)
    val order: StateFlow<Order?> = _order.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _paymentStatus = MutableStateFlow<String?>(null)
    val paymentStatus: StateFlow<String?> = _paymentStatus.asStateFlow()

    private val _currency = MutableStateFlow(CurrencyConfig())
    val currency: StateFlow<CurrencyConfig> = _currency.asStateFlow()

    fun loadOrder(orderId: String) {
        viewModelScope.launch {
            _isLoading.value = true
            when (val result = repository.getOrderById(orderId)) {
                is Result.Success -> _order.value = result.data
                is Result.Error -> _error.value = result.message
                else -> {}
            }
            when (val result = repository.getSystemCurrency()) {
                is Result.Success -> _currency.value = result.data
                else -> {}
            }
            _isLoading.value = false
        }
    }

    fun processCashPayment(orderId: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            when (val result = repository.updateOrderStatus(orderId, "preparing")) {
                is Result.Success -> {
                    _paymentStatus.value = "completed"
                    onSuccess()
                }
                is Result.Error -> _error.value = result.message
                else -> {}
            }
            _isLoading.value = false
        }
    }
}

@HiltViewModel
class OrderTrackingViewModel @Inject constructor(
    private val repository: KioskRepository
) : ViewModel() {

    private val _order = MutableStateFlow<Order?>(null)
    val order: StateFlow<Order?> = _order.asStateFlow()

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _currency = MutableStateFlow(CurrencyConfig())
    val currency: StateFlow<CurrencyConfig> = _currency.asStateFlow()

    fun loadOrder(orderId: String) {
        viewModelScope.launch {
            _isLoading.value = true
            when (val result = repository.getOrderById(orderId)) {
                is Result.Success -> _order.value = result.data
                else -> {}
            }
            when (val result = repository.getSystemCurrency()) {
                is Result.Success -> _currency.value = result.data
                else -> {}
            }
            _isLoading.value = false
        }
    }

    fun refreshOrder(orderId: String) {
        viewModelScope.launch {
            when (val result = repository.getOrderById(orderId)) {
                is Result.Success -> _order.value = result.data
                else -> {}
            }
        }
    }
}

@HiltViewModel
class AdminViewModel @Inject constructor(
    private val repository: KioskRepository
) : ViewModel() {

    private val _isLoggedIn = MutableStateFlow(false)
    val isLoggedIn: StateFlow<Boolean> = _isLoggedIn.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error: StateFlow<String?> = _error.asStateFlow()

    private val _orders = MutableStateFlow<List<Order>>(emptyList())
    val orders: StateFlow<List<Order>> = _orders.asStateFlow()

    private val _products = MutableStateFlow<List<Product>>(emptyList())
    val products: StateFlow<List<Product>> = _products.asStateFlow()

    private val _categories = MutableStateFlow<List<Category>>(emptyList())
    val categories: StateFlow<List<Category>> = _categories.asStateFlow()

    private val _dashboardStats = MutableStateFlow(DashboardStats())
    val dashboardStats: StateFlow<DashboardStats> = _dashboardStats.asStateFlow()

    data class DashboardStats(
        val totalOrders: Int = 0,
        val pendingOrders: Int = 0,
        val preparingOrders: Int = 0,
        val readyOrders: Int = 0,
        val totalRevenue: Double = 0.0
    )

    fun login(email: String, password: String, onSuccess: () -> Unit) {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null
            when (val result = repository.signIn(email, password)) {
                is Result.Success -> {
                    _isLoggedIn.value = true
                    onSuccess()
                }
                is Result.Error -> _error.value = result.message
                else -> {}
            }
            _isLoading.value = false
        }
    }

    fun logout(onComplete: () -> Unit) {
        viewModelScope.launch {
            repository.signOut()
            _isLoggedIn.value = false
            onComplete()
        }
    }

    fun loadDashboard() {
        viewModelScope.launch {
            _isLoading.value = true
            loadOrders()
            val orders = _orders.value
            _dashboardStats.value = DashboardStats(
                totalOrders = orders.size,
                pendingOrders = orders.count { it.status == "pending" },
                preparingOrders = orders.count { it.status == "preparing" },
                readyOrders = orders.count { it.status == "ready" },
                totalRevenue = orders.filter { it.status == "completed" }.sumOf { it.totalPrice }
            )
            _isLoading.value = false
        }
    }

    fun loadOrders(status: String? = null) {
        viewModelScope.launch {
            when (val result = repository.getOrders(status)) {
                is Result.Success -> _orders.value = result.data
                is Result.Error -> _error.value = result.message
                else -> {}
            }
        }
    }

    fun loadProducts() {
        viewModelScope.launch {
            when (val result = repository.getProducts()) {
                is Result.Success -> _products.value = result.data
                else -> {}
            }
        }
    }

    fun loadCategories() {
        viewModelScope.launch {
            when (val result = repository.getCategories()) {
                is Result.Success -> _categories.value = result.data
                else -> {}
            }
        }
    }

    fun updateOrderStatus(orderId: String, status: String) {
        viewModelScope.launch {
            when (val result = repository.updateOrderStatus(orderId, status)) {
                is Result.Success -> loadOrders()
                is Result.Error -> _error.value = result.message
                else -> {}
            }
        }
    }
}

@HiltViewModel
class KitchenViewModel @Inject constructor(
    private val repository: KioskRepository
) : ViewModel() {

    private val _activeOrders = MutableStateFlow<List<Order>>(emptyList())
    val activeOrders: StateFlow<List<Order>> = _activeOrders.asStateFlow()

    private val _isLoading = MutableStateFlow(true)
    val isLoading: StateFlow<Boolean> = _isLoading.asStateFlow()

    init {
        loadActiveOrders()
    }

    fun loadActiveOrders() {
        viewModelScope.launch {
            _isLoading.value = true
            val pending = repository.getOrders("pending")
            val preparing = repository.getOrders("preparing")
            val all = mutableListOf<Order>()
            if (pending is Result.Success) all.addAll(pending.data)
            if (preparing is Result.Success) all.addAll(preparing.data)
            _activeOrders.value = all.sortedBy { it.createdAt }
            _isLoading.value = false
        }
    }

    fun markAsReady(orderId: String) {
        viewModelScope.launch {
            repository.updateOrderStatus(orderId, "ready")
            loadActiveOrders()
        }
    }

    fun markAsPreparing(orderId: String) {
        viewModelScope.launch {
            repository.updateOrderStatus(orderId, "preparing")
            loadActiveOrders()
        }
    }
}
