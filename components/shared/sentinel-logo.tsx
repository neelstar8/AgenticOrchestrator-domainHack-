import { cn } from "@/lib/utils/cn";
import { APP_NAME, APP_TAGLINE } from "@/lib/config/constants";

/**
 * The Sentinel mark: a shield with a radar sweep inside it.
 *
 * Inline SVG with no remote asset and no icon font, so the logo renders
 * identically offline and cannot be a tracking vector. `currentColor` is used
 * throughout so it inherits the surrounding text colour in both themes.
 */
export function SentinelMark({
  className,
  animated = false,
}: {
  className?: string;
  animated?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={cn("size-7", className)}
      role="img"
      aria-label={`${APP_NAME} logo`}
    >
      {/* Shield outline */}
      <path
        d="M16 2.5 4.5 6.8v9.4c0 6.6 4.7 11.6 11.5 13.3 6.8-1.7 11.5-6.7 11.5-13.3V6.8L16 2.5Z"
        className="fill-accent/12 stroke-accent"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      {/* Radar rings */}
      <circle cx="16" cy="15.5" r="7.6" className="stroke-accent/30" strokeWidth="1" />
      <circle cx="16" cy="15.5" r="4.6" className="stroke-accent/45" strokeWidth="1" />
      <circle cx="16" cy="15.5" r="1.5" className="fill-accent" />
      {/* Sweep arm */}
      <g className={animated ? "origin-[16px_15.5px] animate-sweep" : undefined}>
        <path d="M16 15.5 L16 7.9" className="stroke-accent" strokeWidth="1.5" strokeLinecap="round" />
        <path
          d="M16 7.9 A7.6 7.6 0 0 1 21.4 10.1 L16 15.5 Z"
          className="fill-accent/20"
        />
      </g>
      {/* Contact blip */}
      <circle cx="20.4" cy="11.3" r="1.25" className="fill-review" />
    </svg>
  );
}

export function SentinelLogo({
  className,
  showTagline = true,
  animated = false,
}: {
  className?: string;
  showTagline?: boolean;
  animated?: boolean;
}) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <SentinelMark animated={animated} />
      <span className="flex min-w-0 flex-col leading-none">
        <span className="text-sm font-semibold tracking-tight text-foreground">
          {APP_NAME}
        </span>
        {showTagline ? (
          <span className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-wider text-foreground-subtle">
            {APP_TAGLINE}
          </span>
        ) : null}
      </span>
    </span>
  );
}
