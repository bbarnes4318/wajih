import type {
  BatchIntegrityFlag,
  BatchStatus,
  BuyerLeadStatus,
  DisputeReasonCode,
  IngressChannel,
  NotificationSeverity,
  OrgStatus,
  PipelineStage,
  RejectionReasonCode,
  RejectionStep,
  SettlementStatus,
  SuppressionListType,
  TrafficSource,
  UserRole,
  VettingCheckKey,
  VettingCheckStatus,
} from "@prisma/client";
import { VERTICAL_SPECS } from "./verticals";

/**
 * Presentation registry for every enum in the system.
 *
 * Rule 1 says rejections and disputes are enums, never free text — which puts
 * the burden of being human-readable here. One place to add a label, one
 * place to pick a colour, and no stringly-typed formatting scattered across
 * components.
 */

/** Chip palettes, mapped to the token families in globals.css. */
export type Tone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "violet"
  | "teal";

export const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-chip text-muted border-chip-border",
  accent: "bg-accent-soft text-accent border-accent-border",
  success: "bg-success-soft text-success border-success-border",
  warning: "bg-warning-soft text-warning border-warning-border",
  danger: "bg-danger-soft text-danger border-danger-border",
  info: "bg-info-soft text-info border-info-border",
  violet: "bg-violet-soft text-violet border-violet-border",
  teal: "bg-teal-soft text-teal border-teal-border",
};

/** Solid dot colour, for legends and timeline markers. */
export const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-faint",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  violet: "bg-violet",
  teal: "bg-teal",
};

export interface EnumMeta {
  label: string;
  tone: Tone;
  /** Longer explanation surfaced in tooltips and drill-downs. */
  help?: string;
}

// ---------------------------------------------------------------------------
//  Pipeline
// ---------------------------------------------------------------------------

export const PIPELINE_STAGE: Record<PipelineStage, EnumMeta> = {
  INTAKE: { label: "Intake", tone: "neutral", help: "Tagged and attributed; validation not yet run." },
  VALIDATED: { label: "Validated", tone: "info", help: "Fields normalized and schema-checked." },
  SCRUBBED: { label: "Scrubbed", tone: "info", help: "Clear on every DNC and litigator list." },
  CONSENT_VERIFIED: { label: "Consent Verified", tone: "violet", help: "TrustedForm or Jornaya artifact verified." },
  QUALIFIED: { label: "Qualified", tone: "violet", help: "Matched at least one active buyer campaign." },
  ROUTED: { label: "Routed", tone: "warning", help: "Buyer selected and capacity reserved; delivery in flight." },
  DELIVERED: { label: "Delivered", tone: "success", help: "Buyer endpoint acknowledged receipt." },
  DISPUTED: { label: "Disputed", tone: "danger", help: "Buyer filed a structured return request." },
  ACCEPTED: { label: "Accepted", tone: "success", help: "Buyer accepted, or a return was denied." },
  SETTLED: { label: "Settled", tone: "teal", help: "Dispute window closed; payout resolved." },
  REJECTED: { label: "Rejected", tone: "danger", help: "Halted by the compliance waterfall." },
  HOLD_QUEUE: { label: "Hold Queue", tone: "warning", help: "Retained but undeliverable pending consent evidence." },
};

/** Display order for pipeline funnels and legends. */
export const PIPELINE_STAGE_ORDER: PipelineStage[] = [
  "INTAKE",
  "VALIDATED",
  "SCRUBBED",
  "CONSENT_VERIFIED",
  "QUALIFIED",
  "ROUTED",
  "DELIVERED",
  "ACCEPTED",
  "DISPUTED",
  "SETTLED",
  "HOLD_QUEUE",
  "REJECTED",
];

