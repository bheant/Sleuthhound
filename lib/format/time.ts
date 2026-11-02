// Dates and times in UK style: 24-hour times, "14 May 2027". Rendered on the
// server, which is the user's own Mac, so local time is the user's time.

const timeFmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const clockFmt = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});
const dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "14:03" */
export function formatTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

/** "14:03:12" */
export function formatClock(iso: string): string {
  return clockFmt.format(new Date(iso));
}

/** "14:03" today, otherwise "18 Oct". */
export function formatShort(iso: string, now = new Date()): string {
  const d = new Date(iso);
  return sameDay(d, now) ? timeFmt.format(d) : dayFmt.format(d);
}

/** "Today at 14:00", otherwise "18 Oct at 14:00". */
export function formatDayTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  return `${sameDay(d, now) ? "Today" : dayFmt.format(d)} at ${timeFmt.format(d)}`;
}


const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });
const longDayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });

/** "14 May 2027". Date-only strings are read as local dates. */
export function formatDate(iso: string): string {
  return dateFmt.format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso));
}

/** "Saturday 17 October" */
export function formatLongDay(d = new Date()): string {
  return longDayFmt.format(d).replace(",", "");
}

const shortDateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** "2 Mar 2027", for tight spaces such as the Deadlines timeline. */
export function formatShortDate(iso: string): string {
  return shortDateFmt.format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso)).replace("Sept", "Sep");
}

/** "the 14:00 run" today, otherwise "the 14:00 run on 18 Oct". */
export function runName(iso: string, now = new Date()): string {
  const d = new Date(iso);
  return sameDay(d, now) ? `the ${timeFmt.format(d)} run` : `the ${timeFmt.format(d)} run on ${dayFmt.format(d)}`;
}

/** "15:00" today, otherwise "20 Oct at 09:00". */
export function formatWhen(iso: string, now = new Date()): string {
  const d = new Date(iso);
  return sameDay(d, now) ? timeFmt.format(d) : `${dayFmt.format(d)} at ${timeFmt.format(d)}`;
}

/** "Giaan" from "giaan" or "Giaan Shah", for the Home welcome. */
export function firstNameOf(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first.charAt(0).toLocaleUpperCase("en-GB") + first.slice(1);
}
