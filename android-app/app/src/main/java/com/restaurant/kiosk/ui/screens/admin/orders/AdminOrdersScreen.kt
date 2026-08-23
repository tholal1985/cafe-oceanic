package com.restaurant.kiosk.ui.screens.admin.orders

import androidx.compose.animation.*
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.restaurant.kiosk.data.model.Order
import com.restaurant.kiosk.ui.components.EmptyState
import com.restaurant.kiosk.ui.components.StatusBadge
import com.restaurant.kiosk.ui.theme.*
import com.restaurant.kiosk.viewmodel.AdminViewModel

@Composable
fun AdminOrdersScreen(
    onBack: () -> Unit,
    viewModel: AdminViewModel = hiltViewModel()
) {
    val orders by viewModel.orders.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()

    var selectedFilter by remember { mutableStateOf<String?>(null) }
    var expandedOrderId by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(selectedFilter) {
        viewModel.loadOrders(selectedFilter)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Orders", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.loadOrders(selectedFilter) }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        },
        containerColor = Surface
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding)) {
            LazyRow(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                val filters = listOf(null to "All", "pending" to "Pending", "preparing" to "Preparing", "ready" to "Ready", "completed" to "Completed", "cancelled" to "Cancelled")
                items(filters.size) { i ->
                    val (value, label) = filters[i]
                    FilterChip(
                        selected = selectedFilter == value,
                        onClick = { selectedFilter = value },
                        label = { Text(label, fontWeight = if (selectedFilter == value) FontWeight.SemiBold else FontWeight.Normal) },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = Primary,
                            selectedLabelColor = Color.White,
                            containerColor = Color.White,
                            labelColor = OnSurfaceVariant
                        ),
                        border = FilterChipDefaults.filterChipBorder(
                            enabled = true,
                            selected = selectedFilter == value,
                            borderColor = Outline,
                            selectedBorderColor = Primary
                        )
                    )
                }
            }

            HorizontalDivider(color = Outline)

            if (isLoading) {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = Primary)
                }
            } else if (orders.isEmpty()) {
                EmptyState(
                    icon = Icons.Default.Receipt,
                    title = "No orders found",
                    subtitle = "Orders matching your filter will appear here",
                    modifier = Modifier.fillMaxSize()
                )
            } else {
                LazyColumn(
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(orders, key = { it.id }) { order ->
                        OrderCard(
                            order = order,
                            isExpanded = expandedOrderId == order.id,
                            onToggleExpand = {
                                expandedOrderId = if (expandedOrderId == order.id) null else order.id
                            },
                            onStatusUpdate = { status -> viewModel.updateOrderStatus(order.id, status) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun OrderCard(
    order: Order,
    isExpanded: Boolean,
    onToggleExpand: () -> Unit,
    onStatusUpdate: (String) -> Unit
) {
    Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable { onToggleExpand() }
                    .padding(16.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(
                        modifier = Modifier
                            .size(44.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(PrimaryLight),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(Icons.Default.Receipt, contentDescription = null, tint = Primary, modifier = Modifier.size(24.dp))
                    }
                    Spacer(Modifier.width(12.dp))
                    Column {
                        Text("#${order.orderNumber}", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = OnSurface)
                        Text(
                            "${order.orderType.replaceFirstChar { it.uppercase() }.replace("-", " ")} • ${order.items.size} item(s)",
                            style = MaterialTheme.typography.bodySmall,
                            color = OnSurfaceVariant
                        )
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    StatusBadge(order.status)
                    Icon(
                        if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                        contentDescription = null,
                        tint = OnSurfaceVariant,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }

            AnimatedVisibility(visible = isExpanded) {
                Column {
                    HorizontalDivider(color = Outline)
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        order.items.forEach { item ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text("${item.quantity}x ${item.productName}", style = MaterialTheme.typography.bodyMedium, color = OnSurface)
                                    if (item.addons.isNotEmpty()) {
                                        Text(
                                            "+ ${item.addons.joinToString(", ") { it.name }}",
                                            style = MaterialTheme.typography.bodySmall,
                                            color = OnSurfaceVariant
                                        )
                                    }
                                }
                                Text("MVR ${String.format("%.2f", item.itemTotal)}", style = MaterialTheme.typography.bodyMedium, color = OnSurface)
                            }
                        }

                        HorizontalDivider(color = Outline)

                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Total", fontWeight = FontWeight.Bold, color = OnSurface)
                            Text("MVR ${String.format("%.2f", order.totalPrice)}", fontWeight = FontWeight.Bold, color = Primary)
                        }

                        if (order.customerPhone != null) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.Phone, contentDescription = null, tint = OnSurfaceVariant, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(6.dp))
                                Text(order.customerPhone, style = MaterialTheme.typography.bodySmall, color = OnSurfaceVariant)
                            }
                        }

                        val nextStatuses = when (order.status) {
                            "pending" -> listOf("preparing" to "Start Preparing", "cancelled" to "Cancel")
                            "preparing" -> listOf("ready" to "Mark Ready", "cancelled" to "Cancel")
                            "ready" -> listOf("completed" to "Complete Order")
                            else -> emptyList()
                        }

                        if (nextStatuses.isNotEmpty()) {
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                nextStatuses.forEach { (status, label) ->
                                    val (bg, fg) = when (status) {
                                        "preparing" -> Pair(Primary, Color.White)
                                        "ready" -> Pair(Success, Color.White)
                                        "completed" -> Pair(Primary, Color.White)
                                        "cancelled" -> Pair(ErrorLight, Error)
                                        else -> Pair(SurfaceVariant, OnSurface)
                                    }
                                    Button(
                                        onClick = { onStatusUpdate(status) },
                                        modifier = Modifier.weight(1f),
                                        shape = RoundedCornerShape(10.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = bg, contentColor = fg)
                                    ) {
                                        Text(label, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold)
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
