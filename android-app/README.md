# Restaurant Kiosk - Android App

Native Android application for the Restaurant Kiosk system, built with Kotlin and Jetpack Compose.

## Tech Stack

- **Language**: Kotlin
- **UI**: Jetpack Compose + Material Design 3
- **Architecture**: MVVM + Clean Architecture
- **DI**: Hilt (Dagger)
- **Networking**: Ktor Client (HTTP)
- **Serialization**: Kotlinx Serialization
- **Images**: Coil
- **Navigation**: Jetpack Navigation Compose
- **Backend**: Supabase (same as web app)

## Architecture

```
android-app/
├── app/src/main/java/com/restaurant/kiosk/
│   ├── data/
│   │   ├── model/        # Data classes (Category, Product, Order, etc.)
│   │   ├── remote/       # Supabase API client & API calls
│   │   └── repository/   # Repository pattern (single source of truth)
│   ├── di/               # Hilt dependency injection modules
│   ├── ui/
│   │   ├── components/   # Shared UI components
│   │   ├── navigation/   # NavGraph & Screen definitions
│   │   ├── screens/
│   │   │   ├── welcome/          # Home / category selection
│   │   │   ├── menu/             # Product browsing
│   │   │   ├── checkout/         # Cart & order placement
│   │   │   ├── payment/          # Payment method selection
│   │   │   ├── tracking/         # Real-time order status
│   │   │   ├── kitchen/          # Kitchen display (dark theme)
│   │   │   └── admin/
│   │   │       ├── login/        # Admin sign-in
│   │   │       ├── dashboard/    # Stats & quick actions
│   │   │       ├── orders/       # Order management
│   │   │       └── products/     # Product listing
│   │   └── theme/        # Colors, typography, theme
│   ├── util/             # CartManager, currency formatter
│   └── viewmodel/        # ViewModels for each screen
```

## Screens

### Customer Flow
1. **Welcome** - Category grid with hero image, FABs for admin/kitchen
2. **Menu** - Category chips, product grid, search, add-to-cart dialog
3. **Checkout** - Cart items, order type (dine-in/takeaway), phone number, gift banners
4. **Payment** - Cash / Card / Wallet selection
5. **Order Tracking** - Animated status, progress stepper, auto-refresh every 10s

### Staff
6. **Kitchen Display** - Dark mode, active orders grid, one-tap status updates, auto-refresh every 15s

### Admin
7. **Admin Login** - Gradient login screen with Supabase auth
8. **Dashboard** - Stats cards, quick actions, recent orders
9. **Orders** - Filterable list, expandable cards, status update buttons
10. **Products** - Searchable, filterable product catalog

## Setup

1. Open the `android-app` folder in Android Studio (Hedgehog or newer)
2. Sync Gradle
3. Build and run on a device/emulator (API 26+)

The app connects to the same Supabase backend as the web app. Credentials are embedded in `BuildConfig`.

## Key Features

- Same Supabase backend — no separate API needed
- Real-time order polling (auto-refresh)
- Cart management with add-ons
- Promotional gifts eligibility check
- Role-based navigation (customer vs admin vs kitchen)
- Deep link support for payment callbacks (`restaurantkiosk://payment`)
- Edge-to-edge design with proper insets handling
- Smooth animations and micro-interactions
