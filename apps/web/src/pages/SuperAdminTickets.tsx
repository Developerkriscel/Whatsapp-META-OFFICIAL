import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Search, MessageSquare, Clock, User, X, CheckCircle } from 'lucide-react';

interface Ticket {
  id: string;
  subject: string;
  description: string;
  priority: string;
  status: string;
  category: string | null;
  tenant: { id: string; name: string };
  assignedTo: { id: string; name: string } | null;
  createdAt: string;
  updatedAt: string;
}

const statusColors: Record<string, string> = {
  OPEN: 'bg-red-500/20 text-red-500',
  IN_PROGRESS: 'bg-apple-orange/20 text-apple-orange',
  RESOLVED: 'bg-wa-green/20 text-wa-green',
  CLOSED: 'bg-ios-gray text-ios-secondary',
};

const priorityColors: Record<string, string> = {
  LOW: 'text-ios-secondary',
  MEDIUM: 'text-wa-green',
  HIGH: 'text-apple-orange',
  CRITICAL: 'text-red-500',
};

const priorityBg: Record<string, string> = {
  LOW: 'bg-ios-gray',
  MEDIUM: 'bg-wa-green/20',
  HIGH: 'bg-apple-orange/20',
  CRITICAL: 'bg-red-500/20',
};

export default function SuperAdminTickets() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useQuery({
    queryKey: ['superadmin', 'tickets', page, statusFilter, debouncedSearch],
    queryFn: async () => {
      const params: any = { page, limit: 20 };
      if (statusFilter !== 'all') params.status = statusFilter;
      if (debouncedSearch) params.search = debouncedSearch;
      const response = await api.get('/superadmin/tickets', { params });
      return response.data;
    },
  });

  const updateTicket = useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: string }) => {
      await api.patch(`/superadmin/tickets/${ticketId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['superadmin', 'tickets'] });
      setSelectedTicket(null);
    },
  });

  const tickets = data?.data || [];
  const meta = data?.meta || { total: 0, page: 1, totalPages: 1 };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-ios-dark">Support Tickets</h1>
        <p className="text-ios-secondary mt-1">
          View and manage support tickets from all tenants
        </p>
      </div>

      {/* Filters */}
      <div className="card-apple p-4 flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-ios-muted" />
          <input
            type="text"
            placeholder="Search tickets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-apple w-full pl-10"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-apple"
        >
          <option value="all">All Status</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
      </div>

      {/* Tickets List */}
      <div className="space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card-apple p-6 animate-pulse">
              <div className="h-4 bg-ios-gray rounded w-1/3 mb-4" />
              <div className="h-3 bg-ios-gray rounded w-2/3" />
            </div>
          ))
        ) : tickets.length === 0 ? (
          <div className="card-apple p-12 text-center">
            <MessageSquare className="w-12 h-12 text-ios-muted mx-auto mb-4" />
            <p className="text-ios-secondary">No tickets found</p>
          </div>
        ) : (
          tickets.map((ticket: Ticket) => (
            <div
              key={ticket.id}
              className="card-apple p-6 hover:shadow-apple-hover transition-all cursor-pointer"
              onClick={() => setSelectedTicket(ticket)}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2 py-1 text-xs rounded-apple-full ${priorityBg[ticket.priority]}`}>
                      <span className={`font-medium ${priorityColors[ticket.priority]}`}>{ticket.priority}</span>
                    </span>
                    <span className={`px-2 py-1 text-xs rounded-apple-full ${statusColors[ticket.status]}`}>
                      {ticket.status.replace('_', ' ')}
                    </span>
                    {ticket.category && (
                      <span className="px-2 py-1 text-xs rounded-apple-full bg-ios-gray text-ios-secondary">{ticket.category}</span>
                    )}
                  </div>
                  <h3 className="font-semibold text-ios-dark mb-1">{ticket.subject}</h3>
                  <p className="text-sm text-ios-secondary line-clamp-2 mb-3">{ticket.description}</p>
                  <div className="flex items-center gap-4 text-sm text-ios-muted">
                    <span className="flex items-center gap-1">
                      <User className="w-4 h-4" />
                      {ticket.tenant.name}
                    </span>
                    {ticket.assignedTo && (
                      <span className="flex items-center gap-1">Assigned to {ticket.assignedTo.name}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {new Date(ticket.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <button className="btn-apple btn-apple-outline text-sm">View</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-ios-secondary">
          Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, meta.total)} of {meta.total} tickets
        </p>
        <div className="flex gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-apple btn-apple-outline text-sm py-1.5 disabled:opacity-50">Previous</button>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= meta.totalPages} className="btn-apple btn-apple-outline text-sm py-1.5 disabled:opacity-50">Next</button>
        </div>
      </div>

      {/* Ticket Detail Modal */}
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
          onUpdate={(ticketId, status) => updateTicket.mutate({ ticketId, status })}
          isUpdating={updateTicket.isPending}
        />
      )}
    </div>
  );
}

function TicketDetailModal({ ticket, onClose, onUpdate, isUpdating }: {
  ticket: Ticket;
  onClose: () => void;
  onUpdate: (ticketId: string, status: string) => void;
  isUpdating: boolean;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xl flex items-center justify-center z-50">
      <div className="glass-card rounded-apple-xl p-6 w-[600px] max-h-[80vh] overflow-y-auto shadow-apple-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className={`px-2 py-1 text-xs rounded-apple-full ${priorityBg[ticket.priority]}`}>
              <span className={`font-medium ${priorityColors[ticket.priority]}`}>{ticket.priority}</span>
            </span>
            <span className={`px-2 py-1 text-xs rounded-apple-full ${statusColors[ticket.status]}`}>
              {ticket.status.replace('_', ' ')}
            </span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-ios-gray rounded-apple-lg"><X className="w-5 h-5" /></button>
        </div>

        <h2 className="text-xl font-bold text-ios-dark mb-2">{ticket.subject}</h2>
        <p className="text-sm text-ios-secondary mb-4">
          From {ticket.tenant.name} • {new Date(ticket.createdAt).toLocaleString()}
        </p>

        <div className="p-4 bg-ios-gray rounded-apple-lg mb-6">
          <p className="text-ios-secondary whitespace-pre-wrap">{ticket.description}</p>
        </div>

        <div className="border-t border-black/5 pt-4">
          <h3 className="font-semibold text-ios-dark mb-3">Update Status</h3>
          <div className="flex gap-2 flex-wrap">
            {['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'].map(status => (
              <button
                key={status}
                onClick={() => onUpdate(ticket.id, status)}
                disabled={isUpdating || ticket.status === status}
                className={`px-4 py-2 rounded-apple-lg border text-sm transition ${
                  ticket.status === status
                    ? 'bg-ios-gray text-ios-muted cursor-not-allowed'
                    : 'hover:bg-ios-gray'
                }`}
              >
                {status === 'IN_PROGRESS' ? 'In Progress' : status.charAt(0) + status.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
