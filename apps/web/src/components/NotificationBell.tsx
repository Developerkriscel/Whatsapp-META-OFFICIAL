/**
 * The notification bell.
 *
 * Two things share it, because two things were unreachable from anywhere but
 * their own page: customers waiting for a reply, and system notifications.
 * A customer waiting is the more urgent of the two, so waiting conversations
 * sit above notifications regardless of age — a finished campaign can wait, a
 * customer cannot.
 *
 * The badge counts conversations rather than messages. One customer who sent
 * nine messages is one thing to deal with, and a badge reading 9 would say
 * otherwise.
 */
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Bell, MessageSquare, Check, Loader2 } from 'lucide-react';

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notification-feed'],
    queryFn: async () => (await api.get('/notifications/feed')).data?.data,
    // Inbound messages arrive whenever a customer sends one, not on a schedule
    // we control, so the bell polls rather than waiting for a page change.
    refetchInterval: 30000,
  });

  const markAll = useMutation({
    mutationFn: async () => (await api.post('/notifications/mark-all-read')).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notification-feed'] }),
  });

  // Close on an outside click, the way every other menu on the page behaves.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const badge = data?.badge ?? 0;
  const conversations = data?.conversations ?? [];
  const notifications = data?.notifications ?? [];
  const nothing = conversations.length === 0 && notifications.length === 0;

  const goToConversation = (id: string) => {
    setOpen(false);
    navigate(`/conversations?open=${id}`);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={badge > 0 ? `${badge} items needing attention` : 'Notifications'}
        className="relative w-10 h-10 rounded-apple-lg flex items-center justify-center text-ios-muted hover:text-ios-dark hover:bg-ios-gray transition"
      >
        <Bell className="w-5 h-5" />
        {badge > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-apple-red text-white text-[11px] font-bold flex items-center justify-center tabular-nums">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 max-w-[92vw] bg-white rounded-apple-xl shadow-xl border border-black/10 z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-black/8">
            <div>
              <p className="font-semibold text-ios-dark text-sm">Notifications</p>
              {data && (
                <p className="text-xs text-ios-muted mt-0.5">
                  {data.unreadConversations > 0
                    ? `${data.unreadConversations} conversation${data.unreadConversations === 1 ? '' : 's'} waiting · ${data.unreadMessages} unread message${data.unreadMessages === 1 ? '' : 's'}`
                    : 'No one is waiting for a reply'}
                </p>
              )}
            </div>
            {data?.unreadNotifications > 0 && (
              <button
                onClick={() => markAll.mutate()}
                disabled={markAll.isPending}
                className="text-xs text-wa-green hover:underline disabled:opacity-50 shrink-0"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[24rem] overflow-y-auto">
            {isLoading && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-ios-muted" />
              </div>
            )}

            {!isLoading && nothing && (
              <div className="px-4 py-10 text-center">
                <Check className="w-8 h-8 text-wa-green mx-auto mb-2" />
                <p className="text-sm text-ios-muted">Nothing needs you right now.</p>
              </div>
            )}

            {conversations.length > 0 && (
              <div>
                <p className="px-4 pt-3 pb-1.5 text-[11px] font-semibold text-ios-muted uppercase tracking-wide">
                  Waiting for a reply
                </p>
                {conversations.map((c: any) => (
                  <button
                    key={c.id}
                    onClick={() => goToConversation(c.id)}
                    className="w-full text-left px-4 py-2.5 hover:bg-ios-gray/60 transition flex gap-3 items-start"
                  >
                    <span className="w-8 h-8 rounded-full bg-wa-green/15 text-wa-green flex items-center justify-center shrink-0 mt-0.5">
                      <MessageSquare className="w-4 h-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-ios-dark text-sm truncate">{c.name}</span>
                        {c.unreadCount > 1 && (
                          <span className="text-[11px] px-1.5 rounded-full bg-apple-red/10 text-apple-red font-medium shrink-0">
                            {c.unreadCount}
                          </span>
                        )}
                        <span className="text-[11px] text-ios-muted ml-auto shrink-0">{timeAgo(c.at)}</span>
                      </span>
                      {c.preview && (
                        <span className="block text-xs text-ios-muted truncate mt-0.5">{c.preview}</span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {notifications.length > 0 && (
              <div className={conversations.length > 0 ? 'border-t border-black/8 mt-1' : ''}>
                <p className="px-4 pt-3 pb-1.5 text-[11px] font-semibold text-ios-muted uppercase tracking-wide">
                  Updates
                </p>
                {notifications.map((n: any) => (
                  <div
                    key={n.id}
                    className={`px-4 py-2.5 flex gap-3 items-start ${n.isRead ? '' : 'bg-wa-green/5'}`}
                  >
                    <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${n.isRead ? 'bg-transparent' : 'bg-wa-green'}`} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="font-medium text-ios-dark text-sm truncate">{n.title}</span>
                        <span className="text-[11px] text-ios-muted ml-auto shrink-0">{timeAgo(n.at)}</span>
                      </span>
                      <span className="block text-xs text-ios-muted mt-0.5">{n.message}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {conversations.length > 0 && (
            <button
              onClick={() => { setOpen(false); navigate('/conversations'); }}
              className="w-full px-4 py-2.5 text-sm text-wa-green hover:bg-ios-gray/60 border-t border-black/8 font-medium transition"
            >
              {data.unreadConversations > conversations.length
                ? `Open Conversations — ${data.unreadConversations - conversations.length} more waiting`
                : 'Open Conversations'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
