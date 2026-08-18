# Ooredoo Maldives SMS Integration

## Overview
The kiosk now supports SMS notifications via Ooredoo Maldives Bulk SMS API. SMS provides universal reach to all mobile phones without requiring WhatsApp or Viber installation.

## Features

### Why SMS?
- **Universal Compatibility**: Works with any mobile phone
- **No App Required**: No need for WhatsApp or Viber
- **High Reliability**: Direct carrier delivery
- **Instant Delivery**: Messages arrive within seconds
- **Wide Reach**: Perfect for all customer demographics

### Message Types
Same as WhatsApp/Viber:
1. **Order Confirmation** - Sent after payment
2. **Status Updates** - When order is being prepared
3. **Ready Notification** - When order is ready

## Setup Instructions

### Step 1: Get Ooredoo Maldives SMS Account
1. Contact Ooredoo Maldives Business Sales
2. Request Bulk SMS API access
3. Complete registration and verification
4. You will receive:
   - **Bearer Token**: Authorization token for API access
   - **Username**: Your account email/username
   - **Access Key**: Base64-encoded authentication key
   - **API Endpoint**: https://o-papi1-lb01.ooredoo.mv/bulk_sms/v2

### Step 2: Configure in Kiosk
1. Login to Admin Panel
2. Navigate to **Admin Panel > Messaging**
3. Find the **SMS (Ooredoo)** section
4. Enter your credentials:
   - **Bearer Token**: Authorization token (e.g., `5f39b5d6-b51f-3cd6-928a-0882ea03fa63`)
   - **Username (Email)**: Your Ooredoo account email (e.g., `your-email@example.com`)
   - **Access Key**: Your base64-encoded access key
   - **API URL**: Leave as default unless specified by Ooredoo
5. Check "Enable SMS Messaging"
6. Click "Save SMS Config"

## Configuration Details

### Required Fields
- **Bearer Token**: API authorization token from Ooredoo
- **Username**: Your account email or username
- **Access Key**: Base64-encoded authentication key

### Optional Fields
- **API URL**: Gateway endpoint
  - Default: `https://o-papi1-lb01.ooredoo.mv/bulk_sms/v2`
  - Only change if Ooredoo provides a different URL

## How It Works

### Automatic Delivery
When a customer completes an order:
1. System attempts to send via **all enabled services**:
   - WhatsApp (via Twilio)
   - Viber (via Viber Bot)
   - SMS (via Ooredoo Maldives)
2. Messages sent simultaneously for redundancy
3. Customer receives on at least one platform
4. All attempts logged for tracking

### Message Format
SMS messages are plain text, concise format:

**Order Confirmation:**
```
Order Confirmed!

Order #ORD-123456-789
Type: Takeaway
Total: $45.99

Thank you for your order! We'll notify you when it's ready.
```

**Status Update:**
```
Your order #ORD-123456-789 is being prepared!

Our chefs are working on it.
```

**Ready Notification:**
```
Your order #ORD-123456-789 is ready for pickup!

Please come to the counter to collect your order.

Thank you!
```

## Phone Number Format

### Accepted Formats
The system automatically handles various formats:
- International: `+9609166818`
- Local Maldives: `9609166818`
- With spaces: `+960 916 6818`
- With dashes: `+960-916-6818`

System converts all to digits only for Ooredoo Maldives.

## API Integration Details

### Ooredoo Maldives Bulk SMS v2 API
The Edge Function sends a POST request with FormData:

**Headers:**
- `Authorization: Bearer {bearer_token}`

**Form Parameters:**
- `username`: Your account email/username
- `access_key`: Your base64-encoded access key
- `message`: Message content
- `batch`: Phone number(s) to send to

### Example cURL Command
```bash
curl -X POST "https://o-papi1-lb01.ooredoo.mv/bulk_sms/v2" \
  -H "Authorization: Bearer 5f39b5d6-b51f-3cd6-928a-0882ea03fa63" \
  -F "username=\"your-email@example.com\"" \
  -F "access_key=\"SnRrQzg3TUtUYk9NMXlLdEZ1QXJTY09hSjUwNzJ1emlxZTVtWXZ1UXlONS92SkhVZnFUbUtMSzk0L2Vmd3UyZQ==\"" \
  -F "message=\"Test SMS\"" \
  -F "batch=\"9609166818\""
```

### Response Handling
- **Success**: HTTP 200 with `status: "success"` or similar
- **Failure**: Error message in response body
- **Timeout**: 30 second timeout

## Cost & Billing

### Ooredoo Maldives Pricing
- Charged per SMS sent
- Pricing varies by:
  - Message length (160 chars = 1 SMS)
  - Destination (local vs international)
  - Volume (bulk discounts available)
- Check with Ooredoo Maldives for current rates

### Cost Optimization Tips
1. Keep messages under 160 characters
2. Use abbreviations where appropriate
3. Avoid special characters (count as 2 chars)
4. Monitor usage via message logs
5. Consider enabling only for takeaway orders

