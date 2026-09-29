import { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Save, AlertCircle, CheckCircle2, Globe, Clock, Shield } from 'lucide-react';
import { kioskposApi, type GatewaySettings } from '../../lib/kioskposApi';

export default function KioskGatewaySettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<GatewaySettings | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const data = await kioskposApi.getSettings();
      setSettings(data as GatewaySettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const handleSave = async () => {
    if (!settings) return;
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      await kioskposApi.updateSettings({
        ultimatepos_url: settings.ultimatepos_url,
        ultimatepos_location_id: settings.ultimatepos_location_id,
        mock_mode: settings.mock_mode,
        sync_interval_minutes: settings.sync_interval_minutes,
        rate_limit_per_minute: settings.rate_limit_per_minute,
        allowed_origins: settings.allowed_origins,
        currency: settings.currency,
        timezone: settings.timezone,
      });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-full bg-ivory-50 px-6 py-8 lg:px-10">
        <div className="mx-auto max-w-3xl">
          <div className="h-8 w-48 animate-pulse rounded bg-ink-100" />
          <div className="mt-4 h-64 animate-pulse rounded-2xl bg-white/60" />
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="min-h-full bg-ivory-50 px-6 py-8 lg:px-10">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
            Failed to load settings. Make sure the database migration has been applied.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-ivory-50 px-6 py-8 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-ocean-700">API Gateway</p>
            <h1 className="font-display text-4xl text-ink-900">Gateway Settings</h1>
            <p className="mt-2 text-sm text-ink-500">
              Configure UltimatePOS connection, sync interval, rate limits, and more.
            </p>
          </div>
          <button
            onClick={fetchSettings}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ink-100 bg-white text-ink-500 shadow-soft transition-colors hover:text-ocean-700"
            title="Refresh"
          >
            <RefreshCw size={15} />
          </button>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <AlertCircle size={16} /> {error}
          </div>
        )}
        {success && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <CheckCircle2 size={16} /> Settings saved successfully
          </div>
        )}

        <div className="space-y-6">
          {/* UltimatePOS Connection */}
          <div className="rounded-2xl border border-ink-100/70 bg-white p-6 shadow-soft">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ocean-50 text-ocean-700">
                <Globe size={18} />
              </div>
              <div>
                <h3 className="font-display text-lg text-ink-900">UltimatePOS Connection</h3>
                <p className="text-xs text-ink-400">Server-side only — never exposed to the browser</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-600">UltimatePOS URL</label>
                <input
                  type="text"
                  value={settings.ultimatepos_url || ''}
                  onChange={(e) => setSettings({ ...settings, ultimatepos_url: e.target.value })}
                  placeholder="https://your-store.ultimatepos.com"
                  className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-ocean-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-600">Location ID</label>
                <input
                  type="number"
                  value={settings.ultimatepos_location_id}
                  onChange={(e) => setSettings({ ...settings, ultimatepos_location_id: parseInt(e.target.value, 10) || 1 })}
                  className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-ocean-400 focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-ink-100 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-ink-900">Mock Mode</p>
                  <p className="text-xs text-ink-400">Use mock data instead of real UltimatePOS API</p>
                </div>
                <button
                  onClick={() => setSettings({ ...settings, mock_mode: !settings.mock_mode })}
                  className={`relative h-6 w-11 rounded-full transition-colors ${settings.mock_mode ? 'bg-emerald-500' : 'bg-ink-200'}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${settings.mock_mode ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>
          </div>

          {/* Sync & Rate Limit */}
          <div className="rounded-2xl border border-ink-100/70 bg-white p-6 shadow-soft">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                <Clock size={18} />
              </div>
              <div>
                <h3 className="font-display text-lg text-ink-900">Sync & Rate Limiting</h3>
                <p className="text-xs text-ink-400">Control how often data syncs and API rate limits</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-600">Sync Interval (minutes)</label>
                <input
                  type="number"
                  value={settings.sync_interval_minutes}
                  onChange={(e) => setSettings({ ...settings, sync_interval_minutes: parseInt(e.target.value, 10) || 60 })}
                  className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-ocean-400 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-600">Rate Limit (requests/min/kiosk)</label>
                <input
                  type="number"
                  value={settings.rate_limit_per_minute}
                  onChange={(e) => setSettings({ ...settings, rate_limit_per_minute: parseInt(e.target.value, 10) || 100 })}
                  className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-ocean-400 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Security & Localization */}
          <div className="rounded-2xl border border-ink-100/70 bg-white p-6 shadow-soft">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-50 text-ink-700">
                <Shield size={18} />
              </div>
              <div>
                <h3 className="font-display text-lg text-ink-900">Security & Localization</h3>
                <p className="text-xs text-ink-400">CORS origins, currency, and timezone</p>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-ink-600">Allowed Origins (comma-separated)</label>
                <input
                  type="text"
                  value={settings.allowed_origins || ''}
                  onChange={(e) => setSettings({ ...settings, allowed_origins: e.target.value })}
                  placeholder="https://kiosk1.example.com, https://kiosk2.example.com"
                  className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-ocean-400 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-ink-400">Leave empty to allow all origins (not recommended for production)</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-600">Currency</label>
                  <select
                    value={settings.currency}
                    onChange={(e) => setSettings({ ...settings, currency: e.target.value })}
                    className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-ocean-400 focus:outline-none"
                  >
                    <option value="MVR">MVR — Maldivian Rufiyaa</option>
                    <option value="USD">USD — US Dollar</option>
                    <option value="EUR">EUR — Euro</option>
                    <option value="GBP">GBP — British Pound</option>
                    <option value="INR">INR — Indian Rupee</option>
                    <option value="AED">AED — UAE Dirham</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-ink-600">Timezone</label>
                  <select
                    value={settings.timezone}
                    onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
                    className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900 focus:border-ocean-400 focus:outline-none"
                  >
                    <option value="Indian/Maldives">Indian/Maldives</option>
                    <option value="UTC">UTC</option>
                    <option value="Asia/Dubai">Asia/Dubai</option>
                    <option value="Asia/Kolkata">Asia/Kolkata</option>
                    <option value="Asia/Singapore">Asia/Singapore</option>
                    <option value="Europe/London">Europe/London</option>
                    <option value="America/New_York">America/New_York</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Save button */}
          <div className="flex justify-end">
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              <Save size={16} />
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
