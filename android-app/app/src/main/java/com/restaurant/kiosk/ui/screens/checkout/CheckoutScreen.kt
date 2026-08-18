package com.restaurant.kiosk.ui.screens.checkout

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.restaurant.kiosk.data.model.CartItem
import com.restaurant.kiosk.ui.components.*
import com.restaurant.kiosk.ui.theme.*
import com.restaurant.kiosk.util.format
import com.restaurant.kiosk.viewmodel.CheckoutViewModel
import com.restaurant.kiosk.viewmodel.SharedViewModel

@Composable
fun CheckoutScreen(
    onBack: () -> Unit,
    onProceedToPayment: (String) -> Unit,
    viewModel: CheckoutViewModel = hiltViewModel(),
    sharedViewModel: SharedViewModel = hiltViewModel()
) {
    val cartItems by viewModel.cartManager.cartItems.collectAsStateWithLifecycle()
    val isCreatingOrder by viewModel.isCreatingOrder.collectAsStateWithLifecycle()
    val error by viewModel.error.collectAsStateWithLifecycle()
    val eligibleGifts by viewModel.eligibleGifts.collectAsStateWithLifecycle()
    val currency by sharedViewModel.currency.collectAsStateWithLifecycle()

    var orderType by remember { mutableStateOf("dine-in") }
    var customerPhone by remember { mutableStateOf("") }
    var showPhoneDialog by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Your Order", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Text(
                            "${cartItems.sumOf { it.quantity }} items",
                            style = MaterialTheme.typography.bodySmall,
                            color = OnSurfaceVariant
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (cartItems.isNotEmpty()) {
                        TextButton(
                            onClick = { viewModel.cartManager.clearCart() },
                            contentPadding = PaddingValues(horizontal = 12.dp)
                        ) {
                            Text("Clear", color = Error, fontSize = 14.sp)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        },
        containerColor = Surface
    ) { padding ->
        if (cartItems.isEmpty()) {
            EmptyState(
                icon = Icons.Default.ShoppingCart,
                title = "Your cart is empty",
                subtitle = "Add items from the menu to get started",
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                action = {
                    KioskButton("Browse Menu", onClick = onBack, icon = Icons.Default.ArrowBack)
                }
            )
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
            ) {
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    item {
                        OrderTypeSelector(
                            selectedType = orderType,
                            onTypeSelected = { orderType = it }
                        )
                    }

                    items(cartItems) { item ->
                        CartItemRow(
                            item = item,
                            currency = currency,
                            onQuantityChange = { qty -> viewModel.cartManager.updateQuantity(item.id, qty) },
                            onRemove = { viewModel.cartManager.removeFromCart(item.id) }
                        )
                    }

                    if (eligibleGifts.isNotEmpty()) {
                        item {
                            GiftsBanner(gifts = eligibleGifts)
                        }
                    }

                    item {
                        OrderSummaryCard(
                            cartItems = cartItems,
                            currency = currency,
                            customerPhone = customerPhone,
                            onPhoneClick = { showPhoneDialog = true }
                        )
                    }

                    if (error != null) {
                        item {
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(12.dp))
                                    .background(ErrorLight)
                                    .padding(12.dp)
                            ) {
                                Row(verticalAlignment = Alignment.CenterVertically) {
                                    Icon(Icons.Default.Warning, contentDescription = null, tint = Error, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(8.dp))
                                    Text(error!!, color = Error, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                        }
                    }

                    item { Spacer(Modifier.height(4.dp)) }
                }

                Surface(
                    shadowElevation = 16.dp,
                    color = Color.White
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp)
                            .navigationBarsPadding()
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text("Total", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold, color = OnSurface)
                            Text(
                                currency.format(cartItems.sumOf { it.itemTotal }),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = Primary
                            )
                        }
                        Spacer(Modifier.height(10.dp))
                        KioskButton(
                            text = "Place Order",
                            onClick = {
                                viewModel.createOrder(orderType, customerPhone.ifBlank { null }) { orderId ->
                                    onProceedToPayment(orderId)
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                            loading = isCreatingOrder,
                            icon = Icons.Default.Payment
                        )
                    }
                }
            }
        }
    }

    if (showPhoneDialog) {
        AlertDialog(
            onDismissRequest = { showPhoneDialog = false },
            title = { Text("Phone Number", fontWeight = FontWeight.Bold) },
            text = {
                OutlinedTextField(
                    value = customerPhone,
                    onValueChange = { customerPhone = it },
                    label = { Text("Mobile number (optional)") },
                    leadingIcon = { Icon(Icons.Default.Phone, contentDescription = null) },
                    placeholder = { Text("+960 xxx xxxx") },
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth()
                )
            },
            confirmButton = {
                TextButton(onClick = { showPhoneDialog = false }) {
                    Text("Done", color = Primary, fontWeight = FontWeight.SemiBold)
                }
            },
            dismissButton = {
                TextButton(onClick = {
                    customerPhone = ""
                    showPhoneDialog = false
                }) {
                    Text("Clear", color = OnSurfaceVariant)
                }
            }
        )
    }
}

