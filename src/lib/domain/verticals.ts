import { Vertical } from "@prisma/client";

/**
 * Vertical schema registry.
 *
 * Step 2 of the ingest waterfall validates a lead payload against the entry
 * for its vertical. Adding a vertical is a data change here, never a change
 * to the pipeline engine.
 */

export type FieldType = "string" | "number" | "boolean" | "enum" | "date";

export interface VerticalField {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** Allowed values when `type === "enum"`. */
  options?: string[];
  min?: number;
  max?: number;
  help?: string;
}

export interface VerticalSpec {
  vertical: Vertical;
  label: string;
  /** Short slug used in Source IDs and CSV templates. */
  code: string;
  fields: VerticalField[];
}

/**
 * Contact fields every vertical requires. Validated before the vertical
 * specific block so a malformed phone always reports the same reason code.
 */
export const CORE_CONTACT_FIELDS: VerticalField[] = [
  { key: "first_name", label: "First Name", type: "string", required: true },
  { key: "last_name", label: "Last Name", type: "string", required: true },
  {
    key: "phone",
    label: "Phone",
    type: "string",
    required: true,
    help: "Normalized to E.164 (+1XXXXXXXXXX) at step 2.",
  },
  { key: "email", label: "Email", type: "string", required: true },
  { key: "address_1", label: "Address", type: "string", required: false },
  { key: "city", label: "City", type: "string", required: false },
  {
    key: "state",
    label: "State",
    type: "string",
    required: true,
    help: "2-letter USPS code.",
  },
  { key: "zip", label: "ZIP", type: "string", required: true },
  {
    key: "date_of_birth",
    label: "Date of Birth",
    type: "date",
    required: false,
    help: "ISO-8601 (YYYY-MM-DD). Drives age criteria at step 6.",
  },
];

const YES_NO = ["YES", "NO"];
const CREDIT_BANDS = ["EXCELLENT", "GOOD", "FAIR", "POOR"];

