/**
 * Contacts Page
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Plus, Search, Phone, Mail, Building, MoreVertical, X, Trash2, Edit2, User, Download } from 'lucide-react';

interface Contact {
  id: string;
  name: string;
  phone: string;
  email?: string;
  company?: string;
  tags: string[];
  status: 'active' | 'inactive' | 'blocked';
  lastMessage?: string;
  createdAt: string;
}

export default function ContactsPage() {
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    company: '',
    tags: '',
  });
  const [createError, setCreateError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', search],
    queryFn: async () => {
      const response = await api.get('/contacts', { params: { search } });
      return response.data;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (contact: any) => {
      const response = await api.post('/contacts', contact);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setShowAdd(false);
      setForm({ name: '', phone: '', email: '', company: '', tags: '' });
      setCreateError(null);
    },
    onError: (err: any) => {
      setCreateError(
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Failed to add contact. Please try again.'
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/contacts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setSelected([]);
    },
  });

  const contacts: Contact[] = data?.data || [
    { id: '1', name: 'John Smith', phone: '+1234567890', email: 'john@techstart.io', company: 'TechStart Inc', tags: ['lead', 'Q3'], status: 'active', lastMessage: '2h ago', createdAt: '2026-06-01' },
    { id: '2', name: 'Sarah Johnson', phone: '+1987654321', email: 'sarah@globalretail.com', company: 'Global Retail', tags: ['customer'], status: 'active', lastMessage: '5m ago', createdAt: '2026-05-15' },
    { id: '3', name: 'Mike Brown', phone: '+1122334455', email: 'mike@acmecorp.com', company: 'Acme Corp', tags: ['enterprise', 'priority'], status: 'active', lastMessage: '1d ago', createdAt: '2026-04-20' },
    { id: '4', name: 'Emily Davis', phone: '+1555444333', email: 'emily@healthpro.com', company: 'HealthPro', tags: ['customer'], status: 'inactive', createdAt: '2026-03-10' },
    { id: '5', name: 'Alex Wilson', phone: '+1777888999', email: 'alex@startupxyz.com', company: 'StartupXYZ', tags: ['lead'], status: 'active', lastMessage: '3d ago', createdAt: '2026-07-01' },
    { id: '6', name: 'Lisa Chen', phone: '+1222333444', email: 'lisa@digimarkpro.com', company: 'Digital Marketing Pro', tags: ['marketing', 'Q3'], status: 'blocked', createdAt: '2026-06-20' },
  ];

  const filtered = contacts.filter(c =>
    !search ||
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleSelect = (id: string) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  const handleSubmit = () => {
    if (!form.name || !form.phone) return;
    setCreateError(null);
    createMutation.mutate({
      name: form.name,
      phone: form.phone,
      email: form.email || undefined,
      company: form.company || undefined,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
    });
  };

  const tagColors: Record<string, string> = {
    lead: 'bg-wa-green/20 text-wa-green',
    customer: 'bg-apple-green/20 text-apple-green',
    enterprise: 'bg-apple-purple/20 text-apple-purple',
    priority: 'bg-apple-orange/20 text-apple-orange',
    Q3: 'bg-apple-indigo/20 text-apple-indigo',
    marketing: 'bg-apple-red/20 text-apple-red',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ios-dark">Contacts</h1>
          <p className="text-ios-secondary mt-1">{contacts.length} total contacts</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              const headers = ['Name', 'Phone', 'Email', 'Company', 'Tags', 'Created At'];
              const csvRows = [headers.join(',')];
              filtered.forEach(c => {
                const tags = Array.isArray(c.tags) ? c.tags.join(';') : '';
                csvRows.push([
                  `"${c.name || ''}"`,
                  `"${c.phone || ''}"`,
                  `"${c.email || ''}"`,
                  `"${c.company || ''}"`,
                  `"${tags}"`,
                  `"${c.createdAt || ''}"`
                ].join(','));
              });
              const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
              const url = window.URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.setAttribute('href', url);
              a.setAttribute('download', `contacts_export_${new Date().toISOString().slice(0,10)}.csv`);
              a.click();
            }}
            className="btn-apple btn-apple-outline flex items-center gap-2 text-sm"
          >
            <Download className="w-4 h-4 text-ios-secondary" />
            Export CSV
          </button>
          {selected.length > 0 && (
            <button
              onClick={() => deleteMutation.mutate(selected[0])}
              className="btn-apple text-apple-red hover:bg-apple-red/10 flex items-center gap-2 text-sm"
            >
              <Trash2 className="w-4 h-4" />
              Delete ({selected.length})
            </button>
          )}
          <button
            onClick={() => setShowAdd(true)}
            className="btn-apple bg-wa-gradient flex items-center gap-2 text-white shadow-wa"
          >
            <Plus className="w-4 h-4" />
            Add Contact
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="card-apple p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-muted" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, phone, or email..."
            className="input-apple w-full pl-10"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2"
            >
              <X className="w-4 h-4 text-ios-muted" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card-apple overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ios-gray">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    onChange={(e) => setSelected(e.target.checked ? filtered.map(c => c.id) : [])}
                    checked={selected.length === filtered.length && filtered.length > 0}
                    className="w-4 h-4 rounded border-black/20"
                  />
                </th>
                {['Name', 'Phone', 'Email', 'Company', 'Tags', 'Status', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-ios-secondary font-medium text-xs whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {filtered.map((contact) => (
                <tr key={contact.id} className="hover:bg-ios-gray/50 transition">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(contact.id)}
                      onChange={() => toggleSelect(contact.id)}
                      className="w-4 h-4 rounded border-black/20"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-wa-green/20 text-wa-green rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0">
                        {contact.name.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-ios-dark">{contact.name}</p>
                        <p className="text-xs text-ios-muted">{contact.lastMessage}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-ios-secondary font-mono text-xs">{contact.phone}</td>
                  <td className="px-4 py-3 text-ios-secondary">{contact.email || '—'}</td>
                  <td className="px-4 py-3 text-ios-secondary">{contact.company || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {contact.tags.map(tag => (
                        <span key={tag} className={`text-xs px-2 py-0.5 rounded-apple font-medium ${tagColors[tag] || 'bg-ios-gray text-ios-secondary'}`}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-apple-full font-medium ${
                      contact.status === 'active' ? 'bg-apple-green/20 text-apple-green' :
                      contact.status === 'inactive' ? 'bg-ios-gray text-ios-muted' :
                      'bg-apple-red/20 text-apple-red'
                    }`}>
                      {contact.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setEditing(contact)}
                      className="p-1.5 hover:bg-ios-gray rounded-apple-lg text-ios-muted"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="p-16 text-center text-ios-muted">
            <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No contacts found</p>
            <p className="text-sm mt-1">
              {search ? 'Try a different search term' : 'Add your first contact to get started'}
            </p>
          </div>
        )}
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-apple-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-ios-dark">Add New Contact</h3>
              <button onClick={() => { setShowAdd(false); setCreateError(null); }} className="p-1 hover:bg-ios-gray rounded-apple-lg">
                <X className="w-5 h-5 text-ios-muted" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">Name *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Full name"
                  className="input-apple w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">Phone *</label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+1 234 567 8900"
                  className="input-apple w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="email@example.com"
                  className="input-apple w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">Company</label>
                <input
                  type="text"
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  placeholder="Company name"
                  className="input-apple w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1.5">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  placeholder="lead, customer, Q3"
                  className="input-apple w-full"
                />
              </div>

              {createError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {createError}
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={createMutation.isPending || !form.name || !form.phone}
                className="w-full py-3 btn-apple bg-wa-gradient text-white shadow-wa rounded-apple-lg font-medium disabled:opacity-50"
              >
                {createMutation.isPending ? 'Adding...' : 'Add Contact'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
