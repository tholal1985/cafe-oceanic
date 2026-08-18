package com.restaurant.kiosk.ui.screens.menu

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.*
import androidx.compose.foundation.lazy.grid.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil.compose.AsyncImage
import com.restaurant.kiosk.data.model.Addon
import com.restaurant.kiosk.data.model.Product
import com.restaurant.kiosk.ui.components.*
import com.restaurant.kiosk.ui.theme.*
import com.restaurant.kiosk.util.CartManager
import com.restaurant.kiosk.util.format
import com.restaurant.kiosk.viewmodel.MenuViewModel
import com.restaurant.kiosk.viewmodel.SharedViewModel

@Composable
fun MenuScreen(
    initialCategoryId: String?,
    onCheckout: () -> Unit,
    onBack: () -> Unit,
    viewModel: MenuViewModel = hiltViewModel(),
    sharedViewModel: SharedViewModel = hiltViewModel()
) {
    val categories by viewModel.categories.collectAsStateWithLifecycle()
    val products by viewModel.filteredProducts.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
    val selectedCategoryId by viewModel.selectedCategoryId.collectAsStateWithLifecycle()
    val searchQuery by viewModel.searchQuery.collectAsStateWithLifecycle()
    val cartItems by viewModel.cartManager.cartItems.collectAsStateWithLifecycle()
    val currency by sharedViewModel.currency.collectAsStateWithLifecycle()

    val configuration = LocalConfiguration.current
    val isTablet = configuration.screenWidthDp >= 600
    val gridColumns = if (isTablet) 3 else 2

    var selectedProduct by remember { mutableStateOf<Product?>(null) }

    LaunchedEffect(initialCategoryId) {
        viewModel.selectCategory(initialCategoryId)
    }

    Box(modifier = Modifier.fillMaxSize().background(Surface)) {
        Column(modifier = Modifier.fillMaxSize()) {
            TopAppBar(
                title = {
                    Text(
                        text = categories.find { it.id == selectedCategoryId }?.name ?: "All Menu",
                        fontWeight = FontWeight.Bold,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color.White,
                    titleContentColor = OnSurface
                )
            )

            Column(modifier = Modifier.weight(1f)) {
                OutlinedTextField(
                    value = searchQuery,
                    onValueChange = viewModel::setSearchQuery,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    placeholder = { Text("Search dishes...") },
                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = null, modifier = Modifier.size(20.dp)) },
                    trailingIcon = {
                        if (searchQuery.isNotEmpty()) {
                            IconButton(onClick = { viewModel.setSearchQuery("") }) {
                                Icon(Icons.Default.Clear, contentDescription = "Clear", modifier = Modifier.size(18.dp))
                            }
                        }
                    },
                    shape = RoundedCornerShape(12.dp),
                    singleLine = true,
                    colors = OutlinedTextFieldDefaults.colors(
                        unfocusedBorderColor = Outline,
                        focusedBorderColor = Primary,
                        unfocusedContainerColor = Color.White,
                        focusedContainerColor = Color.White
                    )
                )

                if (categories.isNotEmpty()) {
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 4.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        item {
                            CategoryChip(
                                name = "All",
                                isSelected = selectedCategoryId == null,
                                onClick = { viewModel.selectCategory(null) }
                            )
                        }
                        items(categories) { cat ->
                            CategoryChip(
                                name = cat.name,
                                isSelected = selectedCategoryId == cat.id,
                                onClick = { viewModel.selectCategory(cat.id) }
                            )
                        }
                    }
                }

                HorizontalDivider(color = Outline, thickness = 1.dp)

                if (isLoading) {
                    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = Primary)
                    }
                } else if (products.isEmpty()) {
                    EmptyState(
                        icon = Icons.Default.SearchOff,
                        title = "No items found",
                        subtitle = "Try a different category or search term",
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(gridColumns),
                        contentPadding = PaddingValues(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(products) { product ->
                            ProductCard(
                                product = product,
                                currency = currency,
                                onAddToCart = { selectedProduct = product }
                            )
                        }
                    }
                }
            }

            if (cartItems.isNotEmpty()) {
                Surface(
                    shadowElevation = 16.dp,
                    color = Color.White
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp)
                            .navigationBarsPadding(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                "${cartItems.sumOf { it.quantity }} item(s)",
                                style = MaterialTheme.typography.bodySmall,
                                color = OnSurfaceVariant
                            )
                            Text(
                                currency.format(cartItems.sumOf { it.itemTotal }),
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = OnSurface
                            )
                        }
                        Button(
                            onClick = onCheckout,
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Primary),
                            contentPadding = PaddingValues(horizontal = 20.dp, vertical = 12.dp)
                        ) {
                            Icon(Icons.Default.ShoppingCart, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(8.dp))
                            Text("View Cart", fontWeight = FontWeight.SemiBold)
                        }
                    }
                }
            }
        }
    }

    selectedProduct?.let { product ->
        AddToCartDialog(
            product = product,
            currency = currency,
            onDismiss = { selectedProduct = null },
            onAddToCart = { qty, addons ->
                viewModel.cartManager.addToCart(product, qty, addons)
                selectedProduct = null
            }
        )
    }
}

