// The phone layouts take over below 768px (Tailwind's md). Checked when
// something happens, never during render, so server and client render alike.
export const PHONE_QUERY = "(max-width: 767px)";

export function isPhone(): boolean {
  return typeof window !== "undefined" && window.matchMedia(PHONE_QUERY).matches;
}
