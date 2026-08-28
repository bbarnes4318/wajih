-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('SUPER_ADMIN', 'PUBLISHER', 'BUYER');

-- CreateEnum
CREATE TYPE "OrgType" AS ENUM ('INTERNAL', 'PUBLISHER', 'BUYER');

-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('PENDING_VETTING', 'ACTIVE', 'SUSPENDED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "Vertical" AS ENUM ('AUTO_INSURANCE', 'HOME_INSURANCE', 'HEALTH_INSURANCE', 'LIFE_INSURANCE', 'MEDICARE', 'SOLAR', 'HOME_IMPROVEMENT', 'MORTGAGE', 'PERSONAL_LOAN', 'DEBT_RELIEF', 'LEGAL_MASS_TORT', 'EDUCATION');

-- CreateEnum
CREATE TYPE "TrafficSource" AS ENUM ('SEO', 'PAID_SEARCH', 'PAID_SOCIAL', 'DISPLAY', 'NATIVE', 'EMAIL', 'SMS', 'PUSH', 'CALL_CENTER', 'CO_REGISTRATION', 'AGGREGATOR', 'INCENTIVIZED');

-- CreateEnum
CREATE TYPE "IngressChannel" AS ENUM ('API', 'SINGLE_FORM', 'CSV_BATCH');

-- CreateEnum
CREATE TYPE "PipelineStage" AS ENUM ('INTAKE', 'VALIDATED', 'SCRUBBED', 'CONSENT_VERIFIED', 'QUALIFIED', 'ROUTED', 'DELIVERED', 'DISPUTED', 'ACCEPTED', 'SETTLED', 'REJECTED', 'HOLD_QUEUE');

-- CreateEnum
CREATE TYPE "RejectionStep" AS ENUM ('STEP_1_INTAKE', 'STEP_2_FIELD_VALIDATION', 'STEP_3_DEDUP', 'STEP_4_DNC_LITIGATOR', 'STEP_5_CONSENT', 'STEP_6_VERTICAL_QUALIFIER', 'STEP_7_ROUTING');

-- CreateEnum
CREATE TYPE "RejectionReasonCode" AS ENUM ('MISSING_SOURCE_ID', 'UNKNOWN_SOURCE_ID', 'SOURCE_INACTIVE', 'PUBLISHER_NOT_VETTED', 'PUBLISHER_SUSPENDED', 'PUBLISHER_TERMINATED', 'MISSING_REQUIRED_FIELD', 'INVALID_PHONE_FORMAT', 'NON_US_PHONE', 'INVALID_EMAIL_FORMAT', 'INVALID_STATE_CODE', 'INVALID_ZIP_CODE', 'INVALID_DATE_OF_BIRTH', 'VERTICAL_SCHEMA_MISMATCH', 'DUPLICATE_INTRA_PUBLISHER', 'DUPLICATE_CROSS_PUBLISHER', 'DNC_FEDERAL_MATCH', 'DNC_STATE_MATCH', 'DNC_INTERNAL_MATCH', 'TCPA_LITIGATOR_MATCH', 'SCRUB_PROVIDER_ERROR', 'CONSENT_CERT_MISSING', 'CONSENT_CERT_MALFORMED', 'CONSENT_CERT_EXPIRED', 'CONSENT_TEXT_MISSING', 'NO_ACTIVE_CAMPAIGN_FOR_VERTICAL', 'OUT_OF_GEOGRAPHY', 'AGE_OUT_OF_RANGE', 'CRITERIA_MISMATCH', 'ALL_CAMPAIGNS_CAPPED', 'DAILY_BUDGET_EXHAUSTED', 'CPL_FLOOR_NOT_MET');

-- CreateEnum
CREATE TYPE "AuditStepStatus" AS ENUM ('PASS', 'FAIL', 'HOLD', 'SKIP');

-- CreateEnum
CREATE TYPE "BuyerLeadStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DISPUTED', 'RETURN_APPROVED', 'RETURN_DENIED');

-- CreateEnum
CREATE TYPE "DisputeReasonCode" AS ENUM ('INVALID_DISCONNECT', 'TCPA_MISMATCH', 'OUT_OF_GEOGRAPHY', 'DUPLICATE_WITHIN_WINDOW', 'WRONG_PERSON', 'BOGUS_CONTACT_INFO');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('UNSETTLED', 'SETTLED_PAYABLE', 'SETTLED_VOID', 'CLAWED_BACK');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'IN_FLIGHT', 'SUCCESS', 'FAILED', 'EXHAUSTED');

