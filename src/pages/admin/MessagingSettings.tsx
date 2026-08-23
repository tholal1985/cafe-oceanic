import { useState, useEffect } from 'react';
import { MessageCircle, Save, Eye, EyeOff, Send, FileText, Plus, CreditCard as Edit2, Trash2, Copy } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { Database } from '../../lib/database.types';

type MessagingConfig = Database['public']['Tables']['messaging_config']['Row'];
type MessageLog = Database['public']['Tables']['message_logs']['Row'];

interface MessageTemplate {
  id: string;
  name: string;
  template_type: string;
  channel: string;
  subject: string | null;
  message_body: string;
  variables: any;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export default function MessagingSettings() {
  const [activeTab, setActiveTab] = useState<'config' | 'templates'>('config');
  const [whatsappConfig, setWhatsappConfig] = useState<MessagingConfig | null>(null);
  const [viberConfig, setViberConfig] = useState<MessagingConfig | null>(null);
  const [smsConfig, setSmsConfig] = useState<MessagingConfig | null>(null);
  const [messageLogs, setMessageLogs] = useState<MessageLog[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [showWhatsAppSecret, setShowWhatsAppSecret] = useState(false);
  const [showViberKey, setShowViberKey] = useState(false);
  const [showSmsPassword, setShowSmsPassword] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);

  const [whatsappForm, setWhatsappForm] = useState({
    is_enabled: false,
    api_key: '',
    api_secret: '',
    sender_id: '',
  });

  const [viberForm, setViberForm] = useState({
    is_enabled: false,
    api_key: '',
    sender_id: '',
  });

  const [smsForm, setSmsForm] = useState({
    is_enabled: false,
    api_secret: '',
    sender_id: '',
    bearer_token: '',
    api_url: 'https://o-papi1-lb01.ooredoo.mv/bulk_sms/v2',
  });

  const [templateForm, setTemplateForm] = useState({
    name: '',
    template_type: 'order_confirmation',
    channel: 'sms',
    subject: '',
    message_body: '',
    is_active: true,
    is_default: false,
  });

  const availableVariables = [
    { name: 'customer_name', description: "Customer's name" },
    { name: 'customer_phone', description: "Customer's phone number" },
    { name: 'order_number', description: 'Order number' },
    { name: 'order_total', description: 'Total order amount' },
    { name: 'order_items', description: 'List of items ordered' },
    { name: 'order_status', description: 'Current order status' },
    { name: 'order_type', description: 'dine-in, takeaway, delivery' },
    { name: 'table_number', description: 'Table number (if applicable)' },
    { name: 'tracking_link', description: 'Link to track order' },
    { name: 'business_name', description: 'Restaurant/business name' },
    { name: 'business_phone', description: 'Business contact number' },
    { name: 'estimated_time', description: 'Estimated preparation/delivery time' },
    { name: 'current_time', description: 'Current timestamp' },
    { name: 'custom_message', description: 'Custom message field' },
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [whatsappRes, viberRes, smsRes, logsRes, templatesRes] = await Promise.all([
        supabase
          .from('messaging_config')
          .select('*')
          .eq('service_name', 'whatsapp')
          .maybeSingle(),
        supabase
          .from('messaging_config')
          .select('*')
          .eq('service_name', 'viber')
          .maybeSingle(),
        supabase
          .from('messaging_config')
          .select('*')
          .eq('service_name', 'sms')
          .maybeSingle(),
        supabase
          .from('message_logs')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('message_templates')
          .select('*')
          .order('template_type', { ascending: true })
          .order('channel', { ascending: true }),
      ]);

      if (whatsappRes.data) {
        setWhatsappConfig(whatsappRes.data);
        setWhatsappForm({
          is_enabled: whatsappRes.data.is_enabled,
          api_key: whatsappRes.data.api_key || '',
          api_secret: whatsappRes.data.api_secret || '',
          sender_id: whatsappRes.data.sender_id || '',
        });
      }

      if (viberRes.data) {
        setViberConfig(viberRes.data);
        setViberForm({
          is_enabled: viberRes.data.is_enabled,
          api_key: viberRes.data.api_key || '',
          sender_id: viberRes.data.sender_id || '',
        });
      }

      if (smsRes.data) {
        setSmsConfig(smsRes.data);
        const configData = smsRes.data.config_data as any;
        setSmsForm({
          is_enabled: smsRes.data.is_enabled,
          api_secret: smsRes.data.api_secret || '',
          sender_id: smsRes.data.sender_id || '',
          bearer_token: configData?.bearer_token || '',
          api_url: configData?.api_url || 'https://o-papi1-lb01.ooredoo.mv/bulk_sms/v2',
        });
      }

      setMessageLogs(logsRes.data || []);
      setTemplates(templatesRes.data || []);
    } catch (error) {
      console.error('Error loading data:', error);
      alert('Failed to load messaging settings');
    } finally {
      setLoading(false);
    }
  };

