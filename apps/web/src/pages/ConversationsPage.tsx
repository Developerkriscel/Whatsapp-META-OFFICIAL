/**
 * Conversations Page
 * Full inbox with message thread, contact info sidebar, agent assignment,
 * bot toggle, close conversation, internal notes.
 */

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, teamsApi } from '../api/client';
import {
  Search, Send, X, Check, RefreshCw, ChevronDown,
  UserPlus, Bot, CircleOff, CheckCircle, StickyNote,
  MessageSquare, Phone, Mail, Tag, Calendar, User,
  AlertCircle, Info,
} from 'lucide-react';
import { useToast } from '../components/Toast';

// ─────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────

interface Message {
  id: string;
  content: string;
  direction: 'inbound' | 'outbound';
  status: 'sent' | 'delivered' | 'read' | 'failed';
  errorMessage?: string | null;
  timestamp: string;
  isNote?: boolean;
  authorName?: string;
}

interface ConvContact {
  id?: string;
  name: string;
  phone: string;
  email?: string;
  tags?: string[];
}

interface AssignedUser {
  id: string;
  name: string;
  email?: string;
}

interface AssignedTeam {
  id: string;
  name: string;
}

interface Conversation {
  id: string;
  contactId?: string;
  phoneNumberId?: string;
  contact: ConvContact;
  lastMessage: string;
  lastTime: string;
  unread: number;
  status: 'OPEN' | 'CLOSED' | 'PENDING_AGENT' | 'ARCHIVED';
  isBotActive?: boolean;
  assignedToId?: string;
  assignedTeamId?: string;
  assignedTo?: AssignedUser;
  assignedTeam?: AssignedTeam;
  createdAt?: string;
  messages: Message[];
}

type SidebarTab = 'info' | 'notes';
type FilterType = 'open' | 'all' | 'closed' | 'pending' | 'mine' | 'bot';

// ─────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────