@Composable
private fun OrderTypeSelector(selectedType: String, onTypeSelected: (String) -> Unit) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Text("Order Type", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = OnSurface)
            Spacer(Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(10.dp)
            ) {
                listOf(
                    "dine-in" to Icons.Default.TableRestaurant,
                    "takeaway" to Icons.Default.TakeoutDining
                ).forEach { (type, icon) ->
                    val isSelected = selectedType == type
                    OutlinedCard(
                        modifier = Modifier
                            .weight(1f)
                            .clickable { onTypeSelected(type) },
                        shape = RoundedCornerShape(12.dp),
                        border = BorderStroke(if (isSelected) 2.dp else 1.dp, if (isSelected) Primary else Outline),
                        colors = CardDefaults.outlinedCardColors(
                            containerColor = if (isSelected) PrimaryLight else Color.White
                        )
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 14.dp, horizontal = 8.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Icon(
                                icon,
                                contentDescription = null,
                                tint = if (isSelected) Primary else OnSurfaceVariant,
                                modifier = Modifier.size(26.dp)
                            )
                            Spacer(Modifier.height(6.dp))
                            Text(
                                type.replaceFirstChar { it.uppercase() }.replace("-", " "),
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                                color = if (isSelected) Primary else OnSurfaceVariant
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun CartItemRow(
    item: CartItem,
    currency: com.restaurant.kiosk.data.model.CurrencyConfig,
    onQuantityChange: (Int) -> Unit,
    onRemove: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(60.dp)
                    .clip(RoundedCornerShape(10.dp))
                    .background(PrimaryLight),
                contentAlignment = Alignment.Center
            ) {
                if (item.product.imageUrl != null) {
                    coil.compose.AsyncImage(
                        model = item.product.imageUrl,
                        contentDescription = item.product.name,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxSize()
                            .clip(RoundedCornerShape(10.dp))
                    )
                } else {
                    Icon(
                        Icons.Default.Restaurant,
                        contentDescription = null,
                        tint = Primary,
                        modifier = Modifier.size(28.dp)
                    )
                }
            }

            Spacer(Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    item.product.name,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = OnSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                if (item.selectedAddons.isNotEmpty()) {
                    Spacer(Modifier.height(2.dp))
                    Text(
                        item.selectedAddons.joinToString(", ") { it.name },
                        style = MaterialTheme.typography.bodySmall,
                        color = OnSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        fontSize = 11.sp
                    )
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    currency.format(item.itemTotal),
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    color = Primary
                )
            }

            Spacer(Modifier.width(8.dp))

            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                IconButton(
                    onClick = onRemove,
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        Icons.Default.Delete,
                        contentDescription = "Remove",
                        tint = Error,
                        modifier = Modifier.size(18.dp)
                    )
                }
                QuantitySelector(
                    quantity = item.quantity,
                    onIncrement = { onQuantityChange(item.quantity + 1) },
                    onDecrement = { onQuantityChange(item.quantity - 1) }
                )
            }
        }
    }
}

@Composable
private fun GiftsBanner(gifts: List<com.restaurant.kiosk.data.model.PromotionalGift>) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = AccentLight),
        elevation = CardDefaults.cardElevation(defaultElevation = 0.dp),
        border = BorderStroke(1.dp, Accent.copy(alpha = 0.4f))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(Accent),
                contentAlignment = Alignment.Center
            ) {
                Icon(Icons.Default.CardGiftcard, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
            }
            Spacer(Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text("Free Gift Unlocked!", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = Color(0xFF78350F))
                Text(gifts.first().giftTitle, style = MaterialTheme.typography.bodySmall, color = Color(0xFF92400E), maxLines = 1, overflow = TextOverflow.Ellipsis)
            }
        }
    }
}

@Composable
private fun OrderSummaryCard(
    cartItems: List<CartItem>,
    currency: com.restaurant.kiosk.data.model.CurrencyConfig,
    customerPhone: String,
    onPhoneClick: () -> Unit
) {
    Card(
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Order Summary", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = OnSurface)
            Spacer(Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Subtotal", style = MaterialTheme.typography.bodyMedium, color = OnSurfaceVariant)
                Text(currency.format(cartItems.sumOf { it.itemTotal }), style = MaterialTheme.typography.bodyMedium, color = OnSurface, fontWeight = FontWeight.Medium)
            }
            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp), color = Outline)
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text("Total", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = OnSurface)
                Text(currency.format(cartItems.sumOf { it.itemTotal }), style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = Primary)
            }
            Spacer(Modifier.height(12.dp))
            OutlinedButton(
                onClick = onPhoneClick,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(10.dp),
                border = BorderStroke(1.dp, if (customerPhone.isBlank()) Outline else Primary),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = OnSurface),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp)
            ) {
                Icon(
                    Icons.Default.Phone,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = if (customerPhone.isBlank()) OnSurfaceVariant else Primary
                )
                Spacer(Modifier.width(8.dp))
                Text(
                    if (customerPhone.isBlank()) "Add phone for notifications" else customerPhone,
                    color = if (customerPhone.isBlank()) OnSurfaceVariant else OnSurface,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}
