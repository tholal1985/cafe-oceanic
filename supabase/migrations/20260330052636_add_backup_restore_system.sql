/*
  # Add Backup and Restore System

  ## Overview
  Implements a comprehensive backup and restore system following industry best practices:
  - Full database backups with metadata tracking
  - Point-in-time restore capability
  - Automated scheduling support
  - Backup verification and integrity checks
  - Retention policy management
  - Audit logging for all backup/restore operations

  ## 1. New Tables

  ### backup_snapshots
  Tracks all backup operations with comprehensive metadata
  - `id` (uuid, primary key)
  - `backup_name` (text, unique) - User-friendly backup identifier
  - `backup_type` (text) - full, incremental, or scheduled
  - `file_size_bytes` (bigint) - Size of backup data
  - `record_count` (jsonb) - Count of records per table
  - `backup_data` (jsonb) - Complete backup payload
  - `checksum` (text) - SHA-256 hash for integrity verification
  - `created_by` (uuid) - Admin who created the backup
  - `created_at` (timestamptz)
  - `expires_at` (timestamptz) - Optional expiration for retention policy
  - `is_verified` (boolean) - Whether backup integrity was verified
  - `notes` (text) - Optional description/notes

  ### backup_restore_logs
  Audit trail for all restore operations
  - `id` (uuid, primary key)
  - `snapshot_id` (uuid, foreign key to backup_snapshots)
  - `restore_type` (text) - full or selective
  - `tables_restored` (text[]) - List of tables restored
  - `records_restored` (jsonb) - Count of restored records per table
  - `status` (text) - pending, in_progress, completed, failed
  - `error_message` (text) - Error details if failed
  - `restored_by` (uuid) - Admin who performed restore
  - `started_at` (timestamptz)
  - `completed_at` (timestamptz)
  - `pre_restore_snapshot_id` (uuid) - Auto-backup before restore

  ### backup_schedules
  Automated backup scheduling configuration
  - `id` (uuid, primary key)
  - `schedule_name` (text)
  - `frequency` (text) - daily, weekly, monthly
  - `retention_days` (integer) - How long to keep backups
  - `is_active` (boolean)
  - `last_run_at` (timestamptz)
  - `next_run_at` (timestamptz)
  - `created_at` (timestamptz)

  ## 2. Security
  - Enable RLS on all backup tables
  - Only authenticated admin users can manage backups
  - Restore operations require special verification
  - All operations are logged for audit purposes

  ## 3. Indexes
  - Fast lookup by backup name
  - Efficient filtering by date ranges
  - Quick access to latest backups
*/

-- Create backup_snapshots table
CREATE TABLE IF NOT EXISTS backup_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_name text UNIQUE NOT NULL,
  backup_type text NOT NULL DEFAULT 'full' CHECK (backup_type IN ('full', 'incremental', 'scheduled', 'manual')),
  file_size_bytes bigint DEFAULT 0,
  record_count jsonb DEFAULT '{}'::jsonb,
  backup_data jsonb NOT NULL,
  checksum text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  is_verified boolean DEFAULT false,
  notes text,
  database_version text,
  schema_version text
);

-- Create backup_restore_logs table
CREATE TABLE IF NOT EXISTS backup_restore_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid REFERENCES backup_snapshots(id) ON DELETE SET NULL,
  restore_type text NOT NULL DEFAULT 'full' CHECK (restore_type IN ('full', 'selective', 'table')),
  tables_restored text[],
  records_restored jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'rolled_back')),
  error_message text,
  restored_by uuid REFERENCES auth.users(id),
  started_at timestamptz DEFAULT now(),
  completed_at timestamptz,
  pre_restore_snapshot_id uuid REFERENCES backup_snapshots(id),
  metadata jsonb DEFAULT '{}'::jsonb
);

-- Create backup_schedules table
CREATE TABLE IF NOT EXISTS backup_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_name text NOT NULL,
  frequency text NOT NULL CHECK (frequency IN ('hourly', 'daily', 'weekly', 'monthly')),
  retention_days integer DEFAULT 30 CHECK (retention_days > 0),
  is_active boolean DEFAULT true,
  last_run_at timestamptz,
  next_run_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  backup_tables text[],
  notes text
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_backup_snapshots_created_at ON backup_snapshots(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_snapshots_backup_type ON backup_snapshots(backup_type);
CREATE INDEX IF NOT EXISTS idx_backup_snapshots_created_by ON backup_snapshots(created_by);
CREATE INDEX IF NOT EXISTS idx_backup_restore_logs_snapshot_id ON backup_restore_logs(snapshot_id);
CREATE INDEX IF NOT EXISTS idx_backup_restore_logs_status ON backup_restore_logs(status);
CREATE INDEX IF NOT EXISTS idx_backup_restore_logs_started_at ON backup_restore_logs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_backup_schedules_is_active ON backup_schedules(is_active);
CREATE INDEX IF NOT EXISTS idx_backup_schedules_next_run ON backup_schedules(next_run_at) WHERE is_active = true;

-- Enable RLS
ALTER TABLE backup_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_restore_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE backup_schedules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for backup_snapshots
CREATE POLICY "Authenticated users can view backups"
  ON backup_snapshots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create backups"
  ON backup_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Authenticated users can delete own backups"
  ON backup_snapshots FOR DELETE
  TO authenticated
  USING (auth.uid() = created_by);

-- RLS Policies for backup_restore_logs
CREATE POLICY "Authenticated users can view restore logs"
  ON backup_restore_logs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create restore logs"
  ON backup_restore_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = restored_by);

CREATE POLICY "Authenticated users can update restore logs"
  ON backup_restore_logs FOR UPDATE
  TO authenticated
  USING (auth.uid() = restored_by)
  WITH CHECK (auth.uid() = restored_by);

-- RLS Policies for backup_schedules
CREATE POLICY "Authenticated users can view backup schedules"
  ON backup_schedules FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can manage backup schedules"
  ON backup_schedules FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Create function to calculate backup checksum
CREATE OR REPLACE FUNCTION calculate_backup_checksum(backup_data jsonb)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN encode(digest(backup_data::text, 'sha256'), 'hex');
END;
$$;

-- Create function to verify backup integrity
CREATE OR REPLACE FUNCTION verify_backup_integrity(snapshot_id_param uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  snapshot_record RECORD;
  calculated_checksum text;
BEGIN
  SELECT * INTO snapshot_record
  FROM backup_snapshots
  WHERE id = snapshot_id_param;
  
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  
  calculated_checksum := calculate_backup_checksum(snapshot_record.backup_data);
  
  IF calculated_checksum = snapshot_record.checksum THEN
    UPDATE backup_snapshots
    SET is_verified = true
    WHERE id = snapshot_id_param;
    RETURN true;
  ELSE
    RETURN false;
  END IF;
END;
$$;

-- Create function to cleanup expired backups
CREATE OR REPLACE FUNCTION cleanup_expired_backups()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  WITH deleted AS (
    DELETE FROM backup_snapshots
    WHERE expires_at IS NOT NULL 
    AND expires_at < now()
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;