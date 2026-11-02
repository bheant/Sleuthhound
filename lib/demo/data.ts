// Demo rows for building the UI before real data arrives. Names and details come
// from the design files. Everything here is written with is_demo = 1.

export type DemoCompany = {
  key: string;
  name: string;
  score: number;
  summary: string;
  borough: string;
  what: string;
  fit: string;
  now: string | null;
  number: string;
  incorporated: string;
  sic: { code: string; label: string };
  accountsDue: string;
  deadline?: { kind: "first_accounts_due" | "accounts_due" | "confirmation_overdue"; title: string; due: string };
  directors: string[];
  formationAgent?: boolean;
  resembles?: string;
  site: string;
};

export const FORMATION_AGENT = { address: "71 Bridle Lane, N1 (formation agent)", postcode: "N1", borough: "Islington" };

// Approximate borough centres; markers get a small deterministic offset.
export const BOROUGHS: Record<string, { lat: number; lng: number; district: string }> = {
  Hackney: { lat: 51.545, lng: -0.055, district: "E8" },
  Islington: { lat: 51.538, lng: -0.103, district: "N1" },
  Newham: { lat: 51.525, lng: 0.035, district: "E15" },
  Southwark: { lat: 51.488, lng: -0.078, district: "SE1" },
  Lambeth: { lat: 51.462, lng: -0.117, district: "SE11" },
  Haringey: { lat: 51.588, lng: -0.11, district: "N17" },
  Wandsworth: { lat: 51.457, lng: -0.192, district: "SW18" },
  Camden: { lat: 51.545, lng: -0.163, district: "NW1" },
  "Tower Hamlets": { lat: 51.515, lng: -0.035, district: "E1" },
  Greenwich: { lat: 51.478, lng: 0.01, district: "SE10" },
};

const sic = (code: string, label: string) => ({ code, label });
const SOFTWARE = sic("62012", "Business and domestic software");

