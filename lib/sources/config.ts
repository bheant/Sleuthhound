import { z } from "zod";

// sources.config, validated on read so a run never trusts a hand-edited row.

export const SCHEDULES = ["hourly", "every_6_hours", "daily"] as const;
export type Schedule = (typeof SCHEDULES)[number];

export const sourceConfig = z.object({
  scope: z.unknown(),
  mapping: z.unknown().optional(),
  schedule: z.enum(SCHEDULES).default("hourly"),
  max_items: z.number().int().min(1).max(1000).default(200),
  spend_cap_gbp: z.number().min(0).nullable().default(null),
  weight: z.enum(["low", "normal", "high"]).default("normal"),
  describe_text: z.string().nullable().default(null),
});
export type SourceConfig = z.infer<typeof sourceConfig>;

const HOUR = 3_600_000;

// Runs land on the hour, like the design's "Last run 14:00, next run 15:00":
// hourly at the next whole hour, every 6 hours at 00, 06, 12 or 18, daily at 08.
export function nextRunAt(schedule: Schedule, from: Date = new Date()): Date {
  const next = new Date(from);
  next.setMinutes(0, 0, 0);
  if (schedule === "hourly") {
    next.setTime(next.getTime() + HOUR);
    return next;
  }
  if (schedule === "every_6_hours") {
    next.setHours(next.getHours() - (next.getHours() % 6) + 6);
    return next;
  }
  next.setHours(8);
  if (next <= from) next.setDate(next.getDate() + 1);
  return next;
}
