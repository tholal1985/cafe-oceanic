-- Add retry tracking and last order push timestamp to support the integration
ALTER TABLE ultimatepos_config ADD COLUMN IF NOT EXISTS last_order_push_at timestamptz;
ALTER TABLE ultimatepos_order_log ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;
ALTER TABLE ultimatepos_order_log ADD COLUMN IF NOT EXISTS last_retry_at timestamptz;

-- Add index for order log lookups by order_id
CREATE INDEX IF NOT EXISTS idx_ultimatepos_order_log_order_id ON ultimatepos_order_log(order_id);
CREATE INDEX IF NOT EXISTS idx_ultimatepos_order_log_status ON ultimatepos_order_log(status);
CREATE INDEX IF NOT EXISTS idx_ultimatepos_sync_log_status ON ultimatepos_sync_log(status);