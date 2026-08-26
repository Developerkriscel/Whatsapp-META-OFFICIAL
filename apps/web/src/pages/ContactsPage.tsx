/**
 * Contacts Page
 * List, create, edit, delete contacts + CSV import with column mapping + export.
 */

import { useState, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  Plus, Search, X, Trash2, Edit2, User, Download,
  Upload, ChevronDown, ChevronRight, AlertCircle,
  CheckCircle, FileText, ArrowRight, RefreshCw,
} from 'lucide-react';
import { useToast } from '../components/Toast';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

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

type ImportStep = 'upload' | 'map' | 'preview' | 'done';

interface CsvRow {
  [key: string]: string;
}

interface ColumnMapping {
  csvColumn: string;
  field: string; // 'name' | 'phone' | 'email' | 'company' | 'tags' | ''
}

const CONTACT_FIELDS = [
  { value: '', label: '— Skip —' },
  { value: 'name', label: 'Name *' },
  { value: 'phone', label: 'Phone *' },
  { value: 'email', label: 'Email' },
  { value: 'company', label: 'Company' },
  { value: 'tags', label: 'Tags (comma-separated)' },
];

// ─────────────────────────────────────────────────────────
// CSV Utilities
// ─────────────────────────────────────────────────────────

function parseCsv(text: string): { headers: string[]; rows: CsvRow[] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).filter(l => l.trim()).map(line => {
    const values = parseRow(line);
    const row: CsvRow = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
  return { headers, rows };
}

function autoMapColumn(header: string): string {
  const h = header.toLowerCase().replace(/[^a-z]/g, '');
  if (['name', 'fullname', 'contactname'].includes(h)) return 'name';
  if (['phone', 'mobile', 'cell', 'phonenumber', 'tel', 'telephone', 'whatsapp'].includes(h)) return 'phone';
  if (['email', 'emailaddress', 'mail'].includes(h)) return 'email';
  if (['company', 'organization', 'org', 'business'].includes(h)) return 'company';
  if (['tags', 'label', 'labels', 'categories'].includes(h)) return 'tags';
  return '';
}

// ─────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────

export default function ContactsPage() {
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [showImport, setShowImport] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ name: '', phone: '', email: '', company: '', tags: '' });
  const [createError, setCreateError] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', company: '' });
  const [editError, setEditError] = useState<string | null>(null);

  // CSV Import state
  const [importStep, setImportStep] = useState<ImportStep>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResults, setImportResults] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // ── Queries ──────────────────────────────────────────

  const { data, isLoading } = useQuery({
    queryKey: ['contacts', search],
    queryFn: async () => {
      const response = await api.get('/contacts', { params: { search } });
      return response.data;
    },
  });

  // ── Mutations ─────────────────────────────────────────

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
      toast.success('Contact added');
    },
    onError: (err: any) => {
      setCreateError(
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Failed to add contact.'
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(ids.map(id => api.delete(`/contacts/${id}`)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setSelected([]);
      toast.success('Contacts deleted');
    },
    onError: (error: any) => toast.error(error.response?.data?.error?.message || 'Failed to delete contacts'),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const response = await api.patch(`/contacts/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setEditing(null);
      setEditError(null);
      toast.success('Contact updated');
    },
    onError: (err: any) => {
      setEditError(
        err.response?.data?.error?.message ||
        err.response?.data?.message ||
        'Failed to update contact.'
      );
    },
  });

  const bulkImportMutation = useMutation({
    mutationFn: async (contacts: any[]) => {
      const response = await api.post('/contacts/import', { contacts });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      setImportResults({
        created: data?.data?.created ?? data?.created ?? 0,
        skipped: data?.data?.skipped ?? data?.skipped ?? 0,
        errors: data?.data?.errors ?? data?.errors ?? [],
      });
      setImportStep('done');
      toast.success('Import complete');
    },
    onError: (err: any) => {
      setImportError(err.response?.data?.message || 'Import failed. Please try again.');
    },
  });

  // ── Data ─────────────────────────────────────────────

  const contacts: Contact[] = data?.data || [];

  const filtered = contacts.filter(c =>
    !search ||
    (c.name || '').toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  );

  // ── CSV Import Handlers ───────────────────────────────

  const handleFileSelect = useCallback((file: File) => {
    if (!file) return;
    if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
      setImportError('Please upload a CSV file (.csv)');
      return;
    }
    setImportError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const { headers, rows } = parseCsv(text);
      if (headers.length === 0) {
        setImportError('CSV appears to be empty or invalid.');
        return;
      }
      setCsvHeaders(headers);
      setCsvRows(rows);
      // Auto-map columns
      const mappings: ColumnMapping[] = headers.map(h => ({
        csvColumn: h,
        field: autoMapColumn(h),
      }));
      setColumnMappings(mappings);
      setImportStep('map');
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  }, [handleFileSelect]);

  const getMappedValue = (row: CsvRow, field: string): string => {
    const mapping = columnMappings.find(m => m.field === field);
    if (!mapping) return '';
    return row[mapping.csvColumn] || '';
  };

  const previewContacts = csvRows.slice(0, 5).map(row => ({
    name: getMappedValue(row, 'name'),
    phone: getMappedValue(row, 'phone'),
    email: getMappedValue(row, 'email'),
    company: getMappedValue(row, 'company'),
    tags: getMappedValue(row, 'tags'),
  }));

  const canProceedFromMap = columnMappings.some(m => m.field === 'name') &&
    columnMappings.some(m => m.field === 'phone');

  const handleStartImport = () => {
    const contactsToImport = csvRows
      .map(row => ({
        name: getMappedValue(row, 'name'),
        phone: getMappedValue(row, 'phone'),
        email: getMappedValue(row, 'email') || undefined,
        company: getMappedValue(row, 'company') || undefined,
        tags: getMappedValue(row, 'tags')
          ? getMappedValue(row, 'tags').split(',').map(t => t.trim()).filter(Boolean)
          : [],
      }))
      .filter(c => c.name && c.phone);
    bulkImportMutation.mutate(contactsToImport);
  };

  const resetImport = () => {
    setImportStep('upload');
    setCsvHeaders([]);
    setCsvRows([]);
    setColumnMappings([]);
    setImportError(null);
    setImportResults(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const closeImport = () => {
    setShowImport(false);
    resetImport();
  };

  // ── Form Handlers ─────────────────────────────────────

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

  const toggleSelect = (id: string) =>
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const startEdit = (contact: Contact) => {
    setEditing(contact);
    setEditForm({ name: contact.name || '', email: contact.email || '', company: contact.company || '' });
    setEditError(null);
  };

  const handleEditSubmit = () => {
    if (!editing || !editForm.name) return;
    setEditError(null);
    updateMutation.mutate({
      id: editing.id,
      data: {
        name: editForm.name,
        email: editForm.email || undefined,
        company: editForm.company || undefined,
      },
    });
  };

  const handleExport = () => {
    const headers = ['Name', 'Phone', 'Email', 'Company', 'Tags', 'Created At'];
    const csvRows = [headers.join(',')];
    filtered.forEach(c => {
      csvRows.push([
        `"${c.name || ''}"`,
        `"${c.phone || ''}"`,
        `"${c.email || ''}"`,
        `"${c.company || ''}"`,
        `"${Array.isArray(c.tags) ? c.tags.join(';') : ''}"`,
        `"${c.createdAt || ''}"`,
      ].join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contacts_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tagColors: Record<string, string> = {
    lead: 'bg-wa-green/20 text-wa-green',
    customer: 'bg-apple-green/20 text-apple-green',
    enterprise: 'bg-apple-purple/20 text-apple-purple',
    priority: 'bg-apple-orange/20 text-apple-orange',
    marketing: 'bg-apple-red/20 text-apple-red',
  };

  // ─────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-ios-dark">Contacts</h1>
          <p className="text-ios-secondary mt-1">{contacts.length} total contacts</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleExport} className="btn-apple btn-apple-outline flex items-center gap-2 text-sm">
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={() => { resetImport(); setShowImport(true); }}
            className="btn-apple btn-apple-outline flex items-center gap-2 text-sm"
          >
            <Upload className="w-4 h-4" />
            Import CSV
          </button>
          {selected.length > 0 && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleteMutation.isPending}
              className="btn-apple text-apple-red hover:bg-apple-red/10 flex items-center gap-2 text-sm"
            >
              <Trash2 className="w-4 h-4" />
              Delete ({selected.length})
            </button>
          )}
          <button
            onClick={() => setShowAdd(true)}
            className="btn-apple btn-wa-green flex items-center gap-2"
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
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2">
              <X className="w-4 h-4 text-ios-muted" />
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card-apple overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-ios-muted animate-pulse">Loading contacts...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-ios-gray">
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      onChange={(e) => setSelected(e.target.checked ? filtered.map(c => c.id) : [])}
                      checked={selected.length === filtered.length && filtered.length > 0}
                      className="w-4 h-4 rounded"
                    />
                  </th>
                  {['Name', 'Phone', 'Email', 'Company', 'Tags', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-ios-secondary font-medium text-xs whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filtered.map((contact) => (
                  <tr key={contact.id} className="hover:bg-ios-gray/30 transition">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selected.includes(contact.id)}
                        onChange={() => toggleSelect(contact.id)}
                        className="w-4 h-4 rounded"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-wa-green/20 text-wa-green rounded-full flex items-center justify-center font-semibold text-sm flex-shrink-0">
                          {(contact.name || contact.phone || '?').charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-ios-dark">{contact.name || contact.phone || '—'}</p>
                          {contact.lastMessage && <p className="text-xs text-ios-muted">{contact.lastMessage}</p>}
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
                        contact.status === 'blocked' ? 'bg-apple-red/20 text-apple-red' :
                        'bg-ios-gray text-ios-muted'
                      }`}>
                        {contact.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => startEdit(contact)}
                        className="p-1.5 hover:bg-ios-gray rounded-apple-lg text-ios-muted"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="p-16 text-center text-ios-muted">
                <User className="w-12 h-12 mx-auto mb-3 opacity-40" />
                <p className="font-medium">No contacts found</p>
                <p className="text-sm mt-1">{search ? 'Try a different search term' : 'Add or import your first contact'}</p>
                {!search && (
                  <div className="flex items-center justify-center gap-3 mt-4">
                    <button onClick={() => setShowAdd(true)} className="btn-apple btn-wa-green text-sm">Add Contact</button>
                    <button onClick={() => setShowImport(true)} className="btn-apple btn-apple-outline text-sm">Import CSV</button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── ADD CONTACT MODAL ─────────────────────────── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-apple-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-ios-dark">Add New Contact</h3>
              <button onClick={() => { setShowAdd(false); setCreateError(null); }} className="p-1 hover:bg-ios-gray rounded-apple-lg">
                <X className="w-5 h-5 text-ios-muted" />
              </button>
            </div>
            <div className="space-y-4">
              {[
                { label: 'Name *', key: 'name', type: 'text', placeholder: 'Full name' },
                { label: 'Phone *', key: 'phone', type: 'tel', placeholder: '+1 234 567 8900' },
                { label: 'Email', key: 'email', type: 'email', placeholder: 'email@example.com' },
                { label: 'Company', key: 'company', type: 'text', placeholder: 'Company name' },
                { label: 'Tags (comma-separated)', key: 'tags', type: 'text', placeholder: 'lead, customer, Q3' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-ios-secondary mb-1">{label}</label>
                  <input
                    type={type}
                    value={form[key as keyof typeof form]}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                    placeholder={placeholder}
                    className="input-apple w-full"
                    autoFocus={key === 'name'}
                  />
                </div>
              ))}
              {createError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-apple-lg text-sm text-apple-red flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {createError}
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || !form.name || !form.phone}
                  className="flex-1 btn-apple btn-wa-green disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Adding...' : 'Add Contact'}
                </button>
                <button onClick={() => { setShowAdd(false); setCreateError(null); }} className="flex-1 btn-apple btn-apple-outline">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT CONTACT MODAL ────────────────────────── */}
      {editing && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-apple-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-ios-dark">Edit Contact</h3>
              <button onClick={() => { setEditing(null); setEditError(null); }} className="p-1 hover:bg-ios-gray rounded-apple-lg">
                <X className="w-5 h-5 text-ios-muted" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-ios-secondary mb-1">Phone</label>
                <input type="tel" value={editing.phone} disabled className="input-apple w-full opacity-60 cursor-not-allowed" />
                <p className="text-xs text-ios-muted mt-1">Phone number can't be changed once a contact is created.</p>
              </div>
              {[
                { label: 'Name *', key: 'name', type: 'text', placeholder: 'Full name' },
                { label: 'Email', key: 'email', type: 'email', placeholder: 'email@example.com' },
                { label: 'Company', key: 'company', type: 'text', placeholder: 'Company name' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-ios-secondary mb-1">{label}</label>
                  <input
                    type={type}
                    value={editForm[key as keyof typeof editForm]}
                    onChange={(e) => setEditForm({ ...editForm, [key]: e.target.value })}
                    placeholder={placeholder}
                    className="input-apple w-full"
                    autoFocus={key === 'name'}
                  />
                </div>
              ))}
              {editError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-apple-lg text-sm text-apple-red flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {editError}
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleEditSubmit}
                  disabled={updateMutation.isPending || !editForm.name}
                  className="flex-1 btn-apple btn-wa-green disabled:opacity-50"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={() => { setEditing(null); setEditError(null); }} className="flex-1 btn-apple btn-apple-outline">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM MODAL ──────────────────────── */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-apple-xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-apple-red/10 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-apple-red" />
              </div>
              <h3 className="text-lg font-semibold text-ios-dark">Delete {selected.length} contact{selected.length === 1 ? '' : 's'}?</h3>
            </div>
            <p className="text-sm text-ios-secondary mb-5">This action cannot be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  deleteMutation.mutate(selected);
                  setShowDeleteConfirm(false);
                }}
                disabled={deleteMutation.isPending}
                className="flex-1 btn-apple bg-apple-red text-white hover:bg-apple-red/90 disabled:opacity-50"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 btn-apple btn-apple-outline">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CSV IMPORT MODAL ──────────────────────────── */}
      {showImport && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-apple-xl w-full max-w-2xl shadow-apple-xl overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-black/5">
              <div>
                <h3 className="font-semibold text-ios-dark">Import Contacts from CSV</h3>
                {/* Progress */}
                <div className="flex items-center gap-2 mt-1.5">
                  {(['upload', 'map', 'preview', 'done'] as ImportStep[]).map((step, i) => (
                    <div key={step} className="flex items-center gap-1.5">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        importStep === step ? 'bg-wa-green text-white' :
                        ['upload', 'map', 'preview', 'done'].indexOf(importStep) > i ? 'bg-apple-green text-white' :
                        'bg-ios-gray text-ios-muted'
                      }`}>
                        {['upload', 'map', 'preview', 'done'].indexOf(importStep) > i ? '✓' : i + 1}
                      </div>
                      <span className={`text-[10px] font-medium capitalize ${importStep === step ? 'text-wa-green' : 'text-ios-muted'}`}>
                        {step === 'upload' ? 'Upload' : step === 'map' ? 'Map' : step === 'preview' ? 'Preview' : 'Done'}
                      </span>
                      {i < 3 && <ChevronRight className="w-3 h-3 text-ios-muted" />}
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={closeImport} className="p-1 hover:bg-ios-gray rounded-apple-lg">
                <X className="w-5 h-5 text-ios-muted" />
              </button>
            </div>

            <div className="p-6">
              {/* STEP 1: Upload */}
              {importStep === 'upload' && (
                <div>
                  <div
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-apple-xl p-12 text-center cursor-pointer transition ${
                      dragOver ? 'border-wa-green bg-wa-green/5' : 'border-black/15 hover:border-wa-green/50 hover:bg-ios-gray/30'
                    }`}
                  >
                    <Upload className={`w-10 h-10 mx-auto mb-3 ${dragOver ? 'text-wa-green' : 'text-ios-muted'}`} />
                    <p className="font-semibold text-ios-dark">Drop your CSV file here</p>
                    <p className="text-sm text-ios-muted mt-1">or click to browse</p>
                    <p className="text-xs text-ios-muted mt-3">
                      Supported format: .csv with headers (name, phone, email, company, tags)
                    </p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="hidden"
                      onChange={(e) => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }}
                    />
                  </div>
                  {importError && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-apple-lg flex items-center gap-2 text-sm text-apple-red">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {importError}
                    </div>
                  )}
                  {/* Sample CSV download */}
                  <div className="mt-4 p-3 bg-ios-gray rounded-apple-lg flex items-center gap-3">
                    <FileText className="w-5 h-5 text-ios-muted flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs font-medium text-ios-dark">Need a template?</p>
                      <p className="text-xs text-ios-muted">Download a sample CSV to get started</p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const csv = 'Name,Phone,Email,Company,Tags\nJohn Smith,+1234567890,john@example.com,Acme Corp,"lead,customer"\nSarah Lee,+9876543210,sarah@example.com,,VIP';
                        const blob = new Blob([csv], { type: 'text/csv' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'contacts_template.csv';
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="flex items-center gap-1 text-xs text-wa-green font-medium hover:underline"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: Column Mapping */}
              {importStep === 'map' && (
                <div>
                  <p className="text-sm text-ios-secondary mb-4">
                    Map your CSV columns to contact fields. <span className="font-medium text-ios-dark">Name</span> and <span className="font-medium text-ios-dark">Phone</span> are required.
                  </p>
                  <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                    {columnMappings.map((mapping, i) => (
                      <div key={mapping.csvColumn} className="flex items-center gap-3 p-3 bg-ios-gray rounded-apple-lg">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-ios-dark truncate">{mapping.csvColumn}</p>
                          <p className="text-xs text-ios-muted truncate">
                            e.g. &ldquo;{csvRows[0]?.[mapping.csvColumn] || '—'}&rdquo;
                          </p>
                        </div>
                        <ArrowRight className="w-4 h-4 text-ios-muted flex-shrink-0" />
                        <select
                          value={mapping.field}
                          onChange={(e) => {
                            const updated = [...columnMappings];
                            updated[i] = { ...mapping, field: e.target.value };
                            setColumnMappings(updated);
                          }}
                          className="input-apple text-sm py-1.5 w-44"
                        >
                          {CONTACT_FIELDS.map(f => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                  {!canProceedFromMap && (
                    <p className="mt-3 text-xs text-apple-orange flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      Please map at least a Name column and a Phone column to continue.
                    </p>
                  )}
                  <div className="flex gap-2 mt-5">
                    <button onClick={() => setImportStep('upload')} className="flex-1 btn-apple btn-apple-outline">
                      Back
                    </button>
                    <button
                      onClick={() => setImportStep('preview')}
                      disabled={!canProceedFromMap}
                      className="flex-1 btn-apple btn-wa-green disabled:opacity-50"
                    >
                      Preview ({csvRows.length} rows)
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: Preview */}
              {importStep === 'preview' && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-ios-secondary">
                      Preview of first {Math.min(5, csvRows.length)} of <strong>{csvRows.length}</strong> contacts to be imported.
                    </p>
                  </div>
                  <div className="overflow-x-auto rounded-apple-lg border border-black/8 mb-4">
                    <table className="w-full text-xs">
                      <thead className="bg-ios-gray">
                        <tr>
                          {['Name', 'Phone', 'Email', 'Company', 'Tags'].map(h => (
                            <th key={h} className="text-left px-3 py-2 font-medium text-ios-secondary">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {previewContacts.map((c, i) => (
                          <tr key={i} className={!c.name || !c.phone ? 'bg-red-50' : 'bg-white'}>
                            <td className="px-3 py-2 text-ios-dark font-medium">
                              {c.name || <span className="text-apple-red">Missing</span>}
                            </td>
                            <td className="px-3 py-2 text-ios-secondary font-mono">
                              {c.phone || <span className="text-apple-red">Missing</span>}
                            </td>
                            <td className="px-3 py-2 text-ios-muted">{c.email || '—'}</td>
                            <td className="px-3 py-2 text-ios-muted">{c.company || '—'}</td>
                            <td className="px-3 py-2 text-ios-muted">{c.tags || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {csvRows.length > 5 && (
                    <p className="text-xs text-ios-muted mb-4 text-center">… and {csvRows.length - 5} more rows</p>
                  )}
                  {importError && (
                    <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-apple-lg flex items-center gap-2 text-sm text-apple-red">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      {importError}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => setImportStep('map')} className="flex-1 btn-apple btn-apple-outline">
                      Back
                    </button>
                    <button
                      onClick={handleStartImport}
                      disabled={bulkImportMutation.isPending}
                      className="flex-1 btn-apple btn-wa-green disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {bulkImportMutation.isPending ? (
                        <><RefreshCw className="w-4 h-4 animate-spin" /> Importing...</>
                      ) : (
                        <>Import {csvRows.length} Contacts</>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 4: Done */}
              {importStep === 'done' && importResults && (
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-apple-green/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-apple-green" />
                  </div>
                  <h4 className="font-semibold text-ios-dark text-lg">Import Complete!</h4>
                  <div className="flex items-center justify-center gap-6 mt-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-apple-green">{importResults.created}</p>
                      <p className="text-xs text-ios-muted">Created</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-ios-muted">{importResults.skipped}</p>
                      <p className="text-xs text-ios-muted">Skipped (duplicates)</p>
                    </div>
                    {importResults.errors.length > 0 && (
                      <div className="text-center">
                        <p className="text-2xl font-bold text-apple-red">{importResults.errors.length}</p>
                        <p className="text-xs text-ios-muted">Errors</p>
                      </div>
                    )}
                  </div>
                  {importResults.errors.length > 0 && (
                    <div className="mt-4 text-left bg-red-50 rounded-apple-lg p-3 max-h-28 overflow-y-auto">
                      {importResults.errors.map((err, i) => (
                        <p key={i} className="text-xs text-apple-red">{err}</p>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2 mt-6">
                    <button onClick={resetImport} className="flex-1 btn-apple btn-apple-outline flex items-center justify-center gap-2">
                      <Upload className="w-4 h-4" />
                      Import More
                    </button>
                    <button onClick={closeImport} className="flex-1 btn-apple btn-wa-green">
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
