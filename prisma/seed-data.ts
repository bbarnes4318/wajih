import type { TrafficSource, Vertical } from "@prisma/client";

/**
 * Static fixtures for the demo network.
 *
 * Everything here is fictional. Phone numbers use the 555-01xx block reserved
 * for fictional use, and EINs / domains are invented.
 */

// ---------------------------------------------------------------------------
//  Deterministic RNG — a seeded LCG so `npm run db:seed` is reproducible.
// ---------------------------------------------------------------------------

export function makeRng(seed = 1337) {
  let state = seed >>> 0;
  const rng = {
    next(): number {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    },
    int(minInclusive: number, maxExclusive: number): number {
      return minInclusive + Math.floor(rng.next() * (maxExclusive - minInclusive));
    },
    pick<T>(arr: readonly T[]): T {
      return arr[rng.int(0, arr.length)];
    },
    /** True with probability p. */
    chance(p: number): boolean {
      return rng.next() < p;
    },
    shuffle<T>(arr: T[]): T[] {
      const out = [...arr];
      for (let i = out.length - 1; i > 0; i--) {
        const j = rng.int(0, i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
  return rng;
}

export type Rng = ReturnType<typeof makeRng>;

// ---------------------------------------------------------------------------
//  Geography
// ---------------------------------------------------------------------------

export interface Place {
  city: string;
  state: string;
  zip: string;
  areaCode: string;
}

export const PLACES: Place[] = [
  { city: "Phoenix", state: "AZ", zip: "85004", areaCode: "602" },
  { city: "Tucson", state: "AZ", zip: "85719", areaCode: "520" },
  { city: "Sacramento", state: "CA", zip: "95814", areaCode: "916" },
  { city: "Fresno", state: "CA", zip: "93721", areaCode: "559" },
  { city: "San Diego", state: "CA", zip: "92101", areaCode: "619" },
  { city: "Denver", state: "CO", zip: "80202", areaCode: "303" },
  { city: "Orlando", state: "FL", zip: "32801", areaCode: "407" },
  { city: "Tampa", state: "FL", zip: "33602", areaCode: "813" },
  { city: "Jacksonville", state: "FL", zip: "32202", areaCode: "904" },
  { city: "Atlanta", state: "GA", zip: "30303", areaCode: "404" },
  { city: "Savannah", state: "GA", zip: "31401", areaCode: "912" },
  { city: "Boise", state: "ID", zip: "83702", areaCode: "208" },
  { city: "Chicago", state: "IL", zip: "60601", areaCode: "312" },
  { city: "Indianapolis", state: "IN", zip: "46204", areaCode: "317" },
  { city: "Louisville", state: "KY", zip: "40202", areaCode: "502" },
  { city: "Baltimore", state: "MD", zip: "21201", areaCode: "410" },
  { city: "Detroit", state: "MI", zip: "48226", areaCode: "313" },
  { city: "Minneapolis", state: "MN", zip: "55401", areaCode: "612" },
  { city: "Kansas City", state: "MO", zip: "64106", areaCode: "816" },
  { city: "Charlotte", state: "NC", zip: "28202", areaCode: "704" },
  { city: "Raleigh", state: "NC", zip: "27601", areaCode: "919" },
  { city: "Las Vegas", state: "NV", zip: "89101", areaCode: "702" },
  { city: "Columbus", state: "OH", zip: "43215", areaCode: "614" },
  { city: "Cleveland", state: "OH", zip: "44113", areaCode: "216" },
  { city: "Oklahoma City", state: "OK", zip: "73102", areaCode: "405" },
  { city: "Portland", state: "OR", zip: "97204", areaCode: "503" },
  { city: "Philadelphia", state: "PA", zip: "19103", areaCode: "215" },
  { city: "Pittsburgh", state: "PA", zip: "15222", areaCode: "412" },
  { city: "Charleston", state: "SC", zip: "29401", areaCode: "843" },
  { city: "Nashville", state: "TN", zip: "37203", areaCode: "615" },
  { city: "Memphis", state: "TN", zip: "38103", areaCode: "901" },
  { city: "Austin", state: "TX", zip: "78701", areaCode: "512" },
  { city: "Dallas", state: "TX", zip: "75201", areaCode: "214" },
  { city: "Houston", state: "TX", zip: "77002", areaCode: "713" },
  { city: "San Antonio", state: "TX", zip: "78205", areaCode: "210" },
  { city: "Salt Lake City", state: "UT", zip: "84101", areaCode: "801" },
  { city: "Richmond", state: "VA", zip: "23219", areaCode: "804" },
  { city: "Seattle", state: "WA", zip: "98104", areaCode: "206" },
  { city: "Spokane", state: "WA", zip: "99201", areaCode: "509" },
  { city: "Milwaukee", state: "WI", zip: "53202", areaCode: "414" },
];

// ---------------------------------------------------------------------------
//  Names
// ---------------------------------------------------------------------------

export const FIRST_NAMES = [
  "James", "Maria", "Robert", "Linda", "Michael", "Patricia", "David", "Jennifer",
  "William", "Elizabeth", "Richard", "Barbara", "Joseph", "Susan", "Thomas",
  "Jessica", "Charles", "Sarah", "Christopher", "Karen", "Daniel", "Nancy",
  "Matthew", "Lisa", "Anthony", "Betty", "Mark", "Margaret", "Donald", "Sandra",
  "Steven", "Ashley", "Paul", "Kimberly", "Andrew", "Emily", "Joshua", "Donna",
  "Kenneth", "Michelle", "Kevin", "Carol", "Brian", "Amanda", "George", "Dorothy",
  "Timothy", "Melissa", "Ronald", "Deborah", "Jason", "Stephanie", "Edward",
  "Rebecca", "Jeffrey", "Sharon", "Ryan", "Laura", "Jacob", "Cynthia",
];

export const LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
  "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
  "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson", "Walker",
  "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill",
  "Flores", "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell",
  "Mitchell", "Carter", "Roberts", "Gomez", "Phillips", "Evans", "Turner",
];

export const STREETS = [
  "Maple", "Oak", "Cedar", "Pine", "Elm", "Washington", "Lincoln", "Jefferson",
  "Franklin", "Highland", "Sunset", "Lakeview", "Riverside", "Park", "Meadow",
  "Willow", "Chestnut", "Birch", "Aspen", "Juniper",
];

export const STREET_SUFFIXES = ["St", "Ave", "Rd", "Dr", "Ln", "Ct", "Blvd", "Way"];

export const EMAIL_DOMAINS = [
  "gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com",
  "aol.com", "comcast.net", "proton.me",
];

// ---------------------------------------------------------------------------
//  Consent disclosure (verbatim TCPA-style text the network requires)
// ---------------------------------------------------------------------------

export const DISCLOSURE_TEXT =
  "By clicking Get My Quote, I provide my express written consent to receive " +
  "marketing calls and text messages, including by autodialer and prerecorded " +
  "voice, from the companies matched to my request at the telephone number I " +
  "provided, even if that number is on a Do Not Call registry. Consent is not a " +
  "condition of purchase. Message and data rates may apply. I may revoke consent " +
  "at any time.";

// ---------------------------------------------------------------------------
//  Publishers
// ---------------------------------------------------------------------------

export type VettingCheckKeyName =
  | "EIN_TAX_ID_VERIFIED"
  | "BUSINESS_ENTITY_IN_GOOD_STANDING"
  | "LANDING_PAGE_LIVE_CHECK"
  | "VERBATIM_DISCLOSURE_MATCH"
  | "CONSENT_CAPTURE_SAMPLE_REVIEWED"
  | "TRAFFIC_SOURCE_DISCLOSURE_COMPLETE"
  | "INDUSTRY_REFERENCES_CHECKED"
  | "SIGNED_INDEMNITY_AGREEMENT"
  | "TEST_BATCH_PASSED";

export type VettingCheckStatusName =
  | "NOT_STARTED"
  | "IN_REVIEW"
  | "PASSED"
  | "FAILED"
  | "WAIVED";

export interface SourceFixture {
  sourceId: string;
  label: string;
  vertical: Vertical;
  trafficSource: TrafficSource;
  landingPageUrl: string;
  active?: boolean;
  /** Relative share of this publisher's submission volume. */
  weight: number;
}

export interface PublisherFixture {
  key: string;
  name: string;
  einTaxId: string;
  website: string;
  domain: string;
  status: "PENDING_VETTING" | "ACTIVE" | "SUSPENDED" | "TERMINATED";
  contactName: string;
  sources: SourceFixture[];
  rates: Array<{ vertical: Vertical; payoutCpl: number }>;
  vetting: {
    trafficSources: TrafficSource[];
    landingPageUrls: string[];
    consentSampleUrl: string | null;
    disclosureText: string | null;
    agreementSignedAt: string | null;
    agreementPdfUrl: string | null;
    testBatchPassed: boolean;
    auditNotes: string | null;
    submittedAt: string | null;
    approvedAt: string | null;
    references: Array<{
      name: string;
      company: string;
      email: string;
      phone: string;
      relationship: string;
      verified: boolean;
    }>;
    /** Overrides for the 9-point checklist; omitted keys default by status. */
    checkOverrides?: Partial<
      Record<VettingCheckKeyName, { status: VettingCheckStatusName; notes?: string }>
    >;
  };
  /** Knobs the lead generator uses to shape this publisher's traffic quality. */
  quality: {
    malformedRate: number;
    badConsentRate: number;
    suppressedRate: number;
    duplicateRate: number;
    /**
     * Share of delivered leads that end as an APPROVED RETURN — i.e. exactly
     * what `publisher_metrics.return_rate_14d` measures. Denied disputes are
     * layered on top of this by the seeder, so the real filing rate is higher.
     */
    approvedReturnRate: number;
    dailyVolume: number;
  };
}

export const PUBLISHERS: PublisherFixture[] = [
  {
    key: "apex",
    name: "Apex Digital Media",
    einTaxId: "47-3821904",
    website: "https://apexdigitalmedia.example",
    domain: "apexdigitalmedia.example",
    status: "ACTIVE",
    contactName: "Dana Whitfield",
    sources: [
      {
        sourceId: "APEX-AUTO-PS-001",
        label: "Auto - Paid Search (Brand)",
        vertical: "AUTO_INSURANCE",
        trafficSource: "PAID_SEARCH",
        landingPageUrl: "https://apexdigitalmedia.example/auto-quotes",
        weight: 5,
      },
      {
        sourceId: "APEX-SOLAR-PSOC-002",
        label: "Solar - Paid Social",
        vertical: "SOLAR",
        trafficSource: "PAID_SOCIAL",
        landingPageUrl: "https://apexdigitalmedia.example/solar-savings",
        weight: 3,
      },
    ],
    rates: [
      { vertical: "AUTO_INSURANCE", payoutCpl: 14.5 },
      { vertical: "SOLAR", payoutCpl: 42.0 },
    ],
    vetting: {
      trafficSources: ["PAID_SEARCH", "PAID_SOCIAL"],
      landingPageUrls: [
        "https://apexdigitalmedia.example/auto-quotes",
        "https://apexdigitalmedia.example/solar-savings",
      ],
      consentSampleUrl:
        "https://cert.trustedform.com/a1b2c3d4e5f60718293a4b5c6d7e8f9012345678",
      disclosureText: DISCLOSURE_TEXT,
      agreementSignedAt: "2025-11-04T15:22:00.000Z",
      agreementPdfUrl:
        "s3://leados-agreements/apex-digital-media/indemnity-2025-11-04.pdf",
      testBatchPassed: true,
      auditNotes:
        "Two-year operating history. Disclosure matches the network verbatim requirement exactly. Test batch of 50 returned 2 invalid numbers (4%), within tolerance.",
      submittedAt: "2025-10-28T09:10:00.000Z",
      approvedAt: "2025-11-05T17:40:00.000Z",
      references: [
        {
          name: "Marcus Feld",
          company: "Cardinal Media Buying",
          email: "mfeld@cardinalmb.example",
          phone: "+15550142201",
          relationship: "Former demand partner (18 months)",
          verified: true,
        },
        {
          name: "Priya Raman",
          company: "Northlight Insurance Group",
          email: "praman@northlightins.example",
          phone: "+15550142202",
          relationship: "Direct buyer (auto vertical)",
          verified: true,
        },
      ],
    },
    quality: {
      malformedRate: 0.03,
      badConsentRate: 0.03,
      suppressedRate: 0.02,
      duplicateRate: 0.03,
      approvedReturnRate: 0.04,
      dailyVolume: 14,
    },
  },
  {
    key: "northgate",
    name: "Northgate Performance",
    einTaxId: "82-4419307",
    website: "https://northgateperf.example",
    domain: "northgateperf.example",
    status: "ACTIVE",
    contactName: "Curtis Alvarado",
    sources: [
      {
        sourceId: "NGP-MCARE-SEO-001",
        label: "Medicare - Organic Search",
        vertical: "MEDICARE",
        trafficSource: "SEO",
        landingPageUrl: "https://northgateperf.example/medicare-plans",
        weight: 4,
      },
      {
        sourceId: "NGP-HIMP-NAT-002",
        label: "Home Improvement - Native",
        vertical: "HOME_IMPROVEMENT",
        trafficSource: "NATIVE",
        landingPageUrl: "https://northgateperf.example/roofing-estimates",
        weight: 4,
      },
    ],
    rates: [
      { vertical: "MEDICARE", payoutCpl: 26.0 },
      { vertical: "HOME_IMPROVEMENT", payoutCpl: 21.0 },
    ],
    vetting: {
      trafficSources: ["SEO", "NATIVE"],
      landingPageUrls: [
        "https://northgateperf.example/medicare-plans",
        "https://northgateperf.example/roofing-estimates",
      ],
      consentSampleUrl:
        "https://cert.trustedform.com/b2c3d4e5f60718293a4b5c6d7e8f901234567890",
      disclosureText: DISCLOSURE_TEXT,
      agreementSignedAt: "2025-09-19T11:05:00.000Z",
      agreementPdfUrl:
        "s3://leados-agreements/northgate-performance/indemnity-2025-09-19.pdf",
      testBatchPassed: true,
      auditNotes:
        "Organic and native only - no incentivized traffic declared or detected. CMS-compliant Medicare disclosure verified against the landing page snapshot.",
      submittedAt: "2025-09-08T14:00:00.000Z",
      approvedAt: "2025-09-20T10:15:00.000Z",
      references: [
        {
          name: "Helen Cho",
          company: "Beacon Senior Services",
          email: "hcho@beaconsenior.example",
          phone: "+15550142203",
          relationship: "Direct buyer (Medicare)",
          verified: true,
        },
      ],
    },
    quality: {
      malformedRate: 0.02,
      badConsentRate: 0.02,
      suppressedRate: 0.015,
      duplicateRate: 0.02,
      approvedReturnRate: 0.03,
      dailyVolume: 12,
    },
  },
  {
    key: "bluepeak",
    name: "Bluepeak Interactive",
    einTaxId: "61-7745218",
    website: "https://bluepeakinteractive.example",
    domain: "bluepeakinteractive.example",
    status: "ACTIVE",
    contactName: "Sasha Berlin",
    sources: [
      {
        sourceId: "BLUE-AUTO-DISP-001",
        label: "Auto - Display Network",
        vertical: "AUTO_INSURANCE",
        trafficSource: "DISPLAY",
        landingPageUrl: "https://bluepeakinteractive.example/insurance-savings",
        weight: 5,
      },
      {
        sourceId: "BLUE-PLOAN-COREG-002",
        label: "Personal Loan - Co-Registration",
        vertical: "PERSONAL_LOAN",
        trafficSource: "CO_REGISTRATION",
        landingPageUrl: "https://bluepeakinteractive.example/loan-offers",
        weight: 3,
      },
    ],
    rates: [
      { vertical: "AUTO_INSURANCE", payoutCpl: 12.0 },
      { vertical: "PERSONAL_LOAN", payoutCpl: 18.0 },
    ],
    vetting: {
      trafficSources: ["DISPLAY", "CO_REGISTRATION"],
      landingPageUrls: [
        "https://bluepeakinteractive.example/insurance-savings",
        "https://bluepeakinteractive.example/loan-offers",
      ],
      consentSampleUrl:
        "https://cert.trustedform.com/c3d4e5f60718293a4b5c6d7e8f90123456789012",
      disclosureText: DISCLOSURE_TEXT,
      agreementSignedAt: "2026-01-12T16:30:00.000Z",
      agreementPdfUrl:
        "s3://leados-agreements/bluepeak-interactive/indemnity-2026-01-12.pdf",
      testBatchPassed: true,
      auditNotes:
        "Co-registration path approved on condition that the loan offer page renders the full disclosure above the fold. Return rate flagged for review at day 30.",
      submittedAt: "2026-01-02T08:45:00.000Z",
      approvedAt: "2026-01-13T12:00:00.000Z",
      references: [
        {
          name: "Owen Marsh",
          company: "Trailhead Performance",
          email: "omarsh@trailheadperf.example",
          phone: "+15550142204",
          relationship: "Traffic partner",
          verified: true,
        },
      ],
      checkOverrides: {
        TRAFFIC_SOURCE_DISCLOSURE_COMPLETE: {
          status: "IN_REVIEW",
          notes:
            "Co-registration partner list supplied 2026-08-14; two downstream sub-sources still unnamed.",
        },
      },
    },
    // Deliberately poor: this publisher must trip the 15% auto-suspension
    // threshold on computed metrics, not on where the dice land.
    //
    // The measured 14-day rate comes in below this number: leads delivered in
    // the last ~3 days still have open return windows and contribute zero
    // approved returns, diluting the rate by roughly 11/14. 0.28 here lands
    // around 21% measured, which clears 15% with room to spare.
    quality: {
      malformedRate: 0.06,
      badConsentRate: 0.07,
      suppressedRate: 0.05,
      duplicateRate: 0.06,
      approvedReturnRate: 0.28,
      dailyVolume: 13,
    },
  },
  {
    key: "meridian",
    name: "Meridian Lead Group",
    einTaxId: "35-9902144",
    website: "https://meridianleadgroup.example",
    domain: "meridianleadgroup.example",
    status: "PENDING_VETTING",
    contactName: "Tomas Ek",
    sources: [
      {
        sourceId: "MERI-MTG-PS-001",
        label: "Mortgage - Paid Search",
        vertical: "MORTGAGE",
        trafficSource: "PAID_SEARCH",
        landingPageUrl: "https://meridianleadgroup.example/refi-rates",
        weight: 1,
      },
    ],
    rates: [{ vertical: "MORTGAGE", payoutCpl: 38.0 }],
    vetting: {
      trafficSources: ["PAID_SEARCH", "EMAIL"],
      landingPageUrls: ["https://meridianleadgroup.example/refi-rates"],
      consentSampleUrl: null,
      disclosureText:
        "By submitting you agree to be contacted about mortgage offers. Standard rates apply.",
      agreementSignedAt: null,
      agreementPdfUrl: null,
      testBatchPassed: false,
      auditNotes:
        "Disclosure text is a paraphrase, not the network verbatim. Email traffic declared but no ESP or list provenance supplied. Held pending both.",
      submittedAt: "2026-08-18T13:20:00.000Z",
      approvedAt: null,
      references: [
        {
          name: "Renata Silva",
          company: "Harborline Capital",
          email: "rsilva@harborlinecap.example",
          phone: "+15550142205",
          relationship: "Prospective buyer",
          verified: false,
        },
      ],
    },
    quality: {
      malformedRate: 0,
      badConsentRate: 0,
      suppressedRate: 0,
      duplicateRate: 0,
      approvedReturnRate: 0,
      dailyVolume: 2,
    },
  },
  {
    key: "redline",
    name: "Redline Traffic Co",
    einTaxId: "26-5518830",
    website: "https://redlinetraffic.example",
    domain: "redlinetraffic.example",
    status: "SUSPENDED",
    contactName: "Gil Amara",
    sources: [
      {
        sourceId: "RED-AUTO-INC-001",
        label: "Auto - Incentivized",
        vertical: "AUTO_INSURANCE",
        trafficSource: "INCENTIVIZED",
        landingPageUrl: "https://redlinetraffic.example/win-a-car",
        weight: 1,
      },
    ],
    rates: [{ vertical: "AUTO_INSURANCE", payoutCpl: 9.0 }],
    vetting: {
      trafficSources: ["INCENTIVIZED", "SMS"],
      landingPageUrls: ["https://redlinetraffic.example/win-a-car"],
      consentSampleUrl:
        "https://cert.trustedform.com/d4e5f60718293a4b5c6d7e8f9012345678901234",
      disclosureText: DISCLOSURE_TEXT,
      agreementSignedAt: "2026-03-02T10:00:00.000Z",
      agreementPdfUrl:
        "s3://leados-agreements/redline-traffic/indemnity-2026-03-02.pdf",
      testBatchPassed: false,
      auditNotes:
        "SUSPENDED 2026-07-30. Sweepstakes landing page presented the disclosure below a prize graphic; 31% of a 200-lead sample denied ever requesting insurance contact. Reinstatement requires a new landing page and a clean 500-lead test batch.",
      submittedAt: "2026-02-20T09:00:00.000Z",
      approvedAt: "2026-03-03T11:30:00.000Z",
      references: [],
      checkOverrides: {
        VERBATIM_DISCLOSURE_MATCH: {
          status: "FAILED",
          notes: "Disclosure rendered below the fold beneath a prize graphic.",
        },
        TEST_BATCH_PASSED: {
          status: "FAILED",
          notes: "31% of sampled consumers denied requesting contact.",
        },
        TRAFFIC_SOURCE_DISCLOSURE_COMPLETE: {
          status: "FAILED",
          notes: "SMS traffic undeclared at onboarding; discovered during audit.",
        },
      },
    },
    quality: {
      malformedRate: 0,
      badConsentRate: 0,
      suppressedRate: 0,
      duplicateRate: 0,
      approvedReturnRate: 0,
      dailyVolume: 1,
    },
  },
];

// ---------------------------------------------------------------------------
//  Buyers & campaigns
// ---------------------------------------------------------------------------

export interface CampaignFixture {
  key: string;
  name: string;
  vertical: Vertical;
  maxCpl: number;
  dailyBudget: number;
  dailyCapLeads: number | null;
  acceptedStates: string[];
  acceptedZips: string[];
  criteriaJson: Record<string, unknown>;
  returnWindowHours: number;
  priority: number;
  active?: boolean;
}

export interface BuyerFixture {
  key: string;
  name: string;
  einTaxId: string;
  website: string;
  domain: string;
  contactName: string;
  campaigns: CampaignFixture[];
}

export const BUYERS: BuyerFixture[] = [
  {
    key: "statewide",
    name: "Statewide Mutual Insurance",
    einTaxId: "13-2288417",
    website: "https://statewidemutual.example",
    domain: "statewidemutual.example",
    contactName: "Alicia Nunes",
    campaigns: [
      {
        key: "statewide-auto-sunbelt",
        name: "Auto - Sunbelt Tier 1",
        vertical: "AUTO_INSURANCE",
        maxCpl: 24.0,
        dailyBudget: 2400,
        dailyCapLeads: 120,
        acceptedStates: ["AZ", "CA", "FL", "GA", "NV", "TX", "SC"],
        acceptedZips: [],
        criteriaJson: {
          minAge: 21,
          maxAge: 74,
          equals: { currently_insured: ["YES"] },
          notEquals: { dui_last_3_years: ["YES"] },
          numericMin: { vehicle_year: 2008 },
          excludeTrafficSources: ["INCENTIVIZED", "SMS"],
        },
        returnWindowHours: 72,
        priority: 10,
      },
      {
        key: "statewide-auto-national",
        name: "Auto - National Fill",
        vertical: "AUTO_INSURANCE",
        maxCpl: 17.5,
        dailyBudget: 1200,
        dailyCapLeads: 90,
        acceptedStates: [],
        acceptedZips: [],
        criteriaJson: {
          minAge: 18,
          maxAge: 79,
          excludeTrafficSources: ["INCENTIVIZED"],
        },
        returnWindowHours: 48,
        priority: 60,
      },
    ],
  },
  {
    key: "helios",
    name: "Helios Solar Partners",
    einTaxId: "88-1120765",
    website: "https://heliossolar.example",
    domain: "heliossolar.example",
    contactName: "Ruben Diaz",
    campaigns: [
      {
        key: "helios-solar-west",
        name: "Solar - Western Homeowners",
        vertical: "SOLAR",
        maxCpl: 68.0,
        dailyBudget: 3400,
        dailyCapLeads: 55,
        acceptedStates: ["AZ", "CA", "NV", "UT", "CO", "OR", "WA", "ID"],
        acceptedZips: [],
        criteriaJson: {
          minAge: 25,
          equals: { homeowner: ["YES"] },
          numericMin: { monthly_electric_bill: 120 },
          notEquals: { roof_shade: ["HEAVY"] },
        },
        returnWindowHours: 96,
        priority: 10,
      },
      {
        key: "helios-solar-southeast",
        name: "Solar - Southeast Expansion",
        vertical: "SOLAR",
        maxCpl: 54.0,
        dailyBudget: 1600,
        dailyCapLeads: 30,
        acceptedStates: ["FL", "GA", "SC", "NC", "TN"],
        acceptedZips: [],
        criteriaJson: {
          minAge: 25,
          equals: { homeowner: ["YES"] },
          numericMin: { monthly_electric_bill: 90 },
        },
        returnWindowHours: 72,
        priority: 30,
      },
    ],
  },
  {
    key: "summit",
    name: "Summit Health Advisors",
    einTaxId: "45-6603391",
    website: "https://summithealthadvisors.example",
    domain: "summithealthadvisors.example",
    contactName: "Nora Feldman",
    campaigns: [
      {
        key: "summit-medicare-aep",
        name: "Medicare - AEP Core",
        vertical: "MEDICARE",
        maxCpl: 44.0,
        dailyBudget: 2600,
        dailyCapLeads: 70,
        acceptedStates: ["FL", "TX", "AZ", "PA", "OH", "MI", "NC", "TN", "MO", "IN"],
        acceptedZips: [],
        criteriaJson: {
          minAge: 64,
          maxAge: 89,
          equals: { medicare_parts_ab: ["YES"] },
          excludeTrafficSources: ["INCENTIVIZED", "CO_REGISTRATION"],
        },
        returnWindowHours: 72,
        priority: 10,
      },
    ],
  },
  {
    key: "cornerstone",
    name: "Cornerstone Home Services",
    einTaxId: "72-4417765",
    website: "https://cornerstonehome.example",
    domain: "cornerstonehome.example",
    contactName: "Peter Vance",
    campaigns: [
      {
        key: "cornerstone-roofing",
        name: "Home Improvement - Roofing & Siding",
        vertical: "HOME_IMPROVEMENT",
        maxCpl: 39.0,
        dailyBudget: 1800,
        dailyCapLeads: 60,
        acceptedStates: [
          "OH", "MI", "IN", "PA", "IL", "MO", "KY", "WI", "MN", "NC", "TN", "GA",
        ],
        acceptedZips: [],
        criteriaJson: {
          minAge: 25,
          equals: {
            homeowner: ["YES"],
            project_type: ["ROOFING", "SIDING", "GUTTERS", "WINDOWS"],
          },
          notEquals: { timeframe: ["RESEARCHING"] },
        },
        returnWindowHours: 72,
        priority: 10,
      },
    ],
  },
  {
    key: "vertex",
    name: "Vertex Lending",
    einTaxId: "94-3320018",
    website: "https://vertexlending.example",
    domain: "vertexlending.example",
    contactName: "Imani Booker",
    campaigns: [
      {
        key: "vertex-personal-loan",
        name: "Personal Loan - Prime & Near-Prime",
        vertical: "PERSONAL_LOAN",
        maxCpl: 31.0,
        dailyBudget: 1500,
        dailyCapLeads: 50,
        acceptedStates: [],
        acceptedZips: [],
        criteriaJson: {
          minAge: 21,
          maxAge: 70,
          equals: {
            credit_band: ["EXCELLENT", "GOOD", "FAIR"],
            employment_status: ["EMPLOYED", "SELF_EMPLOYED", "RETIRED"],
          },
          numericMin: { annual_income: 30000, loan_amount: 2500 },
        },
        returnWindowHours: 72,
        priority: 10,
      },
    ],
  },
];

// ---------------------------------------------------------------------------
//  Suppression lists
// ---------------------------------------------------------------------------

export interface SuppressionFixture {
  phoneE164: string;
  listType: "INTERNAL_DNC" | "FEDERAL_DNC" | "STATE_DNC" | "TCPA_LITIGATOR";
  stateCode: string | null;
  note: string;
}

/**
 * A fixed roster the generator draws from when it wants a lead to fail step 4.
 * `seed.ts` pads this with a synthetic block so the list looks operational.
 */
export const SEEDED_SUPPRESSIONS: SuppressionFixture[] = [
  {
    phoneE164: "+16025550901",
    listType: "TCPA_LITIGATOR",
    stateCode: null,
    note: "Serial filer - 14 TCPA actions since 2023 (professional plaintiff list).",
  },
  {
    phoneE164: "+19165550902",
    listType: "TCPA_LITIGATOR",
    stateCode: null,
    note: "Named plaintiff in three putative class actions.",
  },
  {
    phoneE164: "+13125550907",
    listType: "TCPA_LITIGATOR",
    stateCode: null,
    note: "Demand letters sent to 6 network buyers in the last 12 months.",
  },
  {
    phoneE164: "+12145550905",
    listType: "FEDERAL_DNC",
    stateCode: null,
    note: "Federal DNC registry match.",
  },
  {
    phoneE164: "+16145550908",
    listType: "FEDERAL_DNC",
    stateCode: null,
    note: "Federal DNC registry match.",
  },
  {
    phoneE164: "+12065550910",
    listType: "FEDERAL_DNC",
    stateCode: null,
    note: "Federal DNC registry match.",
  },
  {
    phoneE164: "+14075550903",
    listType: "STATE_DNC",
    stateCode: "FL",
    note: "Florida state Do Not Call list.",
  },
  {
    phoneE164: "+17135550906",
    listType: "STATE_DNC",
    stateCode: "TX",
    note: "Texas state Do Not Call list.",
  },
  {
    phoneE164: "+18135550904",
    listType: "INTERNAL_DNC",
    stateCode: null,
    note: "Consumer revoked consent by reply STOP on 2026-04-11.",
  },
  {
    phoneE164: "+17045550909",
    listType: "INTERNAL_DNC",
    stateCode: null,
    note: "Written revocation received by certified mail; buyer notified.",
  },
];

/**
 * Which state each suppressed number belongs to, so the generator can place
 * the lead consistently — a Florida state-DNC hit only fires for a FL lead.
 */
export const SUPPRESSION_STATE_BY_PHONE: Record<string, string> = {
  "+16025550901": "AZ",
  "+19165550902": "CA",
  "+13125550907": "IL",
  "+12145550905": "TX",
  "+16145550908": "OH",
  "+12065550910": "WA",
  "+14075550903": "FL",
  "+17135550906": "TX",
  "+18135550904": "FL",
  "+17045550909": "NC",
};
