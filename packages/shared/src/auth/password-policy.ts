/*
 * Admin password policy, mirrored from the server (`modules/auth/services/password.service.ts`
 * `validatePasswordStrength`, Sprint 1). The server stays authoritative; this copy drives the UI
 * meter and is kept in sync by a parity test in the server auth tests.
 */

export const authPasswordMinLength = 12;

export type AuthPasswordRule =
  | "too_short"
  | "missing_letter"
  | "missing_number";

export type AuthPasswordRuleCheck = {
  rule: AuthPasswordRule;
  label: string;
  met: boolean;
};

export const authPasswordRuleLabels: Record<AuthPasswordRule, string> = {
  too_short: `${authPasswordMinLength} caractères minimum`,
  missing_letter: "Au moins une lettre",
  missing_number: "Au moins un chiffre",
};

/** Each required rule with its state, in server evaluation order. */
export function checkAuthPasswordRules(
  password: string,
): AuthPasswordRuleCheck[] {
  return [
    {
      rule: "too_short",
      label: authPasswordRuleLabels.too_short,
      met: password.length >= authPasswordMinLength,
    },
    {
      rule: "missing_letter",
      label: authPasswordRuleLabels.missing_letter,
      met: /[A-Za-z]/.test(password),
    },
    {
      rule: "missing_number",
      label: authPasswordRuleLabels.missing_number,
      met: /\d/.test(password),
    },
  ];
}

/** First failing rule, same order and reasons as the server; null when the password is accepted. */
export function firstFailedAuthPasswordRule(
  password: string,
): AuthPasswordRule | null {
  return (
    checkAuthPasswordRules(password).find((check) => !check.met)?.rule ?? null
  );
}

export type AuthPasswordStrength = 0 | 1 | 2 | 3;

/**
 * Advisory strength for the meter, never a rule: 0 = rules not met; 1 = rules met;
 * +1 for 16+ characters; +1 for mixed case or a symbol. The server accepts any level ≥ 1.
 */
export function authPasswordStrength(password: string): AuthPasswordStrength {
  if (firstFailedAuthPasswordRule(password) !== null) return 0;
  let score = 1;
  if (password.length >= 16) score += 1;
  if (
    (/[a-z]/.test(password) && /[A-Z]/.test(password)) ||
    /[^A-Za-z0-9]/.test(password)
  )
    score += 1;
  return score as AuthPasswordStrength;
}
