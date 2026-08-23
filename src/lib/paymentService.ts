import { supabase } from './supabase';
import type { Database } from './database.types';

type PaymentGateway = Database['public']['Tables']['payment_gateways']['Row'];
type PaymentTransaction = Database['public']['Tables']['payment_transactions']['Row'];

export interface InitiatePaymentParams {
  orderId: string;
  amount: number;
  currency?: string;
  paymentMethod: 'card' | 'cash' | 'wallet';
  customerPhone?: string;
  customerEmail?: string;
  returnUrl?: string;
}

export interface PaymentInitiationResult {
  success: boolean;
  transactionId?: string;
  redirectUrl?: string;
  error?: string;
  localTransactionId?: string;
}

export class PaymentService {
  private static readonly MAX_AMOUNT = 100000;
  private static readonly MIN_AMOUNT = 0.01;
  private static readonly ALLOWED_CURRENCIES = ['USD', 'MVR', 'EUR', 'GBP', 'INR', 'AED', 'SAR', 'JPY', 'CNY', 'AUD', 'SGD', 'CHF'];
  private static readonly TRANSACTION_TIMEOUT_MS = 30 * 60 * 1000;

  private static validateAmount(amount: number): boolean {
    return (
      typeof amount === 'number' &&
      !isNaN(amount) &&
      amount >= this.MIN_AMOUNT &&
      amount <= this.MAX_AMOUNT &&
      Number.isFinite(amount)
    );
  }

  private static validateCurrency(currency: string): boolean {
    return this.ALLOWED_CURRENCIES.includes(currency.toUpperCase());
  }

  private static sanitizePhone(phone?: string): string | null {
    if (!phone) return null;
    const cleaned = phone.replace(/[^\d+]/g, '');
    return cleaned.length >= 7 && cleaned.length <= 15 ? cleaned : null;
  }

