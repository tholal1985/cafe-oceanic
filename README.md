# Cafe Oceanic - Self-Service Restaurant Kiosk

A production-ready, full-stack self-service restaurant kiosk system similar to McDonald's ordering machines.

## Features

### Customer Kiosk Interface
- **Welcome Screen**: Auto-playing animated advertisement carousel with smooth transitions
- **Menu Screen**: Touch-friendly product browsing with categories
- **Product Customization**: Add-ons selection with real-time price calculation
- **Shopping Cart**: Slide-in cart panel with edit and remove functionality
- **Payment Processing**: Mock card and cash payment with animated feedback
- **Order Tracking**: Real-time order status updates with visual progress indicators
- **Idle Mode**: Automatic reset after 60 seconds of inactivity

### Admin Dashboard
- **Analytics Dashboard**: Total sales, order counts, and top-selling products
- **Category Management**: Full CRUD operations for menu categories
- **Product Management**: Comprehensive product catalog management
- **Add-ons Management**: Manage customization options
- **Order Management**: Real-time order tracking and status updates
- **Advertisement System**: Upload and manage promotional content with scheduling

### Kitchen Display System (KDS)
- **Real-time Order Display**: Live view of incoming orders with Kitchen Order Tickets (KOT)
- **Order Timer**: Visual countdown showing time elapsed since order placement
- **Color-coded Urgency**: Orders change color based on wait time (green → yellow → red)
- **Order Details**: Complete item breakdown with quantities and add-ons
- **Status Updates**: Quick buttons to move orders through workflow (Pending → Preparing → Ready)
- **Auto-refresh**: New orders appear instantly via real-time subscriptions
- **Clean Interface**: Dark theme optimized for kitchen environments
- **Grid Layout**: Multiple orders visible simultaneously for efficient workflow

### Technical Features
- Real-time updates using Supabase Realtime
- Secure authentication with Row Level Security
- Responsive design optimized for touchscreen
- Smooth animations using Framer Motion
- State management with Zustand
- Type-safe database queries with TypeScript

## Tech Stack

### Frontend
- React 18 with TypeScript
- Vite
- TailwindCSS
- Framer Motion
- React Router v6
- Zustand

### Backend
- Supabase (PostgreSQL)
- Supabase Auth
- Supabase Realtime
- Supabase Storage

## Getting Started

The application is already configured and ready to use. The development server runs automatically.

### Database Setup

The database is already provisioned with:
- All necessary tables (categories, products, addons, orders, advertisements)
- Row Level Security policies
- Sample seed data
- Real-time subscriptions enabled

### Creating an Admin Account

**Quick Setup** (Recommended):
1. Navigate to `/admin/register`
2. Fill in your details (default: `admin@cafeoceanic.com` / `admin123`)
3. Click "Create Admin Account"
4. Login at `/admin/login`

For detailed instructions and security recommendations, see [ADMIN_CREDENTIALS.md](./ADMIN_CREDENTIALS.md)

## Application Routes

### Customer Kiosk
- `/` - Welcome screen with advertisements
- `/menu` - Browse menu by category
- `/checkout` - Review order before payment
- `/payment` - Process payment
- `/order-confirmation` - Track order status

### Kitchen Display
- `/kitchen` - Real-time kitchen order display (KOT system)

### Admin Panel
- `/admin/login` - Admin authentication
- `/admin/dashboard` - Analytics and overview
- `/admin/categories` - Manage categories
- `/admin/products` - Manage products
- `/admin/addons` - Manage add-ons
- `/admin/orders` - Manage and track orders
- `/admin/advertisements` - Manage promotional content

## Key Features Explained

### Animated Advertisement System
- Auto-rotate ads every 5 seconds
- Support for images, GIFs, and videos
- Impression tracking
- Start/end date scheduling
- Active/inactive toggle
- Display order management

### Real-time Order Tracking
- Orders update live across all connected devices
- Customer kiosk shows order progress
- Admin panel can update order status in real-time
- Status progression: Pending → Preparing → Ready → Completed

### Idle Mode
- Automatically returns to welcome screen after 60 seconds of inactivity
- Clears cart to protect customer privacy
- Does not affect admin panel sessions

### Shopping Experience
- Large, touch-friendly UI elements
- Product images from Pexels
- Customizable add-ons per product
- Real-time cart total calculation
- Quantity adjustments
- Visual feedback for all interactions

### Kitchen Display System
- **Real-time Updates**: Orders appear instantly when placed by customers
- **Time Tracking**: Each order shows elapsed time since placement
- **Color Indicators**:
  - White border: Fresh orders (0-5 minutes)
  - Yellow border: Moderate wait (5-10 minutes)
  - Red border: Urgent orders (10+ minutes)
- **Order Cards**: Grid layout showing multiple orders simultaneously
- **Order Details**: Complete breakdown with item quantities and add-ons highlighted
- **Workflow Buttons**:
  - "Start Preparing" - Marks order as in progress
  - "Mark as Ready" - Signals order is complete for pickup
- **Auto-removal**: Completed orders automatically disappear from the display
- **Dark Theme**: Designed for kitchen environment with high contrast
- **No Authentication**: Kitchen staff can access directly at `/kitchen` route

## Database Schema

### Categories
Menu categories with images and display order

### Products
Product catalog with pricing, descriptions, and availability

### Addons
Optional add-ons and extras for products

### Orders
Customer orders with status tracking

### Order Items
Individual items within orders with add-ons

### Advertisements
Promotional content with scheduling and impression tracking

### Admin Users
Authorized admin accounts for dashboard access

## Security

- Row Level Security enabled on all tables
- Admin-only write access for product management
- Public read access for customer-facing data
- JWT-based authentication
- Secure admin verification

## Customization

### Theme Colors
The app uses a red and yellow color scheme. To customize:
- Primary: Red (#DA291C)
- Accent: Yellow (#FFC72C)

Update these in your Tailwind configuration or component files.

### Images
All product and category images use Pexels stock photos. Replace URLs in the admin panel to use your own images.

### Branding
Update the brand name "Cafe Oceanic" in:
- WelcomeScreen.tsx
- MenuScreen.tsx
- AdminLayout.tsx

## Production Deployment

The application is production-ready and optimized:
- TypeScript for type safety
- Vite for fast builds
- Optimized bundle size
- Error boundaries and loading states
- Mobile-responsive design
- Touch-optimized interactions

## Support

For issues or questions, refer to:
- Supabase Documentation: https://supabase.com/docs
- React Documentation: https://react.dev
- Framer Motion: https://www.framer.com/motion
