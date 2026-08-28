import type { RejectionReasonCode } from "@prisma/client";
import { allFieldsFor, getVerticalSpec } from "@/lib/domain/verticals";
import type { NormalizedContact, StepOutcome } from "../types";
import { timer } from "../types";
import {
  normalizeDateOfBirth,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  normalizeState,
  normalizeZip,
} from "../normalize";
import type { IntakeContext } from "./step1-intake";

/**
 * STEP 2 — FIELD VALIDATION
 *
 * E.164 phone normalization, RFC email check, USPS state/ZIP checks, and
 * required-field validation against the vertical's schema.
 *
 * Writes a `normalized` block back into the payload rather than overwriting
 * the publisher's raw values — a dispute six weeks from now needs to show
 * exactly what was submitted, not what we made of it.
 */

declare const validatedBrand: unique symbol;

export interface ValidatedContext {
  readonly [validatedBrand]: true;
  identity: IntakeContext["identity"];
  submission: IntakeContext["submission"];
  contact: NormalizedContact;
  /** Raw payload plus a `normalized` sub-object. */
  payload: Record<string, unknown>;
}

export function runFieldValidation(
  ctx: IntakeContext,
): StepOutcome<ValidatedContext> {
  const elapsed = timer();
  const { identity, submission } = ctx;
  const spec = getVerticalSpec(identity.vertical);
  const raw = submission.payload ?? {};

  const inputData: Record<string, unknown> = {
    source_id: identity.sourceId,
    vertical: identity.vertical,
    declared_vertical: submission.vertical ?? null,
    submitted_keys: Object.keys(raw).sort(),
  };

  const fail = (
    reasonCode: RejectionReasonCode,
    detail: Record<string, unknown>,
  ): StepOutcome<ValidatedContext> => ({
    status: "FAIL",
    step: "STEP_2_FIELD_VALIDATION",
    reasonCode,
    audit: {
      stepNumber: 2,
      stepName: "Field Validation",
      inputData,
      outputStatus: "FAIL",
      outputData: detail,
      reasonCode,
      executionMs: elapsed(),
      errorLog: null,
    },
  });

  // --- The declared vertical must agree with the source's bound vertical ---
  if (
    submission.vertical &&
    String(submission.vertical).trim().toUpperCase() !== identity.vertical
  ) {
    return fail("VERTICAL_SCHEMA_MISMATCH", {
      source_vertical: identity.vertical,
      declared_vertical: submission.vertical,
    });
  }

  // --- Required-field presence, across core contact + vertical schema ---
  const fields = allFieldsFor(identity.vertical);
  const missing = fields
    .filter((f) => f.required)
    .filter((f) => {
      const v = raw[f.key];
      return v === undefined || v === null || String(v).trim() === "";
    })
    .map((f) => f.key);

  if (missing.length > 0) {
    return fail("MISSING_REQUIRED_FIELD", {
      missing_fields: missing,
      vertical_schema: spec.code,
    });
  }

  // --- Contact normalization ---
  const phone = normalizePhone(raw["phone"]);
  if (!phone.ok) {
    return fail(
      phone.reason === "NON_US" ? "NON_US_PHONE" : "INVALID_PHONE_FORMAT",
      { field: "phone", submitted: String(raw["phone"] ?? ""), detail: phone.reason },
    );
  }

  const email = normalizeEmail(raw["email"]);
  if (!email.ok) {
    return fail("INVALID_EMAIL_FORMAT", {
      field: "email",
      submitted: String(raw["email"] ?? ""),
    });
  }

  const state = normalizeState(raw["state"]);
  if (!state.ok) {
    return fail("INVALID_STATE_CODE", {
      field: "state",
      submitted: String(raw["state"] ?? ""),
    });
  }

  const zip = normalizeZip(raw["zip"]);
  if (!zip.ok) {
    return fail("INVALID_ZIP_CODE", {
      field: "zip",
      submitted: String(raw["zip"] ?? ""),
    });
  }

  let dobIso: string | null = null;
  let age: number | null = null;
  const dobRaw = raw["date_of_birth"];
  if (dobRaw !== undefined && dobRaw !== null && String(dobRaw).trim() !== "") {
    const dob = normalizeDateOfBirth(dobRaw, identity.receivedAtUtc);
    if (!dob.ok) {
      return fail("INVALID_DATE_OF_BIRTH", {
        field: "date_of_birth",
        submitted: String(dobRaw),
      });
    }
    dobIso = dob.iso;
    age = dob.age;
  }

  // --- Vertical-specific typing ---
  const typeErrors: Array<Record<string, unknown>> = [];
  for (const f of spec.fields) {
    const v = raw[f.key];
    if (v === undefined || v === null || String(v).trim() === "") continue;

    if (f.type === "number") {
      const n = Number(v);
      if (!Number.isFinite(n)) {
        typeErrors.push({ field: f.key, expected: "number", submitted: String(v) });
        continue;
      }
      if (f.min !== undefined && n < f.min) {
        typeErrors.push({ field: f.key, expected: `>= ${f.min}`, submitted: n });
      }
      if (f.max !== undefined && n > f.max) {
        typeErrors.push({ field: f.key, expected: `<= ${f.max}`, submitted: n });
      }
    } else if (f.type === "enum") {
      const s = String(v).trim().toUpperCase();
      if (!f.options?.includes(s)) {
        typeErrors.push({
          field: f.key,
          expected: f.options,
          submitted: String(v),
        });
      }
    } else if (f.type === "date") {
      if (!normalizeDateOfBirth(v, identity.receivedAtUtc).ok) {
        typeErrors.push({ field: f.key, expected: "YYYY-MM-DD", submitted: String(v) });
      }
    }
  }

  if (typeErrors.length > 0) {
    return fail("VERTICAL_SCHEMA_MISMATCH", {
      vertical_schema: spec.code,
      field_errors: typeErrors,
    });
  }

  const contact: NormalizedContact = {
    firstName: normalizeName(raw["first_name"]),
    lastName: normalizeName(raw["last_name"]),
    phoneE164: phone.e164,
    areaCode: phone.areaCode,
    email: email.value,
    state: state.value,
    zip5: zip.zip5,
    dobIso,
    age,
  };

  // Coerce vertical enum fields to canonical upper case so step 6 can compare
  // criteria without re-normalizing.
  const coerced: Record<string, unknown> = { ...raw };
  for (const f of spec.fields) {
    const v = coerced[f.key];
    if (v === undefined || v === null || String(v).trim() === "") continue;
    if (f.type === "enum") coerced[f.key] = String(v).trim().toUpperCase();
    if (f.type === "number") coerced[f.key] = Number(v);
  }

  const payload: Record<string, unknown> = {
    ...coerced,
    normalized: {
      first_name: contact.firstName,
      last_name: contact.lastName,
      phone_e164: contact.phoneE164,
      area_code: contact.areaCode,
      email: contact.email,
      state: contact.state,
      zip5: contact.zip5,
      date_of_birth: contact.dobIso,
      age: contact.age,
    },
  };

  return {
    status: "PASS",
    context: { identity, submission, contact, payload } as ValidatedContext,
    audit: {
      stepNumber: 2,
      stepName: "Field Validation",
      inputData,
      outputStatus: "PASS",
      outputData: {
        vertical_schema: spec.code,
        phone_e164: contact.phoneE164,
        email: contact.email,
        state: contact.state,
        zip5: contact.zip5,
        age: contact.age,
        required_fields_checked: fields.filter((f) => f.required).length,
      },
      reasonCode: null,
      executionMs: elapsed(),
      errorLog: null,
    },
  };
}