  const insertVariable = (varName: string) => {
    const textarea = document.getElementById('template-body') as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const text = templateForm.message_body;
      const before = text.substring(0, start);
      const after = text.substring(end);
      const newText = before + `{${varName}}` + after;
      setTemplateForm({ ...templateForm, message_body: newText });
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + varName.length + 2, start + varName.length + 2);
      }, 0);
    }
  };

  const openNewTemplate = () => {
    setEditingTemplate(null);
    setTemplateForm({
      name: '',
      template_type: 'order_confirmation',
      channel: 'sms',
      subject: '',
      message_body: '',
      is_active: true,
      is_default: false,
    });
    setShowTemplateModal(true);
  };

  const openEditTemplate = (template: MessageTemplate) => {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name,
      template_type: template.template_type,
      channel: template.channel,
      subject: template.subject || '',
      message_body: template.message_body,
      is_active: template.is_active,
      is_default: template.is_default,
    });
    setShowTemplateModal(true);
  };

  const duplicateTemplate = (template: MessageTemplate) => {
    setEditingTemplate(null);
    setTemplateForm({
      name: template.name + ' (Copy)',
      template_type: template.template_type,
      channel: template.channel,
      subject: template.subject || '',
      message_body: template.message_body,
      is_active: false,
      is_default: false,
    });
    setShowTemplateModal(true);
  };

  const saveTemplate = async () => {
    if (!templateForm.name.trim() || !templateForm.message_body.trim()) {
      alert('Please fill in template name and message body');
      return;
    }

    setSaving(true);
    try {
      const templateData = {
        name: templateForm.name,
        template_type: templateForm.template_type,
        channel: templateForm.channel,
        subject: templateForm.subject || null,
        message_body: templateForm.message_body,
        variables: availableVariables,
        is_active: templateForm.is_active,
        is_default: templateForm.is_default,
      };

      if (editingTemplate) {
        const { error } = await supabase
          .from('message_templates')
          .update(templateData)
          .eq('id', editingTemplate.id);

        if (error) throw error;
        alert('Template updated successfully!');
      } else {
        const { error } = await supabase
          .from('message_templates')
          .insert(templateData);

        if (error) throw error;
        alert('Template created successfully!');
      }

      setShowTemplateModal(false);
      loadData();
    } catch (error: any) {
      console.error('Error saving template:', error);
      alert('Failed to save template: ' + (error.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const deleteTemplate = async (template: MessageTemplate) => {
    if (!confirm(`Are you sure you want to delete the template "${template.name}"?`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('message_templates')
        .delete()
        .eq('id', template.id);

      if (error) throw error;
      alert('Template deleted successfully!');
      loadData();
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Failed to delete template');
    }
  };

  const saveWhatsAppConfig = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('messaging_config')
        .update({
          is_enabled: whatsappForm.is_enabled,
          api_key: whatsappForm.api_key,
          api_secret: whatsappForm.api_secret,
          sender_id: whatsappForm.sender_id,
          updated_at: new Date().toISOString(),
        })
        .eq('service_name', 'whatsapp');

      if (error) throw error;
      alert('WhatsApp configuration saved successfully!');
      loadData();
    } catch (error) {
      console.error('Error saving WhatsApp config:', error);
      alert('Failed to save WhatsApp configuration');
    } finally {
      setSaving(false);
    }
  };

  const saveViberConfig = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('messaging_config')
        .update({
          is_enabled: viberForm.is_enabled,
          api_key: viberForm.api_key,
          sender_id: viberForm.sender_id,
          updated_at: new Date().toISOString(),
        })
        .eq('service_name', 'viber');

      if (error) throw error;
      alert('Viber configuration saved successfully!');
      loadData();
    } catch (error) {
      console.error('Error saving Viber config:', error);
      alert('Failed to save Viber configuration');
    } finally {
      setSaving(false);
    }
  };

  const saveSMSConfig = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('messaging_config')
        .update({
          is_enabled: smsForm.is_enabled,
          api_secret: smsForm.api_secret,
          sender_id: smsForm.sender_id,
          config_data: {
            bearer_token: smsForm.bearer_token,
            api_url: smsForm.api_url,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('service_name', 'sms');

      if (error) throw error;
      alert('SMS configuration saved successfully!');
      loadData();
    } catch (error) {
      console.error('Error saving SMS config:', error);
      alert('Failed to save SMS configuration');
    } finally {
      setSaving(false);
    }
  };

  const testWhatsApp = async () => {
    if (!testPhone) {
      alert('Please enter a phone number to test');
      return;
    }

    setTesting('whatsapp');
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-whatsapp`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: testPhone,
          message: 'This is a test message from your Restaurant Kiosk. WhatsApp messaging is working correctly!',
          messageType: 'test',
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        alert(`WhatsApp test message sent successfully to ${testPhone}!`);
      } else {
        alert(`WhatsApp test failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error testing WhatsApp:', error);
      alert('Failed to send WhatsApp test message');
    } finally {
      setTesting(null);
    }
  };

  const testViber = async () => {
    if (!testPhone) {
      alert('Please enter a phone number to test');
      return;
    }

    setTesting('viber');
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-viber`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: testPhone,
          message: 'This is a test message from your Restaurant Kiosk. Viber messaging is working correctly!',
          messageType: 'test',
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        alert(`Viber test message sent successfully to ${testPhone}!`);
      } else {
        alert(`Viber test failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error testing Viber:', error);
      alert('Failed to send Viber test message');
    } finally {
      setTesting(null);
    }
  };

  const testSMS = async () => {
    if (!testPhone) {
      alert('Please enter a phone number to test');
      return;
    }

    setTesting('sms');
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-sms`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phoneNumber: testPhone,
          message: 'This is a test message from your Restaurant Kiosk. SMS messaging is working correctly!',
          messageType: 'test',
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        alert(`SMS test message sent successfully to ${testPhone}!`);
      } else {
        alert(`SMS test failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error testing SMS:', error);
      alert('Failed to send SMS test message');
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Messaging Settings</h1>
        <p className="text-gray-600 mt-2">
          Configure messaging services and customize notification templates
        </p>
      </div>

      <div className="flex gap-4 mb-6">
        <button
          onClick={() => setActiveTab('config')}
          className={`px-6 py-3 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
            activeTab === 'config'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          <MessageCircle size={20} />
          Service Configuration
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`px-6 py-3 rounded-lg font-semibold transition-colors flex items-center gap-2 ${
            activeTab === 'templates'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          <FileText size={20} />
          Message Templates
        </button>
      </div>

      {activeTab === 'config' ? (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">Test Messaging Services</h3>
            <p className="text-sm text-blue-700 mb-3">
              Enter a phone number to send test messages and verify your configuration
            </p>
            <div className="flex gap-3">
              <input
                type="text"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="+960 xxx xxxx (with country code)"
                className="flex-1 border border-blue-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={testWhatsApp}
                disabled={testing !== null || !testPhone}
                className="bg-green-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Send size={16} />
                {testing === 'whatsapp' ? 'Testing...' : 'Test WhatsApp'}
              </button>
              <button
                onClick={testViber}
                disabled={testing !== null || !testPhone}
                className="bg-purple-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Send size={16} />
                {testing === 'viber' ? 'Testing...' : 'Test Viber'}
              </button>
              <button
                onClick={testSMS}
                disabled={testing !== null || !testPhone}
                className="bg-blue-600 text-white px-4 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Send size={16} />
                {testing === 'sms' ? 'Testing...' : 'Test SMS'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-green-100 p-3 rounded-lg">
                  <MessageCircle className="text-green-600" size={28} />
                </div>
                <div>
                  <h2 className="text-xl font-bold">WhatsApp (Twilio)</h2>
                  <p className="text-sm text-gray-600">Send via Twilio API</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="whatsapp_enabled"
                    checked={whatsappForm.is_enabled}
                    onChange={(e) =>
                      setWhatsappForm({ ...whatsappForm, is_enabled: e.target.checked })
                    }
                    className="w-5 h-5"
                  />
                  <label htmlFor="whatsapp_enabled" className="text-sm font-semibold">
                    Enable WhatsApp Messaging
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Twilio Account SID
                  </label>
                  <input
                    type="text"
                    value={whatsappForm.api_key}
                    onChange={(e) =>
                      setWhatsappForm({ ...whatsappForm, api_key: e.target.value })
                    }
                    placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Find in Twilio Console Dashboard
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Twilio Auth Token
                  </label>
                  <div className="relative">
                    <input
                      type={showWhatsAppSecret ? 'text' : 'password'}
                      value={whatsappForm.api_secret}
                      onChange={(e) =>
                        setWhatsappForm({ ...whatsappForm, api_secret: e.target.value })
                      }
                      placeholder="Enter Auth Token"
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowWhatsAppSecret(!showWhatsAppSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                    >
                      {showWhatsAppSecret ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Find in Twilio Console Dashboard
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    WhatsApp Sender Number
                  </label>
                  <input
                    type="text"
                    value={whatsappForm.sender_id}
                    onChange={(e) =>
                      setWhatsappForm({ ...whatsappForm, sender_id: e.target.value })
                    }
                    placeholder="+14155238886"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Your Twilio WhatsApp number (with country code)
                  </p>
                </div>

                <button
                  onClick={saveWhatsAppConfig}
                  disabled={saving}
                  className="w-full bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Save size={20} />
                  {saving ? 'Saving...' : 'Save WhatsApp Config'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-purple-100 p-3 rounded-lg">
                  <MessageCircle className="text-purple-600" size={28} />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Viber</h2>
                  <p className="text-sm text-gray-600">Send via Viber Bot API</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="viber_enabled"
                    checked={viberForm.is_enabled}
                    onChange={(e) =>
                      setViberForm({ ...viberForm, is_enabled: e.target.checked })
                    }
                    className="w-5 h-5"
                  />
                  <label htmlFor="viber_enabled" className="text-sm font-semibold">
                    Enable Viber Messaging
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Viber Bot Auth Token
                  </label>
                  <div className="relative">
                    <input
                      type={showViberKey ? 'text' : 'password'}
                      value={viberForm.api_key}
                      onChange={(e) =>
                        setViberForm({ ...viberForm, api_key: e.target.value })
                      }
                      placeholder="Enter Bot Token"
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowViberKey(!showViberKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                    >
                      {showViberKey ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Get from Viber Admin Panel
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Sender Name
                  </label>
                  <input
                    type="text"
                    value={viberForm.sender_id}
                    onChange={(e) =>
                      setViberForm({ ...viberForm, sender_id: e.target.value })
                    }
                    placeholder="Restaurant Name"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Display name shown to customers
                  </p>
                </div>

                <button
                  onClick={saveViberConfig}
                  disabled={saving}
                  className="w-full bg-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Save size={20} />
                  {saving ? 'Saving...' : 'Save Viber Config'}
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="bg-blue-100 p-3 rounded-lg">
                  <MessageCircle className="text-blue-600" size={28} />
                </div>
                <div>
                  <h2 className="text-xl font-bold">SMS (Ooredoo)</h2>
                  <p className="text-sm text-gray-600">Send via Ooredoo Maldives</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="sms_enabled"
                    checked={smsForm.is_enabled}
                    onChange={(e) =>
                      setSmsForm({ ...smsForm, is_enabled: e.target.checked })
                    }
                    className="w-5 h-5"
                  />
                  <label htmlFor="sms_enabled" className="text-sm font-semibold">
                    Enable SMS Messaging
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Bearer Token
                  </label>
                  <div className="relative">
                    <input
                      type={showSmsPassword ? 'text' : 'password'}
                      value={smsForm.bearer_token}
                      onChange={(e) =>
                        setSmsForm({ ...smsForm, bearer_token: e.target.value })
                      }
                      placeholder="5f39b5d6-b51f-3cd6-928a-0882ea03fa63"
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 pr-12 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSmsPassword(!showSmsPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500"
                    >
                      {showSmsPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Authorization token from Ooredoo
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Username (Email)
                  </label>
                  <input
                    type="text"
                    value={smsForm.sender_id}
                    onChange={(e) =>
                      setSmsForm({ ...smsForm, sender_id: e.target.value })
                    }
                    placeholder="your-email@example.com"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Your Ooredoo account email/username
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    Access Key
                  </label>
                  <div className="relative">
                    <input
                      type="password"
                      value={smsForm.api_secret}
                      onChange={(e) =>
                        setSmsForm({ ...smsForm, api_secret: e.target.value })
                      }
                      placeholder="SnRrQzg3TUtUYk9NMXlLdEZ1QXJTY09hSjUw..."
                      className="w-full border border-gray-300 rounded-lg px-4 py-2 text-xs"
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Your Ooredoo access key (base64 encoded)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-semibold mb-2">
                    API URL (Optional)
                  </label>
                  <input
                    type="text"
                    value={smsForm.api_url}
                    onChange={(e) =>
                      setSmsForm({ ...smsForm, api_url: e.target.value })
                    }
                    placeholder="https://o-papi1-lb01.ooredoo.mv/bulk_sms/v2"
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 text-xs"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Leave default unless specified by Ooredoo
                  </p>
                </div>

                <button
                  onClick={saveSMSConfig}
                  disabled={saving}
                  className="w-full bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Save size={20} />
                  {saving ? 'Saving...' : 'Save SMS Config'}
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-bold mb-4">Message Logs</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-gray-700">
                      Date/Time
                    </th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-gray-700">
                      Service
                    </th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-gray-700">
                      Phone
                    </th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-gray-700">
                      Type
                    </th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-gray-700">
                      Status
                    </th>
                    <th className="text-left px-4 py-3 text-sm font-semibold text-gray-700">
                      Message
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {messageLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        No messages sent yet
                      </td>
                    </tr>
                  ) : (
                    messageLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              log.service === 'whatsapp'
                                ? 'bg-green-100 text-green-800'
                                : log.service === 'viber'
                                ? 'bg-purple-100 text-purple-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {log.service.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">{log.phone_number}</td>
                        <td className="px-4 py-3 text-sm capitalize">
                          {log.message_type.replace('_', ' ')}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-semibold ${
                              log.status === 'sent'
                                ? 'bg-green-100 text-green-800'
                                : log.status === 'failed'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}
                          >
                            {log.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm max-w-xs truncate">
                          {log.error_message || log.message_content}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">Message Templates</h2>
              <p className="text-gray-600 text-sm mt-1">
                Create and customize notification templates with dynamic variables
              </p>
            </div>
            <button
              onClick={openNewTemplate}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Plus size={20} />
              New Template
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((template) => (
              <div key={template.id} className="bg-white rounded-lg shadow-md p-5 border border-gray-200">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex-1">
                    <h3 className="font-bold text-lg">{template.name}</h3>
                    <div className="flex gap-2 mt-2">
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full font-medium">
                        {template.template_type.replace('_', ' ')}
                      </span>
                      <span
                        className={`px-2 py-1 text-xs rounded-full font-medium ${
                          template.channel === 'whatsapp'
                            ? 'bg-green-100 text-green-700'
                            : template.channel === 'viber'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {template.channel.toUpperCase()}
                      </span>
                      {template.is_default && (
                        <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs rounded-full font-medium">
                          DEFAULT
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={`w-3 h-3 rounded-full ${template.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                </div>

                <div className="bg-gray-50 rounded p-3 mb-3 text-sm text-gray-700 font-mono max-h-24 overflow-y-auto">
                  {template.message_body}
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => openEditTemplate(template)}
                    className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-1"
                  >
                    <Edit2 size={14} />
                    Edit
                  </button>
                  <button
                    onClick={() => duplicateTemplate(template)}
                    className="bg-gray-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-700 transition-colors flex items-center justify-center"
                    title="Duplicate"
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    onClick={() => deleteTemplate(template)}
                    className="bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition-colors flex items-center justify-center"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {showTemplateModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-2xl font-bold">
                    {editingTemplate ? 'Edit Template' : 'New Template'}
                  </h2>
                </div>

                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold mb-2">Template Name</label>
                      <input
                        type="text"
                        value={templateForm.name}
                        onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                        placeholder="e.g., Order Confirmation - SMS"
                        className="w-full border border-gray-300 rounded-lg px-4 py-2"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold mb-2">Channel</label>
                      <select
                        value={templateForm.channel}
                        onChange={(e) => setTemplateForm({ ...templateForm, channel: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2"
                      >
                        <option value="sms">SMS</option>
                        <option value="whatsapp">WhatsApp</option>
                        <option value="viber">Viber</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold mb-2">Template Type</label>
                      <select
                        value={templateForm.template_type}
                        onChange={(e) => setTemplateForm({ ...templateForm, template_type: e.target.value })}
                        className="w-full border border-gray-300 rounded-lg px-4 py-2"
                      >
                        <option value="order_confirmation">Order Confirmation</option>
                        <option value="order_ready">Order Ready</option>
                        <option value="order_delay">Order Delay</option>
                        <option value="payment_success">Payment Success</option>
                        <option value="payment_failed">Payment Failed</option>
                        <option value="custom">Custom</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={templateForm.is_active}
                          onChange={(e) => setTemplateForm({ ...templateForm, is_active: e.target.checked })}
                          className="w-5 h-5"
                        />
                        <span className="text-sm font-semibold">Active</span>
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={templateForm.is_default}
                          onChange={(e) => setTemplateForm({ ...templateForm, is_default: e.target.checked })}
                          className="w-5 h-5"
                        />
                        <span className="text-sm font-semibold">Set as Default</span>
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-2">Message Body</label>
                    <textarea
                      id="template-body"
                      value={templateForm.message_body}
                      onChange={(e) => setTemplateForm({ ...templateForm, message_body: e.target.value })}
                      placeholder="Enter your message template here. Use variables like {customer_name}, {order_number}, etc."
                      rows={8}
                      className="w-full border border-gray-300 rounded-lg px-4 py-3 font-mono text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Click variable buttons below to insert them at cursor position
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold mb-3">Available Variables</label>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {availableVariables.map((variable) => (
                        <button
                          key={variable.name}
                          onClick={() => insertVariable(variable.name)}
                          className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-3 py-2 rounded-lg text-sm font-mono transition-colors text-left"
                          title={variable.description}
                        >
                          {`{${variable.name}}`}
                        </button>
                      ))}
                    </div>
                    <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-semibold text-sm text-blue-900 mb-2">Variable Descriptions:</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-blue-800">
                        {availableVariables.map((variable) => (
                          <div key={variable.name}>
                            <span className="font-mono font-semibold">{`{${variable.name}}`}</span> - {variable.description}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 border-t border-gray-200 flex gap-3 justify-end">
                  <button
                    onClick={() => setShowTemplateModal(false)}
                    className="px-6 py-2 border border-gray-300 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveTemplate}
                    disabled={saving}
                    className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save size={18} />
                    {saving ? 'Saving...' : editingTemplate ? 'Update Template' : 'Create Template'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