## Monitoring & Logs

### Admin Panel Logs
View all SMS activity in **Admin Panel > Messaging > Message Logs**:
- Date/Time sent
- Phone number
- Service (SMS)
- Message type
- Status (Sent/Failed)
- Error details if failed

### Log Information
Each entry shows:
- **Order ID**: Related order
- **Recipient**: Phone number
- **Content**: Full message text
- **Status**: Delivery status
- **Error**: Failure reason (if applicable)

## Troubleshooting

### Common Issues

#### Issue: SMS not sending
**Solutions:**
1. Verify Bearer Token is correct
2. Check username (email) is correct
3. Verify access key is valid
4. Confirm sufficient SMS credits
5. Test with your own number first
6. Check API URL is correct

#### Issue: "Authentication failed"
**Solutions:**
1. Double-check Bearer Token (no extra spaces)
2. Verify username is your registered email
3. Ensure access key is the full base64 string
4. Contact Ooredoo to verify account status

#### Issue: "Invalid phone number"
**Solutions:**
1. Use Maldives format (+960...)
2. Verify number is valid Maldives mobile
3. Remove any special characters
4. Test with multiple numbers

#### Issue: Messages delayed
**Solutions:**
1. Check Ooredoo Maldives service status
2. Verify network connectivity
3. Review message logs for timing
4. Contact Ooredoo support if persistent

### Testing SMS

#### Test Process
1. Configure SMS in admin panel
2. Enable SMS messaging
3. Place a test order with your phone number
4. Check message logs for delivery status
5. Verify SMS received on your phone

#### What to Check
- Message delivered within 30 seconds
- Message text is complete and readable
- Order number is correct
- No character encoding issues

## Security

### Credential Storage
- Credentials stored encrypted in database
- Only accessible to authenticated admins
- Never exposed to frontend
- Secured via Row Level Security (RLS)

### Message Privacy
- Messages sent only to order owner
- No personal data beyond order details
- Full audit trail in logs
- Privacy compliant

## Best Practices

### Message Content
- Keep under 160 characters when possible
- Use clear, concise language
- Include order number always
- Provide actionable next steps
- Add thank you message

### When to Use SMS
**Always use for:**
- Takeaway orders (customer needs notification)
- Ready notifications
- Order confirmations

**Optional for:**
- Dine-in orders (customer at location)
- Status updates (may be excessive)

### Multi-Channel Strategy
**Recommended approach:**
1. Enable all three services (WhatsApp, Viber, SMS)
2. System sends to all simultaneously
3. Customer receives on available platform
4. Maximum delivery success rate

## Integration with Other Services

### Priority Order
Messages attempt delivery in this order:
1. WhatsApp (if enabled)
2. Viber (if enabled)
3. SMS (if enabled)

All run in parallel - fastest delivery wins.

### Fallback Strategy
If one service fails:
- Other services still attempt delivery
- At least one typically succeeds
- Full redundancy built-in
- Customer experience unaffected

## Support & Resources

### Ooredoo Maldives Support
- Business Support: +960 961 1000
- Email: business@ooredoo.mv
- Website: [ooredoo.mv](https://www.ooredoo.mv)

### Common Questions

**Q: Can I use other SMS providers?**
A: Currently optimized for Ooredoo Maldives. Contact support for other providers.

**Q: What's the character limit?**
A: 160 characters for single SMS. Longer messages split into multiple.

**Q: Can I customize messages?**
A: Yes, edit templates in `/src/lib/messagingService.ts`

**Q: How do I check remaining credits?**
A: Contact Ooredoo Maldives support

**Q: Can I send to international numbers?**
A: Check with Ooredoo Maldives for international rates and availability

## Advanced Configuration

### Custom API Endpoints
If Ooredoo provides a custom endpoint:
1. Go to Admin Panel > Messaging
2. Update API URL field
3. Save configuration
4. Test with a sample message

### Message Templates
To customize message templates:
1. Edit `/src/lib/messagingService.ts`
2. Modify message text in functions
3. Keep messages concise
4. Test thoroughly before deploying

### Rate Limiting
Ooredoo Maldives may enforce rate limits:
- Check your account tier
- Monitor sending frequency
- Consider queueing for high volume
- Contact Ooredoo for higher limits

## Credentials Format Reference

### Bearer Token Example
```
5f39b5d6-b51f-3cd6-928a-0882ea03fa63
```

### Username Example
```
tholal123@gmail.com
```

### Access Key Example (Base64)
```
SnRrQzg3TUtUYk9NMXlLdEZ1QXJTY09hSjUwNzJ1emlxZTVtWXZ1UXlONS92SkhVZnFUbUtMSzk0L2Vmd3UyZQ==
```

## Conclusion

SMS via Ooredoo Maldives provides reliable, universal order notifications for your kiosk. Combined with WhatsApp and Viber, you have comprehensive customer communication coverage ensuring every customer stays informed about their order status.