export const REJECTION_STEP: Record<RejectionStep, EnumMeta> = {
  STEP_1_INTAKE: { label: "1 · Intake", tone: "neutral" },
  STEP_2_FIELD_VALIDATION: { label: "2 · Field Validation", tone: "info" },
  STEP_3_DEDUP: { label: "3 · Dedup", tone: "violet" },
  STEP_4_DNC_LITIGATOR: { label: "4 · DNC / Litigator", tone: "danger" },
  STEP_5_CONSENT: { label: "5 · Consent", tone: "warning" },
  STEP_6_VERTICAL_QUALIFIER: { label: "6 · Vertical Qualifier", tone: "teal" },
  STEP_7_ROUTING: { label: "7 · Routing", tone: "accent" },
};

export const STEP_NAMES: Record<number, string> = {
  1: "Intake Tagging",
  2: "Field Validation",
  3: "Cross/Intra-DB Dedup",
  4: "DNC / TCPA Litigator Scrub",
  5: "Consent Verification",
  6: "Vertical Qualifier",
  7: "Rules-Based Routing",
  8: "Delivery & Webhook",
  9: "Dispute Window",
  10: "Settlement",
};

export const REJECTION_REASON: Record<RejectionReasonCode, EnumMeta> = {
  // Step 1
  MISSING_SOURCE_ID: { label: "Missing Source ID", tone: "neutral", help: "Submission carried no Source ID, so it could not be attributed to a publisher." },
  UNKNOWN_SOURCE_ID: { label: "Unknown Source ID", tone: "neutral", help: "Source ID does not exist in the network." },
  SOURCE_INACTIVE: { label: "Source Inactive", tone: "neutral", help: "The source exists but has been switched off." },
  PUBLISHER_NOT_VETTED: { label: "Publisher Not Vetted", tone: "warning", help: "Publisher has not completed the 9-point vetting checklist." },
  PUBLISHER_SUSPENDED: { label: "Publisher Suspended", tone: "danger" },
  PUBLISHER_TERMINATED: { label: "Publisher Terminated", tone: "danger" },

  // Step 2
  MISSING_REQUIRED_FIELD: { label: "Missing Required Field", tone: "info" },
  INVALID_PHONE_FORMAT: { label: "Invalid Phone Format", tone: "info", help: "Could not be normalized to E.164." },
  NON_US_PHONE: { label: "Non-US Phone", tone: "info", help: "Outside the NANP; this network does not buy international traffic." },
  INVALID_EMAIL_FORMAT: { label: "Invalid Email Format", tone: "info" },
  INVALID_STATE_CODE: { label: "Invalid State Code", tone: "info" },
  INVALID_ZIP_CODE: { label: "Invalid ZIP Code", tone: "info" },
  INVALID_DATE_OF_BIRTH: { label: "Invalid Date of Birth", tone: "info" },
  VERTICAL_SCHEMA_MISMATCH: { label: "Vertical Schema Mismatch", tone: "info" },

  // Step 3
  DUPLICATE_INTRA_PUBLISHER: { label: "Duplicate (Same Publisher)", tone: "violet", help: "This publisher already submitted this consumer inside the 30-day window." },
  DUPLICATE_CROSS_PUBLISHER: { label: "Duplicate (Cross Publisher)", tone: "violet", help: "A different publisher sold this consumer inside the 30-day window." },

  // Step 4
  DNC_FEDERAL_MATCH: { label: "Federal DNC Match", tone: "danger" },
  DNC_STATE_MATCH: { label: "State DNC Match", tone: "danger" },
  DNC_INTERNAL_MATCH: { label: "Internal DNC Match", tone: "danger", help: "Consumer previously revoked consent with this network." },
  TCPA_LITIGATOR_MATCH: { label: "TCPA Litigator Match", tone: "danger", help: "Known serial TCPA plaintiff." },
  SCRUB_PROVIDER_ERROR: { label: "Scrub Provider Error", tone: "danger", help: "The scrub could not be completed. Never treated as clean." },

  // Step 5
  CONSENT_CERT_MISSING: { label: "Consent Cert Missing", tone: "warning" },
  CONSENT_CERT_MALFORMED: { label: "Consent Cert Malformed", tone: "warning" },
  CONSENT_CERT_EXPIRED: { label: "Consent Cert Expired", tone: "warning", help: "Older than the provider's 90-day retention window; no longer claimable." },
  CONSENT_TEXT_MISSING: { label: "Consent Text Missing", tone: "warning", help: "Certificate present but no verbatim disclosure captured." },

  // Step 6
  NO_ACTIVE_CAMPAIGN_FOR_VERTICAL: { label: "No Active Campaign", tone: "teal" },
  OUT_OF_GEOGRAPHY: { label: "Out of Geography", tone: "teal" },
  AGE_OUT_OF_RANGE: { label: "Age Out of Range", tone: "teal" },
  CRITERIA_MISMATCH: { label: "Criteria Mismatch", tone: "teal" },

  // Step 7
  ALL_CAMPAIGNS_CAPPED: { label: "All Campaigns Capped", tone: "accent" },
  DAILY_BUDGET_EXHAUSTED: { label: "Daily Budget Exhausted", tone: "accent" },
  CPL_FLOOR_NOT_MET: { label: "CPL Floor Not Met", tone: "accent", help: "Publisher payout would exceed what the buyer pays." },
};