  private static sanitizeEmail(email?: string): string | null {
    if (!email) return null;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email) ? email : null;
  }

  private static async getActiveGateway(gatewayType?: string): Promise<PaymentGateway | null> {
    const query = supabase
      .from('payment_gateways')
      .select('id, name, gateway_type, is_active, is_default')
      .eq('is_active', true);

    if (gatewayType) {
      query.eq('gateway_type', gatewayType);
    } else {
      query.eq('is_default', true);
    }

    const { data } = await query.maybeSingle();
    return data;
  }

  static async initiatePayment(params: InitiatePaymentParams): Promise<PaymentInitiationResult> {
    try {
      const {
        orderId,
        amount,
        currency = 'USD',
        paymentMethod,
        customerPhone,
        customerEmail,
        returnUrl
      } = params;

      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!orderId || typeof orderId !== 'string' || !uuidRegex.test(orderId)) {
        return {
          success: false,
          error: 'Invalid order ID format'
        };
      }

      if (!this.validateAmount(amount)) {
        return {
          success: false,
          error: 'Invalid payment amount'
        };
      }

      if (!this.validateCurrency(currency)) {
        return {
          success: false,
          error: 'Unsupported currency'
        };
      }

      const normalizedCurrency = currency.toUpperCase();
      const sanitizedPhone = this.sanitizePhone(customerPhone);
      const sanitizedEmail = this.sanitizeEmail(customerEmail);

      if (paymentMethod === 'cash') {
        return this.processCashPayment(orderId, amount, normalizedCurrency, sanitizedPhone);
      }

      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id, total_price, payment_status')
        .eq('id', orderId)
        .maybeSingle();

      if (!existingOrder) {
        return {
          success: false,
          error: 'Order not found'
        };
      }

      if (Math.abs(existingOrder.total_price - amount) > 0.01) {
        return {
          success: false,
          error: 'Payment amount mismatch'
        };
      }

      if (existingOrder.payment_status === 'completed') {
        return {
          success: false,
          error: 'Order already paid'
        };
      }

      const { data: existingTransaction } = await supabase
        .from('payment_transactions')
        .select('id, status')
        .eq('order_id', orderId)
        .in('status', ['completed', 'processing'])
        .maybeSingle();

      if (existingTransaction) {
        return {
          success: false,
          error: 'Payment already in progress'
        };
      }

      const gateway = await this.getActiveGateway();
      if (!gateway) {
        return {
          success: false,
          error: 'No active payment gateway configured'
        };
      }

      const localTxnId = await this.generateTransactionId();
      const allowedOrigin = window.location.origin;
      const callbackUrl = returnUrl && returnUrl.startsWith(allowedOrigin)
        ? returnUrl
        : `${allowedOrigin}/payment/callback`;

      const { data: transaction, error: txnError } = await supabase
        .from('payment_transactions')
        .insert({
          order_id: orderId,
          gateway_id: gateway.id,
          local_transaction_id: localTxnId,
          amount: Math.round(amount * 100) / 100,
          currency: normalizedCurrency,
          status: 'pending',
          payment_method: paymentMethod,
          customer_phone: sanitizedPhone,
          customer_email: sanitizedEmail,
          callback_url: callbackUrl,
          expires_at: new Date(Date.now() + this.TRANSACTION_TIMEOUT_MS).toISOString(),
          metadata: {
            initiated_from: 'kiosk',
            ip_address: null
          }
        })
        .select('id, local_transaction_id')
        .maybeSingle();

      if (txnError || !transaction) {
        console.error('Failed to create transaction:', txnError);
        return {
          success: false,
          error: 'Failed to create payment transaction'
        };
      }

      console.log('Calling edge function:', {
        transactionId: transaction.id,
        gatewayType: gateway.gateway_type,
        supabaseUrl: import.meta.env.VITE_SUPABASE_URL
      });

      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
          throw new Error('Supabase configuration is missing');
        }

        const edgeFunctionUrl = `${supabaseUrl}/functions/v1/initiate-payment`;
        console.log('Calling edge function:', edgeFunctionUrl);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const response = await fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
            'apikey': supabaseKey,
          },
          body: JSON.stringify({
            transactionId: transaction.id,
            gatewayType: gateway.gateway_type,
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        const responseText = await response.text();
        console.log('Edge function response:', response.status, responseText);

        if (!response.ok) {
          console.error('Edge function HTTP error:', response.status, responseText);

          let errorMsg = responseText;
          try {
            const errorJson = JSON.parse(responseText);
            errorMsg = errorJson.error || errorJson.message || responseText;
          } catch {
            // Response is not JSON, use text as-is
          }

          await supabase
            .from('payment_transactions')
            .update({
              status: 'failed',
              error_message: `Payment service error: ${errorMsg}`,
              error_code: 'EDGE_FUNCTION_ERROR'
            })
            .eq('id', transaction.id);

          return {
            success: false,
            error: `Unable to process payment: ${errorMsg}`
          };
        }

        let result;
        try {
          result = JSON.parse(responseText);
        } catch (parseError) {
          console.error('Failed to parse response:', responseText);

          await supabase
            .from('payment_transactions')
            .update({
              status: 'failed',
              error_message: 'Invalid response from payment service',
              error_code: 'PARSE_ERROR'
            })
            .eq('id', transaction.id);

          return {
            success: false,
            error: 'Invalid response from payment service'
          };
        }

        if (!result || !result.success) {
          await supabase
            .from('payment_transactions')
            .update({
              status: 'failed',
              error_message: result?.error || 'Payment initiation failed',
              error_code: result?.errorCode || 'INIT_FAILED'
            })
            .eq('id', transaction.id);

          return {
            success: false,
            error: result?.error || 'Payment initiation failed'
          };
        }

        await supabase
          .from('payment_transactions')
          .update({
            transaction_reference: result.transactionReference,
            redirect_url: result.redirectUrl,
            status: 'processing',
            gateway_response: result.gatewayResponse || {}
          })
          .eq('id', transaction.id);

        return {
          success: true,
          transactionId: transaction.id,
          localTransactionId: localTxnId,
          redirectUrl: result.redirectUrl,
          paymentMethod: result.paymentMethod,
          qrCodeData: result.qrCodeData,
          qrCodeUrl: result.qrCodeUrl,
          sessionToken: result.sessionToken,
          expiresAt: result.expiresAt,
          expiresIn: result.expiresIn
        };
      } catch (fetchError) {
        console.error('Fetch error calling edge function:', fetchError);
        console.error('Error name:', fetchError instanceof Error ? fetchError.name : 'unknown');
        console.error('Error message:', fetchError instanceof Error ? fetchError.message : 'unknown');

        let errorMessage = 'Network connection error';
        if (fetchError instanceof Error) {
          if (fetchError.name === 'AbortError') {
            errorMessage = 'Payment request timed out. Please try again.';
          } else {
            errorMessage = `Network error: ${fetchError.message}`;
          }
        }

        await supabase
          .from('payment_transactions')
          .update({
            status: 'failed',
            error_message: errorMessage,
            error_code: 'NETWORK_ERROR'
          })
          .eq('id', transaction.id);

        return {
          success: false,
          error: errorMessage
        };
      }


    } catch (error) {
      console.error('Payment initiation error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  private static async processCashPayment(
    orderId: string,
    amount: number,
    currency: string,
    customerPhone: string | null
  ): Promise<PaymentInitiationResult> {
    try {
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('id, total_price, payment_status')
        .eq('id', orderId)
        .maybeSingle();

      if (!existingOrder) {
        return {
          success: false,
          error: 'Order not found'
        };
      }

      if (Math.abs(existingOrder.total_price - amount) > 0.01) {
        return {
          success: false,
          error: 'Payment amount mismatch'
        };
      }

      const localTxnId = await this.generateTransactionId();

      const { data: transaction, error } = await supabase
        .from('payment_transactions')
        .insert({
          order_id: orderId,
          local_transaction_id: localTxnId,
          amount: Math.round(amount * 100) / 100,
          currency,
          status: 'pending',
          payment_method: 'cash',
          customer_phone: customerPhone,
          metadata: {
            payment_type: 'cash',
            pay_at_counter: true,
            initiated_from: 'kiosk'
          }
        })
        .select('id, local_transaction_id')
        .maybeSingle();

      if (error || !transaction) {
        console.error('Cash payment transaction error:', error);
        return {
          success: false,
          error: 'Failed to process cash payment'
        };
      }

      return {
        success: true,
        transactionId: transaction.id,
        localTransactionId: localTxnId
      };

    } catch (error) {
      console.error('Cash payment error:', error);
      return {
        success: false,
        error: 'Failed to process cash payment'
      };
    }
  }

  private static async generateTransactionId(): Promise<string> {
    const { data } = await supabase.rpc('generate_transaction_id');
    if (data) return data;

    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 10).toUpperCase();
    return `TXN-${timestamp}-${random}`;
  }

  static async getTransactionStatus(transactionId: string): Promise<PaymentTransaction | null> {
    if (!transactionId || typeof transactionId !== 'string') {
      return null;
    }

    const { data } = await supabase
      .from('payment_transactions')
      .select('id, status, amount, currency, order_id, payment_method, completed_at, error_message')
      .eq('id', transactionId)
      .maybeSingle();

    return data;
  }

  static async verifyPayment(transactionId: string): Promise<PaymentTransaction | null> {
    try {
      if (!transactionId || typeof transactionId !== 'string') {
        return null;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        throw new Error('Supabase configuration missing');
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(`${supabaseUrl}/functions/v1/verify-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ transactionId }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error('Failed to verify payment');
      }

      const result = await response.json();
      return result.transaction || null;

    } catch (error) {
      console.error('Payment verification error:', error);
      return null;
    }
  }
}
