import type {
  BatchStatus,
  BuyerLeadStatus,
  DisputeReasonCode,
  IngressChannel,
  OrgStatus,
  PipelineStage,
  RejectionReasonCode,
  RejectionStep,
  SettlementStatus,
  TrafficSource,
  VettingCheckStatus,
} from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import {
  BATCH_STATUS,
  BUYER_STATUS,
  DISPUTE_REASON,
  INGRESS_CHANNEL,
  ORG_STATUS,
  PIPELINE_STAGE,
  REJECTION_REASON,
  REJECTION_STEP,
  SETTLEMENT_STATUS,
  TRAFFIC_SOURCE,
  VETTING_CHECK_STATUS,
} from "@/lib/domain/labels";

/**
 * One thin component per enum. They exist so a view never reaches for a raw
 * enum string, and so a colour change lands everywhere at once.
 */

export function StageChip({ stage, dot = true }: { stage: PipelineStage; dot?: boolean }) {
  const m = PIPELINE_STAGE[stage];
  return (
    <Badge tone={m.tone} dot={dot} title={m.help}>
      {m.label}
    </Badge>
  );
}

export function ReasonChip({ code }: { code: RejectionReasonCode }) {
  const m = REJECTION_REASON[code];
  return (
    <Badge tone={m.tone} title={m.help ?? code}>
      {m.label}
    </Badge>
  );
}

export function StepChip({ step }: { step: RejectionStep }) {
  const m = REJECTION_STEP[step];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function BuyerStatusChip({ status }: { status: BuyerLeadStatus }) {
  const m = BUYER_STATUS[status];
  return (
    <Badge tone={m.tone} dot title={m.help}>
      {m.label}
    </Badge>
  );
}

export function DisputeReasonChip({ code }: { code: DisputeReasonCode }) {
  const m = DISPUTE_REASON[code];
  return (
    <Badge tone={m.tone} title={m.help}>
      {m.label}
    </Badge>
  );
}

export function SettlementChip({ status }: { status: SettlementStatus }) {
  const m = SETTLEMENT_STATUS[status];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function OrgStatusChip({ status }: { status: OrgStatus }) {
  const m = ORG_STATUS[status];
  return (
    <Badge tone={m.tone} dot>
      {m.label}
    </Badge>
  );
}

export function ChannelChip({ channel }: { channel: IngressChannel }) {
  const m = INGRESS_CHANNEL[channel];
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

export function TrafficSourceChip({ source }: { source: TrafficSource }) {
  const m = TRAFFIC_SOURCE[source];
  return (
    <Badge tone={m.tone} title={m.help}>
      {m.label}
    </Badge>
  );
}

export function BatchStatusChip({ status }: { status: BatchStatus }) {
  const m = BATCH_STATUS[status];
  return (
    <Badge tone={m.tone} dot>
      {m.label}
    </Badge>
  );
}

export function VettingStatusChip({ status }: { status: VettingCheckStatus }) {
  const m = VETTING_CHECK_STATUS[status];
  return (
    <Badge tone={m.tone} dot>
      {m.label}
    </Badge>
  );
}
