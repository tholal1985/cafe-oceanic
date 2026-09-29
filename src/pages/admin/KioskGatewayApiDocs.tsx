import { useState } from 'react';
import { Key, Code2, ChevronDown, ChevronRight } from 'lucide-react';

interface EndpointDoc {
  method: string;
  path: string;
  title: string;
  description: string;
  headers?: string[];
  requestExample?: string;
  responseExample?: string;
}

const ENDPOINTS: EndpointDoc[] = [
  {
    method: 'GET',
    path: '/api/v1/health',
    title: 'Health Check',
    description: 'Check if the API gateway is running and UltimatePOS is reachable. No authentication required.',
    responseExample: `{
  "success": true,
  "data": {
    "service": "KioskPOS API Gateway",
    "version": "1.0.0",
    "timestamp": "2026-09-29T10:00:00Z",
    "ultimatepos": {
      "configured": true,
      "reachable": true
    }
  }
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/products',
    title: 'List Products',
    description: 'Retrieve cached products with pagination, search, and category filtering. Requires X-Kiosk-Key.',
    headers: ['X-Kiosk-Key: kiosk_xxxxxxxxx'],
    responseExample: `{
  "success": true,
  "data": [
    {
      "id": "1",
      "sku": "COF-001",
      "name": "Espresso",
      "category": { "id": "1", "name": "Coffee" },
      "price": 25,
      "stock": 100,
      "image": null,
      "is_available": true
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 100 }
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/products/:id',
    title: 'Get Product',
    description: 'Get a single product by its UltimatePOS product ID. Requires X-Kiosk-Key.',
    headers: ['X-Kiosk-Key: kiosk_xxxxxxxxx'],
    responseExample: `{
  "success": true,
  "data": {
    "id": "1",
    "sku": "COF-001",
    "name": "Espresso",
    "category": { "id": "1", "name": "Coffee" },
    "price": 25,
    "stock": 100,
    "image": null,
    "is_available": true
  }
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/categories',
    title: 'List Categories',
    description: 'Retrieve all cached categories. Requires X-Kiosk-Key.',
    headers: ['X-Kiosk-Key: kiosk_xxxxxxxxx'],
    responseExample: `{
  "success": true,
  "data": [
    { "id": "1", "name": "Coffee", "parent_id": null, "is_active": true }
  ]
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/products/:id/stock',
    title: 'Check Stock',
    description: 'Check current stock for a product at a location. Requires X-Kiosk-Key.',
    headers: ['X-Kiosk-Key: kiosk_xxxxxxxxx'],
    responseExample: `{
  "success": true,
  "data": {
    "product_id": "1",
    "location_id": 1,
    "stock": 25,
    "available": true
  }
}`,
  },
  {
    method: 'POST',
    path: '/api/v1/customers',
    title: 'Create Customer',
    description: 'Create a customer in UltimatePOS. Avoids duplicates. Requires X-Kiosk-Key.',
    headers: ['X-Kiosk-Key: kiosk_xxxxxxxxx', 'Content-Type: application/json'],
    requestExample: `{
  "name": "Customer Name",
  "phone": "9999999",
  "email": "customer@example.com"
}`,
    responseExample: `{
  "success": true,
  "data": {
    "id": "1001",
    "name": "Customer Name",
    "phone": "9999999",
    "email": "customer@example.com"
  }
}`,
  },
  {
    method: 'POST',
    path: '/api/v1/orders',
    title: 'Create Order',
    description: 'Create a new order. The server validates all products, retrieves current prices from UltimatePOS, calculates totals, and creates the sale. Never trust prices or totals from the kiosk. Requires X-Kiosk-Key and Idempotency-Key.',
    headers: ['X-Kiosk-Key: kiosk_xxxxxxxxx', 'Idempotency-Key: KIOSK01-20260929-000001', 'Content-Type: application/json'],
    requestExample: `{
  "location_id": 1,
  "customer_id": null,
  "items": [
    { "product_id": "1", "quantity": 2 },
    { "product_id": "2", "quantity": 1 }
  ],
  "payment_method": "cash"
}`,
    responseExample: `{
  "success": true,
  "data": {
    "order_id": "uuid-here",
    "order_number": "KIOSK01-20260929-000123",
    "ultimatepos_sale_id": "12345",
    "invoice_number": "INV-00123",
    "subtotal": 200,
    "tax": 20,
    "discount": 0,
    "total": 220,
    "currency": "MVR",
    "payment_status": "paid",
    "order_status": "completed"
  }
}`,
  },
  {
    method: 'GET',
    path: '/api/v1/orders/:id',
    title: 'Get Order Status',
    description: 'Retrieve order details including items, payments, and UltimatePOS sync status. Requires X-Kiosk-Key.',
    headers: ['X-Kiosk-Key: kiosk_xxxxxxxxx'],
    responseExample: `{
  "success": true,
  "data": {
    "order_id": "uuid-here",
    "order_number": "KIOSK01-20260929-000123",
    "ultimatepos_sale_id": "12345",
    "invoice_number": "INV-00123",
    "subtotal": 200,
    "tax": 20,
    "total": 220,
    "order_status": "completed",
    "sync_status": "synced",
    "items": [...],
    "payments": [...]
  }
}`,
  },
  {
    method: 'POST',
    path: '/api/v1/orders/:id/cancel',
    title: 'Cancel Order',
    description: 'Cancel an order. For completed orders with an UltimatePOS sale, a return is created. Requires X-Kiosk-Key.',
    headers: ['X-Kiosk-Key: kiosk_xxxxxxxxx', 'Content-Type: application/json'],
    requestExample: `{ "reason": "Customer changed mind" }`,
    responseExample: `{
  "success": true,
  "data": {
    "order_id": "uuid-here",
    "order_status": "cancelled",
    "cancelled_at": "2026-09-29T10:05:00Z"
  }
}`,
  },
  {
    method: 'POST',
    path: '/api/v1/payments',
    title: 'Record Payment',
    description: 'Record a payment for an order. No card details are stored. Requires X-Kiosk-Key.',
    headers: ['X-Kiosk-Key: kiosk_xxxxxxxxx', 'Content-Type: application/json'],
    requestExample: `{
  "order_id": "uuid-here",
  "method": "card",
  "amount": 220,
  "reference": "PAY-REF-001",
  "provider": "bml",
  "provider_transaction_id": "TXN-001"
}`,
    responseExample: `{
  "success": true,
  "data": {
    "payment_id": "uuid-here",
    "order_id": "uuid-here",
    "amount": 220,
    "currency": "MVR",
    "status": "completed"
  }
}`,
  },
  {
    method: 'POST',
    path: '/api/v1/sync/products',
    title: 'Sync Products',
    description: 'Trigger a product sync from UltimatePOS to the local cache. Requires X-Kiosk-Key.',
    headers: ['X-Kiosk-Key: kiosk_xxxxxxxxx'],
    responseExample: `{
  "success": true,
  "data": {
    "job_id": "uuid-here",
    "job_type": "products",
    "status": "completed",
    "records_processed": 150,
    "records_failed": 0
  }
}`,
  },
  {
    method: 'POST',
    path: '/api/v1/sync/categories',
    title: 'Sync Categories',
    description: 'Trigger a category sync from UltimatePOS. Requires X-Kiosk-Key.',
    headers: ['X-Kiosk-Key: kiosk_xxxxxxxxx'],
    responseExample: `{
  "success": true,
  "data": {
    "job_id": "uuid-here",
    "job_type": "categories",
    "status": "completed",
    "records_processed": 12,
    "records_failed": 0
  }
}`,
  },
  {
    method: 'POST',
    path: '/api/v1/sync/all',
    title: 'Full Sync',
    description: 'Sync both products and categories. Requires X-Kiosk-Key.',
    headers: ['X-Kiosk-Key: kiosk_xxxxxxxxx'],
    responseExample: `{
  "success": true,
  "data": {
    "job_id": "uuid-here",
    "job_type": "all",
    "status": "completed",
    "records_processed": 162,
    "records_failed": 0
  }
}`,
  },
];

const METHOD_COLORS: Record<string, string> = {
  GET: 'bg-ocean-50 text-ocean-700',
  POST: 'bg-emerald-50 text-emerald-700',
  PUT: 'bg-amber-50 text-amber-700',
  DELETE: 'bg-rose-50 text-rose-700',
};

const ERROR_CODES = [
  { code: '400', name: 'Bad Request', desc: 'Malformed request or missing required fields' },
  { code: '401', name: 'Unauthorized', desc: 'Missing or invalid X-Kiosk-Key header' },
  { code: '403', name: 'Forbidden', desc: 'Kiosk is blocked or inactive' },
  { code: '404', name: 'Not Found', desc: 'Resource (product, order) not found' },
  { code: '409', name: 'Conflict', desc: 'Duplicate idempotency key or already cancelled' },
  { code: '422', name: 'Validation Error', desc: 'Invalid input data or insufficient stock' },
  { code: '429', name: 'Rate Limited', desc: 'Too many requests from this kiosk' },
  { code: '500', name: 'Internal Server Error', desc: 'Unexpected server error' },
  { code: '502', name: 'UltimatePOS Error', desc: 'UltimatePOS API returned an error' },
  { code: '503', name: 'Service Unavailable', desc: 'UltimatePOS not configured or unreachable' },
];

export default function KioskGatewayApiDocs() {
  const [expanded, setExpanded] = useState<string | null>('POST /api/v1/orders');

  const toggle = (key: string) => setExpanded(expanded === key ? null : key);

  return (
    <div className="min-h-full bg-ivory-50 px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-ocean-700">API Gateway</p>
          <h1 className="font-display text-4xl text-ink-900">API Documentation</h1>
          <p className="mt-2 text-sm text-ink-500">
            Complete reference for the KioskPOS API Gateway. All endpoints use <code className="rounded bg-ink-50 px-1.5 py-0.5 text-xs font-mono">/api/v1/</code> prefix.
          </p>
        </div>

        {/* Authentication section */}
        <div className="mb-6 rounded-2xl border border-ink-100/70 bg-white p-6 shadow-soft">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-50 text-ocean-700">
              <Key size={18} />
            </div>
            <h3 className="font-display text-lg text-ink-900">Authentication</h3>
          </div>
          <p className="text-sm text-ink-600">
            Every kiosk API request (except <code className="rounded bg-ink-50 px-1.5 py-0.5 text-xs font-mono">/health</code>) must include the
            <code className="ml-1 rounded bg-ink-50 px-1.5 py-0.5 text-xs font-mono">X-Kiosk-Key</code> header with a valid API key.
            Keys are generated when a kiosk is registered in the admin dashboard and stored as SHA-256 hashes.
            Order creation additionally requires an <code className="ml-1 rounded bg-ink-50 px-1.5 py-0.5 text-xs font-mono">Idempotency-Key</code> header.
          </p>
          <div className="mt-4 rounded-lg border border-ink-100 bg-ink-50/50 p-4">
            <p className="text-xs font-medium text-ink-500 mb-2">Example headers:</p>
            <pre className="text-xs text-ink-700 font-mono">{`X-Kiosk-Key: kiosk_a1b2c3d4e5f6...
Idempotency-Key: KIOSK01-20260929-000001
Content-Type: application/json`}</pre>
          </div>
        </div>

        {/* Error format */}
        <div className="mb-6 rounded-2xl border border-ink-100/70 bg-white p-6 shadow-soft">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-700">
              <Code2 size={18} />
            </div>
            <h3 className="font-display text-lg text-ink-900">Error Format</h3>
          </div>
          <p className="text-sm text-ink-600 mb-3">All errors use a consistent JSON format with a code, message, and request ID:</p>
          <div className="rounded-lg border border-ink-100 bg-ink-50/50 p-4">
            <pre className="text-xs text-ink-700 font-mono">{`{
  "success": false,
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "Product was not found",
    "request_id": "REQ-20260929-a1b2c3d4"
  }
}`}</pre>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ERROR_CODES.map((err) => (
              <div key={err.code} className="flex items-start gap-3 rounded-lg border border-ink-100 px-3 py-2">
                <span className="inline-flex h-6 min-w-[2.5rem] items-center justify-center rounded-md bg-ink-900 px-1.5 text-[11px] font-bold text-white">
                  {err.code}
                </span>
                <div>
                  <p className="text-xs font-medium text-ink-800">{err.name}</p>
                  <p className="text-[11px] text-ink-400">{err.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Endpoints */}
        <div className="space-y-3">
          <h3 className="font-display text-xl text-ink-900 px-1">Endpoints</h3>
          {ENDPOINTS.map((ep) => {
            const key = `${ep.method} ${ep.path}`;
            const isExpanded = expanded === key;
            return (
              <div key={key} className="rounded-2xl border border-ink-100/70 bg-white shadow-soft overflow-hidden">
                <button
                  onClick={() => toggle(key)}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-ink-50/30"
                >
                  {isExpanded ? <ChevronDown size={16} className="text-ink-400" /> : <ChevronRight size={16} className="text-ink-400" />}
                  <span className={`inline-flex rounded-md px-2.5 py-1 text-[11px] font-bold ${METHOD_COLORS[ep.method] || 'bg-ink-50 text-ink-700'}`}>
                    {ep.method}
                  </span>
                  <code className="text-sm font-mono text-ink-800">{ep.path}</code>
                  <span className="ml-auto text-sm text-ink-500 hidden sm:block">{ep.title}</span>
                </button>
                {isExpanded && (
                  <div className="border-t border-ink-100 px-5 py-4">
                    <p className="text-sm text-ink-600 mb-4">{ep.description}</p>
                    {ep.headers && ep.headers.length > 0 && (
                      <div className="mb-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Headers</p>
                        <div className="rounded-lg border border-ink-100 bg-ink-50/50 p-3">
                          {ep.headers.map((h, i) => (
                            <p key={i} className="text-xs font-mono text-ink-700">{h}</p>
                          ))}
                        </div>
                      </div>
                    )}
                    {ep.requestExample && (
                      <div className="mb-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Request Example</p>
                        <pre className="rounded-lg border border-ink-100 bg-ocean-950 p-4 text-xs text-ivory-100 font-mono overflow-x-auto">{ep.requestExample}</pre>
                      </div>
                    )}
                    {ep.responseExample && (
                      <div>
                        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-400">Response Example</p>
                        <pre className="rounded-lg border border-ink-100 bg-ocean-950 p-4 text-xs text-ivory-100 font-mono overflow-x-auto">{ep.responseExample}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Integration example */}
        <div className="mt-6 rounded-2xl border border-ink-100/70 bg-white p-6 shadow-soft">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <Code2 size={18} />
            </div>
            <h3 className="font-display text-lg text-ink-900">Kiosk Integration Example</h3>
          </div>
          <pre className="rounded-lg border border-ink-100 bg-ocean-950 p-4 text-xs text-ivory-100 font-mono overflow-x-auto">{`// JavaScript example — create an order from a kiosk

const API_BASE = 'https://your-project.supabase.co/functions/v1/kioskpos-api';
const KIOSK_KEY = 'kiosk_xxxxxxxxx';

// 1. Get products
const productsResp = await fetch(\`\${API_BASE}/products?limit=50\`, {
  headers: { 'X-Kiosk-Key': KIOSK_KEY }
});
const { data: products } = await productsResp.json();

// 2. Create order
const orderResp = await fetch(\`\${API_BASE}/orders\`, {
  method: 'POST',
  headers: {
    'X-Kiosk-Key': KIOSK_KEY,
    'Idempotency-Key': 'KIOSK01-20260929-000001',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    location_id: 1,
    items: [
      { product_id: '1', quantity: 2 },
      { product_id: '2', quantity: 1 }
    ],
    payment_method: 'cash'
  })
});
const { data: order } = await orderResp.json();
console.log('Order created:', order.order_number);`}</pre>
        </div>
      </div>
    </div>
  );
}
