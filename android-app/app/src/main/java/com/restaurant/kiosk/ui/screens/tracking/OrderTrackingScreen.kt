package com.restaurant.kiosk.ui.screens.tracking

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.restaurant.kiosk.ui.components.KioskButton
import com.restaurant.kiosk.ui.components.StatusBadge
import com.restaurant.kiosk.ui.theme.*
import com.restaurant.kiosk.util.format
import com.restaurant.kiosk.viewmodel.OrderTrackingViewModel
import kotlinx.coroutines.delay

@Composable
fun OrderTrackingScreen(
    orderId: String,
    onNewOrder: () -> Unit,
    viewModel: OrderTrackingViewModel = hiltViewModel()
) {
    val order by viewModel.order.collectAsStateWithLifecycle()
    val isLoading by viewModel.isLoading.collectAsStateWithLifecycle()
    val currency by viewModel.currency.collectAsStateWithLifecycle()

    LaunchedEffect(orderId) {
        viewModel.loadOrder(orderId)
    }

    LaunchedEffect(order?.status) {
        val currentStatus = order?.status
        if (currentStatus != "completed" && currentStatus != "cancelled") {
            while (true) {
                delay(10_000)
                viewModel.refreshOrder(orderId)
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Surface)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(Primary)
                .statusBarsPadding()
                .padding(horizontal = 20.dp, vertical = 20.dp),
            contentAlignment = Alignment.Center
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                    "Order Placed!",
                    style = MaterialTheme.typography.headlineSmall,
                    fontWeight = FontWeight.Bold,
                    color = Color.White
                )
                order?.let {
                    Spacer(Modifier.height(2.dp))
                    Text(
                        "Order #${it.orderNumber}",
                        style = MaterialTheme.typography.bodyLarge,
                        color = Color.White.copy(alpha = 0.85f)
                    )
                }
            }
        }

        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp)
        ) {
            Spacer(Modifier.height(16.dp))

            if (isLoading) {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(48.dp),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator(color = Primary)
                }
            } else {
                order?.let { ord ->
                    val currentStep = when (ord.status) {
                        "pending" -> 0
                        "preparing" -> 1
                        "ready" -> 2
                        "completed" -> 3
                        else -> 0
                    }

                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                    ) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(20.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            OrderStatusIcon(status = ord.status)
                            Spacer(Modifier.height(14.dp))
                            Text(
                                text = when (ord.status) {
                                    "pending" -> "Order Received"
                                    "preparing" -> "Being Prepared"
                                    "ready" -> "Ready for Pickup!"
                                    "completed" -> "Order Complete"
                                    "cancelled" -> "Order Cancelled"
                                    else -> "Processing"
                                },
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold,
                                color = OnSurface
                            )
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = when (ord.status) {
                                    "pending" -> "Your order is in the queue"
                                    "preparing" -> "The kitchen is working on your order"
                                    "ready" -> "Please collect your order"
                                    "completed" -> "Thank you for dining with us!"
                                    "cancelled" -> "Your order was cancelled"
                                    else -> "Please wait..."
                                },
                                style = MaterialTheme.typography.bodyMedium,
                                color = OnSurfaceVariant,
                                textAlign = TextAlign.Center
                            )
                        }
                    }

                    Spacer(Modifier.height(12.dp))

                    if (ord.status !in listOf("cancelled")) {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(16.dp),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                        ) {
                            Column(modifier = Modifier.padding(horizontal = 20.dp, vertical = 16.dp)) {
                                Text(
                                    "Order Progress",
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = OnSurface
                                )
                                Spacer(Modifier.height(16.dp))
                                OrderProgressStepper(currentStep = currentStep)
                            }
                        }

                        Spacer(Modifier.height(12.dp))
                    }

                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(16.dp),
                        colors = CardDefaults.cardColors(containerColor = Color.White),
                        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                "Order Details",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold,
                                color = OnSurface
                            )
                            Spacer(Modifier.height(10.dp))
                            ord.items.forEach { item ->
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 3.dp),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        "${item.quantity}x ${item.productName}",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = OnSurface,
                                        modifier = Modifier.weight(1f),
                                        maxLines = 1,
                                        overflow = TextOverflow.Ellipsis
                                    )
                                    Spacer(Modifier.width(8.dp))
                                    Text(
                                        currency.format(item.itemTotal),
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = OnSurface,
                                        fontWeight = FontWeight.Medium
                                    )
                                }
                                if (item.addons.isNotEmpty()) {
                                    Text(
                                        "+ ${item.addons.joinToString(", ") { it.name }}",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = OnSurfaceVariant,
                                        modifier = Modifier.padding(start = 16.dp),
                                        fontSize = 11.sp
                                    )
                                }
                            }
                            HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp), color = Outline)
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("Total", fontWeight = FontWeight.Bold, color = OnSurface, style = MaterialTheme.typography.titleSmall)
                                Text(currency.format(ord.totalPrice), fontWeight = FontWeight.Bold, color = Primary, style = MaterialTheme.typography.titleSmall)
                            }
                        }
                    }

                    Spacer(Modifier.height(16.dp))

                    KioskButton(
                        text = "Place New Order",
                        onClick = onNewOrder,
                        modifier = Modifier.fillMaxWidth(),
                        icon = Icons.Default.Add,
                        containerColor = if (ord.status == "completed") Primary else MaterialTheme.colorScheme.surfaceVariant,
                        contentColor = if (ord.status == "completed") Color.White else OnSurfaceVariant
                    )

                    Spacer(Modifier.height(24.dp))
                }
            }
        }
    }
}

