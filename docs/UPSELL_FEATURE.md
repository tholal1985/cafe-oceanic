# Upsell Suggestion Feature

## Overview
The upsell suggestion feature displays a pop-up modal before payment, suggesting additional items to customers - similar to popular kiosks at McDonald's, Burger King, and other fast-food chains.

## How It Works

### Customer Flow
1. Customer adds items to cart and proceeds to checkout
2. Customer selects order type (Dine-in/Takeaway) and enters phone number if needed
3. Customer clicks "Pay with Card" or "Pay with Cash"
4. **Upsell modal appears** showing suggested items
5. Customer can:
   - Add suggested items with one click
   - Skip and continue to payment

### Admin Management
Admins can manage upsell suggestions through the Admin Panel:

1. Navigate to **Admin Panel > Upsell Items**
2. Add new suggestions by clicking "Add Suggestion"
3. Configure for each suggestion:
   - **Product**: Select from available products
   - **Suggestion Type**: drink, side, dessert, combo, or popular
   - **Display Text**: Custom message (e.g., "Perfect with your meal!")
   - **Display Order**: Controls the sequence shown
   - **Active Status**: Enable/disable suggestions

## Features

### Visual Design
- Modern, eye-catching gradient header (orange to red)
- Grid layout showing up to 6 suggestions
- Product images with type badges
- Large "Add" buttons for quick selection
- Visual feedback when items are added
- "No Thanks, Continue to Payment" button always visible

### Smart Functionality
- Only shows active suggestions
- Displays products with images and prices
- Quick add-to-cart without leaving the modal
- Added items show "Added!" confirmation
- Respects product availability
- Ordered by display_order for optimal presentation

## Database Structure

### Table: `suggested_products`
- `id`: Unique identifier
- `product_id`: Links to products table
- `suggestion_type`: Category (drink, side, dessert, combo, popular)
- `display_text`: Custom suggestion message
- `display_order`: Order of appearance
- `is_active`: Enable/disable suggestion
- `created_at`, `updated_at`: Timestamps

## Sample Data
The system includes 3 sample suggestions:
1. Cola (drink) - "Quench your thirst with an ice-cold Cola!"
2. Small Fries (side) - "Perfect with your meal - crispy golden fries!"
3. Ice Cream (dessert) - "Complete your meal with creamy Ice Cream!"

## Benefits
- **Increased Sales**: Suggests complementary items at the right moment
- **Better Customer Experience**: Reminds customers of popular add-ons
- **Flexibility**: Easy to update suggestions based on promotions
- **Analytics Ready**: Track which items are frequently added via upsell
