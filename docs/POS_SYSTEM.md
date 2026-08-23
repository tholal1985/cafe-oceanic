# Point of Sale (POS) System

## Overview

A comprehensive POS system for restaurant operations with customer management, loyalty programs, and real-time transaction processing.

## Features

### 1. Session Management
- **Session Opening**: Staff must open a session before making sales
- **Auto-Generated Session Numbers**: Format `SES-YYYYMMDD-XXXX`
- **Opening Cash Tracking**: Record starting cash amount
- **Real-Time Session Stats**: Tracks total sales and transaction count
- **Session Closing**: Records closing cash and calculates variance

### 2. Product Browsing
- **Category Filtering**: Quick filter by product categories
- **Search Functionality**: Search products by name
- **Grid/List Views**: Toggle between grid and list display modes
- **Real-Time Inventory**: Shows only available products

### 3. Shopping Cart
- **Add to Cart**: Quick product selection
- **Quantity Adjustment**: Increment/decrement quantities
- **Item Removal**: Remove individual items
- **Clear Cart**: Clear all items at once
- **Live Total Calculation**: Real-time cart total

### 4. Customer Management
- **Customer Search**: Search by name, phone, email, or customer number
- **Quick Add Customer**: Fast customer registration during checkout
- **Customer Information Display**: Shows full customer details and loyalty status
- **Loyalty Tier Integration**: Displays tier, points, and discount eligibility

### 5. Checkout Process
- **Multiple Payment Methods**: Cash, card, or digital wallet
- **Cash Change Calculation**: Automatic change calculation for cash payments
- **Loyalty Discounts**: Automatic discount application based on tier
- **Points Earning**: Award loyalty points on purchase (1 point per $1 spent)
- **Auto-Generated Order Numbers**: Format `ORD-YYYYMMDD-XXXX`
- **Transaction Numbers**: Format `TXN-YYYYMMDD-XXXX`

### 6. Automated Database Operations

All number generation and total updates are handled automatically by database triggers:

#### Auto-Generated Numbers
- **Order Numbers**: `ORD-YYYYMMDD-XXXX` (e.g., ORD-20260330-0001)
- **Session Numbers**: `SES-YYYYMMDD-XXXX` (e.g., SES-20260330-0001)
- **Transaction Numbers**: `TXN-YYYYMMDD-XXXX` (e.g., TXN-20260330-0001)

#### Automatic Updates
- **Session Totals**: Automatically updated when transactions are created
- **Customer Stats**: total_visits and total_spent updated on purchase
- **Loyalty Points**: Awarded and tracked automatically

## Database Schema

### POS Sessions
```sql
- id (uuid, primary key)
- session_number (text, auto-generated)
- staff_id (uuid, references admin_users)
- opened_at (timestamptz)
- closed_at (timestamptz, nullable)
- opening_cash (numeric)
- closing_cash (numeric, nullable)
- total_sales (numeric, auto-updated)
- total_transactions (integer, auto-updated)
- status (text: 'open' or 'closed')
```

### POS Transactions
```sql
- id (uuid, primary key)
- transaction_number (text, auto-generated)
- session_id (uuid, references pos_sessions)
- order_id (uuid, references orders)
- staff_id (uuid, references admin_users)
- customer_id (uuid, references customers, nullable)
- customer_name (text, nullable)
- customer_phone (text, nullable)
- payment_method (text: 'cash', 'card', 'digital')
- subtotal (numeric)
- tax_amount (numeric)
- discount_amount (numeric)
- total_amount (numeric)
- amount_tendered (numeric, for cash payments)
- change_given (numeric, for cash payments)
- transaction_type (text: 'sale', 'refund', 'void')
- status (text: 'completed', 'pending', 'cancelled')
```

### Orders (Enhanced for POS)
```sql
- id (uuid, primary key)
- order_number (text, auto-generated)
- order_type (text: 'dine-in', 'takeaway', 'pos')
- total_price (numeric)
- status (text: 'pending', 'preparing', 'ready', 'completed', 'cancelled')
- payment_method (text: 'cash', 'card', 'digital')
- payment_status (text: 'pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled')
- phone_number (text, nullable)
- created_at (timestamptz)
- updated_at (timestamptz)
```

## Workflows

### Opening a Session
1. Navigate to POS
2. Enter opening cash amount
3. Click "Open Session"
4. Session number auto-generated
5. Begin making sales

### Processing a Sale
1. **Select Products**: Click products to add to cart
2. **Adjust Quantities**: Use +/- buttons
3. **Add Customer** (Optional):
   - Search existing customer, OR
   - Quick add new customer, OR
   - Enter name/phone manually
4. **Choose Payment Method**: Cash, card, or digital
5. **Enter Amount** (for cash): System calculates change
6. **Complete Transaction**:
   - Order created with auto-generated order number
   - Transaction created with auto-generated transaction number
   - Session totals updated automatically
   - Customer stats updated automatically
   - Loyalty points awarded (if customer selected)

### Closing a Session
1. Click "Close Session"
2. Count cash drawer
3. Enter closing cash amount
4. System calculates variance
5. Session closes and redirects to dashboard

## Best Practices

### Security
- RLS policies ensure staff can only access their own sessions
- All transactions are audit-logged with staff_id
- Sensitive operations require authentication

### Data Integrity
- All number generation uses database triggers (atomic, no duplicates)
- Session totals updated automatically via triggers
- Customer stats updated automatically via triggers
- Transactions are recorded before any updates

### User Experience
- Fast product selection with search and categories
- Quick customer lookup and registration
- Clear visual feedback during checkout
- Automatic change calculation
- Real-time session stats display

### Performance
- Indexed columns for fast lookups (order_number, session_number, etc.)
- Optimized queries with proper joins
- Minimal round trips to database
- Real-time updates without polling

## Troubleshooting

### Common Issues

**Cannot open session**: Ensure user is authenticated and has proper role permissions.

**Order creation fails**: Check that all required fields are present and RLS policies allow the operation.

**Loyalty points not awarded**: Verify customer is selected and customer_loyalty_transactions table is accessible.

**Session totals not updating**: Database triggers should handle this automatically. Check trigger logs.

## Future Enhancements

- Receipt printing via thermal printers
- Barcode/QR code scanning for products
- Split payment support
- Refund and void transaction handling
- End-of-day reporting
- Cash drawer reconciliation reports
- Multi-location support
- Offline mode with sync
