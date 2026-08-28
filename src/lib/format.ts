/**
 * Display formatting. Kept separate from `labels.ts` (which maps enums) so
 * numeric and temporal formatting has one home.
 */

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const USD_COMPACT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const NUM = new Intl.NumberFormat("en-US");

/** Prisma Decimal, number, string or null — all render the same way. */
export function money(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(n) ? USD.format(n) : "—";
}

export function moneyCompact(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(n) ? USD_COMPACT.format(n) : "—";
}

export function count(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : NUM.format(value);
}

export function percent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

/** Absolute UTC timestamp — the format the audit trail is read in. */
export function utcTimestamp(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "Z");
}

export function shortDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}

export function shortDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.toISOString().slice(5, 10)} ${date.toISOString().slice(11, 16)}`;
}

export function relativeTime(
  d: Date | string | null | undefined,
  now: Date = new Date(),
): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";

  const diff = now.getTime() - date.getTime();
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? "ago" : "from now";

  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;

  if (abs < 45_000) return "just now";
  if (abs < hour) return `${Math.round(abs / min)}m ${suffix}`;
  if (abs < day) return `${Math.round(abs / hour)}h ${suffix}`;
  if (abs < 30 * day) return `${Math.round(abs / day)}d ${suffix}`;
  return shortDate(date);
}

/** Milliseconds, rendered for the audit trail's execution column. */
export function ms(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value < 1000) return `${value}ms`;
  return `${(value / 1000).toFixed(2)}s`;
}

/** Truncates in the middle so both ends of an ID stay legible. */
export function midTruncate(value: string, head = 8, tail = 4): string {
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

/** E.164 -> (602) 555-0142 */
export function phoneDisplay(e164: string | null | undefined): string {
  if (!e164) return "—";
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

/** Countdown parts for a dispute window. */
export function countdownParts(expiresAt: Date | string | null, now = new Date()) {
  if (!expiresAt) return { expired: true, hours: 0, minutes: 0, totalMs: 0 };
  const target = typeof expiresAt === "string" ? new Date(expiresAt) : expiresAt;
  const totalMs = target.getTime() - now.getTime();
  if (totalMs <= 0) return { expired: true, hours: 0, minutes: 0, totalMs: 0 };
  return {
    expired: false,
    totalMs,
    hours: Math.floor(totalMs / 3_600_000),
    minutes: Math.floor((totalMs % 3_600_000) / 60_000),
  };
}
