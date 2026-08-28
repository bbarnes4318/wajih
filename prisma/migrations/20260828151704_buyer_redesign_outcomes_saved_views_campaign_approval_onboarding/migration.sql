-- CreateEnum
CREATE TYPE "LeadOutcome" AS ENUM ('NOT_WORKED', 'NO_CONTACT', 'CONTACTED', 'APPOINTMENT_SET', 'QUOTED', 'SOLD', 'CLOSED_LOST');

-- CreateEnum
CREATE TYPE "CampaignApprovalStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "buyer_campaigns" ADD COLUMN     "approval_status" "CampaignApprovalStatus" NOT NULL DEFAULT 'APPROVED';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "outcome" "LeadOutcome",
ADD COLUMN     "outcome_updated_at" TIMESTAMP(3),
ADD COLUMN     "outcome_value_amount" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "onboarding_dismissed_at" TIMESTAMP(3),
ADD COLUMN     "onboarding_steps" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "saved_views" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "query_string" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "saved_views_org_id_user_id_idx" ON "saved_views"("org_id", "user_id");

-- CreateIndex
CREATE INDEX "buyer_campaigns_approval_status_idx" ON "buyer_campaigns"("approval_status");

-- CreateIndex
CREATE INDEX "leads_buyer_org_id_outcome_idx" ON "leads"("buyer_org_id", "outcome");

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
