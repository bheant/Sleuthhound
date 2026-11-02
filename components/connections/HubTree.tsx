import { Crosshair } from "@/components/ui/Crosshair";
import { HubIconSvg } from "./HubIcons";
import type { HubNode, Tone } from "./hub-model";

// The hub on phone: the same nodes as the diagram, as a tree under
// Sleuthhound. Each branch keeps the diagram's line style, so connected,
// standby, testing, paused and failed read the same way.

const TONE: Record<Tone, string> = {
  muted: "text-ink-muted",
  secondary: "text-ink-secondary",
  error: "text-error-ink",
  overdue: "text-overdue",
  data: "text-data",
};
const BORDER = { bright: "border-bright", strong: "border-strong", error: "border-error" };
const INK = { bright: "text-bright", secondary: "text-ink-secondary", error: "text-error-ink" };
const LINE_STYLE = { solid: "border-solid", dashed: "border-dashed", dotted: "border-dotted" };
const LINE_COLOUR = { bright: "border-bright", control: "border-control", muted: "border-ink-muted", error: "border-error" };

type Props = { nodes: HubNode[]; summary: string };

export function HubTree({ nodes, summary }: Props) {
  return (
    <section aria-labelledby="hub-tree-h" className="sh-in sh-d3 mx-gutter mt-16 border border-faint bg-plate px-4 pt-4 pb-5 md:hidden">
      <h2 id="hub-tree-h" className="sr-only">
        What’s connected to Sleuthhound
      </h2>
      <div className="flex items-center gap-4">
        <span className="flex size-11 shrink-0 items-center justify-center border border-bright bg-black">
          <Crosshair size={22} />
        </span>
        <span className="text-[17px]">Sleuthhound</span>
      </div>
      {nodes.length === 0 ? (
        <p className="mt-4 mb-0 text-[14px] text-ink-muted">Nothing connected yet. Each key you add below appears here.</p>
      ) : (
        <ul className="relative m-0 ml-[21px] list-none border-l border-strong p-0">
          {nodes.map((n) => {
            const sub = n.status && n.status !== n.label ? n.status : null;
            // The diagram's line labels are written for a long edge; the tree is narrower.
            const label = n.label.replace(/, reviews companies$/, "");
            return (
              <li key={n.id} role="img" aria-label={n.aria} className="relative flex items-center gap-3 pt-4 pl-6">
                <span
                  aria-hidden
                  className={`absolute top-[calc(1rem+16px)] left-0 w-6 border-t ${LINE_STYLE[n.line.style]} ${LINE_COLOUR[n.line.colour]}`}
                />
                <span className={`flex size-8 shrink-0 items-center justify-center border bg-field ${BORDER[n.border]} ${INK[n.ink]} [&_svg]:size-4`}>
                  <HubIconSvg icon={n.icon} />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] leading-5">{n.name}</span>
                  <span className="flex flex-wrap gap-x-4 text-[12px] leading-4">
                    <span className={TONE[n.labelTone]}>{label}</span>
                    {sub ? <span className={TONE[n.statusTone]}>{sub}</span> : null}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-5 mb-0 border-t border-subtle pt-4 text-[13px] leading-5 text-ink-muted">{summary}</p>
    </section>
  );
}
