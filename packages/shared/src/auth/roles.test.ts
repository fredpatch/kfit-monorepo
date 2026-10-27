import assert from "node:assert/strict";
import test from "node:test";
import {
  authRoleLabels,
  authRoles,
  hasRole,
  isAuthRole,
  rolesWith,
} from "./roles.js";

test("ROLE-01 R2: hasRole matrix - admin ⇐ superadmin|admin, superadmin ⇐ superadmin only, coach satisfies neither", () => {
  const expected = {
    superadmin: { admin: true, superadmin: true },
    admin: { admin: true, superadmin: false },
    coach: { admin: false, superadmin: false },
  } as const;
  for (const role of authRoles)
    for (const required of ["admin", "superadmin"] as const)
      assert.equal(
        hasRole({ role }, required),
        expected[role][required],
        `${role} → ${required}`,
      );
  assert.equal(hasRole(null, "admin"), false);
  assert.deepEqual(rolesWith("admin"), ["superadmin", "admin"]);
  assert.deepEqual(rolesWith("superadmin"), ["superadmin"]);
});

test("ROLE-01 R1: three known roles with French labels; anything else is unknown", () => {
  assert.deepEqual(authRoleLabels, {
    superadmin: "Super-administrateur",
    admin: "Administrateur",
    coach: "Coach",
  });
  for (const role of authRoles) assert.equal(isAuthRole(role), true);
  for (const value of ["owner", "Admin", "", null, 1])
    assert.equal(isAuthRole(value), false, String(value));
});
