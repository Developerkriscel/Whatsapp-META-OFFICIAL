/**
 * Snapchat-style avatar shown inline in the navbar, next to the brand text —
 * mostly sits within the bar's own height, with just the head/bubble poking
 * above its top edge. Plays once on mount, then holds its final frame
 * indefinitely. Truly transparent background: a plain <video> element always
 * composites as opaque even with an alpha-channel source, so this decodes
 * the video onto a <canvas> instead, which does respect per-pixel video
 * alpha.
 */

import { useEffect, useRef } from 'react';
import boyAvatarSrc from '../assets/boy-avatar.webm';
import girlAvatarSrc from '../assets/girl-avatar.webm';

export type AvatarKind = 'boy' | 'girl';

// Source webm is 160x284. The character's head/bubble/shoulders sit in the
// lower two-thirds of that frame — crop there instead of the (empty) top.
const CROP = { sx: 0, sy: 77, sw: 160, sh: 172 };
const DISPLAY_WIDTH = 62;
const DISPLAY_HEIGHT = Math.round(DISPLAY_WIDTH * (CROP.sh / CROP.sw));
// Reserved footprint in the header's flex row — keeps text spacing sane.
const SLOT_SIZE = 40;

export default function HeaderAvatar({ kind }: { kind: AvatarKind }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    let rafId: number;
    let stopped = false;

    const drawFrame = () => {
      if (!ctx || video.readyState < 2) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      try {
        ctx.drawImage(video, CROP.sx, CROP.sy, CROP.sw, CROP.sh, 0, 0, canvas.width, canvas.height);
      } catch {
        // Ignore transient decode errors — the next frame/event will retry.
      }
    };

    // requestAnimationFrame gives smooth ~60fps updates on a normally
    // visible/focused tab, but browsers throttle or fully suspend rAF on
    // backgrounded/non-compositing tabs. The video's own playback events
    // (driven by the media pipeline, not the compositor) act as a fallback
    // so the avatar still renders correctly in that case.
    const rafLoop = () => {
      if (stopped) return;
      drawFrame();
      rafId = requestAnimationFrame(rafLoop);
    };

    video.muted = true;
    const tryPlay = () => video.play().catch(() => {});
    tryPlay();
    video.addEventListener('loadeddata', tryPlay);
    video.addEventListener('canplay', tryPlay);
    video.addEventListener('timeupdate', drawFrame);
    video.addEventListener('seeked', drawFrame);
    video.addEventListener('ended', drawFrame);

    rafId = requestAnimationFrame(rafLoop);

    return () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      video.removeEventListener('loadeddata', tryPlay);
      video.removeEventListener('canplay', tryPlay);
      video.removeEventListener('timeupdate', drawFrame);
      video.removeEventListener('seeked', drawFrame);
      video.removeEventListener('ended', drawFrame);
    };
  }, [kind]);

  return (
    <div className="relative shrink-0" style={{ width: SLOT_SIZE, height: SLOT_SIZE }}>
      <div
        className="absolute pointer-events-none"
        style={{
          width: DISPLAY_WIDTH,
          height: DISPLAY_HEIGHT,
          left: (SLOT_SIZE - DISPLAY_WIDTH) / 2,
          // Pulls the character up so only its head/bubble pokes above the
          // navbar's top edge, while the rest stays within the bar itself.
          top: -18,
          zIndex: 5,
        }}
      >
        <canvas
          ref={canvasRef}
          width={DISPLAY_WIDTH * 2}
          height={DISPLAY_HEIGHT * 2}
          className="block w-full h-full"
          aria-hidden="true"
        />
        {/* Invisible via opacity (not off-screen or display:none) so
            browsers don't throttle/pause decoding for being out of
            viewport. */}
        <video
          ref={videoRef}
          src={kind === 'girl' ? girlAvatarSrc : boyAvatarSrc}
          muted
          playsInline
          autoPlay
          preload="auto"
          className="absolute inset-0 pointer-events-none"
          style={{ width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT, opacity: 0 }}
        />
      </div>
    </div>
  );
}
