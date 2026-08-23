import { useState, useEffect } from 'react';
import { Lock, Plus, CreditCard as Edit2, Trash2, Clock, Calendar, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface Category {
  id: string;
  name: string;
}

interface KioskLock {
  id: string;
  name: string;
  lock_type: 'all' | 'specific';
  locked_category_ids: string[];
  start_time: string;
  end_time: string;
  days_of_week: number[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday', short: 'Sun' },
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
];

export default function KioskLock() {
  const [locks, setLocks] = useState<KioskLock[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingLock, setEditingLock] = useState<KioskLock | null>(null);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState({
    name: '',
    lock_type: 'specific' as 'all' | 'specific',
    locked_category_ids: [] as string[],
    start_time: '00:00',
    end_time: '23:59',
    days_of_week: [] as number[],
    is_active: true,
  });

  useEffect(() => {
    fetchLocks();
    fetchCategories();
  }, []);

  const fetchLocks = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('kiosk_lock_settings')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setLocks(data || []);
    } catch (error) {
      alert('Error fetching locks: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      alert('Error fetching categories');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      alert('Please enter a name for the lock rule');
      return;
    }

    if (formData.lock_type === 'specific' && formData.locked_category_ids.length === 0) {
      alert('Please select at least one category to lock');
      return;
    }

    try {
      const lockData = {
        name: formData.name.trim(),
        lock_type: formData.lock_type,
        locked_category_ids: formData.lock_type === 'all' ? [] : formData.locked_category_ids,
        start_time: formData.start_time,
        end_time: formData.end_time,
        days_of_week: formData.days_of_week,
        is_active: formData.is_active,
      };

      if (editingLock) {
        const { error } = await supabase
          .from('kiosk_lock_settings')
          .update(lockData)
          .eq('id', editingLock.id);

        if (error) throw error;
        alert('Lock rule updated successfully');
      } else {
        const { error } = await supabase
          .from('kiosk_lock_settings')
          .insert([lockData]);

        if (error) throw error;
        alert('Lock rule created successfully');
      }

      fetchLocks();
      handleCloseModal();
    } catch (error) {
      alert('Error saving lock rule: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleEdit = (lock: KioskLock) => {
    setEditingLock(lock);
    setFormData({
      name: lock.name,
      lock_type: lock.lock_type,
      locked_category_ids: lock.locked_category_ids || [],
      start_time: lock.start_time,
      end_time: lock.end_time,
      days_of_week: lock.days_of_week || [],
      is_active: lock.is_active,
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this lock rule?')) return;

    try {
      const { error } = await supabase
        .from('kiosk_lock_settings')
        .delete()
        .eq('id', id);

      if (error) throw error;
      alert('Lock rule deleted successfully');
      fetchLocks();
    } catch (error) {
      alert('Error deleting lock rule');
    }
  };

  const toggleActive = async (lock: KioskLock) => {
    try {
      const { error } = await supabase
        .from('kiosk_lock_settings')
        .update({ is_active: !lock.is_active })
        .eq('id', lock.id);

      if (error) throw error;
      fetchLocks();
    } catch (error) {
      alert('Error updating lock status');
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingLock(null);
    setFormData({
      name: '',
      lock_type: 'specific',
      locked_category_ids: [],
      start_time: '00:00',
      end_time: '23:59',
      days_of_week: [],
      is_active: true,
    });
  };

  const toggleDay = (day: number) => {
    setFormData(prev => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(day)
        ? prev.days_of_week.filter(d => d !== day)
        : [...prev.days_of_week, day].sort(),
    }));
  };

  const toggleCategory = (categoryId: string) => {
    setFormData(prev => ({
      ...prev,
      locked_category_ids: prev.locked_category_ids.includes(categoryId)
        ? prev.locked_category_ids.filter(id => id !== categoryId)
        : [...prev.locked_category_ids, categoryId],
    }));
  };

  const getDaysDisplay = (days: number[]) => {
    if (!days || days.length === 0) return 'Every day';
    if (days.length === 7) return 'Every day';
    return days.map(d => DAYS_OF_WEEK[d].short).join(', ');
  };

  const getCategoriesDisplay = (lock: KioskLock) => {
    if (lock.lock_type === 'all') return 'All Categories';
    if (!lock.locked_category_ids || lock.locked_category_ids.length === 0) return 'None';

    const names = lock.locked_category_ids
      .map(id => categories.find(c => c.id === id)?.name)
      .filter(Boolean);

    return names.length > 3
      ? `${names.slice(0, 3).join(', ')} +${names.length - 3} more`
      : names.join(', ');
  };

  return (
    <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Lock size={32} className="text-red-600" />
            <h1 className="text-3xl font-bold text-gray-800">Kiosk Lock Settings</h1>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors"
          >
            <Plus size={20} />
            Add Lock Rule
          </button>
        </div>

        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-gray-500">Loading lock rules...</div>
          ) : locks.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No lock rules configured. Create one to restrict category access during specific times.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Categories
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Time Range
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Days
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {locks.map((lock) => (
                    <tr key={lock.id} className={!lock.is_active ? 'opacity-50' : ''}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Lock size={16} className={lock.is_active ? 'text-red-600' : 'text-gray-400'} />
                          <span className="font-medium text-gray-900">{lock.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-600">{getCategoriesDisplay(lock)}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Clock size={14} />
                          {lock.start_time} - {lock.end_time}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-sm text-gray-600">
                          <Calendar size={14} />
                          {getDaysDisplay(lock.days_of_week)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => toggleActive(lock)}
                          className={`px-3 py-1 rounded-full text-xs font-medium ${
                            lock.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {lock.is_active ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleEdit(lock)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Edit2 size={18} />
                          </button>
                          <button
                            onClick={() => handleDelete(lock.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b flex items-center justify-between sticky top-0 bg-white">
                <h2 className="text-2xl font-bold text-gray-800">
                  {editingLock ? 'Edit Lock Rule' : 'Add Lock Rule'}
                </h2>
                <button
                  onClick={handleCloseModal}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rule Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    placeholder="e.g., Lunch Break Lock"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Lock Type *
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="lock_type"
                        value="all"
                        checked={formData.lock_type === 'all'}
                        onChange={(e) => setFormData({ ...formData, lock_type: e.target.value as 'all' | 'specific' })}
                        className="text-red-600"
                      />
                      <div>
                        <div className="font-medium">Lock All Categories</div>
                        <div className="text-sm text-gray-500">Prevent orders from all categories</div>
                      </div>
                    </label>
                    <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="lock_type"
                        value="specific"
                        checked={formData.lock_type === 'specific'}
                        onChange={(e) => setFormData({ ...formData, lock_type: e.target.value as 'all' | 'specific' })}
                        className="text-red-600"
                      />
                      <div>
                        <div className="font-medium">Lock Specific Categories</div>
                        <div className="text-sm text-gray-500">Select which categories to lock</div>
                      </div>
                    </label>
                  </div>
                </div>

                {formData.lock_type === 'specific' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select Categories to Lock *
                    </label>
                    <div className="border rounded-lg p-4 max-h-48 overflow-y-auto space-y-2">
                      {categories.length === 0 ? (
                        <p className="text-gray-500 text-sm">No categories available</p>
                      ) : (
                        categories.map((category) => (
                          <label
                            key={category.id}
                            className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={formData.locked_category_ids.includes(category.id)}
                              onChange={() => toggleCategory(category.id)}
                              className="text-red-600 rounded"
                            />
                            <span>{category.name}</span>
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Start Time *
                    </label>
                    <input
                      type="time"
                      value={formData.start_time}
                      onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      End Time *
                    </label>
                    <input
                      type="time"
                      value={formData.end_time}
                      onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Days of Week (Leave empty for every day)
                  </label>
                  <div className="grid grid-cols-7 gap-2">
                    {DAYS_OF_WEEK.map((day) => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleDay(day.value)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                          formData.days_of_week.includes(day.value)
                            ? 'bg-red-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        {day.short}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                    <input
                      type="checkbox"
                      checked={formData.is_active}
                      onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                      className="text-red-600 rounded"
                    />
                    <div>
                      <div className="font-medium">Active</div>
                      <div className="text-sm text-gray-500">Enable this lock rule immediately</div>
                    </div>
                  </label>
                </div>

                <div className="flex gap-4 pt-4 border-t">
                  <button
                    type="button"
                    onClick={handleCloseModal}
                    className="flex-1 px-6 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  >
                    {editingLock ? 'Update Lock Rule' : 'Create Lock Rule'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
    </div>
  );
}
