import type { BatchIntegrityFlag, Vertical } from "@prisma/client";
import { allFieldsFor, csvTemplateHeaders } from "@/lib/domain/verticals";
import { normalizePhone } from "./normalize";

/**
 * CSV batch pre-flight.
 *
 * These heuristics run across the *whole file* before any row is allowed into
 * the ingest waterfall. Per-row validation catches a malformed lead; only a
 * file-level view catches a fabricated one — sequential phone blocks, a
 * handful of IPs behind thousands of rows, timestamps no human cohort could
 * produce.
 *
 * A batch that trips a blocking flag is rejected in full. Partially accepting
 * a fabricated file just launders the good-looking half of it.
 */

export interface CsvRow {
  [key: string]: string | undefined;
}

export interface IntegrityFinding {
  flag: BatchIntegrityFlag;
  /** Blocking findings reject the whole batch; advisory ones only warn. */
  blocking: boolean;
  detail: Record<string, unknown>;
}

export interface PreflightResult {
  ok: boolean;
  findings: IntegrityFinding[];
  rowCount: number;
  /** Column names present in the file. */
  headers: string[];
  missingRequiredColumns: string[];
}

// --- Thresholds -------------------------------------------------------------
// Deliberately conservative: a false positive costs a publisher a resubmission,
// a false negative costs the network a TCPA claim. Below MIN_ROWS the
// statistical checks are meaningless and are skipped entirely.
const MIN_ROWS_FOR_STATISTICS = 20;
const SEQUENTIAL_RUN_THRESHOLD = 5;
const SEQUENTIAL_SHARE_THRESHOLD = 0.02;
const IP_CONCENTRATION_THRESHOLD = 0.05;
const TIMESTAMP_CLUSTER_WINDOW_MS = 60_000;
const TIMESTAMP_CLUSTER_SHARE = 0.5;
const INTRA_BATCH_DUP_THRESHOLD = 0.05;

const CERT_COLUMNS = ["trustedform_cert_url", "jornaya_lead_id"];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

/**
 * Runs every heuristic over a parsed file.
 *
 * `headers` is passed separately from the rows because a file can have a
 * declared header row and zero data rows, and the missing-column check must
 * still fire in that case.
 */