export const VERTICAL_SPECS: Record<Vertical, VerticalSpec> = {
  AUTO_INSURANCE: {
    vertical: "AUTO_INSURANCE",
    label: "Auto Insurance",
    code: "AUTO",
    fields: [
      { key: "currently_insured", label: "Currently Insured", type: "enum", required: true, options: YES_NO },
      { key: "current_carrier", label: "Current Carrier", type: "string", required: false },
      { key: "vehicle_year", label: "Vehicle Year", type: "number", required: true, min: 1960, max: 2027 },
      { key: "vehicle_make", label: "Vehicle Make", type: "string", required: true },
      { key: "vehicle_model", label: "Vehicle Model", type: "string", required: true },
      { key: "num_vehicles", label: "Vehicles in Household", type: "number", required: false, min: 1, max: 10 },
      { key: "dui_last_3_years", label: "DUI (3yr)", type: "enum", required: false, options: YES_NO },
      { key: "homeowner", label: "Homeowner", type: "enum", required: false, options: YES_NO },
    ],
  },
  HOME_INSURANCE: {
    vertical: "HOME_INSURANCE",
    label: "Home Insurance",
    code: "HOME",
    fields: [
      { key: "property_type", label: "Property Type", type: "enum", required: true, options: ["SINGLE_FAMILY", "CONDO", "TOWNHOME", "MOBILE", "MULTI_FAMILY"] },
      { key: "year_built", label: "Year Built", type: "number", required: true, min: 1800, max: 2027 },
      { key: "estimated_value", label: "Estimated Value", type: "number", required: false, min: 10000 },
      { key: "currently_insured", label: "Currently Insured", type: "enum", required: true, options: YES_NO },
    ],
  },
  HEALTH_INSURANCE: {
    vertical: "HEALTH_INSURANCE",
    label: "Health Insurance",
    code: "HEALTH",
    fields: [
      { key: "household_size", label: "Household Size", type: "number", required: true, min: 1, max: 12 },
      { key: "household_income", label: "Household Income", type: "number", required: true, min: 0 },
      { key: "currently_insured", label: "Currently Insured", type: "enum", required: true, options: YES_NO },
      { key: "tobacco_use", label: "Tobacco Use", type: "enum", required: false, options: YES_NO },
    ],
  },
  LIFE_INSURANCE: {
    vertical: "LIFE_INSURANCE",
    label: "Life Insurance",
    code: "LIFE",
    fields: [
      { key: "coverage_amount", label: "Coverage Amount", type: "number", required: true, min: 10000 },
      { key: "tobacco_use", label: "Tobacco Use", type: "enum", required: true, options: YES_NO },
      { key: "health_status", label: "Health Status", type: "enum", required: false, options: ["EXCELLENT", "GOOD", "FAIR", "POOR"] },
    ],
  },
  MEDICARE: {
    vertical: "MEDICARE",
    label: "Medicare",
    code: "MCARE",
    fields: [
      { key: "medicare_parts_ab", label: "Has Parts A & B", type: "enum", required: true, options: YES_NO },
      { key: "current_plan_type", label: "Current Plan Type", type: "enum", required: false, options: ["ADVANTAGE", "SUPPLEMENT", "ORIGINAL", "NONE"] },
    ],
  },
  SOLAR: {
    vertical: "SOLAR",
    label: "Solar",
    code: "SOLAR",
    fields: [
      { key: "homeowner", label: "Homeowner", type: "enum", required: true, options: YES_NO },
      { key: "monthly_electric_bill", label: "Monthly Electric Bill", type: "number", required: true, min: 0 },
      { key: "roof_shade", label: "Roof Shade", type: "enum", required: false, options: ["NONE", "PARTIAL", "HEAVY"] },
      { key: "credit_band", label: "Credit Band", type: "enum", required: false, options: CREDIT_BANDS },
    ],
  },
  HOME_IMPROVEMENT: {
    vertical: "HOME_IMPROVEMENT",
    label: "Home Improvement",
    code: "HIMP",
    fields: [
      { key: "homeowner", label: "Homeowner", type: "enum", required: true, options: YES_NO },
      { key: "project_type", label: "Project Type", type: "enum", required: true, options: ["ROOFING", "WINDOWS", "SIDING", "HVAC", "BATH", "KITCHEN", "GUTTERS"] },
      { key: "timeframe", label: "Timeframe", type: "enum", required: false, options: ["IMMEDIATE", "1_3_MONTHS", "3_6_MONTHS", "RESEARCHING"] },
    ],
  },
  MORTGAGE: {
    vertical: "MORTGAGE",
    label: "Mortgage",
    code: "MTG",
    fields: [
      { key: "loan_purpose", label: "Loan Purpose", type: "enum", required: true, options: ["PURCHASE", "REFINANCE", "CASH_OUT", "HELOC"] },
      { key: "loan_amount", label: "Loan Amount", type: "number", required: true, min: 25000 },
      { key: "property_value", label: "Property Value", type: "number", required: false, min: 25000 },
      { key: "credit_band", label: "Credit Band", type: "enum", required: true, options: CREDIT_BANDS },
    ],
  },
  PERSONAL_LOAN: {
    vertical: "PERSONAL_LOAN",
    label: "Personal Loan",
    code: "PLOAN",
    fields: [
      { key: "loan_amount", label: "Loan Amount", type: "number", required: true, min: 1000 },
      { key: "annual_income", label: "Annual Income", type: "number", required: true, min: 0 },
      { key: "employment_status", label: "Employment Status", type: "enum", required: true, options: ["EMPLOYED", "SELF_EMPLOYED", "RETIRED", "UNEMPLOYED"] },
      { key: "credit_band", label: "Credit Band", type: "enum", required: true, options: CREDIT_BANDS },
    ],
  },
  DEBT_RELIEF: {
    vertical: "DEBT_RELIEF",
    label: "Debt Relief",
    code: "DEBT",
    fields: [
      { key: "unsecured_debt_amount", label: "Unsecured Debt", type: "number", required: true, min: 0 },
      { key: "num_creditors", label: "Creditors", type: "number", required: false, min: 1 },
      { key: "delinquent", label: "Currently Delinquent", type: "enum", required: false, options: YES_NO },
    ],
  },
  LEGAL_MASS_TORT: {
    vertical: "LEGAL_MASS_TORT",
    label: "Legal / Mass Tort",
    code: "TORT",
    fields: [
      { key: "case_type", label: "Case Type", type: "string", required: true },
      { key: "diagnosis_date", label: "Diagnosis Date", type: "date", required: false },
      { key: "represented_by_counsel", label: "Has Counsel", type: "enum", required: true, options: YES_NO },
    ],
  },
  EDUCATION: {
    vertical: "EDUCATION",
    label: "Education",
    code: "EDU",
    fields: [
      { key: "program_of_interest", label: "Program of Interest", type: "string", required: true },
      { key: "education_level", label: "Education Level", type: "enum", required: true, options: ["HIGH_SCHOOL", "SOME_COLLEGE", "ASSOCIATE", "BACHELOR", "MASTER"] },
      { key: "enrollment_timeframe", label: "Enrollment Timeframe", type: "enum", required: false, options: ["IMMEDIATE", "3_MONTHS", "6_MONTHS", "12_MONTHS"] },
    ],
  },
};

export function getVerticalSpec(vertical: Vertical): VerticalSpec {
  return VERTICAL_SPECS[vertical];
}

/** Full ordered field list (core contact + vertical specific). */
export function allFieldsFor(vertical: Vertical): VerticalField[] {
  return [...CORE_CONTACT_FIELDS, ...VERTICAL_SPECS[vertical].fields];
}

/** Header row for the publisher CSV template of a given vertical. */
export function csvTemplateHeaders(vertical: Vertical): string[] {
  return [
    "source_id",
    ...allFieldsFor(vertical).map((f) => f.key),
    "trustedform_cert_url",
    "jornaya_lead_id",
    "consent_text",
    "ingress_ip",
    "submitted_at",
  ];
}
