/**
 * Kriscel WA brandmark — WhatsApp Business API White List Provider.
 * Shared across auth pages (login, forgot password, register).
 */

import kriscelKSrc from '../assets/kriscel-k.jpeg';

const HEADING_GREEN = '#14532D';

export default function KriscelWaBrandmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <img
        src={kriscelKSrc}
        alt="Kriscel"
        className={`rounded-full object-contain shrink-0 ${compact ? 'w-9 h-9' : 'w-9 h-9 sm:w-10 sm:h-10'}`}
      />
      <div className="leading-tight">
        <div className={`font-bold ${compact ? 'text-[15px]' : 'text-[15px] sm:text-[17px]'}`} style={{ color: HEADING_GREEN }}>
          Kriscel WA
        </div>
        <div className={`text-black/45 leading-tight ${compact ? 'text-[10px]' : 'text-[10px] sm:text-[11px]'}`}>
          WhatsApp Business API{!compact && <br className="hidden sm:block" />} White List Provider
        </div>
      </div>
    </div>
  );
}
