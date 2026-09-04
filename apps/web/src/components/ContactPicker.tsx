/**
 * ContactPicker — choose exactly who a campaign goes to.
 *
 * Built around one constraint: Meta caps how many unique people a number may
 * message per rolling 24 hours (the messaging tier). A tenant on TIER_250 with
 * 370 contacts cannot send to everyone, so the interesting question is not
 * "all or nothing" but *which* 250 — and the answer usually comes from sorting
 * and filtering, then taking the top N.
 *
 * Selection is a Set of ids held above the table, so it survives paging,
 * searching and re-sorting. Anything that selects rows the user cannot
 * currently see resolves server-side through /contacts/select-ids, which shares
 * its filter builder with the list endpoint so the two can never disagree.
 */
import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Check, X, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown,
  Zap, AlertTriangle, Users, Filter, CheckSquare, Square, RotateCcw,
} from 'lucide-react';
import { api } from '../api/client';

export interface PickerContact {
  id: string;
  name: string | null;
  phone: string;
  email?: string | null;
  company?: string | null;
  country?: string | null;
  consentStatus: string;
  tags: string[];
  createdAt: string;
}

type SortField = 'name' | 'phone' | 'country' | 'consentStatus' | 'createdAt' | 'company' | 'email';

interface Props {
  selectedIds: Set<string>;
  onChange: (ids: Set<string>) => void;
  /** Chosen phone number, when the wizard already knows it. Drives tier headroom. */
  phoneNumberId?: string;
}

const PAGE_SIZE = 25;

const CONSENT_STYLES: Record<string, string> = {
  OPTED_IN: 'bg-wa-green/15 text-wa-green',
  OPTED_OUT: 'bg-red-100 text-red-600',
  UNKNOWN: 'bg-ios-gray text-ios-muted',
};

