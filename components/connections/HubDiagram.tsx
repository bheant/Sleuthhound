import type { CSSProperties } from "react";
import { Crosshair } from "@/components/ui/Crosshair";
import { HubIconSvg } from "./HubIcons";
import { HUB_CX, HUB_CY, HUB_H, HUB_W, type HubNode, type Tone } from "./hub-model";

// Lines are SVG in the diagram's own coordinates; nodes and labels are HTML
// laid over them by percentage, so text never stretches with the plate.

const LINE_COLOUR = {
  bright: "var(--border-bright)",
  control: "var(--border-control)",
  muted: "var(--text-muted)",
  error: "var(--status-error-line)",
};
const DASH = { solid: undefined, dashed: "4 4", dotted: "1 3" };

const TONE: Record<Tone, string> = {
  muted: "text-ink-muted",
  secondary: "text-ink-secondary",
  error: "text-error-ink",
  overdue: "text-overdue",
  data: "text-data",
};
const BORDER = { bright: "border-bright", strong: "border-strong", error: "border-error" };
const INK = { bright: "text-bright", secondary: "text-ink-secondary", error: "text-error-ink" };

const pct = (v: number, of: number) => `${(v / of) * 100}%`;

// Lines grow from the centre: scale about the end that touches it.
function lineOrigin(n: HubNode): CSSProperties {
  return { transformOrigin: `${n.x < HUB_CX ? "100%" : "0%"} ${n.y < HUB_CY ? "100%" : "0%"}` };
}

function Grid() {
  const xs = [96, 192, 288, 384, 480, 576, 768, 864, 960, 1056, 1152, 1248];
  const ys = [65, 130, 195, 325, 390, 455];
  const d = [...xs.map((x) => `M${x} 0V${HUB_H}`), ...ys.map((y) => `M0 ${y}H${HUB_W}`)].join("");
  return (
    <>
      <path d={d} stroke="var(--plate-grid)" vectorEffect="non-scaling-stroke" />
      <path d={`M${HUB_CX} 0V${HUB_H}M0 ${HUB_CY}H${HUB_W}`} stroke="var(--border-faint)" vectorEffect="non-scaling-stroke" />
    </>
  );
}

function Node({ n }: { n: HubNode }) {
  return (
    <div
      className="absolute"
      style={{ left: pct(n.x, HUB_W), top: pct(n.y, HUB_H), transform: "translate(-50%, -28px)" }}
    >
      <div role="img" aria-label={n.aria} data-leaving={n.leaving} className="hub-node flex flex-col items-center gap-1.5">
        <span className={`flex size-14 items-center justify-center border bg-field ${BORDER[n.border]} ${INK[n.ink]}`}>
          <HubIconSvg icon={n.icon} />
        </span>
        <span className="text-[14px] leading-[18px] whitespace-nowrap">{n.name}</span>
        {n.status ? (
          <span className={`text-[12px] leading-4 whitespace-nowrap ${TONE[n.statusTone]}`}>{n.status}</span>
        ) : null}
      </div>
    </div>
  );
}

function Legend() {
  const items: Array<[string, string]> = [
    ["border-solid border-bright", "Connected"],
    ["border-solid border-control", "Standby AI"],
    ["border-dashed border-ink-muted", "Testing or awaiting approval"],
    ["border-dotted border-ink-muted", "Paused"],
    ["border-dashed border-error", "Failed or key rejected"],
  ];
  return (
    <div className="mt-3 flex flex-wrap justify-end gap-x-[18px] gap-y-1.5 text-[12px] leading-4 text-ink-secondary">
      {items.map(([line, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span aria-hidden className={`h-0 w-[18px] border-t ${line}`} />
          {label}
        </span>
      ))}
    </div>
  );
}

export function HubDiagram({ nodes }: { nodes: HubNode[] }) {
  const empty = nodes.length === 0;
  return (
    <section aria-labelledby="hub-h" className="sh-in sh-d3 mx-gutter mt-[120px] max-md:hidden">
      <h2 id="hub-h" className="sr-only">
        What’s connected to Sleuthhound
      </h2>
      <div className="relative min-h-[380px] overflow-hidden border border-faint bg-plate" style={{ aspectRatio: `${HUB_W} / ${HUB_H}` }}>
        <svg
          viewBox={`0 0 ${HUB_W} ${HUB_H}`}
          preserveAspectRatio="none"
          aria-hidden
          className="absolute inset-0 size-full"
        >
          <Grid />
          {nodes.map((n) => (
            <line
              key={n.id}
              x1={HUB_CX}
              y1={HUB_CY}
              x2={n.x}
              y2={n.y}
              stroke={LINE_COLOUR[n.line.colour]}
              strokeDasharray={DASH[n.line.style]}
              vectorEffect="non-scaling-stroke"
              data-leaving={n.leaving}
              className="hub-line"
              style={lineOrigin(n)}
            />
          ))}
        </svg>

        {nodes.map((n) => (
          <span
            key={n.id}
            aria-hidden
            data-leaving={n.leaving}
            className={`hub-label absolute -translate-x-1/2 -translate-y-1/2 bg-plate px-1.5 text-[11px] leading-4 whitespace-nowrap ${TONE[n.labelTone]}`}
            style={{ left: pct((HUB_CX + n.x) / 2, HUB_W), top: pct((HUB_CY + n.y) / 2, HUB_H) }}
          >
            {n.label}
          </span>
        ))}

        {empty ? (
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
            <p className="m-0 text-[clamp(40px,4.4vw,64px)] leading-none font-light tracking-[-0.03em]">Sleuthhound</p>
            <p className="mt-4 mb-0 text-[14px] text-ink-muted">Nothing connected yet. Each key you add below appears here.</p>
          </div>
        ) : (
          <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-9 flex-col items-center gap-2.5">
            <span className="flex size-[72px] items-center justify-center border border-bright bg-black">
              <Crosshair size={34} />
            </span>
            <span className="bg-plate px-1.5 text-[18px] leading-6">Sleuthhound</span>
          </div>
        )}

        {nodes.map((n) => (
          <Node key={n.id} n={n} />
        ))}
      </div>
      {empty ? null : <Legend />}
    </section>
  );
}
