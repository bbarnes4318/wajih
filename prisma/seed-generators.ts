import type { Vertical } from "@prisma/client";
import {
  DISCLOSURE_TEXT,
  EMAIL_DOMAINS,
  FIRST_NAMES,
  LAST_NAMES,
  PLACES,
  STREETS,
  STREET_SUFFIXES,
  SUPPRESSION_STATE_BY_PHONE,
  type Place,
  type Rng,
} from "./seed-data";

/**
 * Synthetic lead generation.
 *
 * Leads are produced as raw submissions and then run through the *real*
 * ingest waterfall, so the seeded database contains genuine audit trails with
 * real timings and real provider payloads rather than hand-written fixtures.
 */

/** The defect a generated lead is meant to exhibit, if any. */
export type Defect =
  | "NONE"
  | "MALFORMED_PHONE"
  | "MALFORMED_EMAIL"
  | "MISSING_FIELD"
  | "BAD_STATE"
  | "CONSENT_MISSING"
  | "CONSENT_MALFORMED"
  | "SUPPRESSED"
  | "DUPLICATE";

const USER_AGENTS = [
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:135.0) Gecko/20100101 Firefox/135.0",
  "Mozilla/5.0 (iPad; CPU OS 18_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Mobile/15E148 Safari/604.1",
];

const HEX = "0123456789abcdef";

/** 40 lowercase hex characters, matching the TrustedForm certificate shape. */
export function makeTrustedFormCert(rng: Rng): string {
  let s = "";
  for (let i = 0; i < 40; i++) s += HEX[rng.int(0, 16)];
  return `https://cert.trustedform.com/${s}`;
}

export function makeJornayaId(rng: Rng): string {
  const block = (n: number) => {
    let s = "";
    for (let i = 0; i < n; i++) s += HEX[rng.int(0, 16)];
    return s.toUpperCase();
  };
  return `${block(8)}-${block(4)}-${block(4)}-${block(4)}-${block(12)}`;
}

/**
 * Fictional phone in the 555-01xx block, area-coded to the lead's city.
 * Line numbers 0900-0999 are reserved for the suppression roster, so a
 * generated lead never collides with a suppressed number by accident.
 */
export function makePhone(rng: Rng, place: Place): string {
  const line = String(rng.int(100, 900)).padStart(4, "0");
  return `+1${place.areaCode}555${line}`;
}

export function makeIp(rng: Rng): string {
  return `${rng.int(12, 224)}.${rng.int(0, 256)}.${rng.int(0, 256)}.${rng.int(1, 255)}`;
}

export function makeUserAgent(rng: Rng): string {
  return rng.pick(USER_AGENTS);
}