// ---------------------------------------------------------------------------
//  Commercial
// ---------------------------------------------------------------------------

export const BUYER_STATUS: Record<BuyerLeadStatus, EnumMeta> = {
  PENDING: { label: "Pending", tone: "warning", help: "Inside the return window." },
  ACCEPTED: { label: "Accepted", tone: "success" },
  // Pending review by network operations — not yet a hard outcome, so it
  // takes "info" (neutral system state) rather than "danger", which is
  // reserved for an approved return. The reason code itself stays neutral
  // (tone: "neutral" below) so a queue row never carries more than the two
  // hue families (status + countdown) the hue budget allows.
  DISPUTED: { label: "Disputed", tone: "info" },
  RETURN_APPROVED: { label: "Return Approved", tone: "danger", help: "Credited to the buyer; publisher payout voided." },
  RETURN_DENIED: { label: "Return Denied", tone: "success", help: "Lead stands as payable." },
};

// A dispute reason is a label explaining *why*, not a second status — the
// status chip above already carries the severity. Every reason is "neutral"
// (the "chip" family) so it never competes with BUYER_STATUS for attention.
export const DISPUTE_REASON: Record<DisputeReasonCode, EnumMeta> = {
  INVALID_DISCONNECT: { label: "Invalid / Disconnected", tone: "neutral", help: "Number is out of service or unreachable." },
  TCPA_MISMATCH: { label: "TCPA Mismatch", tone: "neutral", help: "Consent record does not support outreach to this consumer." },
  OUT_OF_GEOGRAPHY: { label: "Out of Geography", tone: "neutral", help: "Delivered outside the campaign's accepted area." },
  DUPLICATE_WITHIN_WINDOW: { label: "Duplicate in Window", tone: "neutral", help: "Buyer already purchased this consumer inside the window." },
  WRONG_PERSON: { label: "Wrong Person", tone: "neutral", help: "Contact reached is not the person who inquired." },
  BOGUS_CONTACT_INFO: { label: "Bogus Contact Info", tone: "neutral", help: "Name, address or email is fabricated." },
};

export const SETTLEMENT_STATUS: Record<SettlementStatus, EnumMeta> = {
  UNSETTLED: { label: "Unsettled", tone: "neutral" },
  SETTLED_PAYABLE: { label: "Payable", tone: "success" },
  SETTLED_VOID: { label: "Void", tone: "neutral" },
  CLAWED_BACK: { label: "Clawed Back", tone: "danger" },
};

// ---------------------------------------------------------------------------
//  Tenancy & vetting
// ---------------------------------------------------------------------------

export const ORG_STATUS: Record<OrgStatus, EnumMeta> = {
  PENDING_VETTING: { label: "Pending Vetting", tone: "warning" },
  ACTIVE: { label: "Active", tone: "success" },
  SUSPENDED: { label: "Suspended", tone: "danger" },
  TERMINATED: { label: "Terminated", tone: "neutral" },
};

