/**
 * Abstract illustration of AVEN's connected modules. Deliberately contains
 * no numbers, balances or people, so nothing on the landing page is fake data.
 */
const NODES = [
  { label: "Money", x: 70, y: 70 },
  { label: "Intelligence", x: 330, y: 58 },
  { label: "Memory", x: 376, y: 220 },
  { label: "Wellbeing", x: 300, y: 362 },
  { label: "Planning", x: 74, y: 334 },
  { label: "Nudges", x: 26, y: 200 },
];

export function ConnectionsIllustration() {
  const cx = 210;
  const cy = 210;
  return (
    <svg
      viewBox="-30 0 480 420"
      role="img"
      aria-label="Diagram: Money, Intelligence, Memory, Wellbeing, Planning and Nudges all connect to your personal agent and memory at the centre."
      className="h-auto w-full max-w-[520px]"
    >
      <defs>
        <radialGradient id="aven-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r="190" fill="url(#aven-glow)" />
      <circle
        cx={cx}
        cy={cy}
        r="150"
        fill="none"
        stroke="var(--line-strong)"
        strokeDasharray="2 6"
        className="illo-spin"
        style={{ transformOrigin: `${cx}px ${cy}px` }}
      />
      {NODES.map((n) => (
        <line
          key={`l-${n.label}`}
          x1={cx}
          y1={cy}
          x2={n.x}
          y2={n.y}
          stroke="var(--accent)"
          strokeOpacity="0.45"
          strokeWidth="1.2"
          strokeDasharray="3 7"
          className="illo-flow"
        />
      ))}
      {NODES.map((n, i) => (
        <line
          key={`r-${n.label}`}
          x1={n.x}
          y1={n.y}
          x2={NODES[(i + 1) % NODES.length]!.x}
          y2={NODES[(i + 1) % NODES.length]!.y}
          stroke="var(--line)"
          strokeWidth="1"
        />
      ))}
      <g>
        <circle
          cx={cx}
          cy={cy}
          r="58"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.5"
          className="illo-pulse"
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        />
        <circle cx={cx} cy={cy} r="58" fill="var(--primary)" />
        <text
          x={cx}
          y={cy - 4}
          textAnchor="middle"
          fontSize="15"
          fontWeight="600"
          fill="var(--primary-fg)"
        >
          Your agent
        </text>
        <text
          x={cx}
          y={cy + 16}
          textAnchor="middle"
          fontSize="11.5"
          fill="var(--primary-fg)"
          fillOpacity="0.6"
          fontWeight="600"
        >
          + memory
        </text>
      </g>
      {NODES.map((n, i) => (
        <g key={n.label} className="illo-float" style={{ animationDelay: `${i * -1.1}s` }}>
          <rect
            x={n.x - 58}
            y={n.y - 17}
            width="116"
            height="34"
            rx="17"
            fill="var(--surface)"
            stroke="var(--line-strong)"
          />
          <circle cx={n.x - 42} cy={n.y} r="4" fill="var(--accent)" />
          <text
            x={n.x + 7}
            y={n.y + 4.5}
            textAnchor="middle"
            fontSize="12.5"
            fontWeight="500"
            fill="var(--ink)"
          >
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
