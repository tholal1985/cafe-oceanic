# Cafe Oceanic API Reference

## Database Tables

### Categories

Stores menu categories (Burgers, Drinks, etc.)

**Table**: `categories`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | text | Category name (unique) |
| image_url | text | Category image URL |
| display_order | integer | Display order (0 = first) |
| is_active | boolean | Visibility toggle |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update timestamp |

**Example Query**:
```typescript
const { data, error } = await supabase
  .from('categories')
  .select('*')
  .eq('is_active', true)
  .order('display_order', { ascending: true });
```

---

### Products

Stores menu items with pricing and details

**Table**: `products`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| category_id | uuid | Foreign key to categories |
| name | text | Product name |
| description | text | Product description |
| price | decimal(10,2) | Product price |
| image_url | text | Product image URL |
| is_available | boolean | Availability toggle |
| display_order | integer | Display order within category |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update timestamp |

**Example Query**:
```typescript
const { data, error } = await supabase
  .from('products')
  .select('*, categories(name)')
  .eq('category_id', categoryId)
  .eq('is_available', true)
  .order('display_order', { ascending: true });
```

---

### Addons

Stores optional add-ons and extras

**Table**: `addons`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| name | text | Add-on name |
| price | decimal(10,2) | Additional cost |
| is_available | boolean | Availability toggle |
| created_at | timestamptz | Creation timestamp |

**Example Query**:
```typescript
const { data, error } = await supabase
  .from('addons')
  .select('*')
  .eq('is_available', true);
```

---

### Orders

Stores customer orders

**Table**: `orders`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| order_number | text | Unique order number (e.g., "ORD-20240101-1234") |
| total_price | decimal(10,2) | Total order amount |
| status | text | Order status (pending, preparing, ready, completed, cancelled) |
| payment_method | text | Payment type (card, cash) |
| created_at | timestamptz | Order creation time |
| updated_at | timestamptz | Last status update |

**Example Query**:
```typescript
// Create order
const { data, error } = await supabase
  .from('orders')
  .insert({
    order_number: 'ORD-20240101-1234',
    total_price: 25.99,
    status: 'pending',
    payment_method: 'card'
  })
  .select()
  .single();

// Update status
await supabase
  .from('orders')
  .update({ status: 'preparing' })
  .eq('id', orderId);
```

---

### Order Items

Stores individual items within orders

**Table**: `order_items`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| order_id | uuid | Foreign key to orders |
| product_id | uuid | Foreign key to products |
| product_name | text | Product name (snapshot) |
| product_price | decimal(10,2) | Product price (snapshot) |
| quantity | integer | Item quantity |
| addons | jsonb | Selected add-ons array |
| item_total | decimal(10,2) | Line total (price + addons) × quantity |

**Addons JSON Format**:
```json
[
  { "id": "uuid", "name": "Extra Cheese", "price": 1.50 },
  { "id": "uuid", "name": "Bacon", "price": 2.00 }
]
```

**Example Query**:
```typescript
const { data, error } = await supabase
  .from('order_items')
  .insert([
    {
      order_id: orderId,
      product_id: productId,
      product_name: 'Cheeseburger',
      product_price: 9.99,
      quantity: 2,
      addons: [
        { id: 'addon-1', name: 'Extra Cheese', price: 1.50 }
      ],
      item_total: 22.98
    }
  ]);
```

---

### Advertisements

Stores promotional content for the kiosk

**Table**: `advertisements`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| title | text | Advertisement title |
| media_type | text | Media type (image, gif, video) |
| media_url | text | Media file URL |
| start_date | timestamptz | Start date (optional) |
| end_date | timestamptz | End date (optional) |
| is_active | boolean | Active toggle |
| impressions | integer | View count |
| display_order | integer | Display order |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update timestamp |

**Example Query**:
```typescript
// Get active ads
const { data, error } = await supabase
  .from('advertisements')
  .select('*')
  .eq('is_active', true)
  .lte('start_date', new Date().toISOString())
  .or('end_date.is.null,end_date.gte.' + new Date().toISOString())
  .order('display_order', { ascending: true });

// Increment impressions
await supabase.rpc('increment_ad_impression', { ad_id: adId });
```

---

### Admin Users

Stores authorized admin accounts

**Table**: `admin_users`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key (references auth.users) |
| email | text | Admin email |
| full_name | text | Admin full name |
| created_at | timestamptz | Creation timestamp |

**Example Query**:
```typescript
const { data, error } = await supabase
  .from('admin_users')
  .select('*')
  .eq('id', userId)
  .maybeSingle();
```

---

## Real-time Subscriptions

### Subscribe to Order Updates