export const USER_ROLE: Record<UserRole, EnumMeta> = {
  SUPER_ADMIN: { label: "Super Admin", tone: "accent" },
  PUBLISHER: { label: "Publisher", tone: "violet" },
  BUYER: { label: "Buyer", tone: "teal" },
};

export const VETTING_CHECK: Record<
  VettingCheckKey,
  EnumMeta & { detail: string }
> = {
  EIN_TAX_ID_VERIFIED: {
    label: "EIN / Tax ID Verified",
    tone: "accent",
    detail:
      "EIN matches the legal entity name on the signed agreement, confirmed against an IRS letter or state filing.",
  },
  BUSINESS_ENTITY_IN_GOOD_STANDING: {
    label: "Entity in Good Standing",
    tone: "accent",
    detail:
      "Secretary of State registration is active, not dissolved or delinquent, in the state of incorporation.",
  },
  LANDING_PAGE_LIVE_CHECK: {
    label: "Landing Page Live Check",
    tone: "accent",
    detail:
      "Every declared landing page resolves, renders the lead form, and was captured as a dated snapshot.",
  },
  VERBATIM_DISCLOSURE_MATCH: {
    label: "Verbatim Disclosure Match",
    tone: "accent",
    detail:
      "The on-page consent language matches the network's required text word for word, and sits above the submit control.",
  },
  CONSENT_CAPTURE_SAMPLE_REVIEWED: {
    label: "Consent Capture Sample",
    tone: "accent",
    detail:
      "A live TrustedForm or Jornaya certificate from this publisher was retrieved and its session replay reviewed.",
  },
  TRAFFIC_SOURCE_DISCLOSURE_COMPLETE: {
    label: "Traffic Source Disclosure",
    tone: "accent",
    detail:
      "Every traffic source is declared, including downstream co-registration partners and any SMS or email list provenance.",
  },
  INDUSTRY_REFERENCES_CHECKED: {
    label: "Industry References Checked",
    tone: "accent",
    detail:
      "At least one prior buyer or network confirmed volume, quality and dispute history directly.",
  },
  SIGNED_INDEMNITY_AGREEMENT: {
    label: "Signed Indemnity Agreement",
    tone: "accent",
    detail:
      "Countersigned publisher agreement on file, including TCPA indemnification and audit rights.",
  },
  TEST_BATCH_PASSED: {
    label: "Test Batch Passed",
    tone: "accent",
    detail:
      "A supervised test batch cleared DNC, connected at an acceptable rate, and produced no consumer denials.",
  },
};

export const VETTING_CHECK_ORDER: VettingCheckKey[] = [
  "EIN_TAX_ID_VERIFIED",
  "BUSINESS_ENTITY_IN_GOOD_STANDING",
  "LANDING_PAGE_LIVE_CHECK",
  "VERBATIM_DISCLOSURE_MATCH",
  "CONSENT_CAPTURE_SAMPLE_REVIEWED",
  "TRAFFIC_SOURCE_DISCLOSURE_COMPLETE",
  "INDUSTRY_REFERENCES_CHECKED",
  "SIGNED_INDEMNITY_AGREEMENT",
  "TEST_BATCH_PASSED",
];

