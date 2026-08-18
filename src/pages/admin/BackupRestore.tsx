import { useEffect, useState } from 'react';
import { Database, Download, Upload, RefreshCw, Trash2, Clock, CheckCircle, AlertCircle, Calendar, Play, FileDown, FileUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type BackupSnapshot = {
  id: string;
  backup_name: string;
  backup_type: string;
  file_size_bytes: number;
  record_count: Record<string, number>;
  checksum: string;
  created_by: string;
  created_at: string;
  expires_at: string | null;
  is_verified: boolean;
  notes: string | null;
};

type RestoreLog = {
  id: string;
  snapshot_id: string;
  restore_type: string;
  tables_restored: string[];
  records_restored: Record<string, number>;
  status: string;
  error_message: string | null;
  restored_by: string;
  started_at: string;
  completed_at: string | null;
  backup_snapshots?: {
    backup_name: string;
  };
};

type BackupSchedule = {
  id: string;
  schedule_name: string;
  frequency: string;
  backup_type: string;
  retention_days: number;
  is_active: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  created_at: string;
  backup_tables: string[] | null;
  notes: string | null;
};

export default function BackupRestore() {
  const [backups, setBackups] = useState<BackupSnapshot[]>([]);
  const [restoreLogs, setRestoreLogs] = useState<RestoreLog[]>([]);
  const [schedules, setSchedules] = useState<BackupSchedule[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'backups' | 'restore' | 'schedules'>('backups');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<BackupSnapshot | null>(null);
  const [backupName, setBackupName] = useState('');
  const [backupNotes, setBackupNotes] = useState('');
  const [backupType, setBackupType] = useState<'full' | 'incremental'>('full');
  const [retentionDays, setRetentionDays] = useState<number>(30);
  const [createPreRestoreBackup, setCreatePreRestoreBackup] = useState(true);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleName, setScheduleName] = useState('');
  const [scheduleFrequency, setScheduleFrequency] = useState<'hourly' | 'daily' | 'weekly' | 'monthly'>('daily');
  const [scheduleBackupType, setScheduleBackupType] = useState<'full' | 'incremental'>('full');
  const [scheduleRetention, setScheduleRetention] = useState<number>(30);
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  useEffect(() => {
    fetchBackups();
    fetchRestoreLogs();
    fetchSchedules();
  }, []);

  const fetchBackups = async () => {
    const { data } = await supabase
      .from('backup_snapshots')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) setBackups(data);
  };

  const fetchRestoreLogs = async () => {
    const { data } = await supabase
      .from('backup_restore_logs')
      .select('*, backup_snapshots(backup_name)')
      .order('started_at', { ascending: false });

    if (data) setRestoreLogs(data);
  };

  const fetchSchedules = async () => {
    const { data } = await supabase
      .from('backup_schedules')
      .select('*')
      .order('created_at', { ascending: false });

    if (data) setSchedules(data);
  };

  const createBackup = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      console.log('Creating backup with:', {
        backup_name: backupName || undefined,
        backup_type: 'manual',
        notes: backupNotes || undefined,
        retention_days: retentionDays,
      });

      const requestBody = {
        backup_name: backupName || undefined,
        backup_type: backupType === 'full' ? 'full' : 'manual',
        notes: backupNotes || undefined,
        retention_days: retentionDays,
        is_incremental: backupType === 'incremental',
      };

      console.log('Request body:', JSON.stringify(requestBody));

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-backup`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify(requestBody),
        }
      );

      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));

      const responseText = await response.text();
      console.log('Response text:', responseText);

      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse response:', parseError);
        throw new Error(`Server returned invalid response: ${responseText.substring(0, 200)}`);
      }

      console.log('Response data:', result);

      if (!response.ok || !result.success) {
        throw new Error(result.error || `HTTP ${response.status}: Backup failed`);
      }

      alert('Backup created successfully!');
      setShowCreateModal(false);
      setBackupName('');
      setBackupNotes('');
      setBackupType('full');
      setRetentionDays(30);
      fetchBackups();
    } catch (error) {
      console.error('Error creating backup:', error);
      alert(error instanceof Error ? error.message : 'Failed to create backup');
    } finally {
      setLoading(false);
    }
  };

  const restoreBackup = async () => {
    if (!selectedBackup) return;

    const confirmed = window.confirm(
      `Are you sure you want to restore backup "${selectedBackup.backup_name}"?\n\n` +
      `This will replace all current data with the backup data.\n` +
      `${createPreRestoreBackup ? 'A backup of current data will be created first.' : 'WARNING: No backup will be created before restore!'}`
    );

    if (!confirmed) return;

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/restore-backup`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            snapshot_id: selectedBackup.id,
            restore_type: 'full',
            create_pre_restore_backup: createPreRestoreBackup,
          }),
        }
      );

      const result = await response.json();
      if (!result.success) {
        throw new Error(result.error || 'Restore failed');
      }

      if (result.errors && result.errors.length > 0) {
        alert(`Restore completed with warnings:\n${result.errors.join('\n')}`);
      } else {
        alert('Restore completed successfully!');
      }

      setShowRestoreModal(false);
      setSelectedBackup(null);
      fetchRestoreLogs();
    } catch (error) {
      console.error('Error restoring backup:', error);
      alert(error instanceof Error ? error.message : 'Failed to restore backup');
    } finally {
      setLoading(false);
    }
  };

  const deleteBackup = async (id: string, name: string) => {
    const confirmed = window.confirm(`Are you sure you want to delete backup "${name}"?`);
    if (!confirmed) return;

    const { error } = await supabase
      .from('backup_snapshots')
      .delete()
      .eq('id', id);

    if (error) {
      alert('Failed to delete backup');
    } else {
      fetchBackups();
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleString();
  };

  const getTotalRecords = (recordCount: Record<string, number>) => {
    return Object.values(recordCount).reduce((sum, count) => sum + count, 0);
  };

  const downloadBackup = async (backup: BackupSnapshot) => {
    try {
      const { data, error } = await supabase
        .from('backup_snapshots')
        .select('*')
        .eq('id', backup.id)
        .single();

      if (error) throw error;

      const backupData = {
        metadata: {
          backup_name: data.backup_name,
          backup_type: data.backup_type,
          created_at: data.created_at,
          checksum: data.checksum,
          file_size_bytes: data.file_size_bytes,
          record_count: data.record_count,
        },
        backup_data: data.backup_data,
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${backup.backup_name}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert('Backup downloaded successfully!');
    } catch (error) {
      console.error('Error downloading backup:', error);
      alert(error instanceof Error ? error.message : 'Failed to download backup');
    }
  };

  const handleUploadBackup = async () => {
    if (!uploadFile) {
      alert('Please select a backup file to upload');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const fileContent = await uploadFile.text();
      const backupData = JSON.parse(fileContent);

      if (!backupData.metadata || !backupData.backup_data) {
        throw new Error('Invalid backup file format');
      }

      const checksum = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify(backupData.backup_data))
      );
      const checksumHex = Array.from(new Uint8Array(checksum))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      const { error } = await supabase
        .from('backup_snapshots')
        .insert({
          backup_name: `${backupData.metadata.backup_name} (Uploaded)`,
          backup_type: 'manual',
          file_size_bytes: backupData.metadata.file_size_bytes || fileContent.length,
          record_count: backupData.metadata.record_count || {},
          backup_data: backupData.backup_data,
          checksum: checksumHex,
          created_by: user.id,
          is_verified: true,
          notes: 'Uploaded from backup file',
        });

      if (error) throw error;

      alert('Backup uploaded successfully!');
      setShowUploadModal(false);
      setUploadFile(null);
      fetchBackups();
    } catch (error) {
      console.error('Error uploading backup:', error);
      alert(error instanceof Error ? error.message : 'Failed to upload backup');
    } finally {
      setLoading(false);
    }
  };

  const createSchedule = async () => {
    if (!scheduleName.trim()) {
      alert('Please enter a schedule name');
      return;
    }

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const nextRun = calculateNextRun(scheduleFrequency);

      const { error } = await supabase
        .from('backup_schedules')
        .insert({
          schedule_name: scheduleName,
          frequency: scheduleFrequency,
          backup_type: scheduleBackupType,
          retention_days: scheduleRetention,
          is_active: true,
          next_run_at: nextRun,
          created_by: user.id,
          notes: scheduleNotes || null,
        });

      if (error) throw error;

      alert('Backup schedule created successfully!');
      setShowScheduleModal(false);
      setScheduleName('');
      setScheduleFrequency('daily');
      setScheduleBackupType('full');
      setScheduleRetention(30);
      setScheduleNotes('');
      fetchSchedules();
    } catch (error) {
      console.error('Error creating schedule:', error);
      alert(error instanceof Error ? error.message : 'Failed to create schedule');
    } finally {
      setLoading(false);
    }
  };

  const calculateNextRun = (frequency: string): string => {
    const now = new Date();
    switch (frequency) {
      case 'hourly':
        now.setHours(now.getHours() + 1);
        break;
      case 'daily':
        now.setDate(now.getDate() + 1);
        break;
      case 'weekly':
        now.setDate(now.getDate() + 7);
        break;
      case 'monthly':
        now.setMonth(now.getMonth() + 1);
        break;
    }
    return now.toISOString();
  };

  const toggleScheduleStatus = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from('backup_schedules')
      .update({ is_active: !currentStatus })
      .eq('id', id);

    if (error) {
      alert('Failed to update schedule status');
    } else {
      fetchSchedules();
    }
  };

  const deleteSchedule = async (id: string, name: string) => {
    const confirmed = window.confirm(`Are you sure you want to delete schedule "${name}"?`);
    if (!confirmed) return;

    const { error } = await supabase
      .from('backup_schedules')
      .delete()
      .eq('id', id);

    if (error) {
      alert('Failed to delete schedule');
    } else {
      fetchSchedules();
    }
  };

  const runScheduledBackup = async (schedule: BackupSchedule) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-backup`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            backup_name: `${schedule.schedule_name} - ${new Date().toISOString()}`,
            backup_type: schedule.backup_type || 'full',
            retention_days: schedule.retention_days,
            notes: `Scheduled ${schedule.backup_type || 'full'} backup: ${schedule.schedule_name}`,
            is_incremental: schedule.backup_type === 'incremental',
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Backup failed');
      }

      await supabase
        .from('backup_schedules')
        .update({
          last_run_at: new Date().toISOString(),
          next_run_at: calculateNextRun(schedule.frequency),
        })
        .eq('id', schedule.id);

      alert('Scheduled backup completed successfully!');
      fetchBackups();
      fetchSchedules();
    } catch (error) {
      console.error('Error running scheduled backup:', error);
      alert(error instanceof Error ? error.message : 'Failed to run scheduled backup');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Backup & Restore</h1>
          <p className="text-gray-600">Manage database backups and restore operations</p>
        </div>

        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setActiveTab('backups')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              activeTab === 'backups'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <Database className="inline mr-2" size={20} />
            Backups
          </button>
          <button
            onClick={() => setActiveTab('restore')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              activeTab === 'restore'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <Clock className="inline mr-2" size={20} />
            Restore History
          </button>
          <button
            onClick={() => setActiveTab('schedules')}
            className={`px-6 py-3 rounded-lg font-semibold transition-colors ${
              activeTab === 'schedules'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            <Calendar className="inline mr-2" size={20} />
            Schedules
          </button>
        </div>

        {activeTab === 'backups' && (
          <div>
            <div className="mb-6 flex gap-4">
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-semibold"
              >
                <Download className="inline mr-2" size={20} />
                Create New Backup
              </button>
              <button
                onClick={() => setShowUploadModal(true)}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
              >
                <FileUp className="inline mr-2" size={20} />
                Upload Backup
              </button>
            </div>

            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Name</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Type</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Size</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Records</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Created</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Status</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {backups.map((backup) => (
                    <tr key={backup.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{backup.backup_name}</div>
                        {backup.notes && <div className="text-sm text-gray-500">{backup.notes}</div>}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${
                          backup.backup_type === 'full'
                            ? 'bg-purple-100 text-purple-800'
                            : backup.backup_type === 'manual'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {backup.backup_type === 'full' ? 'Full' : backup.backup_type === 'manual' ? 'Manual' : backup.backup_type}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {formatBytes(backup.file_size_bytes)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {getTotalRecords(backup.record_count).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {formatDate(backup.created_at)}
                      </td>
                      <td className="px-6 py-4">
                        {backup.is_verified ? (
                          <CheckCircle className="text-green-600" size={20} />
                        ) : (
                          <AlertCircle className="text-yellow-600" size={20} />
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => downloadBackup(backup)}
                            className="text-green-600 hover:text-green-800 p-2"
                            title="Download Backup"
                          >
                            <FileDown size={18} />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedBackup(backup);
                              setShowRestoreModal(true);
                            }}
                            className="text-blue-600 hover:text-blue-800 p-2"
                            title="Restore"
                          >
                            <Upload size={18} />
                          </button>
                          <button
                            onClick={() => deleteBackup(backup.id, backup.backup_name)}
                            className="text-red-600 hover:text-red-800 p-2"
                            title="Delete"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {backups.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  No backups found. Create your first backup to get started.
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'restore' && (
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Backup Name</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Type</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Tables</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Started</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Completed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {restoreLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {log.backup_snapshots?.backup_name || 'Unknown'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-800">
                        {log.restore_type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          log.status === 'completed'
                            ? 'bg-green-100 text-green-800'
                            : log.status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {log.tables_restored?.length || 0} tables
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {formatDate(log.started_at)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {log.completed_at ? formatDate(log.completed_at) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {restoreLogs.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                No restore operations found.
              </div>
            )}
          </div>
        )}

        {activeTab === 'schedules' && (
          <div>
            <div className="mb-6 flex gap-4">
              <button
                onClick={() => setShowScheduleModal(true)}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold"
              >
                <Calendar className="inline mr-2" size={20} />
                Create Schedule
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors font-semibold"
              >
                <Database className="inline mr-2" size={20} />
                Full Backup Now
              </button>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <p className="text-yellow-800">
                <strong>Note:</strong> Automated backup scheduling requires a cron job or similar scheduler to execute the backups at the scheduled times.
              </p>
            </div>
            <div className="bg-white rounded-lg shadow-md overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Schedule Name</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Type</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Frequency</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Retention</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Status</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Last Run</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Next Run</th>
                    <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {schedules.map((schedule) => (
                    <tr key={schedule.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="font-medium text-gray-900">{schedule.schedule_name}</div>
                        {schedule.notes && <div className="text-sm text-gray-500">{schedule.notes}</div>}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold capitalize ${
                          schedule.backup_type === 'full'
                            ? 'bg-purple-100 text-purple-800'
                            : 'bg-orange-100 text-orange-800'
                        }`}>
                          {schedule.backup_type || 'full'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 capitalize">
                          {schedule.frequency}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{schedule.retention_days} days</td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => toggleScheduleStatus(schedule.id, schedule.is_active)}
                          className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer ${
                            schedule.is_active
                              ? 'bg-green-100 text-green-800 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                          }`}
                        >
                          {schedule.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {schedule.last_run_at ? formatDate(schedule.last_run_at) : 'Never'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {schedule.next_run_at ? formatDate(schedule.next_run_at) : '-'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => runScheduledBackup(schedule)}
                            disabled={loading}
                            className="text-green-600 hover:text-green-800 p-2 disabled:opacity-50"
                            title="Run Now"
                          >
                            <Play size={18} />
                          </button>
                          <button
                            onClick={() => deleteSchedule(schedule.id, schedule.schedule_name)}
                            className="text-red-600 hover:text-red-800 p-2"
                            title="Delete"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {schedules.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  No backup schedules configured. Create your first schedule to automate backups.
                </div>
              )}
            </div>
          </div>
        )}

        {showCreateModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 max-w-md w-full">
              <h2 className="text-2xl font-bold mb-6">Create New Backup</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Backup Type
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        value="full"
                        checked={backupType === 'full'}
                        onChange={(e) => setBackupType(e.target.value as 'full' | 'incremental')}
                        className="mr-3"
                      />
                      <div>
                        <div className="font-semibold">Full Backup</div>
                        <div className="text-sm text-gray-600">Complete backup of all database tables</div>
                      </div>
                    </label>
                    <label className="flex items-center p-3 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        value="incremental"
                        checked={backupType === 'incremental'}
                        onChange={(e) => setBackupType(e.target.value as 'full' | 'incremental')}
                        className="mr-3"
                      />
                      <div>
                        <div className="font-semibold">Incremental Backup</div>
                        <div className="text-sm text-gray-600">Backup recent changes only (faster)</div>
                      </div>
                    </label>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Backup Name (optional)
                  </label>
                  <input
                    type="text"
                    value={backupName}
                    onChange={(e) => setBackupName(e.target.value)}
                    placeholder="Auto-generated if empty"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Retention (days)
                  </label>
                  <input
                    type="number"
                    value={retentionDays}
                    onChange={(e) => setRetentionDays(parseInt(e.target.value))}
                    min="1"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes (optional)
                  </label>
                  <textarea
                    value={backupNotes}
                    onChange={(e) => setBackupNotes(e.target.value)}
                    placeholder="Description or notes about this backup"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    rows={3}
                  />
                </div>
              </div>
              <div className="flex gap-4 mt-6">
                <button
                  onClick={createBackup}
                  disabled={loading}
                  className="flex-1 bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 disabled:bg-gray-400"
                >
                  {loading ? 'Creating...' : 'Create Backup'}
                </button>
                <button
                  onClick={() => setShowCreateModal(false)}
                  disabled={loading}
                  className="flex-1 bg-gray-300 text-gray-700 py-3 rounded-lg hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showRestoreModal && selectedBackup && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 max-w-md w-full">
              <h2 className="text-2xl font-bold mb-4">Restore Backup</h2>
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-yellow-800 text-sm">
                  <strong>Warning:</strong> This will replace all current data with the backup data.
                </p>
              </div>
              <div className="mb-6">
                <p className="text-gray-700 mb-2">
                  <strong>Backup:</strong> {selectedBackup.backup_name}
                </p>
                <p className="text-gray-700 mb-2">
                  <strong>Created:</strong> {formatDate(selectedBackup.created_at)}
                </p>
                <p className="text-gray-700 mb-4">
                  <strong>Records:</strong> {getTotalRecords(selectedBackup.record_count).toLocaleString()}
                </p>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={createPreRestoreBackup}
                    onChange={(e) => setCreatePreRestoreBackup(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-gray-700">Create backup before restore (recommended)</span>
                </label>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={restoreBackup}
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {loading ? 'Restoring...' : 'Restore'}
                </button>
                <button
                  onClick={() => {
                    setShowRestoreModal(false);
                    setSelectedBackup(null);
                  }}
                  disabled={loading}
                  className="flex-1 bg-gray-300 text-gray-700 py-3 rounded-lg hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showScheduleModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 max-w-md w-full">
              <h2 className="text-2xl font-bold mb-6">Create Backup Schedule</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Schedule Name
                  </label>
                  <input
                    type="text"
                    value={scheduleName}
                    onChange={(e) => setScheduleName(e.target.value)}
                    placeholder="e.g., Daily Production Backup"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Backup Type
                  </label>
                  <select
                    value={scheduleBackupType}
                    onChange={(e) => setScheduleBackupType(e.target.value as 'full' | 'incremental')}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="full">Full Backup (Complete)</option>
                    <option value="incremental">Incremental Backup (Changes Only)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Frequency
                  </label>
                  <select
                    value={scheduleFrequency}
                    onChange={(e) => setScheduleFrequency(e.target.value as any)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  >
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Retention (days)
                  </label>
                  <input
                    type="number"
                    value={scheduleRetention}
                    onChange={(e) => setScheduleRetention(parseInt(e.target.value))}
                    min="1"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Notes (optional)
                  </label>
                  <textarea
                    value={scheduleNotes}
                    onChange={(e) => setScheduleNotes(e.target.value)}
                    placeholder="Description or notes about this schedule"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                    rows={3}
                  />
                </div>
              </div>
              <div className="flex gap-4 mt-6">
                <button
                  onClick={createSchedule}
                  disabled={loading}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {loading ? 'Creating...' : 'Create Schedule'}
                </button>
                <button
                  onClick={() => setShowScheduleModal(false)}
                  disabled={loading}
                  className="flex-1 bg-gray-300 text-gray-700 py-3 rounded-lg hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showUploadModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-8 max-w-md w-full">
              <h2 className="text-2xl font-bold mb-6">Upload Backup</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Backup File
                  </label>
                  <input
                    type="file"
                    accept=".json"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Select a previously downloaded backup file (.json)
                  </p>
                </div>
                {uploadFile && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800">
                      <strong>Selected file:</strong> {uploadFile.name}
                    </p>
                    <p className="text-sm text-blue-800">
                      <strong>Size:</strong> {formatBytes(uploadFile.size)}
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-4 mt-6">
                <button
                  onClick={handleUploadBackup}
                  disabled={loading || !uploadFile}
                  className="flex-1 bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                >
                  {loading ? 'Uploading...' : 'Upload Backup'}
                </button>
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setUploadFile(null);
                  }}
                  disabled={loading}
                  className="flex-1 bg-gray-300 text-gray-700 py-3 rounded-lg hover:bg-gray-400"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
}