export function preflightBatch(
  headers: string[],
  rows: CsvRow[],
  vertical: Vertical,
): PreflightResult {
  const normalized = headers.map(normalizeHeader);
  const headerSet = new Set(normalized);
  const findings: IntegrityFinding[] = [];

  // --- Schema -------------------------------------------------------------
  const required = allFieldsFor(vertical)
    .filter((f) => f.required)
    .map((f) => f.key);

  const missingRequiredColumns = ["source_id", ...required].filter(
    (c) => !headerSet.has(c),
  );

  if (missingRequiredColumns.length > 0) {
    findings.push({
      flag: "INVALID_HEADER_SCHEMA",
      blocking: true,
      detail: {
        missing_columns: missingRequiredColumns,
        expected_headers: csvTemplateHeaders(vertical),
        received_headers: normalized,
      },
    });
  }

  // Rule: no batch may be processed without a consent-certificate column.
  // Without one, not a single row in the file can evidence consent.
  if (!CERT_COLUMNS.some((c) => headerSet.has(c))) {
    findings.push({
      flag: "MISSING_CERT_COLUMN",
      blocking: true,
      detail: {
        expected_one_of: CERT_COLUMNS,
        received_headers: normalized,
      },
    });
  }

  if (rows.length < MIN_ROWS_FOR_STATISTICS) {
    return {
      ok: findings.every((f) => !f.blocking),
      findings,
      rowCount: rows.length,
      headers: normalized,
      missingRequiredColumns,
    };
  }

  // --- Sequential phone blocks -------------------------------------------
  const phones = rows
    .map((r) => normalizePhone(r["phone"]))
    .filter((p): p is Extract<typeof p, { ok: true }> => p.ok)
    .map((p) => Number(p.national));

  const sequential = longestConsecutiveRun(phones);
  if (
    sequential.longestRun >= SEQUENTIAL_RUN_THRESHOLD ||
    sequential.inRuns / Math.max(1, phones.length) >= SEQUENTIAL_SHARE_THRESHOLD
  ) {
    findings.push({
      flag: "SEQUENTIAL_PHONE_PATTERN",
      blocking: true,
      detail: {
        longest_run: sequential.longestRun,
        numbers_in_runs: sequential.inRuns,
        total_valid_phones: phones.length,
        example: sequential.example.map((n) => `+1${String(n).padStart(10, "0")}`),
      },
    });
  }

  // --- IP concentration ---------------------------------------------------
  const ips = rows.map((r) => (r["ingress_ip"] ?? "").trim()).filter(Boolean);
  if (ips.length >= MIN_ROWS_FOR_STATISTICS) {
    const counts = tally(ips);
    const distinct = counts.size;
    if (distinct / ips.length < IP_CONCENTRATION_THRESHOLD) {
      const [topIp, topCount] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
      findings.push({
        flag: "DUPLICATE_IP_CLUSTER",
        blocking: true,
        detail: {
          distinct_ips: distinct,
          rows_with_ip: ips.length,
          concentration: Number((distinct / ips.length).toFixed(4)),
          top_ip: topIp,
          top_ip_rows: topCount,
        },
      });
    }
  }

  // --- Timestamp uniformity ----------------------------------------------
  const times = rows
    .map((r) => Date.parse(r["submitted_at"] ?? ""))
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);

  if (times.length >= MIN_ROWS_FOR_STATISTICS) {
    const cluster = largestTimeCluster(times, TIMESTAMP_CLUSTER_WINDOW_MS);
    const span = times[times.length - 1] - times[0];

    if (cluster / times.length >= TIMESTAMP_CLUSTER_SHARE) {
      findings.push({
        flag: "UNIFORM_TIMESTAMPS",
        blocking: true,
        detail: {
          rows_in_60s_window: cluster,
          total_timestamped_rows: times.length,
          total_span_seconds: Math.round(span / 1000),
        },
      });
    }

    // A file whose rows are spaced more evenly than a metronome was generated,
    // not collected.
    const velocity = submitVelocity(times);
    if (velocity.suspicious) {
      findings.push({
        flag: "IMPOSSIBLE_SUBMIT_VELOCITY",
        blocking: false,
        detail: velocity.detail,
      });
    }
  }

  // --- Intra-batch duplicates --------------------------------------------
  const e164 = rows
    .map((r) => normalizePhone(r["phone"]))
    .filter((p): p is Extract<typeof p, { ok: true }> => p.ok)
    .map((p) => p.e164);

  if (e164.length >= MIN_ROWS_FOR_STATISTICS) {
    const counts = tally(e164);
    const duplicated = [...counts.values()].filter((c) => c > 1).length;
    const dupRate = duplicated / counts.size;
    if (dupRate > INTRA_BATCH_DUP_THRESHOLD) {
      findings.push({
        flag: "HIGH_INTRA_BATCH_DUPLICATES",
        blocking: false,
        detail: {
          duplicated_numbers: duplicated,
          distinct_numbers: counts.size,
          duplicate_rate: Number(dupRate.toFixed(4)),
        },
      });
    }
  }

  return {
    ok: findings.every((f) => !f.blocking),
    findings,
    rowCount: rows.length,
    headers: normalized,
    missingRequiredColumns,
  };
}

// ---------------------------------------------------------------------------
//  Heuristic internals
// ---------------------------------------------------------------------------

function tally<T>(items: T[]): Map<T, number> {
  const m = new Map<T, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return m;
}

/**
 * Longest run of consecutive integers, plus how many numbers sit in any run
 * of 3 or more. Real consumer traffic does not arrive in numeric order.
 */
