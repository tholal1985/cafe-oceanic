# Restaurant Kiosk REST API Documentation

## Overview

This REST API provides programmatic access to the Restaurant Kiosk system, enabling integration with external databases, third-party systems, and mobile applications.

## Base URL

```
https://[YOUR_SUPABASE_PROJECT].supabase.co/functions/v1
```

## Authentication

All API requests require an API key passed in the `X-API-Key` header.

```bash
curl -H "X-API-Key: your_api_key_here" https://[project].supabase.co/functions/v1/api/products
```

## Rate Limiting

- 1000 requests per hour per API key
- Rate limit headers included in all responses

## Endpoints

### Products

#### List Products
```
GET /api/products
```

Query Parameters:
- `category_id` (optional): Filter by category
- `is_available` (optional): Filter by availability
- `limit` (optional): Number of results (default: 50, max: 100)
- `offset` (optional): Pagination offset

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Product Name",
      "description": "Description",
      "price": 10.99,
      "image_url": "https://...",
      "is_available": true,
      "category_id": "uuid",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 100
  }
}
```

#### Get Product
```
GET /api/products/:id
```

#### Create Product
```
POST /api/products
```

Body:
```json
{
  "name": "Product Name",
  "description": "Description",
  "price": 10.99,
  "category_id": "uuid",
  "image_url": "https://...",
  "is_available": true
}
```

#### Update Product
```
PUT /api/products/:id
```

#### Delete Product
```
DELETE /api/products/:id
```

### Categories

#### List Categories
```
GET /api/categories
```

#### Get Category
```
GET /api/categories/:id
```

#### Create Category
```
POST /api/categories
```

Body:
```json
{
  "name": "Category Name",
  "description": "Description",
  "image_url": "https://..."
}
```

#### Update Category
```
PUT /api/categories/:id
```

#### Delete Category
```
DELETE /api/categories/:id
```

### Orders

#### List Orders
```
GET /api/orders
```

Query Parameters:
- `status` (optional): pending, preparing, ready, completed, cancelled
- `order_type` (optional): dine_in, takeaway, pos
- `date_from` (optional): ISO date
- `date_to` (optional): ISO date
- `limit` (optional)
- `offset` (optional)

#### Get Order
```
GET /api/orders/:id
```

#### Create Order
```
POST /api/orders
```

Body:
```json
{
  "order_type": "dine_in",
  "items": [
    {
      "product_id": "uuid",
      "quantity": 2,
      "price": 10.99
    }
  ],
  "total_amount": 21.98,
  "customer_phone": "+1234567890",
  "customer_name": "John Doe"
}
```

#### Update Order Status
```
PATCH /api/orders/:id/status
```

Body:
```json
{
  "status": "preparing"
}
```

### Customers

#### List Customers
```
GET /api/customers
```

#### Get Customer
```
GET /api/customers/:id
```

#### Create Customer
```
POST /api/customers
```

Body:
```json
{
  "name": "John Doe",
  "phone": "+1234567890",
  "email": "john@example.com"
}
```

#### Update Customer
```
PUT /api/customers/:id
```

### Analytics

#### Get Sales Summary
```
GET /api/analytics/sales
```

Query Parameters:
- `date_from` (required)
- `date_to` (required)
- `group_by` (optional): day, week, month

#### Get Popular Products
```
GET /api/analytics/products/popular
```

Query Parameters:
- `date_from` (optional)
- `date_to` (optional)
- `limit` (optional, default: 10)

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable error message",
    "details": {}
  }
}
```

Common Error Codes:
- `UNAUTHORIZED`: Invalid or missing API key
- `FORBIDDEN`: Insufficient permissions
- `NOT_FOUND`: Resource not found
- `VALIDATION_ERROR`: Invalid request data
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `INTERNAL_ERROR`: Server error

## Webhooks

Configure webhooks to receive real-time notifications:

Events:
- `order.created`
- `order.updated`
- `order.completed`
- `product.out_of_stock`

Webhook payload:
```json
{
  "event": "order.created",
  "timestamp": "2024-01-01T00:00:00Z",
  "data": { /* event data */ }
}
```

## Examples

### Python Example

```python
import requests

API_KEY = "your_api_key"
BASE_URL = "https://[project].supabase.co/functions/v1/api"

headers = {
    "X-API-Key": API_KEY,
    "Content-Type": "application/json"
}

# Get all products
response = requests.get(f"{BASE_URL}/products", headers=headers)
products = response.json()

# Create an order
order_data = {
    "order_type": "takeaway",
    "items": [{"product_id": "uuid", "quantity": 1, "price": 15.99}],
    "total_amount": 15.99
}
response = requests.post(f"{BASE_URL}/orders", json=order_data, headers=headers)
order = response.json()
```

### Node.js Example

```javascript
const axios = require('axios');

const API_KEY = 'your_api_key';
const BASE_URL = 'https://[project].supabase.co/functions/v1/api';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json'
  }
});

// Get all categories
const categories = await api.get('/categories');

// Create a product
const product = await api.post('/products', {
  name: 'New Product',
  price: 12.99,
  category_id: 'uuid'
});
```

### cURL Example

```bash
# List all orders
curl -X GET \
  -H "X-API-Key: your_api_key" \
  https://[project].supabase.co/functions/v1/api/orders

# Create a customer
curl -X POST \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Doe","phone":"+1234567890"}' \
  https://[project].supabase.co/functions/v1/api/customers
```
