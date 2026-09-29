export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      payment_transactions: {
        Row: {
          id: string;
          order_id: string;
          gateway_id: string | null;
          transaction_reference: string | null;
          local_transaction_id: string | null;
          amount: number;
          currency: string;
          status: string;
          payment_method: string | null;
          gateway_request: Json;
          gateway_response: Json;
          error_message: string | null;
          error_code: string | null;
          customer_phone: string | null;
          customer_email: string | null;
          redirect_url: string | null;
          callback_url: string | null;
          metadata: Json;
          initiated_at: string;
          completed_at: string | null;
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          gateway_id?: string | null;
          transaction_reference?: string | null;
          local_transaction_id?: string | null;
          amount: number;
          currency?: string;
          status?: string;
          payment_method?: string | null;
          gateway_request?: Json;
          gateway_response?: Json;
          error_message?: string | null;
          error_code?: string | null;
          customer_phone?: string | null;
          customer_email?: string | null;
          redirect_url?: string | null;
          callback_url?: string | null;
          metadata?: Json;
          initiated_at?: string;
          completed_at?: string | null;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          gateway_id?: string | null;
          transaction_reference?: string | null;
          local_transaction_id?: string | null;
          amount?: number;
          currency?: string;
          status?: string;
          payment_method?: string | null;
          gateway_request?: Json;
          gateway_response?: Json;
          error_message?: string | null;
          error_code?: string | null;
          customer_phone?: string | null;
          customer_email?: string | null;
          redirect_url?: string | null;
          callback_url?: string | null;
          metadata?: Json;
          initiated_at?: string;
          completed_at?: string | null;
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      payment_webhooks: {
        Row: {
          id: string;
          gateway_id: string | null;
          transaction_id: string | null;
          event_type: string;
          event_id: string | null;
          payload: Json;
          headers: Json;
          signature: string | null;
          is_verified: boolean;
          is_processed: boolean;
          processing_error: string | null;
          processed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          gateway_id?: string | null;
          transaction_id?: string | null;
          event_type: string;
          event_id?: string | null;
          payload: Json;
          headers?: Json;
          signature?: string | null;
          is_verified?: boolean;
          is_processed?: boolean;
          processing_error?: string | null;
          processed_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          gateway_id?: string | null;
          transaction_id?: string | null;
          event_type?: string;
          event_id?: string | null;
          payload?: Json;
          headers?: Json;
          signature?: string | null;
          is_verified?: boolean;
          is_processed?: boolean;
          processing_error?: string | null;
          processed_at?: string | null;
          created_at?: string;
        };
      };
      categories: {
        Row: {
          id: string;
          name: string;
          image_url: string | null;
          display_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          image_url?: string | null;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          image_url?: string | null;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          category_id: string | null;
          name: string;
          description: string | null;
          price: number;
          cost: number;
          image_url: string | null;
          is_available: boolean;
          display_order: number;
          recipe: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          category_id?: string | null;
          name: string;
          description?: string | null;
          price: number;
          cost?: number;
          image_url?: string | null;
          is_available?: boolean;
          display_order?: number;
          recipe?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          category_id?: string | null;
          name?: string;
          description?: string | null;
          price?: number;
          cost?: number;
          image_url?: string | null;
          is_available?: boolean;
          display_order?: number;
          recipe?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      addons: {
        Row: {
          id: string;
          name: string;
          price: number;
          is_available: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          price: number;
          is_available?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          price?: number;
          is_available?: boolean;
          created_at?: string;
        };
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          total_price: number;
          status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
          payment_method: 'card' | 'cash' | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_number: string;
          total_price: number;
          status?: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
          payment_method?: 'card' | 'cash' | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_number?: string;
          total_price?: number;
          status?: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
          payment_method?: 'card' | 'cash' | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string;
          product_name: string;
          product_price: number;
          quantity: number;
          addons: Json;
          item_total: number;
        };
        Insert: {
          id?: string;
          order_id: string;
          product_id: string;
          product_name: string;
          product_price: number;
          quantity: number;
          addons?: Json;
          item_total: number;
        };
        Update: {
          id?: string;
          order_id?: string;
          product_id?: string;
          product_name?: string;
          product_price?: number;
          quantity?: number;
          addons?: Json;
          item_total?: number;
        };
      };
      advertisements: {
        Row: {
          id: string;
          title: string;
          media_type: 'image' | 'gif' | 'video';
          media_url: string;
          start_date: string;
          end_date: string | null;
          is_active: boolean;
          impressions: number;
          display_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          media_type: 'image' | 'gif' | 'video';
          media_url: string;
          start_date?: string;
          end_date?: string | null;
          is_active?: boolean;
          impressions?: number;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          media_type?: 'image' | 'gif' | 'video';
          media_url?: string;
          start_date?: string;
          end_date?: string | null;
          is_active?: boolean;
          impressions?: number;
          display_order?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      admin_users: {
        Row: {
          id: string;
          email: string;
          full_name: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string | null;
          created_at?: string;
        };
      };
      suggested_products: {
        Row: {
          id: string;
          product_id: string;
          suggestion_type: 'drink' | 'side' | 'dessert' | 'combo' | 'popular';
          display_text: string;
          display_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          suggestion_type: 'drink' | 'side' | 'dessert' | 'combo' | 'popular';
          display_text: string;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          suggestion_type?: 'drink' | 'side' | 'dessert' | 'combo' | 'popular';
          display_text?: string;
          display_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      promotional_gifts: {
        Row: {
          id: string;
          product_id: string;
          minimum_order_value: number;
          gift_title: string;
          gift_description: string;
          is_active: boolean;
          priority: number;
          start_date: string;
          end_date: string | null;
          max_redemptions: number | null;
          redemptions_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          minimum_order_value: number;
          gift_title: string;
          gift_description: string;
          is_active?: boolean;
          priority?: number;
          start_date?: string;
          end_date?: string | null;
          max_redemptions?: number | null;
          redemptions_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          minimum_order_value?: number;
          gift_title?: string;
          gift_description?: string;
          is_active?: boolean;
          priority?: number;
          start_date?: string;
          end_date?: string | null;
          max_redemptions?: number | null;
          redemptions_count?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      messaging_config: {
        Row: {
          id: string;
          service_name: 'whatsapp' | 'viber' | 'sms';
          is_enabled: boolean;
          api_key: string | null;
          api_secret: string | null;
          sender_id: string | null;
          config_data: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          service_name: 'whatsapp' | 'viber' | 'sms';
          is_enabled?: boolean;
          api_key?: string | null;
          api_secret?: string | null;
          sender_id?: string | null;
          config_data?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          service_name?: 'whatsapp' | 'viber' | 'sms';
          is_enabled?: boolean;
          api_key?: string | null;
          api_secret?: string | null;
          sender_id?: string | null;
          config_data?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      message_logs: {
        Row: {
          id: string;
          order_id: string | null;
          phone_number: string;
          service: 'whatsapp' | 'viber' | 'sms';
          message_type: 'order_confirmation' | 'status_update' | 'ready_notification';
          message_content: string;
          status: 'pending' | 'sent' | 'delivered' | 'failed';
          error_message: string | null;
          external_message_id: string | null;
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id?: string | null;
          phone_number: string;
          service: 'whatsapp' | 'viber' | 'sms';
          message_type: 'order_confirmation' | 'status_update' | 'ready_notification';
          message_content: string;
          status?: 'pending' | 'sent' | 'delivered' | 'failed';
          error_message?: string | null;
          external_message_id?: string | null;
          sent_at?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string | null;
          phone_number?: string;
          service?: 'whatsapp' | 'viber' | 'sms';
          message_type?: 'order_confirmation' | 'status_update' | 'ready_notification';
          message_content?: string;
          status?: 'pending' | 'sent' | 'delivered' | 'failed';
          error_message?: string | null;
          external_message_id?: string | null;
          sent_at?: string | null;
          created_at?: string;
        };
      };
      kp_kiosks: {
        Row: {
          id: string;
          name: string;
          kiosk_code: string;
          location_id: number | null;
          api_key_hash: string;
          status: 'active' | 'inactive' | 'blocked';
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          kiosk_code: string;
          location_id?: number | null;
          api_key_hash: string;
          status?: 'active' | 'inactive' | 'blocked';
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          kiosk_code?: string;
          location_id?: number | null;
          api_key_hash?: string;
          status?: 'active' | 'inactive' | 'blocked';
          last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      kp_orders: {
        Row: {
          id: string;
          order_number: string;
          kiosk_id: string | null;
          ultimatepos_sale_id: string | null;
          ultimatepos_invoice_number: string | null;
          location_id: number | null;
          customer_id: string | null;
          subtotal: number;
          discount: number;
          tax: number;
          total: number;
          currency: string;
          payment_method: string | null;
          payment_status: 'pending' | 'paid' | 'failed' | 'refunded';
          order_status: 'pending' | 'processing' | 'completed' | 'cancelled' | 'failed';
          sync_status: 'pending' | 'processing' | 'synced' | 'failed';
          idempotency_key: string;
          error_message: string | null;
          cancel_reason: string | null;
          cancelled_by: string | null;
          cancelled_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_number: string;
          kiosk_id?: string | null;
          ultimatepos_sale_id?: string | null;
          ultimatepos_invoice_number?: string | null;
          location_id?: number | null;
          customer_id?: string | null;
          subtotal?: number;
          discount?: number;
          tax?: number;
          total?: number;
          currency?: string;
          payment_method?: string | null;
          payment_status?: 'pending' | 'paid' | 'failed' | 'refunded';
          order_status?: 'pending' | 'processing' | 'completed' | 'cancelled' | 'failed';
          sync_status?: 'pending' | 'processing' | 'synced' | 'failed';
          idempotency_key: string;
          error_message?: string | null;
          cancel_reason?: string | null;
          cancelled_by?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_number?: string;
          kiosk_id?: string | null;
          ultimatepos_sale_id?: string | null;
          ultimatepos_invoice_number?: string | null;
          location_id?: number | null;
          customer_id?: string | null;
          subtotal?: number;
          discount?: number;
          tax?: number;
          total?: number;
          currency?: string;
          payment_method?: string | null;
          payment_status?: 'pending' | 'paid' | 'failed' | 'refunded';
          order_status?: 'pending' | 'processing' | 'completed' | 'cancelled' | 'failed';
          sync_status?: 'pending' | 'processing' | 'synced' | 'failed';
          idempotency_key?: string;
          error_message?: string | null;
          cancel_reason?: string | null;
          cancelled_by?: string | null;
          cancelled_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      kp_order_items: {
        Row: {
          id: string;
          order_id: string;
          ultimatepos_product_id: string | null;
          sku: string | null;
          product_name: string;
          quantity: number;
          unit_price: number;
          discount: number;
          tax: number;
          line_total: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          ultimatepos_product_id?: string | null;
          sku?: string | null;
          product_name: string;
          quantity?: number;
          unit_price?: number;
          discount?: number;
          tax?: number;
          line_total?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          ultimatepos_product_id?: string | null;
          sku?: string | null;
          product_name?: string;
          quantity?: number;
          unit_price?: number;
          discount?: number;
          tax?: number;
          line_total?: number;
          created_at?: string;
        };
      };
      kp_products_cache: {
        Row: {
          id: string;
          ultimatepos_product_id: string;
          sku: string | null;
          name: string;
          description: string | null;
          category_id: string | null;
          category_name: string | null;
          selling_price: number;
          image_url: string | null;
          stock_quantity: number;
          location_id: number | null;
          is_active: boolean;
          ultimatepos_updated_at: string | null;
          synced_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          ultimatepos_product_id: string;
          sku?: string | null;
          name: string;
          description?: string | null;
          category_id?: string | null;
          category_name?: string | null;
          selling_price?: number;
          image_url?: string | null;
          stock_quantity?: number;
          location_id?: number | null;
          is_active?: boolean;
          ultimatepos_updated_at?: string | null;
          synced_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          ultimatepos_product_id?: string;
          sku?: string | null;
          name?: string;
          description?: string | null;
          category_id?: string | null;
          category_name?: string | null;
          selling_price?: number;
          image_url?: string | null;
          stock_quantity?: number;
          location_id?: number | null;
          is_active?: boolean;
          ultimatepos_updated_at?: string | null;
          synced_at?: string;
          created_at?: string;
        };
      };
      kp_categories_cache: {
        Row: {
          id: string;
          ultimatepos_category_id: string;
          name: string;
          parent_id: string | null;
          is_active: boolean;
          synced_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          ultimatepos_category_id: string;
          name: string;
          parent_id?: string | null;
          is_active?: boolean;
          synced_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          ultimatepos_category_id?: string;
          name?: string;
          parent_id?: string | null;
          is_active?: boolean;
          synced_at?: string;
          created_at?: string;
        };
      };
      kp_payments: {
        Row: {
          id: string;
          order_id: string;
          payment_reference: string | null;
          method: 'cash' | 'card' | 'qr' | 'online';
          amount: number;
          currency: string;
          status: 'pending' | 'completed' | 'failed' | 'refunded';
          provider: string | null;
          provider_transaction_id: string | null;
          paid_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          payment_reference?: string | null;
          method: 'cash' | 'card' | 'qr' | 'online';
          amount?: number;
          currency?: string;
          status?: 'pending' | 'completed' | 'failed' | 'refunded';
          provider?: string | null;
          provider_transaction_id?: string | null;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          payment_reference?: string | null;
          method?: 'cash' | 'card' | 'qr' | 'online';
          amount?: number;
          currency?: string;
          status?: 'pending' | 'completed' | 'failed' | 'refunded';
          provider?: string | null;
          provider_transaction_id?: string | null;
          paid_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      kp_sync_jobs: {
        Row: {
          id: string;
          job_type: 'products' | 'categories' | 'all';
          status: 'pending' | 'running' | 'completed' | 'failed';
          started_at: string | null;
          completed_at: string | null;
          records_processed: number;
          records_failed: number;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          job_type: 'products' | 'categories' | 'all';
          status?: 'pending' | 'running' | 'completed' | 'failed';
          started_at?: string | null;
          completed_at?: string | null;
          records_processed?: number;
          records_failed?: number;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          job_type?: 'products' | 'categories' | 'all';
          status?: 'pending' | 'running' | 'completed' | 'failed';
          started_at?: string | null;
          completed_at?: string | null;
          records_processed?: number;
          records_failed?: number;
          error_message?: string | null;
          created_at?: string;
        };
      };
      kp_api_logs: {
        Row: {
          id: string;
          kiosk_id: string | null;
          request_id: string;
          method: string;
          endpoint: string;
          status_code: number | null;
          duration_ms: number | null;
          success: boolean;
          error_message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          kiosk_id?: string | null;
          request_id: string;
          method: string;
          endpoint: string;
          status_code?: number | null;
          duration_ms?: number | null;
          success?: boolean;
          error_message?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          kiosk_id?: string | null;
          request_id?: string;
          method?: string;
          endpoint?: string;
          status_code?: number | null;
          duration_ms?: number | null;
          success?: boolean;
          error_message?: string | null;
          created_at?: string;
        };
      };
      kp_system_settings: {
        Row: {
          id: string;
          ultimatepos_url: string | null;
          ultimatepos_location_id: number;
          mock_mode: boolean;
          sync_interval_minutes: number;
          rate_limit_per_minute: number;
          allowed_origins: string | null;
          currency: string;
          timezone: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          ultimatepos_url?: string | null;
          ultimatepos_location_id?: number;
          mock_mode?: boolean;
          sync_interval_minutes?: number;
          rate_limit_per_minute?: number;
          allowed_origins?: string | null;
          currency?: string;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          ultimatepos_url?: string | null;
          ultimatepos_location_id?: number;
          mock_mode?: boolean;
          sync_interval_minutes?: number;
          rate_limit_per_minute?: number;
          allowed_origins?: string | null;
          currency?: string;
          timezone?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
}