```typescript
const subscription = supabase
  .channel('orders')
  .on(
    'postgres_changes',
    {
      event: 'UPDATE',
      schema: 'public',
      table: 'orders',
      filter: `id=eq.${orderId}`
    },
    (payload) => {
      console.log('Order updated:', payload.new);
    }
  )
  .subscribe();

// Clean up
subscription.unsubscribe();
```

### Subscribe to All Orders (Admin)

```typescript
const subscription = supabase
  .channel('all-orders')
  .on(
    'postgres_changes',
    {
      event: '*',
      schema: 'public',
      table: 'orders'
    },
    (payload) => {
      console.log('Change detected:', payload);
    }
  )
  .subscribe();
```

---

## Common Queries

### Get Menu with Products

```typescript
const { data, error } = await supabase
  .from('categories')
  .select(`
    *,
    products (
      *,
      product_addons (
        addons (*)
      )
    )
  `)
  .eq('is_active', true)
  .eq('products.is_available', true)
  .order('display_order', { ascending: true });
```

### Get Order with Items

```typescript
const { data, error } = await supabase
  .from('orders')
  .select(`
    *,
    order_items (*)
  `)
  .eq('id', orderId)
  .single();
```

### Get Today's Revenue

```typescript
const today = new Date();
today.setHours(0, 0, 0, 0);

const { data, error } = await supabase
  .from('orders')
  .select('total_price')
  .gte('created_at', today.toISOString())
  .eq('status', 'completed');

const revenue = data?.reduce((sum, order) => sum + order.total_price, 0) || 0;
```

### Get Popular Products

```typescript
const { data, error } = await supabase
  .from('order_items')
  .select('product_name, quantity')
  .order('quantity', { ascending: false })
  .limit(10);

// Aggregate in client
const productCounts = data?.reduce((acc, item) => {
  acc[item.product_name] = (acc[item.product_name] || 0) + item.quantity;
  return acc;
}, {});
```

---

## Row Level Security (RLS) Policies

### Public Access (Customers)
- **Read**: Categories (active only), Products (available only), Addons (available only)
- **Write**: Orders, Order Items
- **Update**: None
- **Delete**: None

### Admin Access
- **Read**: All tables, all data
- **Write**: All tables
- **Update**: All tables
- **Delete**: All tables (except active orders)

### Verification
All admin operations verify the user exists in `admin_users` table:

```sql
EXISTS (SELECT 1 FROM admin_users WHERE id = auth.uid())
```

---

## Authentication

### Sign In

```typescript
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'admin@example.com',
  password: 'password'
});
```

### Sign Out

```typescript
await supabase.auth.signOut();
```

### Get Current User

```typescript
const { data: { user } } = await supabase.auth.getUser();
```

### Check Admin Status

```typescript
const { data: adminUser } = await supabase
  .from('admin_users')
  .select('*')
  .eq('id', user.id)
  .maybeSingle();

const isAdmin = !!adminUser;
```

---

## Error Handling

Always check for errors in Supabase responses:

```typescript
const { data, error } = await supabase
  .from('products')
  .select('*');

if (error) {
  console.error('Database error:', error.message);
  // Handle error appropriately
}

if (!data || data.length === 0) {
  console.log('No products found');
}
```

---

## Best Practices

1. **Use `.maybeSingle()` for single record queries** to avoid errors when no records exist
2. **Always check for errors** before using data
3. **Use transactions** for related inserts (orders + order items)
4. **Subscribe to real-time updates** for order tracking
5. **Validate data** on the client before submitting
6. **Use select filters** to minimize data transfer
7. **Index frequently queried columns** for better performance
8. **Clean up subscriptions** when components unmount

---

## Storage

Media files can be stored in Supabase Storage:

### Upload File

```typescript
const file = event.target.files[0];
const fileExt = file.name.split('.').pop();
const fileName = `${Math.random()}.${fileExt}`;
const filePath = `products/${fileName}`;

const { error: uploadError } = await supabase.storage
  .from('media')
  .upload(filePath, file);

if (!uploadError) {
  const { data } = supabase.storage
    .from('media')
    .getPublicUrl(filePath);

  const imageUrl = data.publicUrl;
}
```

### Delete File

```typescript
await supabase.storage
  .from('media')
  .remove(['products/filename.jpg']);
```

---

## Performance Tips

1. Use `select()` to fetch only needed columns
2. Add `.limit()` for large result sets
3. Use `.range()` for pagination
4. Add database indexes for frequently queried fields
5. Cache static data (categories, products) on the client
6. Use `.maybeSingle()` instead of `.single()` when record might not exist
7. Batch operations when possible
8. Monitor Supabase dashboard for slow queries
