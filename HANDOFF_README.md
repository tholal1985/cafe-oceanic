# Restaurant Kiosk System - Complete Source Code Package

## What's Included

This package contains the full source code and database for a production-ready self-service restaurant kiosk system with UltimatePOS integration.

### Contents

| Folder/File | Description |
|---|---|
| `src/` | React + TypeScript frontend (kiosk UI + admin panel) |
| `supabase/` | Database migrations, edge functions, and config |
| `android-app/` | Native Android app (Kotlin + Jetpack Compose) |
| `docs/` | Feature documentation and API reference |
| `database_schema.sql` | Complete database schema (all tables, RLS, functions, triggers) |
| `database_seed.sql` | Initial configuration data (currency, roles, payment gateway, UltimatePOS config) |
| `dist/` | Pre-built production bundle |

---

## System Overview

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS
- **State:** Zustand
- **Backend:** Supabase (PostgreSQL + Auth + Edge Functions)
- **Payments:** BML QPOS QR payment integration
- **POS Integration:** UltimatePOS two-way sync (products in, sales out)
- **Mobile:** Android app (Kotlin + Jetpack Compose)

### Features

- Self-service kiosk ordering (dine-in + takeaway)
- Admin dashboard with full management
- Kitchen display system
- Product, category, and addon management
- Upsell suggestions and promotional gifts
- Customer management with loyalty tiers
- BML QR payments + cash
- POS system with sessions and transactions
- UltimatePOS integration (product sync + sale push)
- SMS/Viber/WhatsApp messaging
- Backup & restore system
- REST API with API keys
- User roles & permissions (admin, cashier, kitchen staff, waiter)
- Kiosk lock system
- Product pack licensing system

---

## Setup Instructions

### 1. Database Setup

**Option A — Using Supabase (recommended):**

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to the SQL Editor
3. Run `database_schema.sql` (creates all tables, policies, functions, triggers)
4. Run `database_seed.sql` (inserts initial config: currency, roles, payment gateway, UltimatePOS settings)

**Option B — Using any PostgreSQL 15+:**

1. Create a database
2. Install required extensions:
   ```sql
   CREATE EXTENSION IF NOT EXISTS pgcrypto;
   CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
   ```
   (The `http` extension is only needed for UltimatePOS connection testing — it's a Supabase-specific extension. If not available, comment out the `test_connection` function in the schema.)
3. Run `database_schema.sql`
4. Run `database_seed.sql`

### 2. Frontend Setup

```bash
npm install
```

Create a `.env` file in the project root:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Get these values from your Supabase project: Settings > API.

**Run in development:**
```bash
npm run dev
```

**Build for production:**
```bash
npm run build
```

The built files will be in the `dist/` folder. Deploy these to any static hosting service (Netlify, Vercel, Cloudflare Pages, etc.).

### 3. Edge Functions (Supabase only)

The project includes these Supabase Edge Functions (Deno runtime):

| Function | Purpose |
|---|---|
| `ultimatepos-sync` | Syncs products from UltimatePOS and pushes sales back |
| `rest-api` | REST API for external integrations |
| `initiate-payment` | Starts a BML QR payment session |
| `verify-payment` | Checks payment status |
| `payment-webhook` | Handles payment gateway webhooks |
| `send-sms` | Sends SMS messages |
| `send-viber` | Sends Viber messages |
| `send-whatsapp` | Sends WhatsApp messages |
| `create-backup` | Creates a database backup |
| `restore-backup` | Restores from a backup |
| `manage-users` | Admin user management |
| `export-product-pack` | Exports product pack data |
| `import-product-pack` | Imports product pack data |

To deploy edge functions, use the Supabase MCP tools or Supabase CLI:
```bash
supabase functions deploy
```

Each function needs a config entry in `supabase/config.toml`.

### 4. Android App

The `android-app/` folder contains a full native Android app. Open it in Android Studio and build.

It needs the same Supabase URL and anon key configured in the app's constants.

---

## UltimatePOS Integration

The system connects to UltimatePOS on `mudhaamv.com` for the **Cafe Oceanic** company.

### Connection Details (pre-configured)

- **URL:** `https://mudhaamv.com/public`
- **Username:** `cafeoceanic`
- **Password:** `P@$$1985`
- **Client ID:** `8`
- **Client Secret:** `eUMFUTdGh34Ryh3uInWkWYgTLzNe23zg8AzKWLS3`
- **Business ID:** 1
- **Location ID:** 2 (Cafe Oceanic)
- **Direct Server IP:** `50.6.156.135` (bypasses Cloudflare)

### How It Works

1. **Product Sync (UltimatePOS → Kiosk):** Pulls products from UltimatePOS and creates/updates them in the kiosk database with `ultimatepos_id` linking
2. **Sale Push (Kiosk → UltimatePOS):** When an order is completed on the kiosk, it's queued in `ultimatepos_sale_pushes` and pushed to UltimatePOS via the session-based POS web interface

### Managing the Integration

- Go to **Admin Panel > UltimatePOS Integration** to test connection, sync products, and view sync logs
- The edge function `ultimatepos-sync` handles all communication
- Trigger sync manually via: `GET /functions/v1/ultimatepos-sync?action=sync-products`
- Trigger sale push via: `GET /functions/v1/ultimatepos-sync?action=push-sales`

---

## Admin Access

After setup, the first admin user can be registered at the admin login page. The first registered user automatically gets admin privileges.

Admin panel URL: `/admin/login`

### User Roles

| Role | Access |
|---|---|
| Admin | Full system access |
| Cashier | Orders, payments, POS |
| Kitchen Staff | Kitchen display, order status |
| Waiter | Orders, kitchen view |

---

## Currency

The system is configured for **Maldivian Rufiyaa (MVR)**. Change this in Admin Panel > System Settings if needed.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| State | Zustand |
| Icons | Lucide React |
| Animations | Framer Motion |
| QR Codes | qrcode.react |
| Backend | Supabase (PostgreSQL, Auth, Edge Functions) |
| Edge Functions | Deno Runtime |
| Mobile | Kotlin, Jetpack Compose |
| Payments | BML QPOS |
| POS | UltimatePOS |

---

## File Structure

```
project/
├── src/                    # Frontend source
│   ├── components/         # Reusable UI components
│   ├── hooks/              # Custom React hooks
│   ├── lib/                # Utilities and services
│   ├── pages/              # Page components
│   │   ├── admin/          # Admin panel pages
│   │   └── customer/       # Customer portal pages
│   └── store/              # Zustand state management
├── supabase/
│   ├── config.toml         # Supabase configuration
│   ├── functions/          # Edge functions (Deno)
│   └── migrations/         # Database migration files
├── android-app/            # Native Android app
├── docs/                   # Documentation
├── database_schema.sql     # Complete database schema
├── database_seed.sql       # Initial seed data
├── package.json            # Frontend dependencies
└── HANDOFF_README.md       # This file
```

---

## Support

For questions about this system, refer to the documentation in the `docs/` folder or the inline code comments.