@Composable
private fun CategoryChip(name: String, isSelected: Boolean, onClick: () -> Unit) {
    FilterChip(
        selected = isSelected,
        onClick = onClick,
        label = { Text(name, fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal, fontSize = 13.sp) },
        colors = FilterChipDefaults.filterChipColors(
            selectedContainerColor = Primary,
            selectedLabelColor = Color.White,
            containerColor = Color.White,
            labelColor = OnSurfaceVariant
        ),
        border = FilterChipDefaults.filterChipBorder(
            enabled = true,
            selected = isSelected,
            borderColor = Outline,
            selectedBorderColor = Primary
        )
    )
}

@Composable
private fun ProductCard(
    product: Product,
    currency: com.restaurant.kiosk.data.model.CurrencyConfig,
    onAddToCart: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(4f / 3f)
            ) {
                if (product.imageUrl != null) {
                    AsyncImage(
                        model = product.imageUrl,
                        contentDescription = product.name,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Brush.linearGradient(listOf(PrimaryLight, AccentLight))),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Restaurant, contentDescription = null, tint = Primary.copy(alpha = 0.5f), modifier = Modifier.size(36.dp))
                    }
                }
            }

            Column(modifier = Modifier.padding(10.dp)) {
                Text(
                    text = product.name,
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    color = OnSurface,
                    lineHeight = 18.sp
                )
                if (!product.description.isNullOrBlank()) {
                    Spacer(Modifier.height(2.dp))
                    Text(
                        text = product.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = OnSurfaceVariant,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        fontSize = 11.sp
                    )
                }
                Spacer(Modifier.height(8.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = currency.format(product.price),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = Primary,
                        modifier = Modifier.weight(1f)
                    )
                    Box(
                        modifier = Modifier
                            .size(32.dp)
                            .clip(RoundedCornerShape(8.dp))
                            .background(Primary)
                            .clickable { onAddToCart() },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Add, contentDescription = "Add", tint = Color.White, modifier = Modifier.size(18.dp))
                    }
                }
            }
        }
    }
}

@Composable
private fun AddToCartDialog(
    product: Product,
    currency: com.restaurant.kiosk.data.model.CurrencyConfig,
    onDismiss: () -> Unit,
    onAddToCart: (Int, List<Addon>) -> Unit
) {
    var quantity by remember { mutableIntStateOf(1) }
    var selectedAddons by remember { mutableStateOf(setOf<String>()) }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            shape = RoundedCornerShape(20.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            Column {
                if (product.imageUrl != null) {
                    AsyncImage(
                        model = product.imageUrl,
                        contentDescription = product.name,
                        contentScale = ContentScale.Crop,
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(160.dp)
                            .clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp))
                    )
                }

                Column(
                    modifier = Modifier
                        .verticalScroll(rememberScrollState())
                        .padding(20.dp)
                ) {
                    Text(product.name, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold, color = OnSurface)
                    if (!product.description.isNullOrBlank()) {
                        Spacer(Modifier.height(4.dp))
                        Text(product.description, style = MaterialTheme.typography.bodyMedium, color = OnSurfaceVariant, maxLines = 3, overflow = TextOverflow.Ellipsis)
                    }
                    Spacer(Modifier.height(16.dp))

                    if (product.addons.isNotEmpty()) {
                        Text("Add-ons", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold, color = OnSurface)
                        Spacer(Modifier.height(6.dp))
                        product.addons.forEach { addon ->
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .clip(RoundedCornerShape(8.dp))
                                    .clickable {
                                        selectedAddons = if (addon.id in selectedAddons)
                                            selectedAddons - addon.id
                                        else selectedAddons + addon.id
                                    }
                                    .padding(vertical = 2.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Checkbox(
                                    checked = addon.id in selectedAddons,
                                    onCheckedChange = { checked ->
                                        selectedAddons = if (checked) selectedAddons + addon.id else selectedAddons - addon.id
                                    },
                                    colors = CheckboxDefaults.colors(checkedColor = Primary)
                                )
                                Text(addon.name, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f), color = OnSurface)
                                Text("+${currency.format(addon.price)}", style = MaterialTheme.typography.bodySmall, color = Primary, fontWeight = FontWeight.Medium)
                            }
                        }
                        Spacer(Modifier.height(12.dp))
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Quantity", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Medium, color = OnSurface)
                        QuantitySelector(
                            quantity = quantity,
                            onIncrement = { quantity++ },
                            onDecrement = { if (quantity > 1) quantity-- }
                        )
                    }

                    Spacer(Modifier.height(16.dp))

                    val selectedAddonsList = product.addons.filter { it.id in selectedAddons }
                    val itemTotal = (product.price + selectedAddonsList.sumOf { it.price }) * quantity

                    KioskButton(
                        text = "Add to Cart  ${currency.format(itemTotal)}",
                        onClick = { onAddToCart(quantity, selectedAddonsList) },
                        modifier = Modifier.fillMaxWidth()
                    )
                }
            }
        }
    }
}
