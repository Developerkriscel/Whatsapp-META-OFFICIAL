/**
 * Conversations Page
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { Search, Send, Phone, X, UserPlus, Check, Image, Smile, MoreVertical, PhoneCall, Video, RefreshCw } from 'lucide-react';

interface Message {
  id: string;
  content: string;
  direction: 'inbound' | 'outbound';
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
}

interface Conversation {
  id: string;
  contact: { name: string; phone: string; avatar?: string };
  lastMessage: string;
  lastTime: string;
  unread: number;
  messages: Message[];
}

export default function ConversationsPage() {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState<'all' | 'unread' | 'archived'>('all');
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['conversations', filter],
    queryFn: async () => {
      const response = await api.get('/conversations', { params: { filter } });
      return response.data;
    },
  });

  // Fetch full conversation details & messages when a conversation is selected
  const { data: activeConvData } = useQuery({
    queryKey: ['conversation', selected?.id],
    queryFn: async () => {
      if (!selected?.id) return null;
      const response = await api.get(`/conversations/${selected.id}`);
      return response.data;
    },
    enabled: !!selected?.id,
    refetchInterval: 3000,
  });

  const sendMutation = useMutation({
    mutationFn: async (payload: { phone?: string; message?: string; body?: string; contactId?: string; phoneNumberId?: string; conversationId?: string }) => {
      const response = await api.post('/messages/send', payload);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      if (selected?.id) {
        queryClient.invalidateQueries({ queryKey: ['conversation', selected.id] });
      }
      setMessage('');
    },
  });

  // Transform API data to expected format
  const conversations: Conversation[] = (data?.data || []).map((conv: any) => ({
    id: conv.id,
    contactId: conv.contactId,
    phoneNumberId: conv.phoneNumberId,
    contact: {
      name: conv.contact?.name || conv.contact?.phone || 'Unknown',
      phone: conv.contact?.phone || '',
    },
    lastMessage: conv.lastMessage?.body || 'No messages yet',
    lastTime: conv.lastMessageAt ? new Date(conv.lastMessageAt).toLocaleTimeString() : '',
    unread: conv.status === 'OPEN' ? 1 : 0,
    messages: [],
  }));

  // Resolve messages for active conversation
  const activeMessages: Message[] = (activeConvData?.data?.messages || []).map((msg: any) => ({
    id: msg.id,
    content: msg.body || '',
    direction: msg.direction === 'INCOMING' ? 'inbound' : 'outbound',
    status: msg.status?.toLowerCase() || 'sent',
    timestamp: msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '',
  }));

  const filtered = conversations.filter(c =>
    !search ||
    c.contact.name.toLowerCase().includes(search.toLowerCase()) ||
    c.contact.phone.includes(search)
  );

  const handleSend = () => {
    if (!message.trim() || !selected) return;
    const text = message.trim();
    setMessage('');
    sendMutation.mutate({
      phone: selected.contact.phone,
      message: text,
      body: text,
      contactId: (selected as any).contactId,
      phoneNumberId: (selected as any).phoneNumberId,
      conversationId: selected.id,
    });
  };

  const statusIcon = (status: string) => {
    if (status === 'read') return <Check className="w-3.5 h-3.5 text-wa-green" />;
    if (status === 'delivered') return <Check className="w-3.5 h-3.5 text-ios-muted" />;
    if (status === 'sent') return <span className="text-xs text-ios-muted">Sent</span>;
    if (status === 'failed') return <span className="text-xs text-apple-red">Failed</span>;
    return null;
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex rounded-apple-xl overflow-hidden border border-black/10">
      {/* Sidebar */}
      <div className="w-80 flex-shrink-0 flex flex-col bg-white">
        {/* Header */}
        <div className="p-4 border-b border-black/5">
          <h2 className="text-lg font-semibold text-ios-dark mb-3">Conversations</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ios-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations..."
              className="input-apple w-full pl-9 text-sm"
            />
          </div>
          {/* Filter tabs */}
          <div className="flex gap-1 mt-3">
            {(['all', 'unread', 'archived'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs font-medium rounded-apple transition ${
                  filter === f ? 'bg-wa-green text-white' : 'bg-ios-gray text-ios-secondary hover:text-ios-dark'
                }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto divide-y divide-black/5">
          {filtered.map((conv) => (
            <button
              key={conv.id}
              onClick={() => setSelected(conv)}
              className={`w-full text-left p-4 transition ${
                selected?.id === conv.id ? 'bg-wa-green/5' : 'hover:bg-ios-gray/50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="relative flex-shrink-0">
                  <div className={`w-11 h-11 ${selected?.id === conv.id ? 'bg-wa-green text-white' : 'bg-wa-green/20 text-wa-green'} rounded-full flex items-center justify-center font-semibold`}>
                    {conv.contact.name.charAt(0)}
                  </div>
                  {conv.unread > 0 && (
                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-apple-red text-white text-xs rounded-full flex items-center justify-center">
                      {conv.unread}
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={`font-medium truncate ${conv.unread > 0 ? 'text-ios-dark' : 'text-ios-secondary'}`}>
                      {conv.contact.name}
                    </p>
                    <span className="text-xs text-ios-muted ml-2 flex-shrink-0">{conv.lastTime}</span>
                  </div>
                  <p className={`text-sm truncate mt-0.5 ${conv.unread > 0 ? 'text-ios-dark font-medium' : 'text-ios-muted'}`}>
                    {conv.lastMessage}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      {selected ? (
        <div className="flex-1 flex flex-col bg-white">
          {/* Chat Header */}
          <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-wa-green/20 text-wa-green rounded-full flex items-center justify-center font-semibold">
                {selected.contact.name.charAt(0)}
              </div>
              <div>
                <p className="font-semibold text-ios-dark">{selected.contact.name}</p>
                <p className="text-xs text-ios-muted font-mono">{selected.contact.phone}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="p-2 hover:bg-ios-gray rounded-apple-lg text-ios-muted">
                <PhoneCall className="w-5 h-5" />
              </button>
              <button className="p-2 hover:bg-ios-gray rounded-apple-lg text-ios-muted">
                <Video className="w-5 h-5" />
              </button>
              <button className="p-2 hover:bg-ios-gray rounded-apple-lg text-ios-muted">
                <MoreVertical className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-ios-gray/30">
            {activeMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-xs lg:max-w-md ${msg.direction === 'outbound' ? 'order-2' : ''}`}>
                  <div className={`px-4 py-3 rounded-apple-xl ${
                    msg.direction === 'outbound'
                      ? 'bg-wa-green text-white rounded-br-md'
                      : 'bg-white border border-black/10 text-ios-dark rounded-bl-md shadow-sm'
                  }`}>
                    <p className="text-sm">{msg.content}</p>
                  </div>
                  <div className={`flex items-center gap-1.5 mt-1 ${msg.direction === 'outbound' ? 'justify-end' : ''}`}>
                    <span className={`text-xs ${msg.direction === 'outbound' ? 'text-ios-muted' : ''}`}>{msg.timestamp}</span>
                    {msg.direction === 'outbound' && statusIcon(msg.status)}
                    {msg.direction === 'outbound' && (msg.status as string) === 'failed' && (
                      <button
                        onClick={() => {
                          if (msg.content) {
                            setMessage(msg.content);
                            handleSend();
                          }
                        }}
                        className="text-[11px] font-bold text-apple-red hover:underline flex items-center gap-0.5 ml-1"
                        title="Click to retry dispatching this message"
                      >
                        <RefreshCw className="w-3 h-3" /> Retry
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="p-4 border-t border-black/5 bg-white">
            <div className="flex items-end gap-3">
              <button className="p-2 text-ios-muted hover:text-ios-secondary transition">
                <Image className="w-5 h-5" />
              </button>
              <div className="flex-1 relative">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Type a message..."
                  rows={1}
                  className="input-apple w-full resize-none pr-12"
                />
              </div>
              <button className="p-2 text-ios-muted hover:text-ios-secondary transition">
                <Smile className="w-5 h-5" />
              </button>
              <button
                onClick={handleSend}
                disabled={!message.trim()}
                className="w-10 h-10 bg-wa-green text-white rounded-apple-lg flex items-center justify-center hover:bg-wa-green/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center bg-ios-gray/20">
          <div className="text-center">
            <div className="w-16 h-16 bg-ios-gray rounded-full flex items-center justify-center mx-auto mb-4">
              <Search className="w-8 h-8 text-ios-muted" />
            </div>
            <p className="text-ios-secondary font-medium">Select a conversation</p>
            <p className="text-sm text-ios-muted mt-1">Choose from your existing conversations</p>
          </div>
        </div>
      )}
    </div>
  );
}
