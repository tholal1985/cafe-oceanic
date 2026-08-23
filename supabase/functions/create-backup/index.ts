import { createClient } from 'npm:@supabase/supabase-js@2';

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const allowedOrigins = [
    supabaseUrl.replace('https://', '').split('.')[0] ? `https://${supabaseUrl.replace('https://', '').split('.')[0]}.supabase.co` : '',
    'http://localhost:5173',
    'http://localhost:3000',
    'http://localhost:8080'
  ].filter(Boolean);

  const isAllowedOrigin = origin && allowedOrigins.some(allowed => origin.startsWith(allowed));

  return {
    'Access-Control-Allow-Origin': isAllowedOrigin ? origin : allowedOrigins[0] || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
    'Access-Control-Allow-Credentials': 'true',
  };
}

const BACKUP_TABLES = [
  'categories',
  'products',
  'product_categories',
  'addons',
  'product_addons',
  'orders',
  'order_items',
  'advertisements',
  'admin_users',
  'suggested_products',
  'promotional_gifts',
  'messaging_config',
  'message_logs',
  'payment_gateways',
  'payment_transactions',
  'payment_webhooks',
  'payment_attempts',
  'payment_audit_log',
  'user_roles',
  'user_role_assignments',
];

interface BackupRequest {
  backup_name?: string;
  backup_type?: 'full' | 'manual' | 'scheduled';
  tables?: string[];
  notes?: string;
  retention_days?: number;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing environment variables:', {
        hasUrl: !!supabaseUrl,
        hasServiceKey: !!supabaseServiceKey
      });
      throw new Error('Missing Supabase environment variables');
    }

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');

    // Create client with service role for database operations (bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // Verify user authentication using service role client
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError) {
      console.error('Auth error:', authError);
      throw new Error(`Authentication failed: ${authError.message}`);
    }

    if (!user) {
      throw new Error('User not found');
    }

    console.log('User authenticated:', user.id);

    let requestData: BackupRequest;
    try {
      requestData = await req.json();
    } catch (jsonError) {
      console.error('Failed to parse request body:', jsonError);
      throw new Error('Invalid request body. Expected JSON.');
    }

    const tablesToBackup = requestData.tables || BACKUP_TABLES;
    const backupType = requestData.backup_type || 'manual';
    const backupName = requestData.backup_name || `backup_${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const retentionDays = requestData.retention_days || null;

    console.log('Starting backup:', { backupName, backupType, tableCount: tablesToBackup.length });

    const backupData: Record<string, any> = {
      metadata: {
        created_at: new Date().toISOString(),
        created_by: user.id,
        backup_type: backupType,
        tables: tablesToBackup,
      },
      tables: {},
    };

    const recordCount: Record<string, number> = {};
    let totalSize = 0;

    for (const tableName of tablesToBackup) {
      try {
        console.log(`Backing up table: ${tableName}`);
        const { data, error } = await supabaseAdmin
          .from(tableName)
          .select('*');

        if (error) {
          console.error(`Error backing up table ${tableName}:`, error);
          backupData.tables[tableName] = {
            error: error.message,
            records: [],
          };
          recordCount[tableName] = 0;
        } else {
          backupData.tables[tableName] = {
            records: data || [],
            count: (data || []).length,
          };
          recordCount[tableName] = (data || []).length;
          totalSize += JSON.stringify(data).length;
          console.log(`Successfully backed up ${tableName}: ${(data || []).length} records`);
        }
      } catch (error) {
        console.error(`Exception backing up table ${tableName}:`, error);
        backupData.tables[tableName] = {
          error: String(error),
          records: [],
        };
        recordCount[tableName] = 0;
      }
    }

    console.log(`Backup data collected. Total size: ${totalSize} bytes`);

    const backupDataJson = backupData;
    const checksum = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(JSON.stringify(backupDataJson))
    );
    const checksumHex = Array.from(new Uint8Array(checksum))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const expiresAt = retentionDays
      ? new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    console.log('Saving backup to database...');
    const { data: snapshot, error: insertError } = await supabaseAdmin
      .from('backup_snapshots')
      .insert({
        backup_name: backupName,
        backup_type: backupType,
        file_size_bytes: totalSize,
        record_count: recordCount,
        backup_data: backupDataJson,
        checksum: checksumHex,
        created_by: user.id,
        expires_at: expiresAt,
        notes: requestData.notes || null,
        is_verified: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Failed to insert backup snapshot:', insertError);
      throw new Error(`Failed to save backup: ${insertError.message}`);
    }

    console.log('Backup saved successfully:', snapshot.id);

    return new Response(
      JSON.stringify({
        success: true,
        backup: {
          id: snapshot.id,
          backup_name: snapshot.backup_name,
          backup_type: snapshot.backup_type,
          file_size_bytes: snapshot.file_size_bytes,
          record_count: snapshot.record_count,
          checksum: snapshot.checksum,
          created_at: snapshot.created_at,
          expires_at: snapshot.expires_at,
        },
        message: 'Backup created successfully',
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Backup error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
