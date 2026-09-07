import { Check, FileText, Play, ExternalLink, Phone as PhoneIcon, Reply, ImageOff } from 'lucide-react';

/**
 * Renders a template the way WhatsApp itself renders it.
 *
 * This exists because the old preview showed the body text and nothing else —
 * no header, no media, no footer, no buttons. A template approved with an
 * IMAGE header looked identical to a body-only one, so there was no way to see
 * from the preview that a campaign was missing the image Meta requires. That
 * gap is what let a 250-recipient send go out and fail on every recipient.
 *
 * Colours and metrics are WhatsApp's own, so this is deliberately a single
 * look rather than a themed one — it is imitating another app's surface, and
 * following our light/dark tokens would make it less accurate, not more.
 */

const WA = {
  wallpaper: '#EFE7DE',
  bubble: '#D9FDD3',
  text: '#111B21',
  muted: '#667781',
  link: '#00A5F4',
  tick: '#53BDEB',
  divider: 'rgba(0,0,0,0.08)',
  headerBar: '#008069',
};

// WhatsApp's chat wallpaper doodles, reduced to a light repeating texture. A
// flat beige reads as "a box we coloured beige"; the texture is what makes it
// recognisable at a glance.
const DOODLES =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cg fill='none' stroke='%23000' stroke-opacity='0.045' stroke-width='1.4'%3E%3Ccircle cx='18' cy='22' r='6'/%3E%3Cpath d='M44 14h14v11H50l-4 4v-4h-2z'/%3E%3Cpath d='M78 30c3-4 9-4 11 0s-2 8-5 10c-3-2-9-6-6-10z'/%3E%3Cpath d='M12 62l6-6 5 5 8-9'/%3E%3Crect x='46' y='54' width='13' height='16' rx='2'/%3E%3Cpath d='M88 60h12M88 66h8'/%3E%3Ccircle cx='104' cy='94' r='5'/%3E%3Cpath d='M20 100h13l3 5 3-5h5'/%3E%3Cpath d='M58 92c4-3 8 1 6 5s-8 3-9-1'/%3E%3C/g%3E%3C/svg%3E\")";

export type PreviewButton = { type?: string; text?: string; url?: string; phone_number?: string };

export interface WhatsAppPreviewProps {
  /** Body text. Variables written as {{1}} are highlighted. */
  body: string;
  /** Header format as Meta stores it. */
  headerFormat?: string | null;
  /** Text of a TEXT header. */
  headerText?: string | null;
  /** The media actually attached — an image/video/pdf URL. */
  mediaUrl?: string | null;
  /** Filename to show for a document header. */
  mediaName?: string | null;
  footer?: string | null;
  buttons?: PreviewButton[];
  /** Business name in the chat title bar. */
  businessName?: string;
  /** Optional caption under the frame. */
  caption?: string;
  className?: string;
}

