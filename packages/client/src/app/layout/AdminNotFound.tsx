import { EmptyState } from "../../components/ui/empty-state.js";
import { AdminPage } from "./AdminPage.js";

export function AdminNotFound() {
  return (
    <AdminPage title="Page introuvable">
      <EmptyState
        title="Cette page n'existe pas"
        description="Utilise le menu pour revenir à un écran de l'espace coach."
      />
    </AdminPage>
  );
}
