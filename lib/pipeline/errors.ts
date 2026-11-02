import { APICallError, NoObjectGeneratedError, RetryError } from "ai";
import { CompaniesHouseError } from "@/lib/connectors/companies-house/client";
import { recordKeyTest } from "@/lib/credentials/store";
import { rejectedCopy, SERVICE_VENDOR, type KeyService } from "@/lib/credentials/services";

// A key the service refused mid-run. It stops the run: every later call with
// the same key would fail the same way.
export class KeyRejectedError extends Error {
  constructor(readonly service: KeyService) {
    super(`${SERVICE_VENDOR[service]} rejected the key.`);
    this.name = "KeyRejectedError";
  }
}

// Stops the run with a message written for the user, e.g. no AI is set up.
export class StopRunError extends Error {
  constructor(
    readonly actor: string,
    message: string,
  ) {
    super(message);
    this.name = "StopRunError";
  }
}

function statusOf(error: unknown): number | undefined {
  if (APICallError.isInstance(error)) return error.statusCode;
  if (RetryError.isInstance(error)) return statusOf(error.lastError);
  if (error instanceof CompaniesHouseError) return error.status;
  // Other connectors' HTTP errors carry a numeric status too.
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

export function isAuthError(error: unknown): boolean {
  const status = statusOf(error);
  return status === 401 || status === 403;
}

/** Marks the stored key rejected, so Connections and Home both show it. */
export function rejectKey(workspaceId: string, service: KeyService) {
  recordKeyTest(workspaceId, service, { ok: false, rejected: true, message: rejectedCopy(service) });
}

// A short, plain reason for the run log. Never the error object itself: some
// carry request details.
export function plainReason(error: unknown): string {
  const status = statusOf(error);
  if (status) return `returned an error (${status})`;
  if (error instanceof Error && error.name === "TimeoutError") return "took too long to answer";
  if (error instanceof Error && /fetch failed|ENOTFOUND|ECONNRE/i.test(error.message)) return "couldn’t be reached";
  if (NoObjectGeneratedError.isInstance(error)) return "gave an answer that didn’t fit the review format";
  return "failed";
}
