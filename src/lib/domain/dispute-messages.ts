/**
 * Human copy for the settlement layer's outcome codes.
 *
 * Lives outside `buyer/actions.ts` because a `"use server"` module may only
 * export async functions — a synchronous helper there is a build error, not
 * just a style problem.
 */
const MESSAGES: Record<string, string> = {
  LEAD_NOT_FOUND: "That lead no longer exists.",
  NOT_DELIVERED: "This lead was never delivered, so it cannot be returned.",
  WINDOW_EXPIRED: "The return window closed. This lead has already settled.",
  ALREADY_DISPUTED: "A dispute is already open on this lead.",
  ALREADY_SETTLED: "This lead has already settled.",
  FORBIDDEN: "This lead was not delivered to your account.",
  MISSING_FIELDS: "Select a reason code before filing.",
};

export function disputeErrorMessage(code: string | undefined): string {
  return (code && MESSAGES[code]) || "That action could not be completed.";
}
