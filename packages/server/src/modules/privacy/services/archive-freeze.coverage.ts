/*
 * ARCH-01 D8: every write route of the subject modules, as registered in its router (`router.post(<route>, …)`), is either
 * guarded (the writer calls assertCustomerWritable / assertProspectWritable first) or exempt with a reason (D3).
 * archive-freeze.coverage.test.ts scans the routers and fails on any write route listed in neither.
 */

export const ARCHIVE_FREEZE_GUARDED_ROUTES = {
  appointments: ["appointmentApiRoutes.list", "appointmentApiRoutes[action]", "appointmentApiRoutes.public"],
  "follow-ups": ["followUpApiRoutes.list", "followUpApiRoutes.complete", "followUpApiRoutes.cancel", "followUpApiRoutes.cadence"],
  progress: ["progressApiRoutes.measurements", "progressApiRoutes.goals", "progressApiRoutes.pause", "progressApiRoutes.resume", "progressApiRoutes.cancel", "progressApiRoutes.confirmOutcome"],
  documents: ["documentApiRoutes.create", "documentApiRoutes.addVersion", "documentApiRoutes.issueLink", "documentApiRoutes.revokeLink", "documentApiRoutes.revoke",
    "documentApiRoutes.archive", "documentApiRoutes.generateProgressSummary", "documentApiRoutes.addProgressPhoto"],
  finance: ["financeApiRoutes.plans", "financeApiRoutes.activate", "financeApiRoutes.revise", "financeApiRoutes.cancel", "financeApiRoutes.payments", "financeApiRoutes.correct"],
  "payment-proofs": ["paymentProofApiRoutes.issueLink", "paymentProofApiRoutes.revokeLink", "paymentProofApiRoutes.confirm", "paymentProofApiRoutes.partiallyConfirm",
    "paymentProofApiRoutes.requestCorrection", "paymentProofApiRoutes.reject", "paymentProofApiRoutes.markDuplicate", "paymentProofApiRoutes.upload"],
  receipts: ["receiptApiRoutes.issue", "receiptApiRoutes.share", "receiptApiRoutes.revoke", "receiptApiRoutes.void"],
  quotes: ["quoteApiRoutes.create", "quoteApiRoutes.version", "quoteApiRoutes.edit", "quoteApiRoutes.issue", "quoteApiRoutes.share", "quoteApiRoutes.revoke",
    "quoteApiRoutes.synchronize", "quoteApiRoutes.cancel", "quoteApiRoutes.respond"],
  consents: ["consentApiRoutes.link", "consentApiRoutes.revokeLink", "consentApiRoutes.capture", "consentApiRoutes.optionalLink", "consentApiRoutes.optionalCapture", "consentApiRoutes.public"],
  questionnaires: ["questionnaireApiRoutes.coachSubmit", "questionnaireApiRoutes.link", "questionnaireApiRoutes.revokeLink", "questionnaireApiRoutes.public"],
  onboarding: ["onboardingApiRoutes.initialize", "onboardingApiRoutes.complete", "onboardingApiRoutes.waive", "onboardingApiRoutes.reservation", "onboardingApiRoutes.ready"],
  subscriptions: ["subscriptionApiRoutes[action]"],
  requests: ["adminRequestsApiRoutes.convert", "adminRequestsApiRoutes.contactAttempts", "adminRequestsApiRoutes.status", "adminRequestsApiRoutes.qualificationReview",
    "adminRequestsApiRoutes.waitlistEntry", "adminRequestsApiRoutes.waitlistEntryWithdraw"],
} as const;

/** ARCH-01 D3: never frozen. Route keys are checked by the coverage test; `job:` entries document the system writers. */
export const ARCHIVE_FREEZE_EXEMPTIONS: Readonly<Record<string, string>> = {
  "consentApiRoutes.revoke": "consent withdrawal (D3)",
  "privacyApiRoutes.archiveCustomer": "privacy action (D3)",
  "privacyApiRoutes.archiveProspect": "privacy action (D3)",
  "privacyApiRoutes.unarchiveCustomer": "privacy action (D3)",
  "privacyApiRoutes.unarchiveProspect": "privacy action (D3)",
  "privacyApiRoutes.anonymizeCustomer": "privacy action (D3)",
  "privacyApiRoutes.anonymizeProspect": "privacy action (D3)",
  "privacyApiRoutes.holds": "privacy action (D3)",
  "privacyApiRoutes.releaseHold": "privacy action (D3)",
  "job:privacy.purge": "system job (D3)",
  "job:notifications.reconcile": "system job (D3)",
  "job:notifications.email-delivery": "system job (D3)",
  "documentApiRoutes.publicVerify": "read of a public link (code check); archive revokes the link (D5)",
  "consentDefinitionApiRoutes.list": "consent texts: no customer",
  "consentDefinitionApiRoutes.detail": "consent texts: no customer",
  "consentDefinitionApiRoutes.publish": "consent texts: no customer",
  "questionnaireApiRoutes.templates": "questionnaire templates: no customer",
  "questionnaireApiRoutes.assignments": "questionnaire templates: no customer",
  "questionnaireApiRoutes.publish": "questionnaire templates: no customer",
  "questionnaireApiRoutes.newVersion": "questionnaire templates: no customer",
  "requestsApiRoutes.publicSubmit": "never attaches to an archived prospect (D7)",
  "adminCustomersApiRoutes.create": "creates a new customer",
  "notificationApiRoutes.read": "the admin's own notification state",
  "notificationApiRoutes.readAll": "the admin's own notification state",
  "notificationApiRoutes.settings": "the admin's own notification state",
};

/** Modules whose routers are scanned: the guarded ones plus those that only hold exempt write routes. */
export const ARCHIVE_FREEZE_SCANNED_MODULES = [...Object.keys(ARCHIVE_FREEZE_GUARDED_ROUTES), "customers", "privacy", "notifications"] as const;
