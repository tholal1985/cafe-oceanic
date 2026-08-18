# WhatsApp & Viber Messaging Integration

## Overview
The kiosk system now supports automatic order notifications via WhatsApp and Viber. Customers receive instant confirmations and status updates about their orders directly to their mobile devices.

## Features

### Supported Services
1. **WhatsApp** (via Twilio API)
   - Industry-standard messaging platform
   - High delivery rates
   - Requires Twilio account

2. **Viber** (via Viber Bot API)
   - Popular in many regions
   - Direct bot messaging
   - Requires Viber Bot account

### Message Types

#### 1. Order Confirmation
Sent immediately after successful payment.
```
🎉 Order Confirmed!

Order #ORD-123456-789
Type: Takeaway
Total: $45.99

Thank you for your order! We'll notify you when it's ready.
```

#### 2. Status Updates
Sent when order status changes.
```
👨‍🍳 Your order #ORD-123456-789 is being prepared!

Our chefs are working on it.
```

#### 3. Ready Notification
Sent when order is ready for pickup/service.
```
✅ Your order #ORD-123456-789 is ready for pickup!

Please come to the counter to collect your order.

Thank you!
```

## Setup Instructions

### WhatsApp Setup (Twilio)

#### Step 1: Create Twilio Account
1. Visit [twilio.com](https://www.twilio.com)
2. Sign up for a free account
3. Verify your email and phone number

#### Step 2: Get WhatsApp Sandbox Number
1. Go to Twilio Console
2. Navigate to Messaging > Try it out > Send a WhatsApp message
3. Follow the instructions to activate your sandbox
4. Note your WhatsApp number (e.g., +14155238886)

#### Step 3: Get API Credentials
1. From Twilio Console Dashboard
2. Find your **Account SID** (starts with AC...)
3. Find your **Auth Token** (click to reveal)

#### Step 4: Configure in Kiosk
1. Go to Admin Panel > Messaging
2. Under WhatsApp section:
   - Check "Enable WhatsApp Messaging"
   - Enter **Twilio Account SID**
   - Enter **Twilio Auth Token**
   - Enter **WhatsApp Sender Number** (e.g., +14155238886)
3. Click "Save WhatsApp Config"

#### Step 5: Test Messages
For testing, recipients need to:
1. Send "join [sandbox-name]" to your Twilio WhatsApp number
2. After joining, they can receive messages

### Viber Setup

#### Step 1: Create Viber Bot
1. Visit [partners.viber.com](https://partners.viber.com)
2. Create a Bot account
3. Complete bot profile (name, icon, description)

#### Step 2: Get Bot Token
1. After bot creation, you'll receive an **Auth Token**
2. Save this token securely

#### Step 3: Configure in Kiosk
1. Go to Admin Panel > Messaging
2. Under Viber section:
   - Check "Enable Viber Messaging"
   - Enter **Viber Bot Auth Token**
   - Enter **Sender Name** (your restaurant name)
3. Click "Save Viber Config"

#### Step 4: Test Messages
Recipients need to:
1. Search for your bot in Viber
2. Start a conversation
3. They can now receive messages

## How It Works

### Customer Flow
1. Customer adds items to cart
2. Proceeds to checkout
3. Enters phone number (for takeaway orders)
4. Completes payment
5. **System automatically sends confirmation** to WhatsApp and Viber
6. Customer receives instant notification

### Admin Monitoring
- Navigate to Admin Panel > Messaging
- View **Message Logs** showing:
  - Date/Time of message
  - Service used (WhatsApp/Viber)
  - Phone number
  - Message type
  - Status (Sent/Failed)
  - Error details if failed

## Phone Number Format

### Accepted Formats
- International: +1234567890
- With spaces: +1 234 567 890
- With dashes: +1-234-567-890
- Local: 1234567890

System automatically formats to international standard.

## Database Structure

### Table: `messaging_config`
Stores API configuration for each service.
- `service_name`: 'whatsapp' or 'viber'
- `is_enabled`: Whether service is active
- `api_key`: Service API key/token
- `api_secret`: Additional secret (for WhatsApp)
- `sender_id`: Sender phone/bot name
- `config_data`: Additional JSON config

### Table: `message_logs`
Tracks all sent messages for monitoring.
- `order_id`: Related order
- `phone_number`: Recipient
- `service`: Which service was used
- `message_type`: Type of message
- `status`: Delivery status
- `error_message`: Error details if failed
- `sent_at`: When message was sent

## Edge Functions

### `/send-whatsapp`
Sends messages via Twilio WhatsApp API.
- Handles Twilio authentication
- Formats message for WhatsApp
- Logs delivery status

### `/send-viber`
Sends messages via Viber Bot API.
- Uses Viber PA API
- Formats message for Viber
- Logs delivery status

## Security

### API Key Storage
- Stored securely in database
- Only accessible to authenticated admins
- Never exposed to frontend

### Message Privacy
- Messages sent only to order owner's phone
- No personal data in message content
- Logs accessible only to admins

## Troubleshooting

### WhatsApp Messages Not Sending

**Issue**: Messages show as "Failed" in logs

**Solutions**:
1. Verify Twilio credentials are correct
2. Check Account SID and Auth Token
3. Ensure phone number format is correct
4. For sandbox: Recipient must join sandbox first
5. Check Twilio account balance

**Issue**: "Invalid number" error

**Solutions**:
1. Use international format (+country code)
2. Verify number is WhatsApp-enabled
3. Test with your own number first

### Viber Messages Not Sending

**Issue**: Messages show as "Failed"

**Solutions**:
1. Verify Bot Token is correct
2. Check bot is active and approved
3. Recipient must have started conversation with bot
4. Verify sender name is configured

**Issue**: "User not found" error

**Solutions**:
1. Recipient needs to search and start chat with bot
2. Phone number must be registered with Viber
3. Use correct international format

## Cost Considerations

### WhatsApp (Twilio)
- **Free Tier**: Limited messages in sandbox mode
- **Production**: Charged per message (~$0.005-0.01)
- **Monthly minimum**: Check Twilio pricing
- **Free alternative**: Use sandbox for testing

### Viber
- **Free**: Bot messaging is typically free
- **Limits**: May have rate limits
- **Requirements**: Bot approval may be needed

## Best Practices

### Message Timing
- Send confirmation immediately after payment
- Send status updates only on significant changes
- Avoid spam - one message per status change

### Message Content
- Keep messages concise and clear
- Include order number always
- Use emojis for visual appeal
- Provide next steps for customer

### Error Handling
- System continues even if messaging fails
- Logs all attempts for debugging
- Multiple services provide redundancy
- Customer can still track order on kiosk

## Advanced Configuration

### Custom Messages
Edit `/src/lib/messagingService.ts` to customize message templates.

### Additional Services
Add new messaging services by:
1. Creating new Edge Function
2. Adding config to `messaging_config`
3. Updating `messagingService.ts`

### Webhook Integration
For delivery receipts, configure webhooks in Twilio/Viber admin panels.

## Support

### Common Issues
- Check message logs for error details
- Verify API credentials
- Test with known working phone numbers
- Review Edge Function logs in Supabase

### Contact
For integration support, refer to:
- [Twilio Documentation](https://www.twilio.com/docs/whatsapp)
- [Viber Bot API](https://developers.viber.com/docs/api/rest-bot-api/)
