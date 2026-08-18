# Cafe Oceanic Setup Guide

## Quick Start

The application is already configured and running. Follow these steps to get started:

### 1. Access the Kiosk

Open your browser and navigate to the application. You'll see the welcome screen with animated advertisements.

### 2. Create an Admin Account

To access the admin dashboard, you need to create an admin user:

#### Step 1: Sign Up via Supabase Auth

You can create a user account using the Supabase Auth API or SQL:

**Option A: Using SQL**

```sql
-- First, create a user in Supabase Auth (you may need to do this via Supabase dashboard)
-- Then add the user to admin_users table

INSERT INTO admin_users (id, email, full_name)
VALUES (
  'your-auth-user-id',  -- Get this from auth.users table after signup
  'admin@cafeoceanic.com',
  'Admin User'
);
```

**Option B: Using Supabase Dashboard**

1. Go to Authentication > Users
2. Click "Add user"
3. Enter email and password
4. Copy the user ID
5. Run the SQL query above with the copied user ID

#### Step 2: Login to Admin Panel

1. Navigate to `/admin/login`
2. Enter your admin credentials
3. You'll be redirected to the admin dashboard

### 3. Add Initial Content

#### Add Categories

1. Go to Admin Panel → Categories
2. Click "Add Category"
3. Fill in:
   - Name (e.g., "Burgers", "Drinks")
   - Image URL (use Pexels or your own)
   - Display Order (0, 1, 2, etc.)
   - Active checkbox

#### Add Products

1. Go to Admin Panel → Products
2. Click "Add Product"
3. Fill in:
   - Category
   - Name
   - Description
   - Price
   - Image URL
   - Display Order
   - Available checkbox

#### Add Add-ons

1. Go to Admin Panel → Add-ons
2. Click "Add Add-on"
3. Fill in:
   - Name (e.g., "Extra Cheese", "Bacon")
   - Price
   - Available checkbox

#### Add Advertisements

1. Go to Admin Panel → Advertisements
2. Click "Add Advertisement"
3. Fill in:
   - Title
   - Media Type (Image/GIF/Video)
   - Media URL
   - Start Date (optional)
   - End Date (optional)
   - Display Order
   - Active checkbox

### 4. Test the Kiosk

1. Go back to the home page (`/`)
2. Click "Start Order"
3. Browse products
4. Add items to cart
5. Proceed to checkout
6. Complete payment
7. Track your order

### 5. Manage Orders

1. Go to Admin Panel → Orders
2. View all incoming orders
3. Update order status:
   - Pending → Preparing
   - Preparing → Ready
   - Ready → Completed
4. Orders update in real-time on the kiosk

### 6. Set Up Kitchen Display

The Kitchen Display System (KDS) shows real-time orders for kitchen staff:

1. **Access the Kitchen Display**:
   - Open a separate browser window or device
   - Navigate to `/kitchen`
   - No login required - designed for quick kitchen access

2. **Recommended Setup**:
   - Use a dedicated tablet or monitor in the kitchen area
   - Keep the `/kitchen` page open full-time
   - Set browser to kiosk/fullscreen mode for best experience

3. **How to Use**:
   - New orders appear automatically when customers place them
   - Each order card shows:
     - Order number (last 4 digits highlighted)
     - Time elapsed since order was placed
     - Complete item list with quantities and add-ons
   - Click "Start Preparing" when you begin working on an order
   - Click "Mark as Ready" when order is complete for pickup
   - Orders automatically disappear when marked as ready

4. **Visual Indicators**:
   - White border: Fresh order (0-5 minutes)
   - Yellow border: Moderate wait (5-10 minutes)
   - Red border: Urgent attention needed (10+ minutes)
   - Blue badge: Order is being prepared
   - Yellow badge: New order awaiting preparation

5. **Access from Admin Panel**:
   - Admins can open the kitchen display by clicking "Kitchen Display" in the sidebar
   - Opens in a new tab for easy multi-screen setups

## Sample Data

The system comes with sample data pre-loaded:
- 4 Categories (Burgers, Drinks, Fries, Desserts)
- 6 Sample Products
- 3 Add-ons
- 2 Sample Advertisements

You can edit or delete these and add your own.

## Environment Variables

The following environment variables are already configured in `.env`:

```
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
```

These are automatically set up and don't need to be changed.

## Troubleshooting

### Can't Login to Admin Panel

**Problem**: "Unauthorized: Admin access required"

**Solution**: Make sure the user is added to the `admin_users` table:

```sql
SELECT * FROM admin_users WHERE email = 'your-email@example.com';
```

If not present, add the user:

```sql
INSERT INTO admin_users (id, email, full_name)
SELECT id, email, raw_user_meta_data->>'full_name'
FROM auth.users
WHERE email = 'your-email@example.com';
```

### Products Not Showing

**Problem**: Products don't appear on the menu screen

**Solutions**:
1. Check if products are marked as "Available" in admin panel
2. Check if the category is marked as "Active"
3. Verify products are assigned to a category

### Advertisements Not Rotating

**Problem**: Ads don't auto-rotate on welcome screen

**Solutions**:
1. Make sure ads are marked as "Active"
2. Check start_date and end_date (must be within current date range)
3. Ensure at least one ad is published

### Order Status Not Updating

**Problem**: Order status changes in admin but not on kiosk

**Solution**: Check browser console for Supabase Realtime connection errors. Refresh the page.

### Idle Timer Not Working

**Problem**: Kiosk doesn't return to home screen

**Solution**: The idle timer only works on customer pages (not admin panel or welcome screen). Try on menu or cart pages.

## Database Management

### View All Orders

```sql
SELECT
  o.order_number,
  o.total_price,
  o.status,
  o.created_at,
  COUNT(oi.id) as item_count
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
GROUP BY o.id
ORDER BY o.created_at DESC;
```

### View Popular Products

```sql
SELECT
  product_name,
  SUM(quantity) as total_sold,
  SUM(item_total) as total_revenue
FROM order_items
GROUP BY product_name
ORDER BY total_sold DESC;
```

### View Ad Performance

```sql
SELECT
  title,
  impressions,
  is_active,
  created_at
FROM advertisements
ORDER BY impressions DESC;
```

## Best Practices

### For Restaurant Operators

1. **Update Menu Regularly**: Keep products and prices current
2. **Monitor Orders**: Check admin panel frequently for new orders
3. **Rotate Ads**: Update advertisements to promote seasonal items
4. **Check Inventory**: Mark items as unavailable when out of stock
5. **Clear Old Orders**: Archive or delete completed orders periodically

### For Developers

1. **Backup Database**: Regular backups via Supabase dashboard
2. **Monitor Realtime**: Check Supabase Realtime usage and quotas
3. **Optimize Images**: Use compressed images for faster loading
4. **Test on Tablet**: Best experienced on tablet-sized touchscreens
5. **Update Dependencies**: Keep npm packages up to date

## Next Steps

- Customize the color scheme to match your brand
- Replace stock images with professional product photos
- Add payment gateway integration (Stripe, Square, etc.)
- Implement receipt printing
- Add multi-language support
- Set up analytics tracking
- Configure automated backup schedules

## Support Resources

- **Supabase Docs**: https://supabase.com/docs
- **React Docs**: https://react.dev
- **Framer Motion**: https://www.framer.com/motion
- **TailwindCSS**: https://tailwindcss.com

For technical support, check the browser console for errors and refer to the documentation above.