export default function ConversationsPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState<FilterType>('open');
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('info');
  const [noteText, setNoteText] = useState('');
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [chatTab, setChatTab] = useState<'messages' | 'notes'>('messages');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── Queries ──────────────────────────────────────────

  const { data: convData, isLoading } = useQuery({
    queryKey: ['conversations', filter, search],
    queryFn: async () => {
      const response = await api.get('/conversations', {
        params: { filter, search: search || undefined, limit: 50 },
      });
      return response.data;
    },
    refetchInterval: 10000,
  });

  const { data: activeConvData } = useQuery({
    queryKey: ['conversation', selected?.id],
    queryFn: async () => {
      if (!selected?.id) return null;
      const response = await api.get(`/conversations/${selected.id}`);
      return response.data;
    },
    enabled: !!selected?.id,
    refetchInterval: 4000,
  });

  const { data: teamsData } = useQuery({
    queryKey: ['teams-list'],
    queryFn: async () => {
      const r = await teamsApi.list();
      return r.data?.data || [];
    },
  });

  const { data: agentsData } = useQuery({
    queryKey: ['agents-list'],
    queryFn: async () => {
      const r = await teamsApi.listAgents();
      return r.data?.data || [];
    },
  });

  // ── Derived data ─────────────────────────────────────

  const conversations: Conversation[] = (convData?.data || []).map((conv: any) => ({
    id: conv.id,
    contactId: conv.contactId,
    phoneNumberId: conv.phoneNumberId,
    contact: {
      id: conv.contact?.id,
      name: conv.contact?.name || conv.contact?.phone || 'Unknown',
      phone: conv.contact?.phone || '',
      email: conv.contact?.email,
      tags: conv.contact?.tags?.map((t: any) => typeof t === 'string' ? t : t.name) || [],
    },
    lastMessage: conv.lastMessage?.body || 'No messages yet',
    lastTime: conv.lastMessageAt
      ? new Date(conv.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '',
    unread: conv._count?.messages || 0,
    status: conv.status || 'OPEN',
    isBotActive: conv.isBotActive ?? false,
    assignedToId: conv.assignedToId,
    assignedTeamId: conv.assignedTeamId,
    assignedTo: conv.assignedTo,
    assignedTeam: conv.assignedTeam,
    createdAt: conv.createdAt,
    messages: [],
  }));

  // Active conversation from detail query
  const activeConv: any = activeConvData?.data;

  // Merge selected with fresh data from detail query
  const selectedFull: Conversation | null = selected
    ? {
        ...selected,
        ...(activeConv
          ? {
              isBotActive: activeConv.isBotActive,
              status: activeConv.status,
              assignedTo: activeConv.assignedTo,
              assignedTeam: activeConv.assignedTeam,
              contact: {
                ...selected.contact,
                email: activeConv.contact?.email,
                tags: activeConv.contact?.tags?.map((t: any) =>
                  typeof t === 'string' ? t : t.name
                ) || [],
              },
            }
          : {}),
      }
    : null;

  const activeMessages: Message[] = (activeConv?.messages || []).map((msg: any) => ({
    id: msg.id,
    content: msg.body || '',
    direction: msg.direction === 'INCOMING' ? 'inbound' : 'outbound',
    status: msg.status?.toLowerCase() || 'sent',
    errorMessage: msg.errorMessage,
    timestamp: msg.createdAt
      ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '',
    isNote: false,
  }));

  const activeNotes: { id: string; content: string; author: string; timestamp: string }[] =
    (activeConv?.notes || []).map((note: any) => ({
      id: note.id,
      content: note.content,
      author: note.author?.name || 'You',
      timestamp: note.createdAt ? new Date(note.createdAt).toLocaleString() : '',
    }));

  // Scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length]);

  // WhatsApp's 24-hour customer service window: free-form replies are only
  // allowed within 24h of the contact's last inbound message. Outside that,
  // Meta rejects anything but an approved template.
  const lastInboundAt: string | null = activeConv?.lastInboundAt || null;
  const windowOpen = lastInboundAt
    ? Date.now() - new Date(lastInboundAt).getTime() < 24 * 60 * 60 * 1000
    : false;
  const windowClosesAt = lastInboundAt
    ? new Date(new Date(lastInboundAt).getTime() + 24 * 60 * 60 * 1000)
    : null;

  // ── Mutations ─────────────────────────────────────────

  const sendMutation = useMutation({
    mutationFn: async (payload: any) => {
      const response = await api.post('/messages/send', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (selected?.id) queryClient.invalidateQueries({ queryKey: ['conversation', selected.id] });
      setMessage('');
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || 'Failed to send message';
      toast.error(msg);
    },
  });

  const updateConvMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: any }) => {
      const response = await api.patch(`/conversations/${id}`, patch);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (selected?.id) queryClient.invalidateQueries({ queryKey: ['conversation', selected.id] });
    },
    onError: (error: any) => toast.error(error.response?.data?.error?.message || 'Failed to update conversation'),
  });

  const assignMutation = useMutation({
    mutationFn: async ({
      conversationId,
      userId,
      teamId,
    }: {
      conversationId: string;
      userId?: string;
      teamId?: string;
    }) => {
      const response = await teamsApi.assignConversation(conversationId, { userId, teamId });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (selected?.id) queryClient.invalidateQueries({ queryKey: ['conversation', selected.id] });
      setShowAssignDropdown(false);
      toast.success('Conversation assigned');
    },
    onError: (error: any) => toast.error(error.response?.data?.error?.message || 'Failed to assign conversation'),
  });

  const addNoteMutation = useMutation({
    mutationFn: async ({ conversationId, content }: { conversationId: string; content: string }) => {
      const response = await api.post(`/conversations/${conversationId}/notes`, { content });
      return response.data;
    },
    onSuccess: () => {
      if (selected?.id) queryClient.invalidateQueries({ queryKey: ['conversation', selected.id] });
      setNoteText('');
      toast.success('Note added');
    },
    onError: (error: any) => toast.error(error.response?.data?.error?.message || 'Failed to add note'),
  });

  // ── Handlers ──────────────────────────────────────────

  const handleSend = () => {
    if (!message.trim() || !selected) return;
    const text = message.trim();
    setMessage('');
    sendMutation.mutate({
      phone: selected.contact.phone,
      body: text,
      message: text,
      contactId: selected.contactId,
      phoneNumberId: selected.phoneNumberId,
      conversationId: selected.id,
    });
  };

  const handleToggleBot = () => {
    if (!selectedFull) return;
    const next = !selectedFull.isBotActive;
    updateConvMutation.mutate(
      { id: selectedFull.id, patch: { isBotActive: next } },
      { onSuccess: () => toast.success(next ? 'Bot activated' : 'Bot paused') }
    );
  };

  const handleClose = () => {
    if (!selectedFull) return;
    const isOpen = selectedFull.status !== 'CLOSED';
    updateConvMutation.mutate(
      { id: selectedFull.id, patch: { status: isOpen ? 'CLOSED' : 'OPEN' } },
      {
        onSuccess: () => {
          toast.success(isOpen ? 'Conversation closed' : 'Conversation reopened');
          if (isOpen) setSelected(null);
        },
      }
    );
  };

  const handleAddNote = () => {
    if (!noteText.trim() || !selected) return;
    addNoteMutation.mutate({ conversationId: selected.id, content: noteText.trim() });
  };

  // Failed-send errors are often Meta's raw error JSON (with fbtrace_id etc.)
  // — pull out just the human message so it doesn't blow up the chat bubble.
  const cleanErrorMessage = (raw?: string | null): string => {
    if (!raw) return '';
    const jsonStart = raw.indexOf('{');
    if (jsonStart === -1) return raw;
    try {
      const parsed = JSON.parse(raw.slice(jsonStart));
      return parsed?.error?.message || raw.slice(0, jsonStart).trim() || raw;
    } catch {
      return raw;
    }
  };

  const statusIcon = (status: string) => {
    if (status === 'read')
      return (
        <span className="flex">
          <Check className="w-3 h-3 text-wa-green" />
          <Check className="w-3 h-3 -ml-1.5 text-wa-green" />
        </span>
      );
    if (status === 'delivered')
      return (
        <span className="flex">
          <Check className="w-3 h-3 text-ios-muted" />
          <Check className="w-3 h-3 -ml-1.5 text-ios-muted" />
        </span>
      );
    if (status === 'sent') return <Check className="w-3 h-3 text-ios-muted" />;
    if (status === 'failed') return <AlertCircle className="w-3 h-3 text-apple-red" />;
    return null;
  };

  const statusBadge = (status: string) => {
    if (status === 'OPEN') return 'bg-apple-green/15 text-apple-green';
    if (status === 'CLOSED') return 'bg-ios-gray text-ios-muted';
    return 'bg-apple-orange/15 text-apple-orange';
  };

  // ─────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────

  return (
    <div className="h-[calc(100vh-5rem)] flex rounded-apple-xl overflow-hidden border border-black/10 bg-white shadow-sm">

      {/* ── LEFT: Conversation List ──────────────────── */}
      <div className="w-72 flex-shrink-0 flex flex-col border-r border-black/8 bg-white">
        {/* Header */}
        <div className="p-3 border-b border-black/5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-base font-bold text-ios-dark">Inbox</h2>
            <span className="text-xs bg-wa-green/15 text-wa-green font-semibold px-2 py-0.5 rounded-apple-full">
              {conversations.filter(c => c.status === 'OPEN').length} open
            </span>
          </div>
          {/* Search */}
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ios-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="input-apple w-full pl-8 text-sm py-1.5"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="w-3.5 h-3.5 text-ios-muted" />
              </button>
            )}
          </div>
          {/* Filter chips */}
          <div className="flex flex-wrap gap-1">
            {(
              [
                { key: 'open', label: 'Open' },
                { key: 'all', label: 'All' },
                { key: 'closed', label: 'Closed' },
                { key: 'pending', label: 'Pending' },
                { key: 'mine', label: 'Mine' },
                { key: 'bot', label: 'Bot' },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded-apple transition ${
                  filter === f.key
                    ? 'bg-wa-green text-white'
                    : 'bg-ios-gray text-ios-secondary hover:text-ios-dark'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto divide-y divide-black/5">
          {isLoading
            ? Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-4 animate-pulse flex gap-3">
                  <div className="w-10 h-10 bg-ios-gray rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-ios-gray rounded w-2/3" />
                    <div className="h-3 bg-ios-gray rounded w-full" />
                  </div>
                </div>
              ))
            : conversations.length === 0
            ? (
                <div className="p-6 text-center">
                  <MessageSquare className="w-8 h-8 text-ios-muted mx-auto mb-2" />
                  <p className="text-sm text-ios-muted">No conversations</p>
                </div>
              )
            : conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => { setSelected(conv); setChatTab('messages'); }}
                  className={`w-full text-left px-3 py-3 transition ${
                    selected?.id === conv.id ? 'bg-wa-green/8' : 'hover:bg-ios-gray/40'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="relative flex-shrink-0">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-sm ${
                          selected?.id === conv.id
                            ? 'bg-wa-green text-white'
                            : 'bg-wa-green/20 text-wa-green'
                        }`}
                      >
                        {(conv.contact.name || conv.contact.phone || '?').charAt(0).toUpperCase()}
                      </div>
                      {conv.isBotActive && (
                        <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-indigo-500 rounded-full flex items-center justify-center border-2 border-white">
                          <Bot className="w-2 h-2 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <p className="font-semibold text-ios-dark text-sm truncate">
                          {conv.contact.name || conv.contact.phone || '—'}
                        </p>
                        <span className="text-[10px] text-ios-muted flex-shrink-0">{conv.lastTime}</span>
                      </div>
                      <p className="text-xs text-ios-muted truncate mt-0.5">{conv.lastMessage}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span
                          className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-apple-full ${statusBadge(conv.status)}`}
                        >
                          {conv.status === 'PENDING_AGENT' ? 'PENDING' : conv.status}
                        </span>
                        {conv.assignedTo && (
                          <span className="text-[9px] text-ios-muted truncate">
                            → {conv.assignedTo.name}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
        </div>
      </div>

      {/* ── CENTER: Chat Thread ──────────────────────── */}
      {selected && selectedFull ? (
        <div className="flex-1 flex flex-col min-w-0">
          {/* Chat Header */}
          <div className="px-4 py-3 border-b border-black/5 flex items-center gap-3 bg-white">
            <div className="w-9 h-9 bg-wa-green/20 text-wa-green rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0">
              {(selectedFull.contact.name || selectedFull.contact.phone || '?').charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-ios-dark text-sm leading-none truncate">
                {selectedFull.contact.name || selectedFull.contact.phone || '—'}
              </p>
              <p className="text-xs text-ios-muted font-mono mt-0.5 truncate">{selectedFull.contact.phone}</p>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {/* Bot toggle */}
              <button
                onClick={handleToggleBot}
                disabled={updateConvMutation.isPending}
                title={selectedFull.isBotActive ? 'Pause bot' : 'Activate bot'}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-apple-lg text-xs font-medium transition ${
                  selectedFull.isBotActive
                    ? 'bg-indigo-500/10 text-indigo-600 hover:bg-indigo-500/20'
                    : 'bg-ios-gray text-ios-secondary hover:bg-indigo-500/10 hover:text-indigo-600'
                }`}
              >
                {selectedFull.isBotActive ? (
                  <Bot className="w-3.5 h-3.5" />
                ) : (
                  <CircleOff className="w-3.5 h-3.5" />
                )}
                <span className="hidden lg:inline">{selectedFull.isBotActive ? 'Bot On' : 'Bot Off'}</span>
              </button>

              {/* Assign */}
              <div className="relative">
                <button
                  onClick={() => setShowAssignDropdown((v) => !v)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-apple-lg text-xs font-medium bg-ios-gray text-ios-secondary hover:text-ios-dark transition"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline max-w-[7rem] truncate">
                    {selectedFull.assignedTo
                      ? selectedFull.assignedTo.name
                      : selectedFull.assignedTeam
                      ? selectedFull.assignedTeam.name
                      : 'Assign'}
                  </span>
                  <ChevronDown className="w-3 h-3" />
                </button>
                {showAssignDropdown && (
                  <div className="absolute top-full right-0 mt-1 w-52 bg-white rounded-apple-xl shadow-apple-lg border border-black/8 z-30 overflow-hidden">
                    <div className="p-2 max-h-64 overflow-y-auto">
                      {(teamsData || []).length > 0 && (
                        <>
                          <p className="text-[10px] font-semibold text-ios-muted uppercase tracking-wide px-2 mb-1">
                            Teams
                          </p>
                          {(teamsData || []).map((team: any) => (
                            <button
                              key={team.id}
                              onClick={() =>
                                assignMutation.mutate({
                                  conversationId: selected.id,
                                  teamId: team.id,
                                })
                              }
                              className="w-full text-left px-2 py-1.5 text-sm text-ios-dark hover:bg-ios-gray rounded-apple transition"
                            >
                              {team.name}
                            </button>
                          ))}
                          <div className="border-t border-black/5 my-1" />
                        </>
                      )}
                      <p className="text-[10px] font-semibold text-ios-muted uppercase tracking-wide px-2 mb-1">
                        Agents
                      </p>
                      {(agentsData || []).length === 0 ? (
                        <p className="text-xs text-ios-muted px-2 py-1">No agents yet</p>
                      ) : (
                        (agentsData || []).map((agent: any) => (
                          <button
                            key={agent.id}
                            onClick={() =>
                              assignMutation.mutate({
                                conversationId: selected.id,
                                userId: agent.id,
                              })
                            }
                            className="w-full text-left px-2 py-1.5 text-sm text-ios-dark hover:bg-ios-gray rounded-apple transition"
                          >
                            <span className="font-medium">{agent.name}</span>
                            <span className="text-xs text-ios-muted ml-1.5 block truncate">
                              {agent.email}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Close / Reopen */}
              <button
                onClick={handleClose}
                disabled={updateConvMutation.isPending}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-apple-lg text-xs font-medium transition ${
                  selectedFull.status === 'CLOSED'
                    ? 'bg-apple-green/10 text-apple-green hover:bg-apple-green/20'
                    : 'bg-apple-red/10 text-apple-red hover:bg-apple-red/20'
                }`}
              >
                {selectedFull.status === 'CLOSED' ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5" /> <span className="hidden lg:inline">Reopen</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3.5 h-3.5" /> <span className="hidden lg:inline">Close</span>
                  </>
                )}
              </button>

              {/* Sidebar toggle */}
              <button
                onClick={() => setShowSidebar((v) => !v)}
                className={`p-1.5 rounded-apple-lg transition ${
                  showSidebar
                    ? 'bg-wa-green/10 text-wa-green'
                    : 'hover:bg-ios-gray text-ios-muted'
                }`}
                title="Toggle contact info"
              >
                <Info className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Messages / Notes tab bar */}
          <div className="flex border-b border-black/5 bg-white px-4 gap-4">
            {(
              [
                { key: 'messages', label: 'Messages', icon: MessageSquare },
                { key: 'notes', label: 'Notes', icon: StickyNote },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setChatTab(key)}
                className={`flex items-center gap-1.5 py-2 text-xs font-medium border-b-2 transition ${
                  chatTab === key
                    ? 'border-wa-green text-wa-green'
                    : 'border-transparent text-ios-muted hover:text-ios-secondary'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
                {key === 'notes' && activeNotes.length > 0 && (
                  <span className="ml-1 px-1 py-0.5 bg-amber-100 text-amber-700 text-[9px] font-bold rounded-apple-full">
                    {activeNotes.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Message / Notes thread */}
          {chatTab === 'messages' ? (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-ios-gray/20">
                {activeMessages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-ios-muted text-sm">No messages yet</p>
                  </div>
                ) : (
                  activeMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className="max-w-[75%]">
                        <div
                          className={`px-3.5 py-2.5 rounded-apple-xl text-sm break-words whitespace-pre-wrap ${
                            msg.status === 'failed'
                              ? 'bg-apple-red/10 border border-apple-red/30 text-ios-dark rounded-br-sm'
                              : msg.direction === 'outbound'
                              ? 'bg-wa-green text-white rounded-br-sm'
                              : 'bg-white border border-black/8 text-ios-dark rounded-bl-sm shadow-sm'
                          }`}
                        >
                          {msg.content}
                        </div>
                        {msg.status === 'failed' && (
                          <div className="flex items-start gap-1 mt-1 justify-end text-[11px] text-apple-red font-medium text-right">
                            <AlertCircle className="w-3 h-3 shrink-0 mt-px" />
                            <span className="break-words">
                              Not delivered
                              {msg.errorMessage ? ` — ${cleanErrorMessage(msg.errorMessage)}` : ''}
                            </span>
                          </div>
                        )}
                        <div
                          className={`flex items-center gap-1 mt-0.5 ${
                            msg.direction === 'outbound' ? 'justify-end' : ''
                          }`}
                        >
                          <span className="text-[10px] text-ios-muted">{msg.timestamp}</span>
                          {msg.direction === 'outbound' && msg.status !== 'failed' && (
                            <span className="flex items-center text-ios-muted">
                              {statusIcon(msg.status)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message input */}
              <div className="p-3 border-t border-black/5 bg-white">
                {selectedFull.status === 'CLOSED' ? (
                  <div className="flex items-center justify-center gap-2 py-3 text-ios-muted text-sm">
                    <CheckCircle className="w-4 h-4" />
                    Conversation closed ·
                    <button onClick={handleClose} className="text-wa-green font-medium hover:underline">
                      Reopen
                    </button>
                  </div>
                ) : !windowOpen ? (
                  <div className="flex items-center justify-between gap-3 py-2.5 px-3 bg-apple-orange/10 rounded-apple-lg text-sm">
                    <div className="flex items-center gap-2 text-apple-orange">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>
                        24-hour messaging window closed
                        {lastInboundAt ? ` — last replied ${new Date(lastInboundAt).toLocaleDateString()}` : ''}.
                        Only an approved template can be sent now.
                      </span>
                    </div>
                    <a
                      href="/templates"
                      className="shrink-0 px-3 py-1.5 bg-wa-green text-white text-xs font-semibold rounded-apple-lg hover:bg-wa-green/90 transition"
                    >
                      Send Template
                    </a>
                  </div>
                ) : (
                  <div className="flex items-end gap-2">
                    <textarea
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                        }
                      }}
                      placeholder="Type a message… (Enter to send, Shift+Enter for newline)"
                      rows={2}
                      className="flex-1 input-apple resize-none text-sm"
                    />
                    <button
                      onClick={handleSend}
                      disabled={!message.trim() || sendMutation.isPending}
                      className="w-9 h-9 bg-wa-green text-white rounded-apple-lg flex items-center justify-center hover:bg-wa-green/90 transition disabled:opacity-50"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                )}
                {windowOpen && windowClosesAt && (
                  <p className="text-[11px] text-ios-muted mt-1.5 px-0.5">
                    Free-form window closes {windowClosesAt.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            </>
          ) : (
            /* Notes tab */
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-amber-50/30">
                {activeNotes.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center">
                    <StickyNote className="w-8 h-8 text-amber-300 mb-2" />
                    <p className="text-sm text-ios-muted">No notes yet</p>
                    <p className="text-xs text-ios-muted mt-1">
                      Internal notes are only visible to your team
                    </p>
                  </div>
                ) : (
                  activeNotes.map((note) => (
                    <div
                      key={note.id}
                      className="bg-amber-50 border border-amber-200 rounded-apple-xl p-3"
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <StickyNote className="w-3 h-3 text-amber-500" />
                        <span className="text-[10px] font-semibold text-amber-600">{note.author}</span>
                        <span className="text-[10px] text-amber-400">· {note.timestamp}</span>
                      </div>
                      <p className="text-sm text-amber-900 whitespace-pre-wrap">{note.content}</p>
                    </div>
                  ))
                )}
              </div>
              {/* Note input */}
              <div className="p-3 border-t border-amber-100 bg-amber-50">
                <div className="flex items-center gap-1.5 mb-2">
                  <StickyNote className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-medium text-amber-700">
                    Internal note — not visible to contact
                  </span>
                </div>
                <div className="flex items-end gap-2">
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Write a note..."
                    rows={2}
                    className="flex-1 input-apple resize-none text-sm bg-white"
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={!noteText.trim() || addNoteMutation.isPending}
                    className="px-3 py-2 bg-amber-500 text-white text-sm font-medium rounded-apple-lg hover:bg-amber-600 transition disabled:opacity-50"
                  >
                    {addNoteMutation.isPending ? '...' : 'Add'}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        /* Empty state */
        <div className="flex-1 flex items-center justify-center bg-ios-gray/10">
          <div className="text-center">
            <div className="w-16 h-16 bg-ios-gray rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare className="w-7 h-7 text-ios-muted" />
            </div>
            <p className="text-ios-secondary font-semibold">Select a conversation</p>
            <p className="text-sm text-ios-muted mt-1">Choose one from the inbox to start</p>
          </div>
        </div>
      )}

      {/* ── RIGHT: Contact Info Sidebar ─────────────── */}
      {selected && selectedFull && showSidebar && (
        <div className="w-60 flex-shrink-0 border-l border-black/8 flex flex-col bg-white overflow-hidden">
          {/* Sidebar tabs */}
          <div className="flex border-b border-black/5">
            {(
              [
                { key: 'info', label: 'Contact', icon: User },
                { key: 'notes', label: 'Notes', icon: StickyNote },
              ] as const
            ).map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setSidebarTab(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-medium border-b-2 transition ${
                  sidebarTab === key
                    ? 'border-wa-green text-wa-green'
                    : 'border-transparent text-ios-muted hover:text-ios-secondary'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto">
            {sidebarTab === 'info' ? (
              <div className="p-4 space-y-4">
                {/* Avatar + name */}
                <div className="text-center">
                  <div className="w-14 h-14 bg-wa-green/20 text-wa-green rounded-full flex items-center justify-center font-bold text-xl mx-auto">
                    {(selectedFull.contact.name || selectedFull.contact.phone || '?').charAt(0)}
                  </div>
                  <p className="font-semibold text-ios-dark mt-2 text-sm">
                    {selectedFull.contact.name || selectedFull.contact.phone || '—'}
                  </p>
                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-apple-full ${statusBadge(selectedFull.status)}`}
                  >
                    {selectedFull.status === 'PENDING_AGENT' ? 'PENDING' : selectedFull.status}
                  </span>
                </div>

                {/* Contact fields */}
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2.5 text-xs">
                    <Phone className="w-3.5 h-3.5 text-ios-muted flex-shrink-0" />
                    <span className="text-ios-secondary font-mono">{selectedFull.contact.phone}</span>
                  </div>
                  {selectedFull.contact.email && (
                    <div className="flex items-center gap-2.5 text-xs">
                      <Mail className="w-3.5 h-3.5 text-ios-muted flex-shrink-0" />
                      <span className="text-ios-secondary truncate">{selectedFull.contact.email}</span>
                    </div>
                  )}
                  {selectedFull.createdAt && (
                    <div className="flex items-center gap-2.5 text-xs">
                      <Calendar className="w-3.5 h-3.5 text-ios-muted flex-shrink-0" />
                      <span className="text-ios-secondary">
                        {new Date(selectedFull.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>

                {/* Tags */}
                {selectedFull.contact.tags && selectedFull.contact.tags.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <Tag className="w-3 h-3 text-ios-muted" />
                      <span className="text-[10px] font-semibold text-ios-muted uppercase tracking-wide">
                        Tags
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {selectedFull.contact.tags.map((tag: string) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 text-[10px] bg-ios-gray text-ios-secondary rounded-apple-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Assignment */}
                <div className="pt-2 border-t border-black/5">
                  <p className="text-[10px] font-semibold text-ios-muted uppercase tracking-wide mb-2">
                    Assignment
                  </p>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ios-muted">Agent</span>
                      <span className="text-ios-secondary font-medium">
                        {selectedFull.assignedTo?.name || '—'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ios-muted">Team</span>
                      <span className="text-ios-secondary font-medium">
                        {selectedFull.assignedTeam?.name || '—'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bot status */}
                <div className="pt-2 border-t border-black/5">
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-apple-lg ${
                      selectedFull.isBotActive
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'bg-ios-gray text-ios-muted'
                    }`}
                  >
                    {selectedFull.isBotActive ? (
                      <Bot className="w-4 h-4" />
                    ) : (
                      <CircleOff className="w-4 h-4" />
                    )}
                    <span className="text-xs font-medium">
                      {selectedFull.isBotActive ? 'Bot active' : 'Bot paused'}
                    </span>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="pt-2 border-t border-black/5 space-y-1.5">
                  <button
                    onClick={handleToggleBot}
                    disabled={updateConvMutation.isPending}
                    className={`w-full text-xs py-2 rounded-apple-lg font-medium transition ${
                      selectedFull.isBotActive
                        ? 'bg-ios-gray text-ios-secondary hover:bg-indigo-50 hover:text-indigo-600'
                        : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'
                    }`}
                  >
                    {selectedFull.isBotActive ? 'Pause Bot' : 'Activate Bot'}
                  </button>
                  <button
                    onClick={handleClose}
                    disabled={updateConvMutation.isPending}
                    className={`w-full text-xs py-2 rounded-apple-lg font-medium transition ${
                      selectedFull.status === 'CLOSED'
                        ? 'bg-apple-green/10 text-apple-green hover:bg-apple-green/20'
                        : 'bg-apple-red/10 text-apple-red hover:bg-apple-red/20'
                    }`}
                  >
                    {selectedFull.status === 'CLOSED' ? 'Reopen Conversation' : 'Close Conversation'}
                  </button>
                </div>
              </div>
            ) : (
              /* Notes list in sidebar */
              <div className="p-4 space-y-3">
                <div className="flex items-center gap-1.5">
                  <StickyNote className="w-3.5 h-3.5 text-amber-500" />
                  <span className="text-xs font-semibold text-ios-dark">Internal Notes</span>
                </div>
                {activeNotes.length === 0 ? (
                  <p className="text-xs text-ios-muted text-center py-4">No notes yet</p>
                ) : (
                  activeNotes.map((note) => (
                    <div
                      key={note.id}
                      className="bg-amber-50 border border-amber-100 rounded-apple-lg p-2.5"
                    >
                      <p className="text-xs text-amber-900">{note.content}</p>
                      <p className="text-[10px] text-amber-500 mt-1">
                        {note.author} · {note.timestamp}
                      </p>
                    </div>
                  ))
                )}
                <div className="pt-2 border-t border-amber-100">
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder="Write a note..."
                    rows={3}
                    className="input-apple w-full resize-none text-xs"
                  />
                  <button
                    onClick={handleAddNote}
                    disabled={!noteText.trim() || addNoteMutation.isPending}
                    className="mt-1.5 w-full py-1.5 bg-amber-500 text-white text-xs font-medium rounded-apple-lg hover:bg-amber-600 transition disabled:opacity-50"
                  >
                    {addNoteMutation.isPending ? 'Adding...' : 'Add Note'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Click-outside to close assign dropdown */}
      {showAssignDropdown && (
        <div className="fixed inset-0 z-20" onClick={() => setShowAssignDropdown(false)} />
      )}
    </div>
  );
}
