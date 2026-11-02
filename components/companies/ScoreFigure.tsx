import { scoreStep } from "@/lib/targets/format";

// Scores use the data accent at full strength for 80 and above, light grey for
// 60 to 79 and muted below: never red, amber and green, which read as status.
const COLOURS = { high: "text-data", mid: "text-bright", low: "text-bright", under: "text-ink-muted" } as const;

export function scoreColour(score: number): string {
  return COLOURS[scoreStep(score)];
}

export function ScoreFigure({ score, className = "" }: { score: number; className?: string }) {
  return <span className={`tabular-nums ${scoreColour(score)} ${className}`.trim()}>{score}</span>;
}
