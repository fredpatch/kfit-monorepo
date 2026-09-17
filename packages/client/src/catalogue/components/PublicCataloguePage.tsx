import { useQuery } from "@tanstack/react-query";
import type { CatalogueAvailabilityStatus, CataloguePublicService } from "@kfit/shared";
import { catalogueApiClient } from "../api/catalogue-api.js";
import { PublicRequestForm } from "../../requests/components/PublicRequestForm.js";

const availabilityLabels: Record<CatalogueAvailabilityStatus, string> = {
  open: "Disponible",
  temporarily_closed: "Temporairement fermé",
  waitlist_only: "Liste d'attente",
  archived: "Archivé",
};

const durationUnitLabels = {
  day: ["jour", "jours"],
  week: ["semaine", "semaines"],
  month: ["mois", "mois"],
} as const;

function formatPrice(service: CataloguePublicService): string {
  if (service.pricingMode === "quote" || service.basePriceXaf === null) {
    return "Sur devis";
  }

  return new Intl.NumberFormat("fr-CM", {
    style: "currency",
    currency: "XAF",
    maximumFractionDigits: 0,
  }).format(service.basePriceXaf);
}

function formatDuration(value: number | null, unit: CataloguePublicService["defaultDurationUnit"]): string {
  if (!value || !unit) return "Durée ajustée au besoin";

  const [singular, plural] = durationUnitLabels[unit];
  return `${value} ${value > 1 ? plural : singular}`;
}

function formatCapacity(service: CataloguePublicService): string {
  if (service.capacityMode === "unlimited" || service.capacityLimit === null) return "Places flexibles";
  return `${service.capacityLimit} place${service.capacityLimit > 1 ? "s" : ""} maximum`;
}

function getPrimaryComponents(service: CataloguePublicService): string[] {
  const ownComponents = service.components.map((component) => component.label);
  const variantComponents = service.variants.flatMap((variant) => variant.components.map((component) => component.label));
  return [...ownComponents, ...variantComponents].slice(0, 4);
}

function ServiceCard({ service }: { service: CataloguePublicService }) {
  const components = getPrimaryComponents(service);

  return (
    <article className="service-card">
      <div className="service-card__header">
        <span className={`availability availability--${service.availabilityStatus}`}>
          {availabilityLabels[service.availabilityStatus]}
        </span>
        <strong>{formatPrice(service)}</strong>
      </div>

      <h3>{service.name}</h3>
      {service.description ? <p>{service.description}</p> : null}

      <dl className="service-facts">
        <div>
          <dt>Durée</dt>
          <dd>{formatDuration(service.defaultDurationValue, service.defaultDurationUnit)}</dd>
        </div>
        <div>
          <dt>Capacité</dt>
          <dd>{formatCapacity(service)}</dd>
        </div>
      </dl>

      {components.length > 0 ? (
        <ul className="service-components">
          {components.map((component) => (
            <li key={component}>{component}</li>
          ))}
        </ul>
      ) : null}

      {service.variants.length > 0 ? (
        <div className="service-variants" aria-label="Options disponibles">
          {service.variants.map((variant) => (
            <span key={variant.id}>
              {variant.name}
              {variant.priceXaf ? ` - ${new Intl.NumberFormat("fr-CM").format(variant.priceXaf)} XAF` : ""}
            </span>
          ))}
        </div>
      ) : null}

      <PublicRequestForm service={service} />
    </article>
  );
}

export function PublicCataloguePage() {
  const catalogue = useQuery({
    queryKey: ["catalogue", "public-services"],
    queryFn: () => catalogueApiClient.listPublicServices(),
  });

  return (
    <main className="public-shell">
      <section className="public-hero" aria-labelledby="public-hero-title">
        <div>
          <p className="eyebrow">K'FIT Coaching</p>
          <h1 id="public-hero-title">Choisis ton accompagnement bien-être.</h1>
          <p>
            Des offres claires pour démarrer avec un bilan, suivre un programme sportif
            ou construire un accompagnement nutritionnel adapté.
          </p>
        </div>
        <a className="hero-admin-link" href="/admin">Accès admin</a>
      </section>

      <section className="catalogue-section" aria-labelledby="catalogue-title">
        <div className="section-heading">
          <p className="eyebrow">Catalogue</p>
          <h2 id="catalogue-title">Services disponibles</h2>
        </div>

        {catalogue.isLoading ? <p className="catalogue-state">Chargement des offres K'FIT...</p> : null}

        {catalogue.isError ? (
          <p className="catalogue-state catalogue-state--error">
            Impossible de charger le catalogue pour le moment.
          </p>
        ) : null}

        {catalogue.data?.services.length === 0 ? (
          <p className="catalogue-state">Aucune offre publique n'est disponible pour le moment.</p>
        ) : null}

        {catalogue.data?.services.length ? (
          <div className="service-grid">
            {catalogue.data.services.map((service) => (
              <ServiceCard key={service.id} service={service} />
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
