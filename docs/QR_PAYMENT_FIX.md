# QR Payment and Currency Integration Fixes

## Issues Fixed

### 1. Currency System Integration
**Problem**: System had hardcoded USD/MVR currencies instead of using the centralized currency system.

**Solution**:
- Integrated `useCurrency` hook into PaymentScreen.tsx
- PaymentService now uses the selected system currency from settings
- QR payment screen displays amounts using the centralized currency formatter
- All payment flows now respect the currency selected in System Settings

### 2. EMV QR Code Generation
**Problem**: The EMV QR code generator had limited currency support and could generate invalid currency codes.

**Solution**:
- Extended EMV QR code generator to support all 12 system currencies
- Added proper ISO 4217 currency code mapping:
  - MVR: 462 (Maldivian Rufiyaa)
  - USD: 840 (US Dollar)
  - EUR: 978 (Euro)
  - GBP: 826 (British Pound)
  - INR: 356 (Indian Rupee)
  - AED: 784 (UAE Dirham)
  - SAR: 682 (Saudi Riyal)
  - JPY: 392 (Japanese Yen)
  - CNY: 156 (Chinese Yuan)
  - AUD: 036 (Australian Dollar)
  - SGD: 702 (Singapore Dollar)
  - CHF: 756 (Swiss Franc)

### 3. Missing Merchant ID Handling
**Problem**: QR generation could fail if merchant_id was not configured.

**Solution**:
- Added fallback to 'DEMO-MERCHANT-ID' if merchant_id is missing
- This allows QR code generation to work in demo mode
- BML gateway already has merchant_id configured in production

### 4. Error Display Improvements
**Problem**: Error messages were not clearly displayed to users.

**Solution**:
- Enhanced QRPaymentScreen with better error messaging
- Added transaction ID display for debugging
- Improved error detail presentation with proper formatting
- Added visual error container with clear styling

## How Currency Changes Work

1. **Admin sets currency** in System Settings (Admin Panel → System Settings)
2. **Currency is stored** in the `system_settings` table as JSONB
3. **All components** use the `useCurrency()` hook to get the current currency
4. **Prices display** using `formatCurrency()` with proper symbol, position, and decimal places
5. **Payment transactions** are created with the correct currency code
6. **QR codes generated** use the correct ISO 4217 currency code

## Testing QR Payments

### Demo Mode (Default)
When BML credentials are not fully configured, the system automatically falls back to demo mode:
- QR codes are generated with EMV QR format
- Contains merchant ID, amount, currency, and transaction reference
- Can be scanned by any EMV QR-compatible payment app
- Transaction tracking works normally

### Production Mode
When BML API credentials are configured:
- API calls are made to BML's QR generation endpoint
- Real QR codes are returned from the payment gateway
- Full payment verification through BML's systems

## Configuration

### BML Gateway Setup
The BML gateway in the database has:
- `merchant_id`: UUID from BML merchant account
- `access_key`: JWT token for API authentication
- `environment`: 'production' or 'sandbox'
- `currency`: Default currency (MVR)

### System Currency
Set via Admin Panel → System Settings:
- Choose from 12 supported currencies
- Changes apply immediately across all sections
- Currency formatting follows regional standards

## Files Modified

1. **src/pages/PaymentScreen.tsx**
   - Added useCurrency hook
   - Using system currency instead of hardcoded values

2. **src/pages/QRPaymentScreen.tsx**
   - Added currency formatter
   - Enhanced error display
   - Added transaction ID for debugging

3. **src/lib/paymentService.ts**
   - Extended ALLOWED_CURRENCIES to all 12 supported currencies

4. **supabase/functions/initiate-payment/index.ts**
   - Enhanced EMV QR code generator with full currency support
   - Added merchant ID fallback
   - Improved currency code mapping

## Next Steps for Production

1. Ensure BML merchant credentials are properly configured
2. Test with real BML QR scanner app
3. Verify webhook endpoints are accessible
4. Monitor payment transactions table for successful completions
5. Set up proper error alerting for failed payments
