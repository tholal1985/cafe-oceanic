# Gift Rewards Feature

## Overview
The Gift Rewards system automatically offers FREE gifts to customers when their order reaches certain value thresholds (e.g., $50, $100, $500). This feature is modeled after promotional systems used by McDonald's, Burger King, and other major quick-service restaurant kiosks.

## How It Works

### Customer Experience Flow
1. Customer adds items to cart
2. When cart total meets minimum threshold (e.g., $50), system detects eligible gifts
3. Customer clicks "Pay with Card" or "Pay with Cash"
4. **Gift Modal appears first** with celebratory design
5. Customer can:
   - Choose ONE free gift from eligible options
   - Skip and continue without claiming
6. After gift selection or skip, upsell modal appears
7. Customer proceeds to payment

### Visual Design - Gift Modal
- **Eye-catching gradient background** (yellow → orange → red)
- **Animated bouncing gift icon** at the top
- **"CONGRATULATIONS!" header** with sparkle animations
- **Gift cards** showing:
  - Product image
  - "FREE!" badge rotated at an angle
  - Original price (crossed out)
  - $0.00 price in green
  - "Claim This Gift" button
- Professional, exciting design that celebrates the customer

### Admin Management
Admins can create and manage gift promotions through **Admin Panel > Gift Rewards**:

#### Configuration Options
- **Product**: Select which product to give as gift
- **Minimum Order Value**: Dollar threshold to qualify (e.g., $50.00)
- **Gift Title**: Main heading shown in modal (e.g., "FREE Gift with Your Order!")
- **Gift Description**: Detailed message (e.g., "Congratulations! Your order qualifies for a FREE Ice Cream!")
- **Priority**: Higher priority gifts shown first (useful for multiple tier rewards)
- **Start Date**: When promotion begins
- **End Date**: When promotion ends (optional - leave blank for ongoing)
- **Max Redemptions**: Limit total claims (optional - leave blank for unlimited)
- **Active Status**: Enable/disable the promotion

## Multi-Tier Rewards System

The system supports multiple reward tiers. Examples:

### Tier 1: $50 Order
- Free Small Fries
- Free Cookie
- Free Fountain Drink

### Tier 2: $100 Order
- Free Medium Fries
- Free Dessert
- Free Large Drink

### Tier 3: $500 Order
- Free Premium Burger
- Free Family Meal Upgrade
- Free Exclusive Item

**Priority System**: Higher priority gifts display first when multiple tiers qualify. For example, if a customer's order is $500, they'll see the $500 tier gifts first, followed by $100 and $50 tier options.

## Database Structure

### Table: `promotional_gifts`
- `id`: Unique identifier
- `product_id`: Links to products table
- `minimum_order_value`: Dollar threshold to qualify
- `gift_title`: Display title for modal
- `gift_description`: Detailed description shown to customer
- `is_active`: Enable/disable promotion
- `priority`: Display order (higher = first)
- `start_date`: Promotion start date
- `end_date`: Promotion end date (nullable)
- `max_redemptions`: Maximum times it can be claimed (nullable = unlimited)
- `redemptions_count`: Tracks how many times claimed
- `created_at`, `updated_at`: Timestamps

## Sample Data
The system includes 1 sample gift promotion:
- Ice Cream (FREE with orders $50+)
- Active and ready to use
- Demonstrates the feature

## Key Features

### Smart Eligibility Detection
- Automatically checks cart total in real-time
- Only shows gift modal if customer qualifies
- Respects date ranges and redemption limits
- Filters out inactive promotions

### Redemption Tracking
- Counts each time a gift is claimed
- Enforces maximum redemption limits
- Provides analytics for promotional effectiveness
- Visible in admin panel

### Gift Application
- Adds gift to cart with $0.00 price
- Maintains product info for kitchen
- Appears in order summary
- Included in order receipt

### Modal Flow Logic
```
Cart Total ≥ Minimum Value?
  ↓ YES
Gift Modal → Choose Gift → Upsell Modal → Payment
  ↓ NO
Upsell Modal → Payment
```

## Benefits

### For Business
- **Increases Order Size**: Customers add items to reach thresholds
- **Customer Loyalty**: Rewards encourage repeat visits
- **Flexible Promotions**: Easy to create time-limited offers
- **Data-Driven**: Track redemption rates and effectiveness
- **Competitive Advantage**: Matches industry-standard kiosk features

### For Customers
- **Immediate Gratification**: See rewards instantly
- **Clear Value**: Know exactly what they're getting
- **No Complicated Terms**: Simple dollar threshold
- **Choice**: Select their preferred gift
- **Transparency**: See value of gift (original price shown)

## Best Practices

### Setting Order Thresholds
- **$20-50**: Small treats (cookies, drinks)
- **$50-100**: Side items (fries, salads)
- **$100-200**: Full menu items (burgers, sandwiches)
- **$200+**: Premium items or combo meals

### Promotional Strategy
1. Start with conservative thresholds
2. Monitor redemption rates
3. Adjust based on average order values
4. Create seasonal/holiday promotions
5. Test different gift options
6. Use priority to feature new items

### Gift Selection Tips
- Choose items with high perceived value
- Select products that complement typical orders
- Feature items you want to promote
- Rotate gifts to keep offerings fresh
- Consider profit margins on gift items

## Technical Notes

### Performance
- Efficient database queries with RLS
- Real-time eligibility checking
- Minimal cart recalculation overhead
- Optimized for kiosk touchscreen use

### Security
- Row Level Security (RLS) enabled
- Public can only read active, eligible gifts
- Only admins can create/modify promotions
- Redemption counts protected from tampering

### Scalability
- Supports unlimited gift promotions
- Handles multiple simultaneous campaigns
- Date-based automatic activation/deactivation
- No performance impact on checkout flow