export const VETTING_CHECK_STATUS: Record<VettingCheckStatus, EnumMeta> = {
  NOT_STARTED: { label: "Not Started", tone: "neutral" },
  IN_REVIEW: { label: "In Review", tone: "warning" },
  PASSED: { label: "Passed", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
  WAIVED: { label: "Waived", tone: "info" },
};

// ---------------------------------------------------------------------------
//  Intake & batches
// ---------------------------------------------------------------------------

export const INGRESS_CHANNEL: Record<IngressChannel, EnumMeta> = {
  API: { label: "API", tone: "accent" },
  SINGLE_FORM: { label: "Single Form", tone: "violet" },
  CSV_BATCH: { label: "CSV Batch", tone: "teal" },
};

export const BATCH_STATUS: Record<BatchStatus, EnumMeta> = {
  UPLOADED: { label: "Uploaded", tone: "neutral" },
  VALIDATING: { label: "Validating", tone: "info" },
  VALIDATION_FAILED: { label: "Validation Failed", tone: "danger" },
  PROCESSING: { label: "Processing", tone: "warning" },
  COMPLETED: { label: "Completed", tone: "success" },
  FAILED: { label: "Failed", tone: "danger" },
};

export const BATCH_INTEGRITY_FLAG: Record<
  BatchIntegrityFlag,
  EnumMeta & { detail: string }
> = {
  MISSING_CERT_COLUMN: {
    label: "Missing Cert Column",
    tone: "danger",
    detail:
      "The file has no trustedform_cert_url or jornaya_lead_id column, so no row in it can evidence consent.",
  },
  INVALID_HEADER_SCHEMA: {
    label: "Invalid Header Schema",
    tone: "danger",
    detail: "Required columns for the declared vertical are absent or misspelled.",
  },
  SEQUENTIAL_PHONE_PATTERN: {
    label: "Sequential Phone Pattern",
    tone: "danger",
    detail:
      "Long runs of consecutive phone numbers. Real consumer traffic does not arrive in numeric order.",
  },
  DUPLICATE_IP_CLUSTER: {
    label: "Duplicate IP Cluster",
    tone: "danger",
    detail:
      "A handful of IP addresses account for most of the file, which is characteristic of scripted submission.",
  },
  UNIFORM_TIMESTAMPS: {
    label: "Uniform Timestamps",
    tone: "danger",
    detail:
      "Submission times cluster into a span no human cohort could produce.",
  },
  HIGH_INTRA_BATCH_DUPLICATES: {
    label: "High Intra-Batch Duplicates",
    tone: "warning",
    detail: "The file repeats the same consumers within itself.",
  },
  IMPOSSIBLE_SUBMIT_VELOCITY: {
    label: "Impossible Submit Velocity",
    tone: "danger",
    detail:
      "Time between form render and submit is shorter than a person could physically type the answers.",
  },
};

export const SUPPRESSION_LIST_TYPE: Record<SuppressionListType, EnumMeta> = {
  INTERNAL_DNC: { label: "Internal DNC", tone: "warning" },
  FEDERAL_DNC: { label: "Federal DNC", tone: "danger" },
  STATE_DNC: { label: "State DNC", tone: "danger" },
  TCPA_LITIGATOR: { label: "TCPA Litigator", tone: "danger" },
};

export const NOTIFICATION_SEVERITY: Record<NotificationSeverity, EnumMeta> = {
  INFO: { label: "Info", tone: "info" },
  WARNING: { label: "Warning", tone: "warning" },
  CRITICAL: { label: "Critical", tone: "danger" },
};

export const TRAFFIC_SOURCE: Record<TrafficSource, EnumMeta> = {
  SEO: { label: "SEO", tone: "success" },
  PAID_SEARCH: { label: "Paid Search", tone: "accent" },
  PAID_SOCIAL: { label: "Paid Social", tone: "accent" },
  DISPLAY: { label: "Display", tone: "info" },
  NATIVE: { label: "Native", tone: "info" },
  EMAIL: { label: "Email", tone: "warning" },
  SMS: { label: "SMS", tone: "warning" },
  PUSH: { label: "Push", tone: "warning" },
  CALL_CENTER: { label: "Call Center", tone: "violet" },
  CO_REGISTRATION: { label: "Co-Registration", tone: "warning" },
  AGGREGATOR: { label: "Aggregator", tone: "neutral" },
  INCENTIVIZED: { label: "Incentivized", tone: "danger", help: "Highest-risk source class." },
};

// ---------------------------------------------------------------------------
//  Verticals
// ---------------------------------------------------------------------------

export function verticalLabel(v: keyof typeof VERTICAL_SPECS): string {
  return VERTICAL_SPECS[v].label;
}

export function verticalCode(v: keyof typeof VERTICAL_SPECS): string {
  return VERTICAL_SPECS[v].code;
}

// ---------------------------------------------------------------------------
//  Generic fallback — never render a raw SCREAMING_SNAKE code to a user.
// ---------------------------------------------------------------------------

export function humanize(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
