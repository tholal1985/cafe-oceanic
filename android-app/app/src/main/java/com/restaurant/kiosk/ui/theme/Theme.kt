package com.restaurant.kiosk.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

val Primary = Color(0xFF1A56DB)
val PrimaryDark = Color(0xFF1342B0)
val PrimaryLight = Color(0xFFE8F0FE)
val Secondary = Color(0xFF0E7490)
val SecondaryLight = Color(0xFFE0F2FE)
val Accent = Color(0xFFF59E0B)
val AccentLight = Color(0xFFFEF3C7)
val Success = Color(0xFF059669)
val SuccessLight = Color(0xFFD1FAE5)
val Warning = Color(0xFFF59E0B)
val WarningLight = Color(0xFFFEF9C3)
val Error = Color(0xFFDC2626)
val ErrorLight = Color(0xFFFEE2E2)
val Surface = Color(0xFFF8FAFC)
val SurfaceVariant = Color(0xFFF1F5F9)
val OnSurface = Color(0xFF0F172A)
val OnSurfaceVariant = Color(0xFF475569)
val Outline = Color(0xFFE2E8F0)
val OutlineVariant = Color(0xFFCBD5E1)

private val LightColorScheme = lightColorScheme(
    primary = Primary,
    onPrimary = Color.White,
    primaryContainer = PrimaryLight,
    onPrimaryContainer = PrimaryDark,
    secondary = Secondary,
    onSecondary = Color.White,
    secondaryContainer = SecondaryLight,
    onSecondaryContainer = Color(0xFF0C4A6E),
    tertiary = Accent,
    onTertiary = Color.White,
    tertiaryContainer = AccentLight,
    onTertiaryContainer = Color(0xFF78350F),
    error = Error,
    onError = Color.White,
    errorContainer = ErrorLight,
    onErrorContainer = Color(0xFF7F1D1D),
    background = Color.White,
    onBackground = OnSurface,
    surface = Color.White,
    onSurface = OnSurface,
    surfaceVariant = SurfaceVariant,
    onSurfaceVariant = OnSurfaceVariant,
    outline = Outline,
    outlineVariant = OutlineVariant,
    inverseSurface = Color(0xFF1E293B),
    inverseOnSurface = Color(0xFFF8FAFC),
    surfaceContainerLow = Surface,
    surfaceContainer = SurfaceVariant,
    surfaceContainerHigh = Color(0xFFE2E8F0)
)

private val DarkColorScheme = darkColorScheme(
    primary = Color(0xFF60A5FA),
    onPrimary = Color(0xFF1E3A5F),
    primaryContainer = Color(0xFF1D4ED8),
    onPrimaryContainer = Color(0xFFBFDBFE),
    secondary = Color(0xFF38BDF8),
    onSecondary = Color(0xFF0C4A6E),
    background = Color(0xFF0F172A),
    onBackground = Color(0xFFF8FAFC),
    surface = Color(0xFF1E293B),
    onSurface = Color(0xFFF8FAFC),
    surfaceVariant = Color(0xFF334155),
    onSurfaceVariant = Color(0xFF94A3B8)
)

@Composable
fun KioskTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = if (darkTheme) DarkColorScheme else LightColorScheme
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = Color.Transparent.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !darkTheme
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = KioskTypography,
        content = content
    )
}
