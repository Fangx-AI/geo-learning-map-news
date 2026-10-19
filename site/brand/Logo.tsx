// GEO 学习地图：经纬线表示全球来源，指针表示发现与追踪。
import { SITE } from "../site.ts";

export function Wordmark({ size = 24, className = "", title = SITE.name }: { size?: number; className?: string; title?: string }) {
  return (
    <span className={`inline-flex items-center gap-[0.3em] whitespace-nowrap font-bold leading-none tracking-[-0.03em] ${className}`} style={{ fontSize: Math.round(size * 0.64) }} aria-label={title} role="img">
      <svg viewBox="0 0 32 32" width={size} height={size} className="shrink-0 text-accent" fill="none" aria-hidden="true">
        <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="1.8" />
        <ellipse cx="16" cy="16" rx="6.5" ry="13" stroke="currentColor" strokeWidth="1.3" opacity="0.55" />
        <path d="M3 16h26" stroke="currentColor" strokeWidth="1.3" opacity="0.55" />
        <path d="m23 9-4.4 10.6L8 24l4.4-10.6Z" fill="currentColor" />
        <circle cx="16" cy="16" r="2" className="fill-bg" />
      </svg>
      <span aria-hidden="true">{SITE.name}</span>
    </span>
  );
}

/** The compass needle rotates while content is loading. */
export function RingMark({ className = "", spinning = false }: { className?: string; spinning?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.5" />
      <g style={spinning ? { transformOrigin: "12px 12px", animation: "spin-slow 1.1s linear infinite" } : undefined}>
        <path d="m17.5 6.5-3.3 7.7-7.7 3.3 3.3-7.7Z" fill="currentColor" />
      </g>
    </svg>
  );
}
