// What the hub diagram draws: one node per connected service or source, each
// with a line from the centre styled by status. Coordinates are in the
// diagram's 1344 × 520 space, centre (672, 260), as in the design source.

export const HUB_W = 1344;
export const HUB_H = 520;
export const HUB_CX = 672;
export const HUB_CY = 260;

export type KeyState = "off" | "testing" | "connected" | "rejected" | "removing";
export type SourceState = "connected" | "paused" | "failed" | "awaiting_approval";
export type HubIcon = "ai" | "building" | "document" | "chat" | "chats" | "source" | "mail" | "send";
export type Tone = "muted" | "secondary" | "error" | "overdue" | "data";

export type HubNode = {
  id: string;
  name: string;
  icon: HubIcon;
  x: number;
  y: number;
  line: { style: "solid" | "dashed" | "dotted"; colour: "bright" | "control" | "muted" | "error" };
  label: string;
  labelTone: Tone;
  border: "bright" | "strong" | "error";
  ink: "bright" | "secondary" | "error";
  status: string;
  statusTone: Tone;
  leaving: boolean;
  aria: string;
};

export type HubKeyInput = { state: KeyState; failedLabel: string; sub: string | null };

export type HubSourceInput = {
  id: string;
  name: string;
  label: string;
  connector: string;
  state: SourceState;
  sub: string;
  failedLine: string;
};

export type HubAiInput = { id: "anthropic" | "openai" | "xai"; name: string; key: HubKeyInput; isDefault: boolean };

export type HubInput = {
  ais: HubAiInput[];
  companiesHouse: HubKeyInput;
  apollo: HubKeyInput;
  hubspot: HubKeyInput;
  sources: HubSourceInput[];
};

// The AIs sit on the left, Claude and Grok where the design has them; ChatGPT
// (not drawn in the design) between them. Apollo and HubSpot take the top and
// the far right, clear of the source spots.
const SPOTS = {
  anthropic: { x: 330, y: 110 },
  openai: { x: 150, y: 262 },
  xai: { x: 330, y: 408 },
  companiesHouse: { x: 1014, y: 92 },
  registers: { x: 672, y: 462 },
  apollo: { x: 520, y: 62 },
  hubspot: { x: 1250, y: 380 },
};

// Places for added sources, right side first. Past five, the Connections graph
// (phase 7) is the better view; the hub shows the first five.
const SOURCE_SPOTS = [
  { x: 1090, y: 262 },
  { x: 1014, y: 432 },
  { x: 1210, y: 150 },
  { x: 870, y: 470 },
  { x: 480, y: 450 },
];

function keyNode(
  id: string,
  name: string,
  icon: HubIcon,
  spot: { x: number; y: number },
  key: HubKeyInput,
  connectedLabel: string,
  standby = false,
): HubNode | null {
  if (key.state === "off") return null;
  const base = { id, name, icon, ...spot, leaving: key.state === "removing" };
  switch (key.state) {
    case "testing":
      return {
        ...base,
        line: { style: "dashed", colour: "muted" },
        label: "Testing…",
        labelTone: "secondary",
        border: "strong",
        ink: "bright",
        status: "Testing…",
        statusTone: "muted",
        aria: `${name}: testing`,
      };
    case "rejected":
      return {
        ...base,
        line: { style: "dashed", colour: "error" },
        label: key.failedLabel,
        labelTone: "error",
        border: "error",
        ink: "error",
        status: key.failedLabel,
        statusTone: "error",
        aria: `${name}: ${key.failedLabel.toLowerCase()}`,
      };
    default:
      return {
        ...base,
        line: { style: "solid", colour: standby || base.leaving ? "control" : "bright" },
        label: standby ? "Standby AI" : connectedLabel,
        labelTone: "secondary",
        border: standby ? "strong" : "bright",
        ink: "bright",
        status: key.sub ?? "Connected",
        statusTone: "muted",
        aria: `${name}: connected`,
      };
  }
}

const SOURCE_ICONS: Record<string, HubIcon> = { hacker_news: "chat", reddit: "chats", csv: "document" };

function sourceNode(s: HubSourceInput, spot: { x: number; y: number }): HubNode {
  const base = { id: s.id, name: s.name, icon: SOURCE_ICONS[s.connector] ?? "source", ...spot, leaving: false };
  switch (s.state) {
    case "awaiting_approval":
      return {
        ...base,
        line: { style: "dashed", colour: "muted" },
        label: "Awaiting approval",
        labelTone: "overdue",
        border: "strong",
        ink: "bright",
        status: s.sub,
        statusTone: "muted",
        aria: `${s.name}: awaiting approval`,
      };
    case "failed":
      return {
        ...base,
        line: { style: "dashed", colour: "error" },
        label: s.failedLine,
        labelTone: "error",
        border: "error",
        ink: "error",
        status: "Failed",
        statusTone: "error",
        aria: `${s.name}: failed`,
      };
    case "paused":
      return {
        ...base,
        line: { style: "dotted", colour: "muted" },
        label: "Paused",
        labelTone: "secondary",
        border: "strong",
        ink: "secondary",
        status: "Paused",
        statusTone: "secondary",
        aria: `${s.name}: paused`,
      };
    default:
      return {
        ...base,
        line: { style: "solid", colour: "bright" },
        label: s.label,
        labelTone: "secondary",
        border: "bright",
        ink: "bright",
        status: s.sub,
        statusTone: "muted",
        aria: `${s.name}: connected`,
      };
  }
}

export function buildHub(input: HubInput): HubNode[] {
  const nodes: (HubNode | null)[] = [
    ...input.ais.map((ai) => keyNode(ai.id, ai.name, "ai", SPOTS[ai.id], ai.key, "Default AI, reviews companies", !ai.isDefault)),
    keyNode("companies_house", "Companies House", "building", SPOTS.companiesHouse, input.companiesHouse, "Company data"),
    keyNode("apollo", "Apollo", "mail", SPOTS.apollo, input.apollo, "Directors’ emails"),
    keyNode("hubspot", "HubSpot", "send", SPOTS.hubspot, input.hubspot, "Kept companies"),
  ];

  // Public registers need no key; they ride on the Companies House connection.
  const ch = input.companiesHouse.state;
  if (ch === "connected" || ch === "removing") {
    nodes.push({
      id: "registers",
      name: "Public registers",
      icon: "document",
      ...SPOTS.registers,
      line: { style: "solid", colour: "control" },
      label: "Background checks",
      labelTone: "secondary",
      border: "strong",
      ink: "bright",
      status: "",
      statusTone: "muted",
      leaving: ch === "removing",
      aria: "Public registers: connected through Companies House",
    });
  }

  input.sources.slice(0, SOURCE_SPOTS.length).forEach((s, i) => nodes.push(sourceNode(s, SOURCE_SPOTS[i])));
  return nodes.filter((n): n is HubNode => n !== null);
}