export const DEMO_COMPANIES: DemoCompany[] = [
  { key: "northwind", name: "Northwind Labs Ltd", score: 92, summary: "First accounts due May", borough: "Hackney", what: "Invoicing software for UK construction subcontractors.", fit: "Seed-stage B2B SaaS with no finance hire, the same shape as Acme Analytics and two other clients.", now: "First accounts due 14 May 2027.", number: "14829301", incorporated: "2025-08-14", sic: SOFTWARE, accountsDue: "2027-05-14", deadline: { kind: "first_accounts_due", title: "First accounts due", due: "2027-05-14" }, directors: ["J. Okafor", "S. Marsh"], resembles: "acme", site: "northwindlabs.io" },
  { key: "quill", name: "Quill & Co Studio Ltd", score: 88, summary: "Agency like Brightside, no CFO", borough: "Islington", what: "Brand and product design studio for early-stage startups.", fit: "Agency billing startups on retainers, like Brightside Studio when it signed.", now: null, number: "15102274", incorporated: "2026-01-02", sic: sic("74100", "Specialised design"), accountsDue: "2027-10-02", directors: ["M. Reyes"], resembles: "brightside", site: "quillandco.studio" },
  { key: "cobalt", name: "Cobalt Freight Ltd", score: 85, summary: "Like Parcel River, accounts due soon", borough: "Newham", what: "Same-day courier network for South-East London retailers.", fit: "Logistics startup at the stage Parcel River was when it signed.", now: "First accounts due 2 Mar 2027.", number: "14630055", incorporated: "2025-06-02", sic: sic("53202", "Delivery services"), accountsDue: "2027-03-02", deadline: { kind: "first_accounts_due", title: "First accounts due", due: "2027-03-02" }, directors: ["D. Mensah"], resembles: "parcel", site: "cobaltfreight.co.uk" },
  { key: "harbour", name: "Harbour Metrics Ltd", score: 81, summary: "Raised seed, hiring", borough: "Southwark", what: "Analytics dashboards for independent pharmacies.", fit: "Recently funded B2B SaaS where a founder still does the books.", now: "Hiring four roles, so payroll grows this year.", number: "14512090", incorporated: "2025-04-03", sic: SOFTWARE, accountsDue: "2027-01-03", deadline: { kind: "accounts_due", title: "Accounts due", due: "2027-01-03" }, directors: ["A. Lindqvist"], resembles: "lumen", site: "harbourmetrics.co" },
  { key: "saltmarsh", name: "Saltmarsh Games Ltd", score: 79, summary: "Raised pre-seed, no accountant", borough: "Hackney", what: "Mobile puzzle game studio.", fit: "Funded software company with founders handling the books.", now: null, number: "14402233", incorporated: "2025-01-14", sic: sic("58210", "Publishing of games"), accountsDue: "2027-01-31", deadline: { kind: "accounts_due", title: "Accounts due", due: "2027-01-31" }, directors: ["E. Bauer", "S. Marsh"], site: "saltmarshgames.com" },
  { key: "kiln", name: "Kiln Commerce Ltd", score: 78, summary: "VAT registered, sales growing", borough: "Lambeth", what: "Online shop for handmade ceramics.", fit: "E-commerce with a fresh VAT registration, the point Kelp & Co signed up.", now: "Registered for VAT in September 2026.", number: "13998102", incorporated: "2024-09-12", sic: sic("47910", "Retail via internet"), accountsDue: "2027-06-30", directors: ["R. Patel"], resembles: "kelp", site: "kilncommerce.co.uk" },
  { key: "verdant", name: "Verdant Rooms Ltd", score: 76, summary: "Service business, payroll starting", borough: "Lambeth", what: "Interior design for short-let apartments.", fit: "Service business about to take on staff.", now: "Registered as an employer last month.", number: "14688120", incorporated: "2025-07-30", sic: sic("74100", "Specialised design"), accountsDue: "2027-04-30", deadline: { kind: "accounts_due", title: "Accounts due", due: "2027-04-30" }, directors: ["P. Okonkwo"], site: "verdantrooms.co.uk" },
  { key: "fernleaf", name: "Fernleaf Foods Ltd", score: 74, summary: "Growing, files its own accounts", borough: "Haringey", what: "Plant-based ready meals sold to London delis.", fit: "Self-filing company that has outgrown it by headcount.", now: null, number: "13811456", incorporated: "2024-06-20", sic: sic("10850", "Prepared meals"), accountsDue: "2027-03-31", deadline: { kind: "accounts_due", title: "Accounts due", due: "2027-03-31" }, directors: ["S. Adeyemi"], site: "fernleaffoods.com" },
  { key: "halcyon", name: "Halcyon Bikes Ltd", score: 72, summary: "Selling online, near the VAT threshold", borough: "Wandsworth", what: "Refurbished road bikes sold online.", fit: "E-commerce business close to the VAT threshold.", now: null, number: "14012998", incorporated: "2024-10-11", sic: sic("47640", "Sports goods retail"), accountsDue: "2027-07-31", directors: ["G. Rossi"], resembles: "kelp", site: "halcyonbikes.co.uk" },
  { key: "lattice", name: "Lattice Health Ltd", score: 71, summary: "Like Lumen, no finance team", borough: "Camden", what: "Scheduling software for physiotherapy clinics.", fit: "B2B SaaS under a year old with no finance hire.", now: null, number: "14955310", incorporated: "2025-11-06", sic: SOFTWARE, accountsDue: "2027-08-06", directors: ["T. Hughes"], resembles: "lumen", site: "latticehealth.io" },
  { key: "northgate", name: "Northgate Legal Tech Ltd", score: 69, summary: "Software, 6 months old", borough: "Islington", what: "Contract review tool for small law firms.", fit: "New B2B SaaS registered at a formation agent, so no accountant yet.", now: null, number: "15240119", incorporated: "2026-04-10", sic: SOFTWARE, accountsDue: "2028-01-10", directors: ["H. Shah"], formationAgent: true, site: "northgate.legal" },
  { key: "copperline", name: "Copperline Studio Ltd", score: 68, summary: "Agency, two directors added", borough: "Southwark", what: "Video production for B2B brands.", fit: "Agency growing its leadership team.", now: "Accounts due 30 Nov 2026.", number: "14455002", incorporated: "2025-02-28", sic: sic("59112", "Video production"), accountsDue: "2026-11-30", deadline: { kind: "accounts_due", title: "Accounts due", due: "2026-11-30" }, directors: ["N. Fraser"], site: "copperline.studio" },
  { key: "orbital", name: "Orbital Print Co Ltd", score: 66, summary: "Confirmation statement overdue", borough: "Tower Hamlets", what: "Short-run print shop for events and packaging.", fit: "Small company falling behind on its filings.", now: "Confirmation statement overdue since 2 Oct 2026.", number: "12904417", incorporated: "2023-09-18", sic: sic("18129", "Printing"), accountsDue: "2027-06-30", deadline: { kind: "confirmation_overdue", title: "Confirmation statement overdue", due: "2026-10-02" }, directors: ["K. Novak"], site: "orbitalprint.co.uk" },
  { key: "pine", name: "Pine & Pixel Ltd", score: 64, summary: "Agency at a formation agent’s address", borough: "Islington", what: "Web development agency for hospitality brands.", fit: "Registered at a formation agent’s address, a sign no accountant is set up yet.", now: null, number: "14700821", incorporated: "2025-10-09", sic: sic("62020", "IT consultancy"), accountsDue: "2027-07-09", directors: ["J. Okafor"], formationAgent: true, resembles: "brightside", site: "pineandpixel.co" },
  { key: "ember", name: "Ember & Oak Ltd", score: 63, summary: "Food business, self-filing", borough: "Greenwich", what: "Bakery supplying cafés in Greenwich and Lewisham.", fit: "Self-filing food business with steady growth.", now: null, number: "13700432", incorporated: "2024-04-02", sic: sic("10710", "Bread manufacture"), accountsDue: "2027-01-31", deadline: { kind: "accounts_due", title: "Accounts due", due: "2027-01-31" }, directors: ["C. Murphy"], site: "emberandoak.co.uk" },
  { key: "tessel", name: "Tessel Robotics Ltd", score: 62, summary: "Hardware, seed round", borough: "Greenwich", what: "Warehouse picking robots for small logistics firms.", fit: "Funded hardware startup with no finance team yet.", now: null, number: "14799003", incorporated: "2025-09-15", sic: sic("28990", "Special-purpose machinery"), accountsDue: "2027-06-15", directors: ["Y. Tanaka"], site: "tesselrobotics.com" },
  { key: "mint", name: "Mint & Marrow Ltd", score: 61, summary: "Agency at a formation agent’s address", borough: "Islington", what: "Social media agency for restaurants.", fit: "Young agency with a growing client list.", now: null, number: "15088012", incorporated: "2026-01-21", sic: sic("73110", "Advertising agencies"), accountsDue: "2027-10-21", directors: ["L. Moreau"], formationAgent: true, site: "mintandmarrow.com" },
  { key: "larkspur", name: "Larkspur Tutors Ltd", score: 60, summary: "Service business, 1 year old", borough: "Islington", what: "Online tutoring for GCSE maths and science.", fit: "Young service business taking many small payments.", now: null, number: "14822760", incorporated: "2025-10-12", sic: sic("85590", "Other education"), accountsDue: "2027-07-12", directors: ["F. Ali"], formationAgent: true, site: "larkspurtutors.co.uk" },
];

