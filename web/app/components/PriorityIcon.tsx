/**
 * Linear-style priority icon.
 *
 * Priority numbers follow Linear's scale: 0 No priority, 1 Urgent, 2 High,
 * 3 Medium, 4 Low. High/Medium/Low share the three-bar shape and differ only
 * by how many bars are solid; Urgent is the orange exclamation tile; No
 * priority is three faint dashes. See workos-design-system/icons/priority.
 */

interface PriorityIconProps {
  priority: number;
  size?: number;
  className?: string;
}

const URGENT = "#fc7840";
const BAR = "#6b6f76";
const FAINT_OPACITY = 0.32;

/** Number of solid bars for High/Medium/Low. */
const SOLID_BARS: Record<number, number> = { 2: 3, 3: 2, 4: 1 };

const BARS = [
  { x: 1.5, y: 8, h: 6 },
  { x: 6.5, y: 5, h: 9 },
  { x: 11.5, y: 2, h: 12 },
];

export default function PriorityIcon({
  priority,
  size = 16,
  className,
}: PriorityIconProps) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    xmlns: "http://www.w3.org/2000/svg",
    className,
    "aria-hidden": true,
    style: { flexShrink: 0, display: "block" } as const,
  };

  if (priority === 1) {
    return (
      <svg {...common} fill={URGENT}>
        <path d="M3 1C1.91 1 1 1.91 1 3V13C1 14.09 1.91 15 3 15H13C14.09 15 15 14.09 15 13V3C15 1.91 14.09 1 13 1H3ZM7 4L9 4L8.75 9H7.25L7 4ZM9 11C9 11.55 8.55 12 8 12C7.45 12 7 11.55 7 11C7 10.45 7.45 10 8 10C8.55 10 9 10.45 9 11Z" />
      </svg>
    );
  }

  if (priority === 0) {
    return (
      <svg {...common} fill={BAR}>
        {BARS.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={7.25}
            width={3}
            height={1.5}
            rx={0.5}
            opacity={0.5}
          />
        ))}
      </svg>
    );
  }

  const solid = SOLID_BARS[priority] ?? 0;
  return (
    <svg {...common} fill={BAR}>
      {BARS.map((b, i) => (
        <rect
          key={i}
          x={b.x}
          y={b.y}
          width={3}
          height={b.h}
          rx={1}
          opacity={i < solid ? 1 : FAINT_OPACITY}
        />
      ))}
    </svg>
  );
}
