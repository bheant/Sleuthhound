import { describe, expect, it } from "vitest";
import { classify, problemCopy, resultFor } from "./key-errors";
import { failedLabel } from "./services";

describe("key errors", () => {
  it("reads each provider's way of saying it", () => {
    expect(classify(200)).toBeNull();
    expect(classify(401, '{"type":"authentication_error"}')).toBe("invalid");
    expect(classify(400, "Incorrect API key provided: xai-****")).toBe("invalid");
    expect(classify(400, "Your credit balance is too low to access the Anthropic API")).toBe("no_credit");
    expect(classify(429, '{"error":{"code":"insufficient_quota"}}')).toBe("no_credit");
    expect(classify(403, "Your newly created team doesn't have any credits yet")).toBe("no_credit");
    expect(classify(429, "rate_limit_error")).toBe("rate_limited");
    expect(classify(529, "overloaded")).toBe("rate_limited");
    expect(classify(403, "unsupported_country_region_territory")).toBe("blocked");
    expect(classify(404, "model_not_found")).toBe("not_found");
    expect(classify(undefined)).toBe("unreachable");
    expect(classify(500)).toBe("error");
  });

  it("gives plain advice, labelled Key rejected only for an invalid key", () => {
    const invalid = resultFor("anthropic", 401);
    expect(invalid).toMatchObject({ ok: false, rejected: true });
    expect(failedLabel("anthropic", invalid.message)).toBe("Key rejected");

    const limited = resultFor("openai", 429);
    expect(limited.message).toBe("OpenAI is limiting requests right now. Wait a minute, then Test again.");
    expect(failedLabel("openai", limited.message)).toBe("Test failed");

    expect(problemCopy("companies_house", "blocked")).toMatch(/JavaScript key/);
    expect(problemCopy("xai", "blocked")).toMatch(/refused access/);
    expect(problemCopy("anthropic", "not_found", 404, "claude-x")).toMatch(/model claude-x/);
    expect(resultFor("hubspot", 204)).toEqual({ ok: true, message: null });
  });
});