-- CreateEnum
CREATE TYPE "VettingCheckKey" AS ENUM ('EIN_TAX_ID_VERIFIED', 'BUSINESS_ENTITY_IN_GOOD_STANDING', 'LANDING_PAGE_LIVE_CHECK', 'VERBATIM_DISCLOSURE_MATCH', 'CONSENT_CAPTURE_SAMPLE_REVIEWED', 'TRAFFIC_SOURCE_DISCLOSURE_COMPLETE', 'INDUSTRY_REFERENCES_CHECKED', 'SIGNED_INDEMNITY_AGREEMENT', 'TEST_BATCH_PASSED');

-- CreateEnum
CREATE TYPE "VettingCheckStatus" AS ENUM ('NOT_STARTED', 'IN_REVIEW', 'PASSED', 'FAILED', 'WAIVED');

-- CreateEnum
CREATE TYPE "BatchStatus" AS ENUM ('UPLOADED', 'VALIDATING', 'VALIDATION_FAILED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "BatchIntegrityFlag" AS ENUM ('MISSING_CERT_COLUMN', 'INVALID_HEADER_SCHEMA', 'SEQUENTIAL_PHONE_PATTERN', 'DUPLICATE_IP_CLUSTER', 'UNIFORM_TIMESTAMPS', 'HIGH_INTRA_BATCH_DUPLICATES', 'IMPOSSIBLE_SUBMIT_VELOCITY');

-- CreateEnum
CREATE TYPE "SuppressionListType" AS ENUM ('INTERNAL_DNC', 'FEDERAL_DNC', 'STATE_DNC', 'TCPA_LITIGATOR');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OrgType" NOT NULL,
    "ein_tax_id" TEXT,
    "website" TEXT,
    "status" "OrgStatus" NOT NULL DEFAULT 'PENDING_VETTING',
    "contact_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "org_id" UUID NOT NULL,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publisher_vetting_profiles" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "references" JSONB NOT NULL DEFAULT '[]',
    "traffic_sources" "TrafficSource"[],
    "landing_page_urls" TEXT[],
    "consent_sample_url" TEXT,
    "disclosure_text" TEXT,
    "agreement_signed_at" TIMESTAMP(3),
    "agreement_pdf_url" TEXT,
    "test_batch_passed" BOOLEAN NOT NULL DEFAULT false,
    "audit_notes" TEXT,
    "submitted_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "approved_by_user_id" UUID,

    CONSTRAINT "publisher_vetting_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vetting_checks" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "key" "VettingCheckKey" NOT NULL,
    "status" "VettingCheckStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "notes" TEXT,
    "evidence_url" TEXT,
    "checked_at" TIMESTAMP(3),
    "checked_by_user_id" UUID,

    CONSTRAINT "vetting_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_sources" (
    "id" UUID NOT NULL,
    "source_id" TEXT NOT NULL,
    "publisher_org_id" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "vertical" "Vertical" NOT NULL,
    "traffic_source" "TrafficSource" NOT NULL,
    "landing_page_url" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "api_key_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publisher_rates" (
    "id" UUID NOT NULL,
    "publisher_org_id" UUID NOT NULL,
    "vertical" "Vertical" NOT NULL,
    "payout_cpl" DECIMAL(12,4) NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publisher_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buyer_campaigns" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "buyer_org_id" UUID NOT NULL,
    "vertical" "Vertical" NOT NULL,
    "max_cpl" DECIMAL(12,4) NOT NULL,
    "daily_budget" DECIMAL(12,2) NOT NULL,
    "daily_cap_leads" INTEGER,
    "accepted_zips" TEXT[],
    "accepted_states" TEXT[],
    "criteria_json" JSONB NOT NULL DEFAULT '{}',
    "delivery_webhook_url" TEXT NOT NULL,
    "webhook_auth_header" TEXT,
    "return_window_hours" INTEGER NOT NULL DEFAULT 72,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buyer_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_daily_stats" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "stat_date" DATE NOT NULL,
    "leads_delivered" INTEGER NOT NULL DEFAULT 0,
    "leads_returned" INTEGER NOT NULL DEFAULT 0,
    "spend_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "campaign_daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "source_id" TEXT NOT NULL,
    "lead_source_ref_id" UUID,
    "received_at_utc" TIMESTAMP(3) NOT NULL,
    "ingress_ip" TEXT,
    "ingress_user_agent" TEXT,
    "ingress_channel" "IngressChannel" NOT NULL DEFAULT 'API',
    "publisher_org_id" UUID NOT NULL,
    "buyer_org_id" UUID,
    "campaign_id" UUID,
    "batch_id" UUID,
    "vertical" "Vertical" NOT NULL,
    "payload" JSONB NOT NULL,
    "contact_first_name" TEXT,
    "contact_last_name" TEXT,
    "contact_phone" TEXT,
    "contact_email" TEXT,
    "contact_state" TEXT,
    "contact_zip" TEXT,
    "trustedform_cert_url" TEXT,
    "jornaya_lead_id" TEXT,
    "consent_text_captured" TEXT,
    "dnc_scrub_passed" BOOLEAN,
    "litigator_scrub_passed" BOOLEAN,
    "dedup_hash" TEXT NOT NULL,
    "pipeline_stage" "PipelineStage" NOT NULL DEFAULT 'INTAKE',
    "rejection_step" "RejectionStep",
    "rejection_reason_code" "RejectionReasonCode",
    "hold_reason" "RejectionReasonCode",
    "pipeline_duration_ms" INTEGER,
    "buyer_status" "BuyerLeadStatus" NOT NULL DEFAULT 'PENDING',
    "dispute_reason_code" "DisputeReasonCode",
    "dispute_notes" TEXT,
    "dispute_window_expires_at" TIMESTAMP(3),
    "disputed_at" TIMESTAMP(3),
    "dispute_resolved_at" TIMESTAMP(3),
    "dispute_resolved_by" UUID,
    "publisher_payout_amount" DECIMAL(12,4),
    "buyer_cost_amount" DECIMAL(12,4),
    "settlement_status" "SettlementStatus" NOT NULL DEFAULT 'UNSETTLED',
    "settled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMP(3),

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_audit_trail" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "source_id" TEXT NOT NULL,
    "step_number" INTEGER NOT NULL,
    "step_name" TEXT NOT NULL,
    "input_data" JSONB NOT NULL,
    "output_status" "AuditStepStatus" NOT NULL,
    "output_data" JSONB,
    "reason_code" "RejectionReasonCode",
    "execution_ms" INTEGER NOT NULL,
    "error_log" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_audit_trail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_attempts" (
    "id" UUID NOT NULL,
    "lead_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "request_headers" JSONB NOT NULL,
    "request_body" JSONB NOT NULL,
    "response_status" INTEGER,
    "response_body" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "error_log" TEXT,
    "latency_ms" INTEGER,
    "next_retry_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publisher_metrics" (
    "publisher_org_id" UUID NOT NULL,
    "total_submitted" INTEGER NOT NULL DEFAULT 0,
    "total_delivered" INTEGER NOT NULL DEFAULT 0,
    "total_returned" INTEGER NOT NULL DEFAULT 0,
    "total_rejected" INTEGER NOT NULL DEFAULT 0,
    "return_rate_7d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "return_rate_14d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "return_rate_30d" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "auto_suspended_at" TIMESTAMP(3),
    "last_computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "publisher_metrics_pkey" PRIMARY KEY ("publisher_org_id")
);

-- CreateTable
CREATE TABLE "csv_batches" (
    "id" UUID NOT NULL,
    "publisher_org_id" UUID NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "storage_url" TEXT,
    "status" "BatchStatus" NOT NULL DEFAULT 'UPLOADED',
    "row_count" INTEGER NOT NULL DEFAULT 0,
    "accepted_count" INTEGER NOT NULL DEFAULT 0,
    "rejected_count" INTEGER NOT NULL DEFAULT 0,
    "integrity_flags" "BatchIntegrityFlag"[],
    "integrity_detail" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "csv_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppression_entries" (
    "id" UUID NOT NULL,
    "phone_e164" TEXT NOT NULL,
    "list_type" "SuppressionListType" NOT NULL,
    "state_code" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppression_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "lead_id" UUID,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_audit_log" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organizations_type_status_idx" ON "organizations"("type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_org_id_idx" ON "users"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "publisher_vetting_profiles_org_id_key" ON "publisher_vetting_profiles"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "vetting_checks_profile_id_key_key" ON "vetting_checks"("profile_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "lead_sources_source_id_key" ON "lead_sources"("source_id");

-- CreateIndex
CREATE INDEX "lead_sources_publisher_org_id_idx" ON "lead_sources"("publisher_org_id");

-- CreateIndex
CREATE UNIQUE INDEX "publisher_rates_publisher_org_id_vertical_key" ON "publisher_rates"("publisher_org_id", "vertical");

-- CreateIndex
CREATE INDEX "buyer_campaigns_vertical_active_idx" ON "buyer_campaigns"("vertical", "active");

-- CreateIndex
CREATE INDEX "buyer_campaigns_buyer_org_id_idx" ON "buyer_campaigns"("buyer_org_id");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_daily_stats_campaign_id_stat_date_key" ON "campaign_daily_stats"("campaign_id", "stat_date");

-- CreateIndex
CREATE INDEX "leads_dedup_hash_idx" ON "leads"("dedup_hash");

-- CreateIndex
CREATE INDEX "leads_publisher_org_id_created_at_idx" ON "leads"("publisher_org_id", "created_at");

-- CreateIndex
CREATE INDEX "leads_buyer_org_id_buyer_status_idx" ON "leads"("buyer_org_id", "buyer_status");

-- CreateIndex
CREATE INDEX "leads_pipeline_stage_created_at_idx" ON "leads"("pipeline_stage", "created_at");

-- CreateIndex
CREATE INDEX "leads_source_id_idx" ON "leads"("source_id");

-- CreateIndex
CREATE INDEX "leads_contact_phone_idx" ON "leads"("contact_phone");

-- CreateIndex
CREATE INDEX "leads_campaign_id_delivered_at_idx" ON "leads"("campaign_id", "delivered_at");

-- CreateIndex
CREATE INDEX "leads_dispute_window_expires_at_idx" ON "leads"("dispute_window_expires_at");

-- CreateIndex
CREATE INDEX "lead_audit_trail_lead_id_step_number_idx" ON "lead_audit_trail"("lead_id", "step_number");

-- CreateIndex
CREATE INDEX "delivery_attempts_lead_id_attempt_number_idx" ON "delivery_attempts"("lead_id", "attempt_number");

-- CreateIndex
CREATE INDEX "delivery_attempts_status_next_retry_at_idx" ON "delivery_attempts"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "csv_batches_publisher_org_id_created_at_idx" ON "csv_batches"("publisher_org_id", "created_at");

-- CreateIndex
CREATE INDEX "suppression_entries_phone_e164_idx" ON "suppression_entries"("phone_e164");

-- CreateIndex
CREATE UNIQUE INDEX "suppression_entries_phone_e164_list_type_key" ON "suppression_entries"("phone_e164", "list_type");

-- CreateIndex
CREATE INDEX "notifications_org_id_read_at_idx" ON "notifications"("org_id", "read_at");

-- CreateIndex
CREATE INDEX "admin_audit_log_entity_type_entity_id_idx" ON "admin_audit_log"("entity_type", "entity_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publisher_vetting_profiles" ADD CONSTRAINT "publisher_vetting_profiles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vetting_checks" ADD CONSTRAINT "vetting_checks_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "publisher_vetting_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_sources" ADD CONSTRAINT "lead_sources_publisher_org_id_fkey" FOREIGN KEY ("publisher_org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publisher_rates" ADD CONSTRAINT "publisher_rates_publisher_org_id_fkey" FOREIGN KEY ("publisher_org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buyer_campaigns" ADD CONSTRAINT "buyer_campaigns_buyer_org_id_fkey" FOREIGN KEY ("buyer_org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_daily_stats" ADD CONSTRAINT "campaign_daily_stats_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "buyer_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_publisher_org_id_fkey" FOREIGN KEY ("publisher_org_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_buyer_org_id_fkey" FOREIGN KEY ("buyer_org_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "buyer_campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_lead_source_ref_id_fkey" FOREIGN KEY ("lead_source_ref_id") REFERENCES "lead_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "csv_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_audit_trail" ADD CONSTRAINT "lead_audit_trail_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_attempts" ADD CONSTRAINT "delivery_attempts_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "buyer_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publisher_metrics" ADD CONSTRAINT "publisher_metrics_publisher_org_id_fkey" FOREIGN KEY ("publisher_org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "csv_batches" ADD CONSTRAINT "csv_batches_publisher_org_id_fkey" FOREIGN KEY ("publisher_org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
