/**
 * Linear-style workflow status icon.
 *
 * The shape is driven by the state *type* (the same categories Linear uses);
 * the tint is driven by the state's own color so it stays faithful to whatever
 * palette a team configures. See workos-design-system/icons/status for the
 * canonical reference shapes.
 */

type StatusType =
  | "triage"
  | "backlog"
  | "unstarted"
  | "started"
  | "completed"
  | "canceled"
  | string;

interface StatusIconProps {
  type: StatusType;
  color: string;
  size?: number;
  /** Fraction of the started pie that is filled (0-1). Defaults to 0.42. */
  progress?: number;
  className?: string;
}

const DEFAULT_COLOR = "#8a8f98";

export default function StatusIcon({
  type,
  color,
  size = 14,
  progress = 0.42,
  className,
}: StatusIconProps) {
  const c = color || DEFAULT_COLOR;
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 14 14",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    className,
    "aria-hidden": true,
    style: { flexShrink: 0, display: "block" } as const,
  };

  switch (type) {
    case "backlog":
      return (
        <svg {...common}>
          <circle
            cx="7"
            cy="7"
            r="6"
            stroke={c}
            strokeWidth="1.5"
            strokeDasharray="2 2.45"
          />
        </svg>
      );

    case "completed":
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="7" fill={c} />
          <path
            d="M4 7.2 6 9.2 10 4.8"
            stroke="#fff"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
      );

    case "canceled":
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="7" fill={c} />
          <path
            d="M4.6 4.6 9.4 9.4 M9.4 4.6 4.6 9.4"
            stroke="#fff"
            strokeWidth="1.5"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      );

    case "triage":
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="7" fill={c} />
          <rect x="6.25" y="3.2" width="1.5" height="4.2" rx="0.75" fill="#fff" />
          <circle cx="7" cy="10" r="0.95" fill="#fff" />
        </svg>
      );

    case "started":
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="6" stroke={c} strokeWidth="1.5" />
          <path d={piePath(progress)} fill={c} />
        </svg>
      );

    case "unstarted":
    default:
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="6" stroke={c} strokeWidth="1.5" />
        </svg>
      );
  }
}

/** Wedge from 12 o'clock, clockwise, covering `fraction` of the circle. */
function piePath(fraction: number): string {
  const f = Math.min(Math.max(fraction, 0.001), 0.999);
  const r = 3.5;
  const angle = f * 2 * Math.PI; // radians swept clockwise from top
  const endX = 7 + r * Math.sin(angle);
  const endY = 7 - r * Math.cos(angle);
  const largeArc = f > 0.5 ? 1 : 0;
  return `M7 7 L7 ${7 - r} A${r} ${r} 0 ${largeArc} 1 ${round(endX)} ${round(endY)} Z`;
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
