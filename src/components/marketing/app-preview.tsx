/**
 * A static, coded preview of the AVEN overview for the landing page.
 * Clearly labelled as example data; it uses the same tokens as the app,
 * so it always matches the real product's look.
 */

const MONTHS = ["Jun", "Jul", "Aug", "Sep", "Oct", "Nov"];
const INCOME = [380, 392, 388, 410, 405, 418];
const SPEND = [262, 301, 248, 296, 274, 239];

function path(values: number[], w: number, h: number, min: number, max: number) {
  const x = (i: number) => (i / (values.length - 1)) * w;
  const y = (v: number) => h - ((v - min) / (max - min)) * h;
  let d = `M${x(0)},${y(values[0]!)}`;
  for (let i = 1; i < values.length; i++) {
    const cx = (x(i - 1) + x(i)) / 2;
    d += ` C${cx},${y(values[i - 1]!)} ${cx},${y(values[i]!)} ${x(i)},${y(values[i]!)}`;
  }
  return d;
}

export function AppPreview() {
  const W = 520;
  const H = 120;
  const income = path(INCOME, W, H, 200, 440);
  const spend = path(SPEND, W, H, 200, 440);
  return (
    <figure
      className="relative w-full lg:[perspective:1800px]"
      aria-label="Example of the AVEN overview, with sample figures"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-10 -z-10 rounded-[3rem] bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--accent)_16%,transparent),transparent),radial-gradient(closest-side_at_80%_80%,color-mix(in_srgb,var(--aurora)_14%,transparent),transparent)] blur-2xl"
      />
      {/* Floating example cards (decorative, inside the labelled example). */}
      <div
        aria-hidden="true"
        className="glass edge-light absolute -top-6 -left-8 z-10 hidden w-44 rounded-2xl p-3.5 lg:block"
      >
        <p className="text-ink-subtle text-[11px]">Savings goal</p>
        <p className="text-ink mt-0.5 text-sm font-medium">New laptop</p>
        <div className="bg-surface-muted mt-3 h-1.5 overflow-hidden rounded-full">
          <div className="h-full w-[62%] rounded-full bg-[linear-gradient(90deg,var(--aurora),var(--accent))]" />
        </div>
        <p className="text-ink-muted mt-1.5 text-[11px]">62% saved</p>
      </div>
      <div
        aria-hidden="true"
        className="glass edge-light absolute -right-6 -bottom-8 z-10 hidden w-52 rounded-2xl p-3.5 lg:block"
      >
        <div className="flex items-center gap-2.5">
          <span className="icon-tile text-warning size-8 text-xs">!</span>
          <div className="min-w-0">
            <p className="text-ink truncate text-xs font-medium">Food budget at 80%</p>
            <p className="text-ink-subtle text-[11px]">Nudge · just now</p>
          </div>
        </div>
      </div>
      <div className="border-line-strong bg-panel shadow-elev-3 overflow-hidden rounded-2xl border lg:[transform:rotateY(-7deg)_rotateX(3deg)] lg:[transform-style:preserve-3d]">
        <div className="border-line flex items-center justify-between border-b px-4 py-2.5">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="bg-line-strong size-2.5 rounded-full" />
            <span className="bg-line-strong size-2.5 rounded-full" />
            <span className="bg-line-strong size-2.5 rounded-full" />
          </div>
          <span className="text-ink-subtle text-xs">Example data</span>
        </div>

        <div className="grid grid-cols-[120px_1fr] max-sm:grid-cols-1">
          <ul
            className="border-line text-ink-muted flex flex-col gap-1 border-r p-3 text-xs max-sm:hidden"
            aria-hidden="true"
          >
            {["Overview", "Money", "Planning", "Nudge Center", "Wellbeing"].map((n, i) => (
              <li
                key={n}
                className={
                  i === 0 ? "bg-surface-muted text-ink rounded-md px-2 py-1.5" : "px-2 py-1.5"
                }
              >
                {n}
              </li>
            ))}
          </ul>

          <div className="flex min-w-0 flex-col gap-3 p-4">
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "Balance", value: "NGN 412,500" },
                { label: "Spent in Nov", value: "NGN 96,200", note: "−12% vs Oct" },
                { label: "Habits today", value: "2/3" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="border-line bg-surface shadow-elev-1 rounded-xl border p-3"
                >
                  <p className="text-ink-subtle text-[11px]">{s.label}</p>
                  <p className="type-figure text-ink mt-1.5 text-[11px] whitespace-nowrap sm:text-base">
                    {s.value}
                  </p>
                  {s.note ? <p className="text-success mt-1 text-[11px]">{s.note}</p> : null}
                </div>
              ))}
            </div>

            <div className="border-line bg-surface shadow-elev-1 rounded-xl border p-3">
              <div className="flex items-center justify-between">
                <p className="text-ink text-xs font-medium">Cash flow</p>
                <p className="text-ink-subtle flex gap-3 text-[11px]">
                  <span className="inline-flex items-center gap-1">
                    <span className="bg-accent h-0.5 w-3 rounded" /> Income
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="bg-ink-muted h-0.5 w-3 rounded" /> Spending
                  </span>
                </p>
              </div>
              <svg
                viewBox={`0 -6 ${W} ${H + 12}`}
                className="mt-3 h-24 w-full"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <defs>
                  <linearGradient id="pv-inc" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                  </linearGradient>
                </defs>
                {[0.33, 0.66].map((t) => (
                  <line
                    key={t}
                    x1="0"
                    x2={W}
                    y1={H * t}
                    y2={H * t}
                    stroke="var(--line)"
                    strokeDasharray="3 5"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                <path d={`${income} L${W},${H} L0,${H} Z`} fill="url(#pv-inc)" />
                <path
                  d={spend}
                  fill="none"
                  stroke="var(--ink-muted)"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                />
                <path
                  d={income}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <div className="text-ink-subtle mt-1 flex justify-between font-mono text-[10px]">
                {MONTHS.map((m) => (
                  <span key={m}>{m}</span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="border-line bg-surface shadow-elev-1 rounded-xl border p-3">
                <p className="text-ink text-xs font-medium">Today</p>
                <ul className="mt-2 flex flex-col gap-1.5 text-[11px]">
                  <li className="flex items-center gap-2">
                    <span className="bg-accent size-1.5 rounded-full" />
                    <span className="text-ink-muted flex-1 truncate">Pay electricity bill</span>
                    <span className="text-ink-subtle font-mono">09:00</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="bg-info size-1.5 rounded-full" />
                    <span className="text-ink-muted flex-1 truncate">Gym</span>
                    <span className="text-ink-subtle font-mono">18:00</span>
                  </li>
                </ul>
              </div>
              <div className="border-line bg-surface shadow-elev-1 rounded-xl border p-3">
                <p className="text-ink text-xs font-medium">Read 20 minutes</p>
                <div className="mt-2 flex gap-1" aria-hidden="true">
                  {[1, 1, 1, 0, 1, 1, 1].map((d, i) => (
                    <span
                      key={i}
                      className={
                        d
                          ? "bg-accent h-4 flex-1 rounded-sm"
                          : "bg-surface-muted h-4 flex-1 rounded-sm"
                      }
                    />
                  ))}
                </div>
                <p className="text-ink-subtle mt-2 text-[11px]">12-day streak</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}
