import type { TrafficSource } from "@prisma/client";
import type { NormalizedContact } from "./types";

/**
 * Campaign criteria evaluator.
 *
 * `criteria_json` is deliberately a small declarative dialect rather than
 * arbitrary code: buyers change filters constantly, and every evaluation has
 * to be explainable in an audit trail months later.
 */

export interface CampaignCriteria {
  minAge?: number;
  maxAge?: number;
  /** Reject when the lead carries no DOB and an age bound is set. */
  requireAge?: boolean;
  /** payload[key] must be one of these values. */
  equals?: Record<string, string[]>;
  /** payload[key] must NOT be one of these values. */
  notEquals?: Record<string, string[]>;
  numericMin?: Record<string, number>;
  numericMax?: Record<string, number>;
  /** Traffic sources this buyer refuses (e.g. INCENTIVIZED, CO_REGISTRATION). */
  excludeTrafficSources?: TrafficSource[];
}

export type CriteriaFailureKind =
  | "OUT_OF_GEOGRAPHY"
  | "AGE_OUT_OF_RANGE"
  | "CRITERIA_MISMATCH";

export interface CriteriaMiss {
  kind: CriteriaFailureKind;
  rule: string;
  expected: unknown;
  actual: unknown;
}

export interface CriteriaInput {
  contact: NormalizedContact;
  payload: Record<string, unknown>;
  trafficSource: TrafficSource;
}

export interface CampaignGeo {
  acceptedStates: string[];
  acceptedZips: string[];
}

export interface CriteriaResult {
  match: boolean;
  /** Every rule that failed, so the drill-down can show why a buyer was skipped. */
  misses: CriteriaMiss[];
  rulesEvaluated: number;
}

function asUpper(v: unknown): string {
  return String(v ?? "").trim().toUpperCase();
}

/**
 * Geography semantics:
 *   - empty `acceptedStates` means "all states"
 *   - a non-empty `acceptedZips` narrows *within* the accepted states
 */
function evaluateGeo(geo: CampaignGeo, contact: NormalizedContact): CriteriaMiss[] {
  const misses: CriteriaMiss[] = [];

  if (geo.acceptedStates.length > 0 && !geo.acceptedStates.includes(contact.state)) {
    misses.push({
      kind: "OUT_OF_GEOGRAPHY",
      rule: "accepted_states",
      expected: geo.acceptedStates,
      actual: contact.state,
    });
  }

  if (geo.acceptedZips.length > 0 && !geo.acceptedZips.includes(contact.zip5)) {
    misses.push({
      kind: "OUT_OF_GEOGRAPHY",
      rule: "accepted_zips",
      expected: `${geo.acceptedZips.length} ZIP allowlist`,
      actual: contact.zip5,
    });
  }

  return misses;
}

export function evaluateCriteria(
  criteria: CampaignCriteria,
  geo: CampaignGeo,
  input: CriteriaInput,
): CriteriaResult {
  const misses: CriteriaMiss[] = [...evaluateGeo(geo, input.contact)];
  let rulesEvaluated = 2;

  const { contact, payload, trafficSource } = input;

  // --- Age ---
  const hasAgeBound = criteria.minAge !== undefined || criteria.maxAge !== undefined;
  if (hasAgeBound) {
    rulesEvaluated += 1;
    if (contact.age === null) {
      if (criteria.requireAge !== false) {
        misses.push({
          kind: "AGE_OUT_OF_RANGE",
          rule: "age_required",
          expected: `${criteria.minAge ?? 0}-${criteria.maxAge ?? 120}`,
          actual: null,
        });
      }
    } else {
      if (criteria.minAge !== undefined && contact.age < criteria.minAge) {
        misses.push({
          kind: "AGE_OUT_OF_RANGE",
          rule: "min_age",
          expected: criteria.minAge,
          actual: contact.age,
        });
      }
      if (criteria.maxAge !== undefined && contact.age > criteria.maxAge) {
        misses.push({
          kind: "AGE_OUT_OF_RANGE",
          rule: "max_age",
          expected: criteria.maxAge,
          actual: contact.age,
        });
      }
    }
  }

  // --- Traffic source exclusions ---
  if (criteria.excludeTrafficSources?.length) {
    rulesEvaluated += 1;
    if (criteria.excludeTrafficSources.includes(trafficSource)) {
      misses.push({
        kind: "CRITERIA_MISMATCH",
        rule: "exclude_traffic_sources",
        expected: `not in ${criteria.excludeTrafficSources.join(", ")}`,
        actual: trafficSource,
      });
    }
  }

  // --- Allowlists ---
  for (const [key, allowed] of Object.entries(criteria.equals ?? {})) {
    rulesEvaluated += 1;
    const actual = asUpper(payload[key]);
    if (!allowed.map(asUpper).includes(actual)) {
      misses.push({
        kind: "CRITERIA_MISMATCH",
        rule: `equals.${key}`,
        expected: allowed,
        actual: payload[key] ?? null,
      });
    }
  }

  // --- Blocklists ---
  for (const [key, blocked] of Object.entries(criteria.notEquals ?? {})) {
    rulesEvaluated += 1;
    const actual = asUpper(payload[key]);
    if (blocked.map(asUpper).includes(actual)) {
      misses.push({
        kind: "CRITERIA_MISMATCH",
        rule: `not_equals.${key}`,
        expected: `not in ${blocked.join(", ")}`,
        actual: payload[key] ?? null,
      });
    }
  }

  // --- Numeric bounds ---
  for (const [key, min] of Object.entries(criteria.numericMin ?? {})) {
    rulesEvaluated += 1;
    const n = Number(payload[key]);
    if (!Number.isFinite(n) || n < min) {
      misses.push({
        kind: "CRITERIA_MISMATCH",
        rule: `numeric_min.${key}`,
        expected: `>= ${min}`,
        actual: payload[key] ?? null,
      });
    }
  }

  for (const [key, max] of Object.entries(criteria.numericMax ?? {})) {
    rulesEvaluated += 1;
    const n = Number(payload[key]);
    if (!Number.isFinite(n) || n > max) {
      misses.push({
        kind: "CRITERIA_MISMATCH",
        rule: `numeric_max.${key}`,
        expected: `<= ${max}`,
        actual: payload[key] ?? null,
      });
    }
  }

  return { match: misses.length === 0, misses, rulesEvaluated };
}

/** Safe cast from the JSONB column. Unknown keys are ignored, not fatal. */
export function parseCriteria(raw: unknown): CampaignCriteria {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as CampaignCriteria;
}

/**
 * Collapses a campaign's misses into the single enum code that best explains
 * why it was skipped. Geography outranks age outranks generic mismatch,
 * because that is the order a buyer's ops team triages in.
 */
export function dominantMissKind(misses: CriteriaMiss[]): CriteriaFailureKind {
  if (misses.some((m) => m.kind === "OUT_OF_GEOGRAPHY")) return "OUT_OF_GEOGRAPHY";
  if (misses.some((m) => m.kind === "AGE_OUT_OF_RANGE")) return "AGE_OUT_OF_RANGE";
  return "CRITERIA_MISMATCH";
}
