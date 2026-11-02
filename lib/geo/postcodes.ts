import { z } from "zod";
import { externalFetch } from "@/lib/net/external";

// postcodes.io: free, no key. Bulk lookup takes up to 100 postcodes a request.
// The borough is the postcode's admin_district, e.g. "Islington".

const URL = "https://api.postcodes.io/postcodes";
export const POSTCODES_BATCH = 100;

const bulkResponse = z.object({
  result: z.array(
    z.object({
      query: z.string(),
      result: z
        .object({ latitude: z.number().nullable(), longitude: z.number().nullable(), admin_district: z.string().nullable() })
        .nullable(),
    }),
  ),
});

export type Geo = { lat: number; lng: number; borough: string | null };

export async function geocodeBatch(postcodes: string[], fetchImpl: typeof fetch = externalFetch): Promise<Map<string, Geo>> {
  const res = await fetchImpl(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ postcodes }),
  });
  if (!res.ok) throw new Error(`postcodes.io returned ${res.status}`);
  const parsed = bulkResponse.parse(await res.json());
  const found = new Map<string, Geo>();
  for (const row of parsed.result) {
    const r = row.result;
    if (r?.latitude != null && r.longitude != null) {
      found.set(row.query, { lat: r.latitude, lng: r.longitude, borough: r.admin_district });
    }
  }
  return found;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
