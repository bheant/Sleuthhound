import type { HubIcon } from "./hub-model";

// 18px-grid line icons from the design source, drawn at 22px in node tiles.
const PATHS: Record<HubIcon, string> = {
  ai: "M5 5h8v8H5zM7 2v3M11 2v3M7 13v3M11 13v3M2 7h3M2 11h3M13 7h3M13 11h3",
  building: "M3 16V3h7v13M10 7h5v9M5.5 6h2M5.5 9h2M5.5 12h2M12.5 10h0.5M12.5 13h0.5M1.5 16h15",
  document: "M5 2.5h6l3 3v10H5zM11 2.5v3h3M7.5 9h5M7.5 12h5",
  chat: "M2.5 3.5h13v8.5H8l-3.5 3v-3h-2zM5.5 7h7M5.5 9.5h4.5",
  chats: "M2 3h9v6H6.5L4 11V9H2zM13 7h3v6h-1.5v2L12 13H8.5v-2",
  source: "M7 4H3.5v10.5H14V11M10 2.5h5.5V8M15.5 2.5 8 10",
  mail: "M2.5 4.5h13v9h-13zM2.5 4.5 9 10l6.5-5.5",
  send: "M9 11V2.5M5.5 6 9 2.5 12.5 6M3 9.5v6h12v-6",
};

export function HubIconSvg({ icon }: { icon: HubIcon }) {
  return (
    <svg width="22" height="22" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d={PATHS[icon]} stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
