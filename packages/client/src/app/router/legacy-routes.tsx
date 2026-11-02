import { Navigate, Route } from "react-router";
import { LegacySubscriptionRedirect } from "../routes/subscription-routes.js";

export function legacyRoutes() {
  return (
    <>
      {/* Former URLs, still used in e-mails or bookmarks. */}
      <Route
        path="follow-up-queue"
        element={<Navigate replace to="/admin/suivis" />}
      />
      <Route
        path="subscription/:id"
        element={<LegacySubscriptionRedirect section="lifecycle" />}
      />
      <Route
        path="onboarding/:id"
        element={<LegacySubscriptionRedirect section="preparation" />}
      />
    </>
  );
}
