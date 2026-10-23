/** Consents and questionnaire can be changed only while the subscription is being prepared (S5 rule). */
export function isOnboardingEditable(subscriptionStatus: string): boolean {
  return subscriptionStatus === "onboarding";
}
