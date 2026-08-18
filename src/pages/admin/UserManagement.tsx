import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Users, Shield, UserPlus, Eye, EyeOff, Pencil, X, Check } from 'lucide-react';

interface User {
  id: string;
  email: string;
  created_at: string;
  is_active: boolean;
  last_login_at?: string;
  roles: {
    id: string;
    name: string;
    display_name: string;
  }[];
}

interface Role {
  id: string;
  name: string;
  display_name: string;
  description: string;
  is_active: boolean;
}

interface CreateUserForm {
  email: string;
  password: string;
  roleIds: string[];
}

interface EditUserForm {
  email: string;
  password: string;
}

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [newUser, setNewUser] = useState<CreateUserForm>({ email: '', password: '', roleIds: [] });
  const [editForm, setEditForm] = useState<EditUserForm>({ email: '', password: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([loadUsers(), loadRoles()]);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    const { data: adminUsers, error: usersError } = await supabase
      .from('admin_users')
      .select('id, email, created_at, is_active, last_login_at')
      .order('created_at', { ascending: false });

    if (usersError) {
      console.error('Error loading users:', usersError);
      return;
    }

    const usersWithRoles = await Promise.all(
      (adminUsers || []).map(async (user) => {
        const { data: roleData } = await supabase.rpc('get_user_roles', {
          user_uuid: user.id
        });
        return { ...user, roles: roleData || [] };
      })
    );

    setUsers(usersWithRoles);
  };

  const loadRoles = async () => {
    const { data, error } = await supabase
      .from('user_roles')
      .select('*')
      .eq('is_active', true)
      .order('display_name');

    if (error) {
      console.error('Error loading roles:', error);
      return;
    }
    setRoles(data || []);
  };

  const getEdgeFunctionUrl = (path: string) =>
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-users${path}`;

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Authorization': `Bearer ${session?.access_token}`,
      'Content-Type': 'application/json',
    };
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    try {
      const headers = await getAuthHeaders();
      const res = await fetch(getEdgeFunctionUrl('/create'), {
        method: 'POST',
        headers,
        body: JSON.stringify({
          email: newUser.email,
          password: newUser.password,
          roleIds: newUser.roleIds,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');

      setShowCreateModal(false);
      setNewUser({ email: '', password: '', roleIds: [] });
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSaving(true);
    setError('');

    try {
      const headers = await getAuthHeaders();
      const body: Record<string, string> = {};
      if (editForm.email && editForm.email !== editingUser.email) body.email = editForm.email;
      if (editForm.password) body.password = editForm.password;

      if (Object.keys(body).length > 0) {
        const res = await fetch(getEdgeFunctionUrl(`/update/${editingUser.id}`), {
          method: 'PUT',
          headers,
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update user');
      }

      setEditingUser(null);
      setEditForm({ email: '', password: '' });
      await loadUsers();
    } catch (err: any) {
      setError(err.message || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const handleAssignRole = async (userId: string, roleId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('user_role_assignments')
        .insert({ user_id: userId, role_id: roleId, assigned_by: user?.id });

      if (error) throw error;
      await loadUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to assign role');
    }
  };

  const handleRemoveRole = async (userId: string, roleId: string) => {
    if (!confirm('Remove this role?')) return;

    try {
      const { error } = await supabase
        .from('user_role_assignments')
        .delete()
        .eq('user_id', userId)
        .eq('role_id', roleId);

      if (error) throw error;
      await loadUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to remove role');
    }
  };

  const handleToggleStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(getEdgeFunctionUrl(`/update/${userId}`), {
        method: 'PUT',
        headers,
        body: JSON.stringify({ is_active: !currentStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update status');
      await loadUsers();
    } catch (err: any) {
      alert(err.message || 'Failed to update user status');
    }
  };

  const openEditModal = (user: User) => {
    setEditingUser(user);
    setEditForm({ email: user.email, password: '' });
    setError('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-lg text-gray-500">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Users className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">User Management</h1>
        </div>
        <button
          onClick={() => { setShowCreateModal(true); setError(''); }}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <UserPlus className="w-5 h-5" />
          Create User
        </button>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Roles</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Login</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-gray-400">No users found</td>
              </tr>
            )}
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900">{user.email}</div>
                  <div className="text-xs text-gray-500">Created {new Date(user.created_at).toLocaleDateString()}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-2 items-center">
                    {user.roles.map((role) => (
                      <span
                        key={role.id}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                      >
                        <Shield className="w-3 h-3" />
                        {role.display_name}
                        <button
                          onClick={() => handleRemoveRole(user.id, role.id)}
                          className="ml-1 hover:text-red-600 transition-colors"
                          title="Remove role"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAssignRole(user.id, e.target.value);
                          e.target.value = '';
                        }
                      }}
                      className="text-xs border border-gray-300 rounded px-2 py-1 bg-white hover:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="">+ Add Role</option>
                      {roles
                        .filter(role => !user.roles.find(ur => ur.id === role.id))
                        .map((role) => (
                          <option key={role.id} value={role.id}>{role.display_name}</option>
                        ))}
                    </select>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                    user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {user.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Never'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openEditModal(user)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 hover:border-blue-300 transition-colors"
                      title="Edit user"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleStatus(user.id, user.is_active)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                        user.is_active
                          ? 'text-red-700 bg-red-50 border-red-200 hover:bg-red-100 hover:border-red-300'
                          : 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100 hover:border-green-300'
                      }`}
                      title={user.is_active ? 'Deactivate' : 'Activate'}
                    >
                      {user.is_active ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      {user.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Create New User</h2>
              <button onClick={() => { setShowCreateModal(false); setNewUser({ email: '', password: '', roleIds: [] }); setError(''); }}>
                <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Min. 6 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Assign Roles</label>
                <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
                  {roles.map((role) => (
                    <label key={role.id} className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 rounded p-1">
                      <input
                        type="checkbox"
                        checked={newUser.roleIds.includes(role.id)}
                        onChange={(e) => {
                          setNewUser({
                            ...newUser,
                            roleIds: e.target.checked
                              ? [...newUser.roleIds, role.id]
                              : newUser.roleIds.filter(id => id !== role.id)
                          });
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <div className="text-sm font-medium text-gray-900">{role.display_name}</div>
                        {role.description && <div className="text-xs text-gray-500">{role.description}</div>}
                      </div>
                    </label>
                  ))}
                  {roles.length === 0 && <p className="text-sm text-gray-400 text-center py-2">No roles available</p>}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Creating...' : (<><Check className="w-4 h-4" /> Create User</>)}
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); setNewUser({ email: '', password: '', roleIds: [] }); setError(''); }}
                  className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-gray-900">Edit User</h2>
              <button onClick={() => { setEditingUser(null); setError(''); }}>
                <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
            )}

            <form onSubmit={handleEditUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New Password <span className="text-gray-400 font-normal">(leave blank to keep current)</span></label>
                <input
                  type="password"
                  minLength={6}
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="Min. 6 characters"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Roles</label>
                <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
                  {roles.map((role) => {
                    const hasRole = editingUser.roles.some(r => r.id === role.id);
                    return (
                      <label key={role.id} className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 rounded p-1">
                        <input
                          type="checkbox"
                          checked={hasRole}
                          onChange={async (e) => {
                            if (e.target.checked) {
                              await handleAssignRole(editingUser.id, role.id);
                            } else {
                              const { error } = await supabase
                                .from('user_role_assignments')
                                .delete()
                                .eq('user_id', editingUser.id)
                                .eq('role_id', role.id);
                              if (!error) {
                                setEditingUser({
                                  ...editingUser,
                                  roles: editingUser.roles.filter(r => r.id !== role.id)
                                });
                              }
                            }
                            const updated = await supabase.rpc('get_user_roles', { user_uuid: editingUser.id });
                            if (updated.data) {
                              setEditingUser({ ...editingUser, roles: updated.data });
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div>
                          <div className="text-sm font-medium text-gray-900">{role.display_name}</div>
                          {role.description && <div className="text-xs text-gray-500">{role.description}</div>}
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {saving ? 'Saving...' : (<><Check className="w-4 h-4" /> Save Changes</>)}
                </button>
                <button
                  type="button"
                  onClick={() => { setEditingUser(null); setError(''); }}
                  className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