/** ISO date of birth for a person of the requested age at `asOf`. */
function dobForAge(rng: Rng, age: number, asOf: Date): string {
  const year = asOf.getUTCFullYear() - age;
  const month = rng.int(1, 13);
  const day = rng.int(1, 28);
  // Bias to earlier in the year so the birthday has already passed and the
  // derived age matches the age we asked for.
  const safeMonth = Math.min(month, Math.max(1, asOf.getUTCMonth()));
  return `${year}-${String(safeMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

const VEHICLE_MAKES: Array<[string, string[]]> = [
  ["Toyota", ["Camry", "Corolla", "RAV4", "Highlander", "Tacoma"]],
  ["Honda", ["Civic", "Accord", "CR-V", "Pilot", "Odyssey"]],
  ["Ford", ["F-150", "Escape", "Explorer", "Fusion", "Edge"]],
  ["Chevrolet", ["Silverado", "Equinox", "Malibu", "Traverse", "Tahoe"]],
  ["Nissan", ["Altima", "Rogue", "Sentra", "Pathfinder", "Frontier"]],
  ["Subaru", ["Outback", "Forester", "Crosstrek", "Impreza"]],
  ["Hyundai", ["Elantra", "Tucson", "Santa Fe", "Sonata"]],
  ["Jeep", ["Grand Cherokee", "Wrangler", "Cherokee", "Compass"]],
];

const CARRIERS = [
  "State Farm", "GEICO", "Progressive", "Allstate", "USAA",
  "Farmers", "Liberty Mutual", "Nationwide", "Travelers",
];

export interface GeneratedLead {
  payload: Record<string, unknown>;
  trustedformCertUrl: string | null;
  jornayaLeadId: string | null;
  consentText: string | null;
  ingressIp: string;
  ingressUserAgent: string;
  /** E.164 phone actually used, so the caller can track duplicates. */
  phoneE164: string;
  place: Place;
}

export interface GenerateOptions {
  rng: Rng;
  vertical: Vertical;
  defect: Defect;
  receivedAt: Date;
  /** Numbers on a suppression list, used when defect === "SUPPRESSED". */
  suppressionPhones: string[];
  /** Previously used numbers, used when defect === "DUPLICATE". */
  priorPhones: string[];
  /** Force a specific city (used to keep state-DNC hits in the right state). */
  place?: Place;
  /** Force a specific age band (e.g. Medicare needs 65+). */
  ageRange?: [number, number];
  /** Reuse a fixed IP — the CSV batch fraud demo relies on this. */
  fixedIp?: string;
}

/**
 * Builds the vertical-specific block. Values are chosen to mostly satisfy the
 * seeded campaigns, so the majority of clean leads route successfully and the
 * remainder fail step 6 for realistic, explainable reasons.
 */
function verticalPayload(
  rng: Rng,
  vertical: Vertical,
  place: Place,
  age: number,
): Record<string, unknown> {
  switch (vertical) {
    case "AUTO_INSURANCE": {
      const [make, models] = rng.pick(VEHICLE_MAKES);
      return {
        currently_insured: rng.chance(0.86) ? "YES" : "NO",
        current_carrier: rng.pick(CARRIERS),
        vehicle_year: rng.int(2006, 2027),
        vehicle_make: make,
        vehicle_model: rng.pick(models),
        num_vehicles: rng.int(1, 4),
        dui_last_3_years: rng.chance(0.05) ? "YES" : "NO",
        homeowner: rng.chance(0.6) ? "YES" : "NO",
      };
    }
    case "SOLAR":
      return {
        homeowner: rng.chance(0.88) ? "YES" : "NO",
        monthly_electric_bill: rng.int(70, 460),
        roof_shade: rng.chance(0.12) ? "HEAVY" : rng.chance(0.4) ? "PARTIAL" : "NONE",
        credit_band: rng.pick(["EXCELLENT", "GOOD", "FAIR", "POOR"]),
      };
    case "MEDICARE":
      return {
        medicare_parts_ab: age >= 65 ? (rng.chance(0.9) ? "YES" : "NO") : "NO",
        current_plan_type: rng.pick(["ADVANTAGE", "SUPPLEMENT", "ORIGINAL", "NONE"]),
      };
    case "HOME_IMPROVEMENT":
      return {
        homeowner: rng.chance(0.9) ? "YES" : "NO",
        project_type: rng.pick([
          "ROOFING", "ROOFING", "SIDING", "WINDOWS", "GUTTERS", "HVAC", "BATH",
        ]),
        timeframe: rng.pick([
          "IMMEDIATE", "1_3_MONTHS", "1_3_MONTHS", "3_6_MONTHS", "RESEARCHING",
        ]),
      };
    case "PERSONAL_LOAN":
      return {
        loan_amount: rng.int(2, 41) * 1000,
        annual_income: rng.int(24, 165) * 1000,
        employment_status: rng.pick([
          "EMPLOYED", "EMPLOYED", "EMPLOYED", "SELF_EMPLOYED", "RETIRED", "UNEMPLOYED",
        ]),
        credit_band: rng.pick(["EXCELLENT", "GOOD", "GOOD", "FAIR", "POOR"]),
      };
    case "MORTGAGE":
      return {
        loan_purpose: rng.pick(["PURCHASE", "REFINANCE", "CASH_OUT", "HELOC"]),
        loan_amount: rng.int(80, 720) * 1000,
        property_value: rng.int(150, 900) * 1000,
        credit_band: rng.pick(["EXCELLENT", "GOOD", "FAIR", "POOR"]),
      };
    case "HOME_INSURANCE":
      return {
        property_type: rng.pick(["SINGLE_FAMILY", "CONDO", "TOWNHOME", "MOBILE"]),
        year_built: rng.int(1948, 2024),
        estimated_value: rng.int(120, 900) * 1000,
        currently_insured: rng.chance(0.8) ? "YES" : "NO",
      };
    case "HEALTH_INSURANCE":
      return {
        household_size: rng.int(1, 7),
        household_income: rng.int(18, 140) * 1000,
        currently_insured: rng.chance(0.55) ? "YES" : "NO",
        tobacco_use: rng.chance(0.16) ? "YES" : "NO",
      };
    case "LIFE_INSURANCE":
      return {
        coverage_amount: rng.int(5, 101) * 10000,
        tobacco_use: rng.chance(0.15) ? "YES" : "NO",
        health_status: rng.pick(["EXCELLENT", "GOOD", "FAIR", "POOR"]),
      };
    case "DEBT_RELIEF":
      return {
        unsecured_debt_amount: rng.int(8, 96) * 1000,
        num_creditors: rng.int(2, 12),
        delinquent: rng.chance(0.45) ? "YES" : "NO",
      };
    case "LEGAL_MASS_TORT":
      return {
        case_type: rng.pick([
          "Talc", "Roundup", "Camp Lejeune", "Hair Relaxer", "AFFF",
        ]),
        diagnosis_date: `${rng.int(2015, 2025)}-${String(rng.int(1, 13)).padStart(2, "0")}-${String(rng.int(1, 28)).padStart(2, "0")}`,
        represented_by_counsel: rng.chance(0.2) ? "YES" : "NO",
      };
    case "EDUCATION":
      return {
        program_of_interest: rng.pick([
          "Nursing", "Business Administration", "Cybersecurity", "Psychology",
          "Medical Assisting", "Criminal Justice",
        ]),
        education_level: rng.pick([
          "HIGH_SCHOOL", "SOME_COLLEGE", "ASSOCIATE", "BACHELOR",
        ]),
        enrollment_timeframe: rng.pick([
          "IMMEDIATE", "3_MONTHS", "6_MONTHS", "12_MONTHS",
        ]),
      };
  }
}

/** Default age band per vertical, so Medicare leads are actually seniors. */
function defaultAgeRange(vertical: Vertical): [number, number] {
  switch (vertical) {
    case "MEDICARE":
      return [63, 86];
    case "SOLAR":
    case "HOME_IMPROVEMENT":
    case "HOME_INSURANCE":
    case "MORTGAGE":
      return [30, 72];
    case "LEGAL_MASS_TORT":
      return [38, 84];
    case "EDUCATION":
      return [19, 46];
    default:
      return [21, 74];
  }
}

export function generateLead(opts: GenerateOptions): GeneratedLead {
  const { rng, vertical, defect, receivedAt } = opts;

  let place = opts.place ?? rng.pick(PLACES);
  let phoneE164: string;

  if (defect === "SUPPRESSED" && opts.suppressionPhones.length > 0) {
    phoneE164 = rng.pick(opts.suppressionPhones);
    // Keep the lead in the number's own state so a state-DNC listing matches.
    const stateCode = SUPPRESSION_STATE_BY_PHONE[phoneE164];
    const match = PLACES.filter((p) => p.state === stateCode);
    if (match.length > 0) place = rng.pick(match);
  } else if (defect === "DUPLICATE" && opts.priorPhones.length > 0) {
    phoneE164 = rng.pick(opts.priorPhones);
    const areaCode = phoneE164.slice(2, 5);
    const match = PLACES.filter((p) => p.areaCode === areaCode);
    if (match.length > 0) place = rng.pick(match);
  } else {
    phoneE164 = makePhone(rng, place);
  }

  const [minAge, maxAge] = opts.ageRange ?? defaultAgeRange(vertical);
  const age = rng.int(minAge, maxAge + 1);

  const firstName = rng.pick(FIRST_NAMES);
  const lastName = rng.pick(LAST_NAMES);

  const payload: Record<string, unknown> = {
    first_name: firstName,
    last_name: lastName,
    phone: phoneE164,
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${rng.int(1, 999)}@${rng.pick(EMAIL_DOMAINS)}`,
    address_1: `${rng.int(100, 9800)} ${rng.pick(STREETS)} ${rng.pick(STREET_SUFFIXES)}`,
    city: place.city,
    state: place.state,
    zip: place.zip,
    date_of_birth: dobForAge(rng, age, receivedAt),
    ...verticalPayload(rng, vertical, place, age),
  };

  let trustedformCertUrl: string | null = makeTrustedFormCert(rng);
  let jornayaLeadId: string | null = rng.chance(0.35) ? makeJornayaId(rng) : null;
  let consentText: string | null = DISCLOSURE_TEXT;

  // --- Apply the requested defect -----------------------------------------
  switch (defect) {
    case "MALFORMED_PHONE":
      // Reaches step 2 with a number that cannot normalize to E.164.
      payload.phone = rng.chance(0.5)
        ? `${place.areaCode}-555-CALL`
        : `+44 20 7946 ${rng.int(1000, 9999)}`;
      break;
    case "MALFORMED_EMAIL":
      payload.email = rng.pick([
        `${firstName.toLowerCase()}@@${rng.pick(EMAIL_DOMAINS)}`,
        `${firstName.toLowerCase()}.${lastName.toLowerCase()}@nodomain`,
        "not-an-email",
      ]);
      break;
    case "MISSING_FIELD":
      delete payload[rng.pick(["last_name", "zip", "email"])];
      break;
    case "BAD_STATE":
      payload.state = rng.pick(["ZZ", "XX", "N/A"]);
      break;
    case "CONSENT_MISSING":
      trustedformCertUrl = null;
      jornayaLeadId = null;
      consentText = null;
      break;
    case "CONSENT_MALFORMED":
      trustedformCertUrl = rng.pick([
        "https://cert.trustedform.com/not-a-real-cert",
        "http://trustedform.com/abc123",
        `https://cert.trustedform.com/${"z".repeat(40)}`,
      ]);
      jornayaLeadId = null;
      break;
    default:
      break;
  }

  return {
    payload,
    trustedformCertUrl,
    jornayaLeadId,
    consentText,
    ingressIp: opts.fixedIp ?? makeIp(rng),
    ingressUserAgent: makeUserAgent(rng),
    phoneE164,
    place,
  };
}

/**
 * Picks a defect for a submission given a publisher's quality profile.
 * Returns "NONE" most of the time.
 */
export function rollDefect(
  rng: Rng,
  quality: {
    malformedRate: number;
    badConsentRate: number;
    suppressedRate: number;
    duplicateRate: number;
  },
): Defect {
  const roll = rng.next();
  let floor = 0;

  floor += quality.malformedRate;
  if (roll < floor) {
    return rng.pick<Defect>([
      "MALFORMED_PHONE",
      "MALFORMED_EMAIL",
      "MISSING_FIELD",
      "BAD_STATE",
    ]);
  }

  floor += quality.badConsentRate;
  if (roll < floor) {
    return rng.chance(0.6) ? "CONSENT_MISSING" : "CONSENT_MALFORMED";
  }

  floor += quality.suppressedRate;
  if (roll < floor) return "SUPPRESSED";

  floor += quality.duplicateRate;
  if (roll < floor) return "DUPLICATE";

  return "NONE";
}