/** WhatsApp's own markup: *bold*, _italic_, ~strike~, ```mono```, plus {{n}}. */
function renderText(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const pattern = /(```[\s\S]+?```|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|\{\{\s*[\w.]+\s*\}\})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    if (tok.startsWith('{{')) {
      // Show the placeholder as a chip. It is not what the recipient sees, and
      // conflating the two is how a literal "{{1}}" ends up being sent.
      out.push(
        <span
          key={`v${key++}`}
          className="inline-block rounded px-1 mx-px align-baseline"
          style={{ background: 'rgba(0,0,0,0.07)', color: WA.muted, fontSize: '0.9em' }}
        >
          {tok.replace(/\s+/g, '')}
        </span>,
      );
    } else if (tok.startsWith('```')) {
      out.push(
        <span key={`m${key++}`} style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
          {tok.slice(3, -3)}
        </span>,
      );
    } else if (tok.startsWith('*')) {
      out.push(<strong key={`b${key++}`}>{tok.slice(1, -1)}</strong>);
    } else if (tok.startsWith('_')) {
      out.push(<em key={`i${key++}`}>{tok.slice(1, -1)}</em>);
    } else {
      out.push(<s key={`s${key++}`}>{tok.slice(1, -1)}</s>);
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function buttonIcon(type?: string) {
  const t = String(type || '').toUpperCase();
  if (t === 'URL') return <ExternalLink className="w-3.5 h-3.5" />;
  if (t === 'PHONE_NUMBER') return <PhoneIcon className="w-3.5 h-3.5" />;
  return <Reply className="w-3.5 h-3.5" />;
}

export default function WhatsAppPreview({
  body,
  headerFormat,
  headerText,
  mediaUrl,
  mediaName,
  footer,
  buttons = [],
  businessName = 'Your Business',
  caption,
  className = '',
}: WhatsAppPreviewProps) {
  const format = String(headerFormat || '').toUpperCase();
  const needsMedia = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(format);
  const isImage = format === 'IMAGE' || (!format && !!mediaUrl && /\.(jpe?g|png|webp)(\?|$)/i.test(mediaUrl));
  const isVideo = format === 'VIDEO' || (!format && !!mediaUrl && /\.(mp4|3gpp?)(\?|$)/i.test(mediaUrl));
  const isDoc = format === 'DOCUMENT' || (!format && !!mediaUrl && /\.pdf(\?|$)/i.test(mediaUrl));

  const now = new Date();
  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <div className={className}>
      <div className="rounded-apple-lg overflow-hidden border border-black/10 shadow-sm">
        {/* Chat title bar */}
        <div className="flex items-center gap-2.5 px-3 py-2" style={{ background: WA.headerBar }}>
          <div className="w-7 h-7 rounded-full bg-white/25 flex items-center justify-center text-white text-xs font-semibold">
            {businessName.trim().charAt(0).toUpperCase() || 'B'}
          </div>
          <div className="min-w-0">
            <p className="text-white text-[13px] font-medium leading-tight truncate">{businessName}</p>
            <p className="text-white/70 text-[11px] leading-tight">business account</p>
          </div>
        </div>

        {/* Chat area */}
        <div
          className="px-3 py-4"
          style={{ background: WA.wallpaper, backgroundImage: DOODLES }}
        >
          <div className="flex justify-end">
            <div
              className="relative max-w-[85%] rounded-lg shadow-sm"
              style={{ background: WA.bubble, borderTopRightRadius: 0 }}
            >
              {/* Bubble tail */}
              <span
                className="absolute top-0 -right-2 w-2 h-3"
                style={{
                  background: WA.bubble,
                  clipPath: 'polygon(0 0, 100% 0, 0 100%)',
                }}
              />

              <div className="p-[3px]">
                {/* Media header — the part that was missing entirely */}
                {needsMedia && mediaUrl && isImage && (
                  <img
                    src={mediaUrl}
                    alt=""
                    className="w-full rounded-md object-cover max-h-64 bg-black/5"
                  />
                )}

                {needsMedia && mediaUrl && isVideo && (
                  <div className="relative rounded-md overflow-hidden bg-black">
                    <video src={mediaUrl} className="w-full max-h-64 object-cover" muted playsInline />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="w-11 h-11 rounded-full bg-black/55 flex items-center justify-center">
                        <Play className="w-5 h-5 text-white fill-white" />
                      </span>
                    </div>
                  </div>
                )}

                {needsMedia && mediaUrl && isDoc && (
                  <div className="flex items-center gap-2.5 rounded-md p-2.5" style={{ background: 'rgba(0,0,0,0.05)' }}>
                    <FileText className="w-7 h-7 shrink-0" style={{ color: WA.muted }} />
                    <p className="text-[13px] truncate" style={{ color: WA.text }}>
                      {mediaName || 'document.pdf'}
                    </p>
                  </div>
                )}

                {/* Approved with a media header, nothing attached. This is
                    exactly the state Meta rejects, so show it as a hole in the
                    message rather than rendering a message that looks fine. */}
                {needsMedia && !mediaUrl && (
                  <div
                    className="flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed py-6 px-3 text-center"
                    style={{ borderColor: 'rgba(0,0,0,0.18)', background: 'rgba(0,0,0,0.03)' }}
                  >
                    <ImageOff className="w-5 h-5" style={{ color: WA.muted }} />
                    <p className="text-[12px] font-medium" style={{ color: WA.text }}>
                      {format === 'IMAGE' ? 'Image' : format === 'VIDEO' ? 'Video' : 'Document'} goes here
                    </p>
                    <p className="text-[11px] leading-snug" style={{ color: WA.muted }}>
                      This template was approved with {format === 'IMAGE' ? 'an' : 'a'}{' '}
                      {format.toLowerCase()} header. Without one, Meta rejects every recipient.
                    </p>
                  </div>
                )}

                <div className="px-1.5 pt-1.5 pb-1">
                  {/* Text header */}
                  {format === 'TEXT' && headerText && (
                    <p className="text-[14.5px] font-semibold mb-1 leading-snug" style={{ color: WA.text }}>
                      {renderText(headerText)}
                    </p>
                  )}

                  {/* Body */}
                  <p
                    className="text-[14.2px] leading-[19px] whitespace-pre-wrap break-words"
                    style={{ color: WA.text }}
                  >
                    {renderText(body || ' ')}
                  </p>

                  {/* Footer */}
                  {footer && (
                    <p className="text-[13px] mt-1.5 leading-snug" style={{ color: WA.muted }}>
                      {footer}
                    </p>
                  )}

                  {/* Timestamp + delivery ticks */}
                  <div className="flex items-center justify-end gap-1 mt-0.5 -mb-0.5">
                    <span className="text-[11px]" style={{ color: WA.muted }}>{time}</span>
                    <span className="relative w-4 h-3 shrink-0">
                      <Check className="absolute left-0 top-0 w-3 h-3" style={{ color: WA.tick }} strokeWidth={3} />
                      <Check className="absolute left-1 top-0 w-3 h-3" style={{ color: WA.tick }} strokeWidth={3} />
                    </span>
                  </div>
                </div>

                {/* Buttons */}
                {buttons.length > 0 && (
                  <div className="mt-0.5">
                    {buttons.map((b, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-center gap-1.5 py-2 text-[14px] font-medium"
                        style={{ color: WA.link, borderTop: `1px solid ${WA.divider}` }}
                      >
                        {buttonIcon(b.type)}
                        <span className="truncate">{b.text || 'Button'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {caption && <p className="text-xs text-ios-muted mt-2">{caption}</p>}
    </div>
  );
}