export default function ContactPicker({ selectedIds, onChange, phoneNumberId }: Props) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sort, setSort] = useState<SortField>('createdAt');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [consentStatus, setConsentStatus] = useState('');
  const [country, setCountry] = useState('');
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Typing in the search box should not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const filterParams = useMemo(() => ({
    ...(debouncedSearch ? { search: debouncedSearch } : {}),
    ...(consentStatus ? { consentStatus } : {}),
    ...(country ? { country } : {}),
    ...(tag ? { tag } : {}),
    sort,
    order,
  }), [debouncedSearch, consentStatus, country, tag, sort, order]);

  const { data, isLoading } = useQuery({
    queryKey: ['picker-contacts', filterParams, page],
    queryFn: async () => {
      const res = await api.get('/contacts', { params: { ...filterParams, page, limit: PAGE_SIZE } });
      return res.data;
    },
  });

  const { data: options } = useQuery({
    queryKey: ['contact-filter-options'],
    queryFn: async () => (await api.get('/contacts/filter-options')).data,
  });

  const { data: tierData } = useQuery({
    queryKey: ['tier-capacity', phoneNumberId],
    queryFn: async () => {
      const res = await api.get('/campaigns/tier-capacity', {
        params: phoneNumberId ? { phoneNumberId } : {},
      });
      return res.data;
    },
  });

  const contacts: PickerContact[] = data?.data || [];
  const total: number = data?.meta?.total ?? 0;
  const totalPages: number = data?.meta?.totalPages ?? 1;
  const tier = tierData?.data;
  const tierRemaining: number | null = tier?.known ? tier.remaining : null;

  const filtersActive = !!(debouncedSearch || consentStatus || country || tag);

  // --- selection helpers ------------------------------------------------

  const pageIds = contacts.map((c) => c.id);
  const pageAllSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const pageSomeSelected = pageIds.some((id) => selectedIds.has(id));

  const mutate = (fn: (next: Set<string>) => void) => {
    const next = new Set(selectedIds);
    fn(next);
    onChange(next);
  };

  const toggleOne = (id: string) => mutate((n) => { n.has(id) ? n.delete(id) : n.add(id); });
  const togglePage = () => mutate((n) => {
    if (pageAllSelected) pageIds.forEach((id) => n.delete(id));
    else pageIds.forEach((id) => n.add(id));
  });
  const invertPage = () => mutate((n) => {
    pageIds.forEach((id) => { n.has(id) ? n.delete(id) : n.add(id); });
  });

  /** Pull ids from the server for rows outside the current page. */
  const fetchIds = async (take?: number): Promise<string[]> => {
    const res = await api.get('/contacts/select-ids', {
      params: { ...filterParams, ...(take ? { take } : {}) },
    });
    const d = res.data?.data;
    if (d?.truncated) {
      setNote(`Selected the first ${d.returned.toLocaleString()} of ${d.total.toLocaleString()} — that is the maximum a single campaign can target.`);
    }
    return d?.ids || [];
  };

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true); setNote(null);
    try { await fn(); } catch { setNote('Could not update the selection. Please try again.'); }
    finally { setBusy(false); }
  };

  const selectAllMatching = () => withBusy(async () => {
    const ids = await fetchIds();
    mutate((n) => ids.forEach((id) => n.add(id)));
  });

  /** The headline action: take the first N in the current order. */
  const selectFirstN = (n: number) => withBusy(async () => {
    const ids = await fetchIds(n);
    // Replaces rather than adds — "the first 250" means exactly those.
    onChange(new Set(ids));
  });

  const clearAll = () => { onChange(new Set()); setNote(null); };

  const dropOptedOut = () => withBusy(async () => {
    const res = await api.get('/contacts/select-ids', {
      params: { ...filterParams, consentStatus: 'OPTED_OUT' },
    });
    const optedOut: string[] = res.data?.data?.ids || [];
    const removed = optedOut.filter((id) => selectedIds.has(id)).length;
    mutate((n) => optedOut.forEach((id) => n.delete(id)));
    setNote(removed > 0
      ? `Removed ${removed} opted-out contact${removed === 1 ? '' : 's'} from the selection.`
      : 'No opted-out contacts were selected.');
  });

  const setSortField = (field: SortField) => {
    if (sort === field) setOrder(order === 'asc' ? 'desc' : 'asc');
    else { setSort(field); setOrder('asc'); }
    setPage(1);
  };

  const resetFilters = () => {
    setSearch(''); setDebouncedSearch(''); setConsentStatus('');
    setCountry(''); setTag(''); setPage(1);
  };

  const count = selectedIds.size;
  const overTier = tierRemaining !== null && count > tierRemaining;

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sort !== field) return <ArrowUpDown className="w-3 h-3 opacity-30" />;
    return order === 'asc' ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />;
  };

  const Th = ({ field, children, className = '' }: { field: SortField; children: React.ReactNode; className?: string }) => (
    <th className={`px-3 py-2 text-left font-medium ${className}`}>
      <button
        onClick={() => setSortField(field)}
        className="inline-flex items-center gap-1 hover:text-wa-green transition"
      >
        {children}<SortIcon field={field} />
      </button>
    </th>
  );

  return (
    <div className="border border-black/10 rounded-apple-xl overflow-hidden">
      {/* ---- toolbar ---- */}
      <div className="p-3 border-b border-black/10 bg-ios-gray/40 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ios-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, phone, email or company"
              className="input-apple w-full pl-9 py-2 text-sm"
            />
          </div>

          <select
            value={consentStatus}
            onChange={(e) => { setConsentStatus(e.target.value); setPage(1); }}
            className="input-apple py-2 text-sm"
          >
            <option value="">Any consent</option>
            {(options?.data?.consentStatus || []).map((c: any) => (
              <option key={c.value} value={c.value}>{c.value.replace('_', ' ').toLowerCase()} ({c.count})</option>
            ))}
          </select>

          <select
            value={country}
            onChange={(e) => { setCountry(e.target.value); setPage(1); }}
            className="input-apple py-2 text-sm"
          >
            <option value="">Any country</option>
            {(options?.data?.countries || []).map((c: any) => (
              <option key={c.value} value={c.value}>{c.value} ({c.count})</option>
            ))}
          </select>

          {(options?.data?.tags || []).length > 0 && (
            <select
              value={tag}
              onChange={(e) => { setTag(e.target.value); setPage(1); }}
              className="input-apple py-2 text-sm"
            >
              <option value="">Any tag</option>
              {(options.data.tags as string[]).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}

          {filtersActive && (
            <button onClick={resetFilters} className="text-sm text-ios-muted hover:text-ios-dark inline-flex items-center gap-1 px-2 py-2">
              <RotateCcw className="w-3.5 h-3.5" /> Reset
            </button>
          )}
        </div>

        {/* ---- bulk + smart actions ---- */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-ios-muted inline-flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" />
            {total.toLocaleString()} match{total === 1 ? 'es' : ''}
          </span>

          <span className="w-px h-4 bg-black/10" />

          <button onClick={selectAllMatching} disabled={busy || total === 0}
            className="px-2.5 py-1 rounded-apple-lg bg-white border border-black/10 hover:border-wa-green/50 disabled:opacity-40">
            Select all {filtersActive ? 'matching' : ''} {total.toLocaleString()}
          </button>
          <button onClick={togglePage} disabled={contacts.length === 0}
            className="px-2.5 py-1 rounded-apple-lg bg-white border border-black/10 hover:border-wa-green/50 disabled:opacity-40">
            {pageAllSelected ? 'Deselect' : 'Select'} page
          </button>
          <button onClick={invertPage} disabled={contacts.length === 0}
            className="px-2.5 py-1 rounded-apple-lg bg-white border border-black/10 hover:border-wa-green/50 disabled:opacity-40">
            Invert page
          </button>
          <button onClick={clearAll} disabled={count === 0}
            className="px-2.5 py-1 rounded-apple-lg bg-white border border-black/10 hover:border-wa-green/50 disabled:opacity-40">
            Clear
          </button>

          <span className="w-px h-4 bg-black/10" />

          {/* The action that exists because of the tier cap. */}
          {tierRemaining !== null && tierRemaining > 0 && (
            <button onClick={() => selectFirstN(tierRemaining)} disabled={busy}
              className="px-2.5 py-1 rounded-apple-lg bg-wa-green text-white hover:opacity-90 inline-flex items-center gap-1 disabled:opacity-40">
              <Zap className="w-3.5 h-3.5" />
              Fill tier limit — first {tierRemaining.toLocaleString()}
            </button>
          )}
          <button onClick={dropOptedOut} disabled={busy || count === 0}
            className="px-2.5 py-1 rounded-apple-lg bg-white border border-black/10 hover:border-wa-green/50 disabled:opacity-40">
            Remove opted-out
          </button>
        </div>

        {note && <p className="text-xs text-ios-muted">{note}</p>}
      </div>

      {/* ---- table ---- */}
      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white border-b border-black/10 text-ios-muted z-10">
            <tr>
              <th className="px-3 py-2 w-10">
                <button onClick={togglePage} className="align-middle" aria-label="Select all rows on this page">
                  {pageAllSelected
                    ? <CheckSquare className="w-4 h-4 text-wa-green" />
                    : <Square className={`w-4 h-4 ${pageSomeSelected ? 'text-wa-green/50' : 'text-ios-muted'}`} />}
                </button>
              </th>
              <Th field="name">Name</Th>
              <Th field="phone">Phone</Th>
              <Th field="country">Country</Th>
              <th className="px-3 py-2 text-left font-medium">Tags</th>
              <Th field="consentStatus">Consent</Th>
              <Th field="createdAt">Added</Th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-ios-muted">Loading…</td></tr>
            )}
            {!isLoading && contacts.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-ios-muted">
                No contacts match these filters.
              </td></tr>
            )}
            {contacts.map((c) => {
              const on = selectedIds.has(c.id);
              const optedOut = c.consentStatus === 'OPTED_OUT';
              return (
                <tr
                  key={c.id}
                  onClick={() => toggleOne(c.id)}
                  className={`border-b border-black/5 cursor-pointer transition ${
                    on ? 'bg-wa-green/5' : 'hover:bg-ios-gray/40'
                  }`}
                >
                  <td className="px-3 py-2">
                    {on ? <CheckSquare className="w-4 h-4 text-wa-green" /> : <Square className="w-4 h-4 text-ios-muted" />}
                  </td>
                  <td className="px-3 py-2 text-ios-dark">{c.name || <span className="text-ios-muted">—</span>}</td>
                  <td className="px-3 py-2 font-mono text-xs tabular-nums">{c.phone}</td>
                  <td className="px-3 py-2">{c.country || <span className="text-ios-muted">—</span>}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {c.tags.slice(0, 2).map((t) => (
                        <span key={t} className="px-1.5 py-0.5 rounded-full bg-ios-gray text-xs text-ios-muted">{t}</span>
                      ))}
                      {c.tags.length > 2 && <span className="text-xs text-ios-muted">+{c.tags.length - 2}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${CONSENT_STYLES[c.consentStatus] || CONSENT_STYLES.UNKNOWN}`}>
                      {c.consentStatus.replace('_', ' ').toLowerCase()}
                    </span>
                    {optedOut && on && (
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500 inline ml-1" aria-label="Opted out but selected" />
                    )}
                  </td>
                  <td className="px-3 py-2 text-ios-muted text-xs tabular-nums">
                    {new Date(c.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---- footer: paging + running total ---- */}
      <div className="p-3 border-t border-black/10 bg-ios-gray/40 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
            className="p-1.5 rounded-apple-lg bg-white border border-black/10 disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-ios-muted tabular-nums">Page {page} of {totalPages || 1}</span>
          <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
            className="p-1.5 rounded-apple-lg bg-white border border-black/10 disabled:opacity-30">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-apple-lg ${
          overTier ? 'bg-red-50 text-red-600' : count > 0 ? 'bg-wa-green/10 text-wa-green' : 'text-ios-muted'
        }`}>
          {overTier ? <AlertTriangle className="w-4 h-4" /> : count > 0 ? <Check className="w-4 h-4" /> : <Users className="w-4 h-4" />}
          <span className="text-sm font-medium tabular-nums">
            {count.toLocaleString()} selected
            {tierRemaining !== null && ` · ${tierRemaining.toLocaleString()} allowed in the next 24h`}
          </span>
          {count > 0 && (
            <button onClick={clearAll} className="ml-1 opacity-60 hover:opacity-100" aria-label="Clear selection">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {overTier && (
        <div className="px-3 py-2 bg-red-50 border-t border-red-100 text-sm text-red-600 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {count.toLocaleString()} selected but only {tierRemaining!.toLocaleString()} can be messaged in the
            next 24 hours on this number. Meta will reject the rest — use
            <button onClick={() => selectFirstN(tierRemaining!)} className="underline font-medium mx-1">
              fill tier limit
            </button>
            to trim to what will actually send.
          </span>
        </div>
      )}
    </div>
  );
}