@Composable
private fun OrderStatusIcon(status: String) {
    val (bgColor, iconColor, icon) = when (status) {
        "pending" -> Triple(WarningLight, Warning, Icons.Default.HourglassTop)
        "preparing" -> Triple(PrimaryLight, Primary, Icons.Default.Restaurant)
        "ready" -> Triple(SuccessLight, Success, Icons.Default.DoneAll)
        "completed" -> Triple(SuccessLight, Success, Icons.Default.CheckCircle)
        "cancelled" -> Triple(ErrorLight, Error, Icons.Default.Cancel)
        else -> Triple(SurfaceVariant, OnSurfaceVariant, Icons.Default.Info)
    }

    val infiniteTransition = rememberInfiniteTransition(label = "pulse")
    val scale by infiniteTransition.animateFloat(
        initialValue = 1f,
        targetValue = if (status in listOf("pending", "preparing")) 1.08f else 1f,
        animationSpec = infiniteRepeatable(
            animation = tween(900, easing = EaseInOut),
            repeatMode = RepeatMode.Reverse
        ),
        label = "scale"
    )

    Box(
        modifier = Modifier
            .size(76.dp)
            .scale(scale)
            .clip(CircleShape)
            .background(bgColor),
        contentAlignment = Alignment.Center
    ) {
        Icon(icon, contentDescription = null, tint = iconColor, modifier = Modifier.size(42.dp))
    }
}

@Composable
private fun OrderProgressStepper(currentStep: Int) {
    val steps = listOf(
        "Received" to Icons.Default.ShoppingBag,
        "Preparing" to Icons.Default.Restaurant,
        "Ready" to Icons.Default.DoneAll,
        "Complete" to Icons.Default.CheckCircle
    )

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.Top
    ) {
        steps.forEachIndexed { index, (label, icon) ->
            val isCompleted = index <= currentStep
            val isActive = index == currentStep

            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.weight(1f)
            ) {
                Box(
                    modifier = Modifier
                        .size(40.dp)
                        .clip(CircleShape)
                        .background(
                            when {
                                isCompleted -> Primary
                                else -> SurfaceVariant
                            }
                        ),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        icon,
                        contentDescription = null,
                        tint = if (isCompleted) Color.White else OutlineVariant,
                        modifier = Modifier.size(20.dp)
                    )
                }
                Spacer(Modifier.height(6.dp))
                Text(
                    label,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (isCompleted) Primary else OnSurfaceVariant,
                    fontWeight = if (isActive) FontWeight.Bold else FontWeight.Normal,
                    textAlign = TextAlign.Center,
                    maxLines = 1,
                    fontSize = 10.sp
                )
            }

            if (index < steps.size - 1) {
                Box(
                    modifier = Modifier
                        .weight(0.4f)
                        .padding(top = 20.dp)
                ) {
                    HorizontalDivider(
                        color = if (index < currentStep) Primary else OutlineVariant,
                        thickness = 2.dp
                    )
                }
            }
        }
    }
}
