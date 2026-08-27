export {
  AEAT_CAPABILITY_MATRIX,
  AEAT_SEDE_LINKS,
  getAeatCapability,
} from "@/lib/fiscal-submission/capability";
export type {
  AeatChannelCapability,
  AeatModelCapability,
  VexoSubmissionStrategy,
} from "@/lib/fiscal-submission/capability";

export type * from "@/lib/fiscal-submission/types";

export { assessPaymentRequirement } from "@/lib/fiscal-submission/payment";
export {
  submissionIdempotencyKey,
  decideSubmissionIdempotency,
  isRetryAllowed,
} from "@/lib/fiscal-submission/idempotency";
export { assertReadyForAssistedSubmission } from "@/lib/fiscal-submission/stale";
export {
  assistedCapability,
  prepareAssistedSubmission,
  createAssistedAdapter,
  ASSISTED_ADAPTERS,
  getSubmissionAdapter,
} from "@/lib/fiscal-submission/adapter";
export {
  compareFiledToDraft,
  buildManualFilingRegistration,
} from "@/lib/fiscal-submission/manual-filing";
export {
  AEAT_RESPONSE_FIXTURES,
  mapFixtureToStatus,
} from "@/lib/fiscal-submission/fixtures";
