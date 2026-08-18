/*
  # Performance indexes for hot query paths

  1. Purpose
    Adds indexes on frequently filtered columns to reduce latency on the
    Kitchen Display, POS transaction lookups, payment reconciliation, and
    customer history pages.

  2. Indexes created (all idempotent via IF NOT EXISTS)
    - orders(status, created_at DESC) - Kitchen Display queue ordering
    - orders(customer_id) - customer order history
    - payment_transactions(order_id) - webhook/reconciliation lookup
    - payment_transactions(status, created_at DESC) - admin payment screen
    - pos_transactions(session_id) - cashing out a POS session
    - pos_transactions(created_at DESC) - recent activity feed

  3. Security
    No RLS changes. Indexes inherit base table policies.

  4. Notes
    - All statements use IF NOT EXISTS and DO blocks that check for table
      existence first, so this migration is safe to run even if a table
      has been renamed or dropped elsewhere.
*/

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='orders') THEN
    CREATE INDEX IF NOT EXISTS idx_orders_status_created_at ON public.orders (status, created_at DESC);
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='orders' AND column_name='customer_id') THEN
      CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders (customer_id);
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='payment_transactions') THEN
    CREATE INDEX IF NOT EXISTS idx_payment_tx_order_id ON public.payment_transactions (order_id);
    CREATE INDEX IF NOT EXISTS idx_payment_tx_status_created_at ON public.payment_transactions (status, created_at DESC);
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='pos_transactions') THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pos_transactions' AND column_name='session_id') THEN
      CREATE INDEX IF NOT EXISTS idx_pos_tx_session_id ON public.pos_transactions (session_id);
    END IF;
    CREATE INDEX IF NOT EXISTS idx_pos_tx_created_at ON public.pos_transactions (created_at DESC);
  END IF;
END $$;
