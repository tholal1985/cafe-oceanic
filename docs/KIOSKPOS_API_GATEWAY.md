# KioskPOS API Gateway

A production-ready middleware API gateway that connects self-service kiosk applications to UltimatePOS through the UltimatePOS REST API. UltimatePOS remains the source of truth for all POS data (products, prices, inventory, customers, sales, payments).

## Architecture

```
Kiosk Application
    |
    | HTTPS REST API (X-Kiosk-Key)
    v
KioskPOS API Gateway (Supabase Edge Function)
    |
    | authenticated server-to-server API
    v
UltimatePOS REST API
```

The gateway runs as a Supabase Edge Function and uses PostgreSQL for:
- Kiosk configuration and API key management
- Local order records with idempotency protection
- Product/category caching from UltimatePOS
- Payment tracking
- Synchronization job tracking
- API request logging
- System settings

## Database Setup

The database schema is applied automatically via the `add_kioskpos_api_gateway_schema` migration. All tables are prefixed with `kp_` to avoid conflicts with existing tables. RLS is enabled on all tables with admin-only access policies.

### Tables

| Table | Purpose |
|---|---|
| `kp_kiosks` | Registered kiosk terminals with hashed API keys |
| `kp_orders` | Local order records linked to UltimatePOS sales |
| `kp_order_items` | Line items for each order |
| `kp_products_cache` | Cached products from UltimatePOS |
| `kp_categories_cache` | Cached categories from UltimatePOS |
| `kp_payments` | Payment records (no card details stored) |
| `kp_sync_jobs` | Sync job tracking (products, categories, all) |
| `kp_api_logs` | Request log for every kiosk API call |
| `kp_system_settings` | Gateway configuration (singleton) |

## Environment Variables

All UltimatePOS credentials are server-side only and never exposed to the browser. See `.env.example` for the full list.

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Pre-populated Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Pre-populated, used by edge functions |
| `ULTIMATEPOS_BASE_URL` | UltimatePOS installation URL |
| `ULTIMATEPOS_CLIENT_ID` | OAuth2 client ID |
| `ULTIMATEPOS_CLIENT_SECRET` | OAuth2 client secret |
| `ULTIMATEPOS_USERNAME` | Password grant username |
| `ULTIMATEPOS_PASSWORD` | Password grant password |
| `ULTIMATEPOS_LOCATION_ID` | Default location ID |
| `ULTIMATEPOS_MOCK_MODE` | `true` for mock data, `false` for live |

**Never** prefix UltimatePOS variables with `VITE_` — that would expose them to the browser.

## UltimatePOS Setup

### Mock Mode (default)

Mock mode is enabled by default. It returns realistic mock data without calling the real UltimatePOS server. This allows testing the entire kiosk API before connecting to a live UltimatePOS installation.

To configure mock mode, go to **Admin > API Gateway > Gateway Settings** and toggle "Mock Mode" on/off.

### Live Mode

To connect to a real UltimatePOS installation:

1. Go to **Admin > API Gateway > Gateway Settings**
2. Enter your UltimatePOS URL
3. Set the Location ID
4. Turn off Mock Mode
5. Configure UltimatePOS credentials in the existing **Admin > UltimatePOS** page (these are stored in the `ultimatepos_config` table)

### UltimatePOS API Endpoints

The edge function includes TODO comments at every point where the exact UltimatePOS endpoint path needs to be configured. Search for `TODO:` in `supabase/functions/kioskpos-api/index.ts` to find all locations. The current implementation uses the `/connector/api/` prefix which is the standard UltimatePOS REST API pattern, but you should verify against your API documentation.

## Kiosk API Authentication

### Creating a Kiosk

1. Go to **Admin > API Gateway > Kiosk Terminals**
2. Click "Add Kiosk"
3. Enter a name, kiosk code, and optional location ID
4. The API key is shown **once** — copy it immediately
5. The key is stored as a SHA-256 hash; it cannot be recovered

### Using the API

Every request must include the `X-Kiosk-Key` header:

```
X-Kiosk-Key: kiosk_a1b2c3d4e5f6...
```

Order creation additionally requires an `Idempotency-Key` header to prevent duplicate sales:

```
Idempotency-Key: KIOSK01-20260929-000001
```

## API Endpoints

All endpoints use the `/api/v1/` prefix. The edge function is deployed at:
```
https://your-project.supabase.co/functions/v1/kioskpos-api
```

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check (no auth) |
| GET | `/products` | List products (paginated, searchable) |
| GET | `/products/:id` | Get single product |
| GET | `/categories` | List categories |
| GET | `/products/:id/stock` | Check stock for a product |
| POST | `/customers` | Create customer in UltimatePOS |
| POST | `/orders` | Create order (with idempotency) |
| GET | `/orders/:id` | Get order status |
| POST | `/orders/:id/cancel` | Cancel order |
| POST | `/payments` | Record payment |
| POST | `/sync/products` | Sync products from UltimatePOS |
| POST | `/sync/categories` | Sync categories from UltimatePOS |
| POST | `/sync/all` | Full sync |

Admin-only endpoints (JWT-protected):

| Method | Endpoint | Description |
|---|---|---|
| POST | `/admin/kiosks` | Create kiosk (returns API key) |
| PUT | `/admin/kiosks/:id` | Update kiosk |
| POST | `/admin/kiosks/:id/regenerate-key` | Regenerate API key |
| GET | `/admin/settings` | Get gateway settings |
| PUT | `/admin/settings` | Update gateway settings |
| POST | `/admin/orders/:id/retry` | Retry failed order sync |

See the in-app **API Documentation** page for full request/response examples.

## Security

- API keys stored as SHA-256 hashes — never raw
- All UltimatePOS credentials are server-side only
- Rate limiting per kiosk (configurable, default 100 req/min)
- Idempotency keys prevent duplicate sales
- No card numbers, CVV, or tokens stored
- Structured error responses with request IDs
- RLS enabled on all database tables

## Admin Dashboard

The admin dashboard is at **Admin > API Gateway** in the sidebar and includes:

- **Gateway Dashboard** — KPIs, charts (orders by day, sales by day, orders by kiosk, payment methods, failed API requests)
- **Kiosk Terminals** — Register, activate/deactivate/block kiosks, regenerate API keys
- **Gateway Orders** — All orders with sync status, detail view, retry failed orders
- **Product Cache** — Cached products from UltimatePOS with stock and pricing
- **Gateway Payments** — Payment records with method, status, provider
- **Synchronization** — Trigger product/category syncs, view sync history
- **Failed Orders** — Orders that failed to sync, with retry button
- **API Logs** — Every API request with request ID, method, endpoint, status, duration
- **Gateway Settings** — UltimatePOS URL, mock mode, sync interval, rate limit, CORS, currency, timezone
- **API Documentation** — Full endpoint reference with examples

## Deployment

The edge function is deployed automatically via the Supabase MCP tools. The frontend builds with `npm run build`.

## Troubleshooting

| Issue | Solution |
|---|---|
| Kiosk gets 401 | Check that the API key is correct and the kiosk status is "active" |
| Kiosk gets 403 | Kiosk is blocked or inactive — change status in admin |
| Kiosk gets 429 | Rate limit exceeded — increase in gateway settings or reduce request frequency |
| Orders fail to sync | Check UltimatePOS configuration and credentials; use retry button |
| Products cache empty | Run a sync from the Synchronization page |
| Mock mode stuck on | Turn off in Gateway Settings page |
| UltimatePOS endpoints wrong | Search for `TODO:` in the edge function source and update paths per your API docs |
