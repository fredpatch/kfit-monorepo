import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CatalogueAdminService,
  CatalogueAvailabilityStatus,
  CatalogueCapacityMode,
  CatalogueServiceCapacityInput,
} from "@kfit/shared";
import { catalogueApiClient } from "../api/catalogue-api.js";

const adminServicesQueryKey = ["catalogue", "admin-services"] as const;

const availabilityOptions: Array<{ value: CatalogueAvailabilityStatus; label: string }> = [
  { value: "open", label: "Ouvert" },
  { value: "temporarily_closed", label: "Fermé temporairement" },
  { value: "waitlist_only", label: "Liste d’attente uniquement" },
  { value: "archived", label: "Archivé" },
];

function availabilityLabel(status: CatalogueAvailabilityStatus): string {
  return availabilityOptions.find((option) => option.value === status)?.label ?? status;
}

function CapacityEditor({
  service,
  saving,
  onSave,
}: {
  service: CatalogueAdminService;
  saving: boolean;
  onSave(input: CatalogueServiceCapacityInput): Promise<void>;
}) {
  const [availabilityStatus, setAvailabilityStatus] = useState<CatalogueAvailabilityStatus>(service.availabilityStatus);
  const [capacityMode, setCapacityMode] = useState<CatalogueCapacityMode>(service.capacityMode);
  const [capacityLimit, setCapacityLimit] = useState(service.capacityLimit?.toString() ?? "");
  const [waitlistEnabled, setWaitlistEnabled] = useState(service.waitlistEnabled);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    setAvailabilityStatus(service.availabilityStatus);
    setCapacityMode(service.capacityMode);
    setCapacityLimit(service.capacityLimit?.toString() ?? "");
    setWaitlistEnabled(service.waitlistEnabled);
    setError(null);
    setSuccess(null);
  }, [service]);

  const archived = service.archivedAt !== null || service.availabilityStatus === "archived";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (archived) return;

    let normalizedLimit: number | null = null;
    if (capacityMode === "limited") {
      const parsed = Number(capacityLimit);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        setError("La capacité doit être un entier strictement supérieur à zéro.");
        return;
      }
      normalizedLimit = parsed;
    }

    if (availabilityStatus === "waitlist_only" && !waitlistEnabled) {
      setError("Active la liste d’attente pour utiliser l’état « Liste d’attente uniquement ».");
      return;
    }

    try {
      await onSave({
        availabilityStatus,
        capacityMode,
        capacityLimit: normalizedLimit,
        waitlistEnabled,
      });
      setSuccess("Capacité et disponibilité mises à jour.");
    } catch {
      setError("La mise à jour a échoué. Vérifie les valeurs puis réessaie.");
    }
  }

  return (
    <article className="admin-capacity-card">
      <div className="admin-capacity-card__heading">
        <div>
          <p className="eyebrow">Service catalogue</p>
          <h3>{service.name}</h3>
          <p className="muted">/{service.slug}</p>
        </div>
        <span className={`availability availability--${service.availabilityStatus}`}>
          {availabilityLabel(service.availabilityStatus)}
        </span>
      </div>

      <form className="capacity-form" onSubmit={(event) => void submit(event)}>
        <label>
          Disponibilité
          <select
            value={availabilityStatus}
            disabled={archived || saving}
            onChange={(event) => setAvailabilityStatus(event.target.value as CatalogueAvailabilityStatus)}
          >
            {availabilityOptions.map((option) => (
              <option key={option.value} value={option.value} disabled={option.value === "archived"}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Mode de capacité
          <select
            value={capacityMode}
            disabled={archived || saving}
            onChange={(event) => {
              const nextMode = event.target.value as CatalogueCapacityMode;
              setCapacityMode(nextMode);
              if (nextMode === "unlimited") setCapacityLimit("");
            }}
          >
            <option value="unlimited">Illimitée</option>
            <option value="limited">Limitée</option>
          </select>
        </label>

        <label>
          Limite de places
          <input
            type="number"
            min="1"
            step="1"
            inputMode="numeric"
            value={capacityLimit}
            disabled={archived || saving || capacityMode === "unlimited"}
            placeholder={capacityMode === "unlimited" ? "Non applicable" : "Ex. 20"}
            onChange={(event) => setCapacityLimit(event.target.value)}
          />
        </label>

        <label className="capacity-toggle">
          <input
            type="checkbox"
            checked={waitlistEnabled}
            disabled={archived || saving}
            onChange={(event) => setWaitlistEnabled(event.target.checked)}
          />
          <span>Autoriser la liste d’attente</span>
        </label>

        <div className="capacity-meta">
          <span>{service.isPublic ? "Visible publiquement" : "Non publié"}</span>
          <span>Ordre : {service.sortOrder}</span>
        </div>

        {archived ? <p className="catalogue-state catalogue-state--error">Ce service est archivé et ne peut plus être modifié.</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {success ? <p className="status">{success}</p> : null}

        <button type="submit" disabled={archived || saving}>
          {saving ? "Enregistrement..." : "Enregistrer la capacité"}
        </button>
      </form>
    </article>
  );
}

export function AdminCatalogueCapacityPage() {
  const queryClient = useQueryClient();
  const services = useQuery({
    queryKey: adminServicesQueryKey,
    queryFn: () => catalogueApiClient.listAdminServices(),
  });

  const updateCapacity = useMutation({
    mutationFn: ({ serviceId, input }: { serviceId: string; input: CatalogueServiceCapacityInput }) =>
      catalogueApiClient.updateAdminServiceCapacity(serviceId, input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminServicesQueryKey });
      await queryClient.invalidateQueries({ queryKey: ["catalogue", "public-services"] });
    },
  });

  return (
    <section className="admin-catalogue-panel">
      <div className="section-heading">
        <p className="eyebrow">Catalogue K'FIT</p>
        <h2>Capacité et liste d’attente</h2>
        <p className="muted">
          Ajuste la disponibilité commerciale de chaque service sans modifier son contenu ni sa tarification.
        </p>
      </div>

      {services.isLoading ? <p className="catalogue-state">Chargement du catalogue admin...</p> : null}
      {services.isError ? (
        <div className="catalogue-state catalogue-state--error">
          <p>Impossible de charger les services du catalogue.</p>
          <button type="button" onClick={() => void services.refetch()}>Réessayer</button>
        </div>
      ) : null}

      {services.data?.services.length === 0 ? <p className="catalogue-state">Aucun service catalogue disponible.</p> : null}

      {services.data?.services.length ? (
        <div className="admin-capacity-grid">
          {services.data.services.map((service) => (
            <CapacityEditor
              key={service.id}
              service={service}
              saving={updateCapacity.isPending && updateCapacity.variables?.serviceId === service.id}
              onSave={async (input) => {
                await updateCapacity.mutateAsync({ serviceId: service.id, input });
              }}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
