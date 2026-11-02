import { generateText, Output } from "ai";
import { industriesPrompt } from "@/lib/ai/prompts";
import { getModel, PROVIDER_LABELS } from "@/lib/ai/provider";
import { cleanSicPrefixes, IdealIndustries } from "@/lib/ai/schemas";
import { getSetting, setSetting } from "@/lib/settings";
import type { RunContext } from "./context";
import { isAuthError, KeyRejectedError, plainReason } from "./errors";

// The SIC code prefixes for the ideal client's industries. Worked out by the
// AI once per ideal-client text and kept in settings, so runs don't pay for it
// again until the text changes. Uses the writing model: in testing the review
// model often returned a single division and missed most industries.
export async function idealSicPrefixes(run: RunContext, idealClient: string): Promise<string[]> {
  const cached = getSetting(run.workspaceId, "ideal_client_sic");
  if (cached.text === idealClient) return cached.prefixes;
  const provider = getSetting(run.workspaceId, "default_ai");
  const { name, vendor } = PROVIDER_LABELS[provider];
  try {
    const ai = getModel("writing", run.workspaceId);
    const result = await generateText({
      model: ai.model,
      prompt: industriesPrompt(idealClient),
      output: Output.object({ schema: IdealIndustries }),
      maxOutputTokens: 4000,
    });
    const prefixes = cleanSicPrefixes(result.output.sic_prefixes);
    setSetting(run.workspaceId, "ideal_client_sic", { text: idealClient, prefixes });
    run.log(name, `Matched the ideal client to ${prefixes.length} industry ${prefixes.length === 1 ? "code" : "codes"}`);
    return prefixes;
  } catch (error) {
    if (isAuthError(error)) throw new KeyRejectedError(provider);
    // Without industries, companies are picked on deadlines and age alone.
    run.log(name, `Couldn’t match the ideal client to industry codes (${vendor} ${plainReason(error)})`, "error");
    return [];
  }
}
