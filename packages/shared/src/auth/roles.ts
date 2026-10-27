/** ROLE-01 R1: closed list of user roles (DB CHECK users_role_known). */
export const authRoles = ["superadmin", "admin", "coach"] as const;
export type AuthRole = (typeof authRoles)[number];
export type RequiredRole = "admin" | "superadmin";

/** ROLE-01 R2: a role satisfies every requirement at or below its rank; coach satisfies none. */
export const ROLE_RANK: Record<AuthRole, number> = {
  coach: 0,
  admin: 1,
  superadmin: 2,
};

/** ROLE-01 R1: French labels (R8: coach is reserved, unused in V1). */
export const authRoleLabels: Record<AuthRole, string> = {
  superadmin: "Super-administrateur",
  admin: "Administrateur",
  coach: "Coach",
};

export function isAuthRole(value: unknown): value is AuthRole {
  return (
    typeof value === "string" &&
    (authRoles as readonly string[]).includes(value)
  );
}

/** ROLE-01 R2/R6: the one role rule, shared by server guards and client menus. */
export function hasRole(
  subject: { role: AuthRole } | null | undefined,
  required: RequiredRole,
): boolean {
  return !!subject && ROLE_RANK[subject.role] >= ROLE_RANK[required];
}

/** The roles that satisfy `required`, for SQL filters. */
export function rolesWith(required: RequiredRole): AuthRole[] {
  return authRoles.filter((role) => ROLE_RANK[role] >= ROLE_RANK[required]);
}
