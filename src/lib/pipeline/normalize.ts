import { createHash } from "node:crypto";
import type { Vertical } from "@prisma/client";

/**
 * Pure normalization helpers. No I/O, no database, no side effects — so the
 * waterfall steps that use them stay unit-testable in isolation.
 */

export const US_STATE_CODES = new Set([
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
  "DC", "PR", "VI", "GU", "AS", "MP",
]);

/**
 * RFC 5322 compatible subset. Deliberately stricter than the full grammar:
 * quoted local parts and IP-literal domains are rejected because no
 * legitimate lead form produces them.
 */
const EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

const ZIP_RE = /^\d{5}(-\d{4})?$/;

export type PhoneResult =
  | { ok: true; e164: string; national: string; areaCode: string }
  | { ok: false; reason: "EMPTY" | "FORMAT" | "NON_US" };

/**
 * Normalize to E.164. US/CA NANP only — this network does not buy or sell
 * international traffic, and an unexpected country code is a fraud signal
 * rather than a formatting nit.
 */
export function normalizePhone(raw: unknown): PhoneResult {
  if (raw === null || raw === undefined) return { ok: false, reason: "EMPTY" };
  const str = String(raw).trim();
  if (!str) return { ok: false, reason: "EMPTY" };

  // Reject anything containing letters before stripping punctuation, so
  // "555-CALL-NOW" fails as FORMAT rather than silently losing characters.
  if (/[A-Za-z]/.test(str)) return { ok: false, reason: "FORMAT" };

  const digits = str.replace(/\D/g, "");
  if (!digits) return { ok: false, reason: "FORMAT" };

  let national: string;
  if (digits.length === 10) {
    national = digits;
  } else if (digits.length === 11 && digits.startsWith("1")) {
    national = digits.slice(1);
  } else if (digits.length > 11) {
    return { ok: false, reason: "NON_US" };
  } else {
    return { ok: false, reason: "FORMAT" };
  }

  // NANP structural rules: area code and exchange must start 2-9, and the
  // area code may not be an N11 service code.
  const areaCode = national.slice(0, 3);
  const exchange = national.slice(3, 6);
  if (!/^[2-9]\d{2}$/.test(areaCode)) return { ok: false, reason: "FORMAT" };
  if (!/^[2-9]\d{2}$/.test(exchange)) return { ok: false, reason: "FORMAT" };
  if (areaCode[1] === "1" && areaCode[2] === "1") {
    return { ok: false, reason: "FORMAT" };
  }

  return { ok: true, e164: `+1${national}`, national, areaCode };
}

export function normalizeEmail(raw: unknown): { ok: boolean; value: string } {
  const value = String(raw ?? "").trim().toLowerCase();
  return { ok: EMAIL_RE.test(value), value };
}

export function normalizeState(raw: unknown): { ok: boolean; value: string } {
  const value = String(raw ?? "").trim().toUpperCase();
  return { ok: US_STATE_CODES.has(value), value };
}

export function normalizeZip(raw: unknown): { ok: boolean; value: string; zip5: string } {
  const value = String(raw ?? "").trim();
  const ok = ZIP_RE.test(value);
  return { ok, value, zip5: ok ? value.slice(0, 5) : value };
}

export function normalizeName(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

export type DobResult =
  | { ok: true; iso: string; age: number }
  | { ok: false };

/** Parses YYYY-MM-DD / MM-DD-YYYY / MM/DD/YYYY and derives age at `asOf`. */
export function normalizeDateOfBirth(raw: unknown, asOf: Date = new Date()): DobResult {
  const str = String(raw ?? "").trim();
  if (!str) return { ok: false };

  let y: number, m: number, d: number;
  const iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(str);
  const us = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(str);

  if (iso) {
    y = +iso[1];
    m = +iso[2];
    d = +iso[3];
  } else if (us) {
    m = +us[1];
    d = +us[2];
    y = +us[3];
  } else {
    return { ok: false };
  }

  if (m < 1 || m > 12 || d < 1 || d > 31) return { ok: false };
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Round-trip check catches impossible calendar dates like 2001-02-30.
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return { ok: false };
  }

  let age = asOf.getUTCFullYear() - y;
  const beforeBirthday =
    asOf.getUTCMonth() < m - 1 ||
    (asOf.getUTCMonth() === m - 1 && asOf.getUTCDate() < d);
  if (beforeBirthday) age -= 1;

  if (age < 0 || age > 120) return { ok: false };

  const pad = (n: number) => String(n).padStart(2, "0");
  return { ok: true, iso: `${y}-${pad(m)}-${pad(d)}`, age };
}

/**
 * Dedup key: SHA-256 over normalized phone + vertical + the 30-day window
 * bucket the lead falls into.
 *
 * The window is a rolling *lookup* concern, not a hash input — bucketing the
 * timestamp into the hash would let a duplicate submitted one second after a
 * bucket boundary produce a different hash and slip through. So the hash is
 * time-invariant and the 30-day constraint is applied as a `createdAt` filter
 * at query time. `windowDays` is recorded in the digest preimage purely so a
 * future policy change (e.g. 90-day windows) cannot collide with historical
 * hashes computed under the old policy.
 */
export function buildDedupHash(
  phoneE164: string,
  vertical: Vertical,
  windowDays = 30,
): string {
  return createHash("sha256")
    .update(`${phoneE164}|${vertical}|w${windowDays}`)
    .digest("hex");
}

export const DEDUP_WINDOW_DAYS = 30;

/** Start of the dedup lookback window relative to `now`. */
export function dedupWindowStart(now: Date, windowDays = DEDUP_WINDOW_DAYS): Date {
  return new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);
}

/** UTC midnight for the day `d` falls in — the key for campaign pacing rows. */
export function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
