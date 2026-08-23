import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface RestoreRequest {
  snapshot_id: string;
  restore_type?: 'full' | 'selective';
  tables?: string[];
  create_pre_restore_backup?: boolean;
}

Deno.serve(async (req: Request) => {
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

    if (authError || !user) {
      console.error('Auth error:', authError);
      throw new Error('Unauthorized');
    }

    const requestData: RestoreRequest = await req.json();
    const { snapshot_id, restore_type = 'full', tables = [], create_pre_restore_backup = true } = requestData;

    if (!snapshot_id) {
      throw new Error('snapshot_id is required');
    }

    const { data: snapshot, error: snapshotError } = await supabaseAdmin
      .from('backup_snapshots')
      .select('*')
      .eq('id', snapshot_id)
      .single();

    if (snapshotError || !snapshot) {
      throw new Error('Backup snapshot not found');
    }

    if (!snapshot.is_verified) {
      throw new Error('Backup integrity verification failed. Cannot restore unverified backup.');
    }

    let preRestoreSnapshotId = null;
    if (create_pre_restore_backup) {
      const preBackupName = `pre_restore_${new Date().toISOString().replace(/[:.]/g, '-')}`;

      const createBackupResponse = await fetch(`${supabaseUrl}/functions/v1/create-backup`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          backup_name: preBackupName,
          backup_type: 'manual',
          notes: `Auto-backup before restore of ${snapshot.backup_name}`,
        }),
      });

      if (createBackupResponse.ok) {
        const backupResult = await createBackupResponse.json();
        preRestoreSnapshotId = backupResult.backup?.id;
      }
    }

    const { data: restoreLog, error: logError } = await supabaseAdmin
      .from('backup_restore_logs')
      .insert({
        snapshot_id: snapshot_id,
        restore_type: restore_type,
        status: 'in_progress',
        restored_by: user.id,
        pre_restore_snapshot_id: preRestoreSnapshotId,
        started_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (logError) {
      throw new Error(`Failed to create restore log: ${logError.message}`);
    }

    const backupData = snapshot.backup_data as any;
    const tablesToRestore = restore_type === 'selective' && tables.length > 0
      ? tables
      : Object.keys(backupData.tables || {});

    const recordsRestored: Record<string, number> = {};
    const errors: string[] = [];

    for (const tableName of tablesToRestore) {
      try {
        const tableData = backupData.tables[tableName];
        if (!tableData || !tableData.records || tableData.records.length === 0) {
          console.log(`Skipping empty table: ${tableName}`);
          recordsRestored[tableName] = 0;
          continue;
        }

        const { error: deleteError } = await supabaseAdmin
          .from(tableName)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');

        if (deleteError) {
          console.error(`Error clearing table ${tableName}:`, deleteError);
          errors.push(`Failed to clear ${tableName}: ${deleteError.message}`);
          continue;
        }

        if (tableData.records.length > 0) {
          const { error: insertError } = await supabaseAdmin
            .from(tableName)
            .insert(tableData.records);

          if (insertError) {
            console.error(`Error restoring table ${tableName}:`, insertError);
            errors.push(`Failed to restore ${tableName}: ${insertError.message}`);
            recordsRestored[tableName] = 0;
          } else {
            recordsRestored[tableName] = tableData.records.length;
          }
        } else {
          recordsRestored[tableName] = 0;
        }
      } catch (error) {
        console.error(`Exception restoring table ${tableName}:`, error);
        errors.push(`Exception in ${tableName}: ${String(error)}`);
        recordsRestored[tableName] = 0;
      }
    }

    const status = errors.length > 0 ? 'completed' : 'completed';
    const { error: updateError } = await supabaseAdmin
      .from('backup_restore_logs')
      .update({
        status: status,
        tables_restored: tablesToRestore,
        records_restored: recordsRestored,
        completed_at: new Date().toISOString(),
        error_message: errors.length > 0 ? errors.join('; ') : null,
      })
      .eq('id', restoreLog.id);

    if (updateError) {
      console.error('Failed to update restore log:', updateError);
    }

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        restore_log_id: restoreLog.id,
        tables_restored: tablesToRestore,
        records_restored: recordsRestored,
        errors: errors.length > 0 ? errors : undefined,
        pre_restore_snapshot_id: preRestoreSnapshotId,
        message: errors.length === 0
          ? 'Restore completed successfully'
          : 'Restore completed with some errors',
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Restore error:', error);
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