export type DemoClient = {
  key: string;
  name: string;
  segment: string;
  signedOn: string;
  why: string;
  whySource: string;
  directors: string[];
};

export const DEMO_CLIENTS: DemoClient[] = [
  { key: "acme", name: "Acme Analytics Ltd", segment: "B2B SaaS", signedOn: "2026-03-01", why: "Raised seed, no finance hire", whySource: "inferred", directors: [] },
  { key: "lumen", name: "Lumen Data Ltd", segment: "B2B SaaS", signedOn: "2026-01-12", why: "Outgrew a spreadsheet and a part-time bookkeeper", whySource: "sales notes", directors: ["A. Lindqvist"] },
  { key: "brightside", name: "Brightside Studio Ltd", segment: "Agency", signedOn: "2025-11-01", why: "Was filing accounts late", whySource: "inferred", directors: [] },
  { key: "kelp", name: "Kelp & Co Ltd", segment: "E-commerce", signedOn: "2026-06-01", why: "VAT got complex as sales grew", whySource: "inferred", directors: [] },
  { key: "parcel", name: "Parcel River Ltd", segment: "Logistics", signedOn: "2026-08-01", why: "First accounts were due", whySource: "inferred", directors: ["D. Mensah"] },
];

export type DemoConversation = {
  title: string;
  where: string;
  url: string;
  hoursAgo: number;
  score: number;
  summary: string;
  quote: string;
  fit: string;
  reply: string;
  possibleCompany?: string;
};

export const DEMO_CONVERSATIONS: DemoConversation[] = [
  {
    title: "Need an accountant for my Ltd, any recommendations?",
    where: "r/smallbusiness",
    url: "https://www.reddit.com/r/smallbusiness/",
    hoursAgo: 3,
    score: 86,
    summary: "One-person UK Ltd with its first year end coming up",
    quote: "Set up a Ltd in March and my first year end is coming up. No idea what I’m doing with corporation tax. Any accountants people actually rate? Small software consultancy, just me and a contractor.",
    fit: "A one-person software consultancy reaching its first year end with no accountant. That’s the stage most of your clients sign at.",
    reply: "Congrats on the first year. Before year end the main jobs are your annual accounts, the CT600 and setting up director’s pay so it’s tax-efficient. I’d look for someone on a fixed monthly fee so there are no surprises.\n\nI work at an accounting firm, so I’m biased, but happy to answer questions here either way.",
  },
  {
    title: "Ask HN: How do you handle bookkeeping as a two-person startup?",
    where: "Hacker News",
    url: "https://news.ycombinator.com/",
    hoursAgo: 8,
    score: 78,
    summary: "Two founders doing their own books in a spreadsheet",
    quote: "Two founders, pre-seed, UK Ltd. We’re doing bookkeeping in a spreadsheet and it’s eating a day a month. What did you use before you hired anyone?",
    fit: "A pre-seed UK Ltd doing its own books, the same stage several of your clients were at when they signed.",
    reply: "At two people, connecting your bank to proper accounting software and having someone do the monthly close usually gets that day back.\n\nDisclosure: I work at an accounting firm.",
  },
  {
    title: "Bakery owner here: VAT and our first employee at the same time, help",
    where: "r/smallbusiness",
    url: "https://www.reddit.com/r/smallbusiness/",
    hoursAgo: 11,
    score: 74,
    summary: "Food business crossing the VAT threshold and hiring",
    quote: "We run a small bakery in south-east London supplying cafés. Just crossed the VAT threshold and our first full-time baker starts next month. I’m doing it all on spreadsheets and I’m drowning.",
    fit: "VAT registration and a first payroll landing at once is a common moment to hire an accountant.",
    reply: "That’s a lot at once. VAT and payroll both run on fixed deadlines, so getting them set up properly now saves a lot of stress later.\n\nI work at an accounting firm. Happy to answer questions here.",
    possibleCompany: "Ember & Oak",
  },
];
