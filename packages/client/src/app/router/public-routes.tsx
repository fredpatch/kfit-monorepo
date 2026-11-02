import { Suspense, lazy } from "react";
import { Route } from "react-router";
import { PublicCataloguePage } from "../../catalogue/components/PublicCataloguePage.js";

/* Screens load on demand: keeps the first load small (charts, tables, public pages). */
const PublicAppointmentPage = lazy(() =>
  import("../../appointments/components/PublicAppointmentPage.js").then(
    (m) => ({
      default: m.PublicAppointmentPage,
    }),
  ),
);
const PublicDocumentPage = lazy(() =>
  import("../../documents/components/PublicDocumentPage.js").then((m) => ({
    default: m.PublicDocumentPage,
  })),
);
const PublicQuotePage = lazy(() =>
  import("../../quotes/components/PublicQuotePage.js").then((m) => ({
    default: m.PublicQuotePage,
  })),
);
const PublicReceiptPage = lazy(() =>
  import("../../receipts/components/PublicReceiptPage.js").then((m) => ({
    default: m.PublicReceiptPage,
  })),
);
const PublicPaymentProofPage = lazy(() =>
  import("../../payment-proofs/components/PublicPaymentProofPage.js").then(
    (m) => ({ default: m.PublicPaymentProofPage }),
  ),
);
const PublicConsentPage = lazy(() =>
  import("../../consents/components/PublicConsentPage.js").then((m) => ({
    default: m.PublicConsentPage,
  })),
);
const PublicRequestPage = lazy(() =>
  import("../../requests/components/PublicRequestForm.js").then((m) => ({
    default: m.PublicRequestPage,
  })),
);
const PublicQuestionnairePage = lazy(() =>
  import("../../questionnaires/components/PublicQuestionnairePage.js").then(
    (m) => ({ default: m.PublicQuestionnairePage }),
  ),
);

// DEV-only component gallery (UX-1). The condition is static in production builds, so the module is dropped.
const UiGallery = import.meta.env.DEV
  ? lazy(() =>
      import("../../dev/UiGallery.js").then((m) => ({ default: m.UiGallery })),
    )
  : null;

export function publicRoutes() {
  return (
    <>
      <Route path="/" element={<PublicCataloguePage />} />
      <Route
        path="/demande/:offre"
        element={
          <Suspense fallback={null}>
            <PublicRequestPage />
          </Suspense>
        }
      />
      <Route
        path="/appointment"
        element={
          <Suspense fallback={null}>
            <PublicAppointmentPage />
          </Suspense>
        }
      />
      <Route
        path="/document/:token"
        element={
          <Suspense fallback={null}>
            <PublicDocumentPage />
          </Suspense>
        }
      />
      <Route
        path="/devis/:token"
        element={
          <Suspense fallback={null}>
            <PublicQuotePage />
          </Suspense>
        }
      />
      <Route
        path="/recu/:token"
        element={
          <Suspense fallback={null}>
            <PublicReceiptPage />
          </Suspense>
        }
      />
      <Route
        path="/justificatif/:token"
        element={
          <Suspense fallback={null}>
            <PublicPaymentProofPage />
          </Suspense>
        }
      />
      <Route
        path="/consent"
        element={
          <Suspense fallback={null}>
            <PublicConsentPage />
          </Suspense>
        }
      />
      <Route
        path="/questionnaire"
        element={
          <Suspense fallback={null}>
            <PublicQuestionnairePage />
          </Suspense>
        }
      />

      {UiGallery ? (
        <Route
          path="/__ui"
          element={
            <Suspense fallback={null}>
              <UiGallery />
            </Suspense>
          }
        />
      ) : null}
    </>
  );
}