function longestConsecutiveRun(numbers: number[]): {
  longestRun: number;
  inRuns: number;
  example: number[];
} {
  if (numbers.length === 0) return { longestRun: 0, inRuns: 0, example: [] };

  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  let longestRun = 1;
  let currentRun = 1;
  let inRuns = 0;
  let bestStart = 0;
  let currentStart = 0;

  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === sorted[i - 1] + 1) {
      currentRun += 1;
    } else {
      if (currentRun >= 3) inRuns += currentRun;
      if (currentRun > longestRun) {
        longestRun = currentRun;
        bestStart = currentStart;
      }
      currentRun = 1;
      currentStart = i;
    }
  }
  if (currentRun >= 3) inRuns += currentRun;
  if (currentRun > longestRun) {
    longestRun = currentRun;
    bestStart = currentStart;
  }

  return {
    longestRun,
    inRuns,
    example: sorted.slice(bestStart, bestStart + Math.min(3, longestRun)),
  };
}

/** Largest number of timestamps falling inside any `windowMs` sliding window. */
function largestTimeCluster(sortedTimes: number[], windowMs: number): number {
  let best = 0;
  let start = 0;
  for (let end = 0; end < sortedTimes.length; end++) {
    while (sortedTimes[end] - sortedTimes[start] > windowMs) start += 1;
    best = Math.max(best, end - start + 1);
  }
  return best;
}

/**
 * Flags near-constant inter-arrival gaps. Human submissions are bursty; a
 * script emits them on a fixed cadence, so the coefficient of variation of
 * the gaps collapses toward zero.
 */
function submitVelocity(sortedTimes: number[]): {
  suspicious: boolean;
  detail: Record<string, unknown>;
} {
  const gaps: number[] = [];
  for (let i = 1; i < sortedTimes.length; i++) {
    gaps.push(sortedTimes[i] - sortedTimes[i - 1]);
  }
  if (gaps.length < 10) return { suspicious: false, detail: {} };

  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  if (mean === 0) {
    return {
      suspicious: true,
      detail: { reason: "ALL_TIMESTAMPS_IDENTICAL", gaps: gaps.length },
    };
  }

  const variance =
    gaps.reduce((sum, g) => sum + (g - mean) ** 2, 0) / gaps.length;
  const cv = Math.sqrt(variance) / mean;

  return {
    suspicious: cv < 0.15,
    detail: {
      mean_gap_ms: Math.round(mean),
      coefficient_of_variation: Number(cv.toFixed(4)),
      threshold: 0.15,
      note: "Human submission intervals are bursty; a near-zero CV indicates scripted cadence.",
    },
  };
}

/** Maps a parsed CSV row onto the pipeline's raw submission payload. */
export function rowToSubmission(
  row: CsvRow,
  vertical: Vertical,
  batchId: string,
) {
  const payload: Record<string, unknown> = {};
  for (const field of allFieldsFor(vertical)) {
    const v = row[field.key];
    if (v !== undefined && String(v).trim() !== "") payload[field.key] = v;
  }

  return {
    sourceId: (row["source_id"] ?? "").trim(),
    payload,
    trustedformCertUrl: row["trustedform_cert_url"]?.trim() || null,
    jornayaLeadId: row["jornaya_lead_id"]?.trim() || null,
    consentText: row["consent_text"]?.trim() || null,
    ingressIp: row["ingress_ip"]?.trim() || null,
    ingressUserAgent: row["user_agent"]?.trim() || null,
    ingressChannel: "CSV_BATCH" as const,
    batchId,
    submittedAt: row["submitted_at"]?.trim() || null,
  };
}

/** Normalizes every key of a parsed row so header casing never matters. */
export function normalizeRow(row: Record<string, unknown>): CsvRow {
  const out: CsvRow = {};
  for (const [k, v] of Object.entries(row)) {
    out[normalizeHeader(k)] = v === null || v === undefined ? undefined : String(v);
  }
  return out;
}
