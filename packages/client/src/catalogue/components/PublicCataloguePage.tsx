import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { Check, MessageCircle } from "lucide-react";
import type { CataloguePublicService, CatalogueServiceVariant } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { moneyFcfa, useNoReferrer } from "../../components/public/PublicShell.js";
import { cn } from "../../lib/utils.js";
import { familyMeta, familyOfSlug, offerFamilies, type OfferFamily } from "../../lib/families.js";
import { publicLinks } from "../../lib/public-links.js";
import { catalogueApiClient } from "../api/catalogue-api.js";

const durationUnits = { day: ["jour", "jours"], week: ["semaine", "semaines"], month: ["mois", "mois"] } as const;
const familyBlurbs: Record<OfferFamily, string> = {
  transpitime: "Séances de sport en live, en visio, à heure fixe.",
  nutrition: "Rééquilibrage alimentaire adapté à tes habitudes.",
  pilates: "Renforcement en douceur, posture et mobilité.",
  pack: "Sport, nutrition et bilans réunis sur plusieurs mois.",
};
const steps = [
  { title: "Tu fais ta demande", text: "Choisis une offre et laisse ton nom et ton numéro WhatsApp." },
  { title: "Ta coach te contacte", text: "Un échange pour comprendre tes objectifs et valider la formule." },
  { title: "Tu prépares ton départ", text: "Questionnaire, conditions et date de début, depuis ton téléphone." },
  { title: "C'est parti", text: "Séances, suivi régulier et bilans pour mesurer tes progrès." },
];
// Answers validated by Fred 2026-10-23 (UX-11). The health answer must be re-checked with the privacy notice before production.
const faq = [
  { q: "Comment se passe le paiement ?", a: "Le paiement se fait directement avec ta coach, après votre échange. Aucun paiement n'est demandé sur ce site." },
  { q: "Mes informations de santé sont-elles protégées ?", a: "Oui. Tu donnes ton accord avant de répondre au questionnaire santé. Tes réponses ne sont visibles que par ta coach et servent uniquement à ton accompagnement." },
  { q: "Je débute, est-ce adapté pour moi ?", a: "Oui. Ta coach adapte le programme à ton niveau après votre premier échange." },
  { q: "Puis-je suivre plusieurs offres à la fois ?", a: "Oui, selon les places disponibles. Indique-le dans ton message, ta coach t'aidera à choisir." },
];

function duration(value: number | null, unit: CataloguePublicService["defaultDurationUnit"]): string | null {
  if (!value || !unit) return null;
  const [one, many] = durationUnits[unit];
  return `${value} ${value > 1 ? many : one}`;
}

/** Lowest price among bookable variants, else the base price; null = on quote. */
function priceOf(service: CataloguePublicService): { amount: number | null; from: boolean } {
  if (service.pricingMode === "quote") return { amount: null, from: false };
  const variantPrices = service.variants.filter((v) => v.availabilityStatus === "open" && v.priceXaf !== null).map((v) => v.priceXaf as number);
  if (variantPrices.length > 1) return { amount: Math.min(...variantPrices), from: true };
  if (variantPrices.length === 1) return { amount: variantPrices[0] ?? null, from: false };
  return { amount: service.basePriceXaf, from: false };
}

function WhatsAppButton({ href, children, className, variant = "secondary" }: { href: string; children: React.ReactNode; className?: string; variant?: "secondary" | "default" | "whatsapp" }) {
  return (
    <Button asChild variant={variant} className={className}>
      <a href={href} target="_blank" rel="noopener noreferrer"><MessageCircle aria-hidden="true" />{children}</a>
    </Button>
  );
}

function OfferCard({ service }: { service: CataloguePublicService }) {
  const family = familyOfSlug(service.slug);
  const meta = familyMeta[family];
  const bookable = service.variants.filter((v) => v.availabilityStatus === "open");
  const [variantId, setVariantId] = useState<string>(bookable.length === 1 ? (bookable[0]?.id ?? "") : "");
  const price = priceOf(service);
  const length = duration(service.defaultDurationValue, service.defaultDurationUnit);
  const items = [...service.components, ...service.variants.flatMap((v) => v.components)].map((c) => c.label).filter((label, i, all) => all.indexOf(label) === i).slice(0, 4);
  const open = service.availabilityStatus === "open";
  const waitlist = service.availabilityStatus === "waitlist_only";
  const requestHref = `/demande/${encodeURIComponent(service.slug)}${variantId ? `?formule=${encodeURIComponent(variantId)}` : ""}`;
  const askHref = publicLinks.whatsappAbout(service.name);

  return (
    <article className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-2.5">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-muted-foreground"><span aria-hidden="true" className={cn("size-2.5 rounded-[3px]", meta.dotClass)} />{meta.label}</span>
        <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-bold", open ? "bg-success-soft text-success" : waitlist ? "bg-waitlist-soft text-waitlist" : "bg-neutral-soft text-neutral")}>
          <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{open ? "Places disponibles" : waitlist ? "Complet pour le moment" : "Fermé temporairement"}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-[22px] font-extrabold tracking-tight">{service.name}</h3>
        {service.description ? <p className="text-sm leading-relaxed text-muted-foreground">{service.description}</p> : null}
      </div>
      <div className="flex flex-wrap items-baseline gap-1.5">
        {price.from ? <span className="text-[13px] text-muted-foreground">dès</span> : null}
        <span className="text-[26px] font-extrabold tracking-tight tabular-nums">{price.amount === null ? "Sur devis" : moneyFcfa(price.amount)}</span>
        {length && price.amount !== null ? <span className="text-[13px] text-muted-foreground">· {length}</span> : null}
      </div>
      {items.length ? (
        <ul className="flex flex-col gap-2">
          {items.map((item) => <li key={item} className="flex gap-2.5 text-sm"><Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />{item}</li>)}
        </ul>
      ) : null}
      {open && service.variants.length > 1 ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="pb-1.5 text-[13px] font-semibold">Formule</legend>
          <div className="flex flex-wrap gap-2">
            {service.variants.map((v: CatalogueServiceVariant) => {
              const disabled = v.availabilityStatus !== "open";
              return (
                <label key={v.id} className={cn("flex min-w-[120px] flex-1 cursor-pointer flex-col gap-0.5 rounded-xl border px-3 py-2.5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring", variantId === v.id ? "border-[1.5px] border-primary bg-accent" : "border-input bg-card", disabled && "cursor-not-allowed opacity-50")}>
                  <input type="radio" name={`formule-${service.id}`} value={v.id} checked={variantId === v.id} disabled={disabled} onChange={() => setVariantId(v.id)} className="sr-only" />
                  <span className="text-[13px] font-bold">{v.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">{disabled ? "Indisponible" : v.priceXaf !== null ? moneyFcfa(v.priceXaf) : "Sur devis"}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ) : null}
      <div className="flex-1" />
      {open ? (
        <Button asChild className="h-12 rounded-[14px] text-[15px] font-bold"><Link to={requestHref}>Faire une demande</Link></Button>
      ) : (
        <>
          <p className="text-center text-xs text-muted-foreground">{waitlist ? "Plus de place pour le moment. Écris à ta coach pour être prévenue dès qu'une place se libère." : "Les nouvelles demandes sont fermées pour le moment."}</p>
          {askHref ? <WhatsAppButton href={askHref} className="h-12 rounded-[14px] text-[15px] font-bold">Écrire à ta coach</WhatsAppButton> : null}
        </>
      )}
    </article>
  );
}

/** Public landing page (board 10). Text-only brand until the coach onboarding provides name, logo and photo. */
export function PublicCataloguePage() {
  useNoReferrer();
  const catalogue = useQuery({ queryKey: ["catalogue", "public-services"], queryFn: () => catalogueApiClient.listPublicServices() });
  const [filter, setFilter] = useState<OfferFamily | "all">("all");
  const services = catalogue.data?.services ?? [];
  const families = useMemo(() => offerFamilies.filter((f) => services.some((s) => familyOfSlug(s.slug) === f)), [services]);
  const shown = services.filter((s) => filter === "all" || familyOfSlug(s.slug) === filter);
  const pickFamily = (f: OfferFamily) => { setFilter(f); document.getElementById("offres")?.scrollIntoView({ behavior: "smooth", block: "start" }); };

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1180px] items-center gap-6 px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2.5 text-foreground no-underline">
            <span aria-hidden="true" className="flex size-[34px] items-center justify-center rounded-[10px] bg-brand-950 text-[15px] font-extrabold text-lime">K</span>
            <span className="text-lg font-extrabold tracking-tight">K'FIT</span>
          </a>
          <nav aria-label="Navigation" className="hidden gap-6 text-sm font-semibold md:flex">
            <a href="#offres" className="text-foreground no-underline hover:text-primary">Offres</a>
            <a href="#etapes" className="text-foreground no-underline hover:text-primary">Comment ça marche</a>
            <a href="#faq" className="text-foreground no-underline hover:text-primary">Questions</a>
          </nav>
          <div className="flex-1" />
          {publicLinks.whatsapp ? <WhatsAppButton href={publicLinks.whatsapp} variant="whatsapp" className="hidden sm:inline-flex">Écrire sur WhatsApp</WhatsAppButton> : null}
        </div>
      </header>

      <main>
        <section className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-12 px-4 pb-12 pt-12 sm:px-6 sm:pt-16">
          <div className="flex min-w-0 flex-[1_1_460px] flex-col gap-5">
            <span className="inline-flex h-[30px] items-center gap-2 self-start rounded-full bg-brand-100 px-3 text-[13px] font-bold text-brand-950"><span aria-hidden="true" className="size-2 rounded-full bg-primary" />Coaching en visio et sur WhatsApp</span>
            <h1 className="text-[40px] font-extrabold leading-[1.05] tracking-[-0.04em] sm:text-[60px]">Choisis ton accompagnement bien-être.</h1>
            <p className="max-w-[520px] text-lg leading-relaxed text-muted-foreground">Sport en live, nutrition, Pilates ou formule complète : une coach, un plan clair, un suivi régulier.</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" className="h-[52px] rounded-[14px] px-6 font-bold"><a href="#offres">Voir les offres</a></Button>
              {publicLinks.whatsapp ? <WhatsAppButton href={publicLinks.whatsapp} className="h-[52px] rounded-[14px] px-6 text-base font-bold">Parler à ta coach</WhatsAppButton> : null}
            </div>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-[13px] text-muted-foreground">
              {["Paiement directement avec la coach", "Questionnaire santé confidentiel", "Réponse sous 24 h"].map((t) => <li key={t} className="flex items-center gap-1.5"><Check aria-hidden="true" className="size-3.5 text-primary" />{t}</li>)}
            </ul>
          </div>
          {/* Text-only brand panel until the coach onboarding provides a photo (no placeholder in production). */}
          <div aria-hidden="true" className="hidden min-w-0 flex-[1_1_380px] flex-col justify-between gap-10 rounded-[28px] bg-brand-950 p-10 text-white lg:flex lg:min-h-[420px]">
            <span className="flex size-16 items-center justify-center rounded-2xl bg-lime text-3xl font-extrabold text-brand-950">K</span>
            <div className="flex flex-col gap-3">
              {families.map((f) => <span key={f} className="flex items-center gap-3 text-lg font-bold"><span className={cn("size-3 rounded", familyMeta[f].dotClass)} />{familyMeta[f].label}</span>)}
            </div>
            <span className="text-sm text-sidebar-foreground">Une coach, un plan clair, un suivi régulier.</span>
          </div>
        </section>

        {families.length ? (
          <section aria-label="Familles d'offres" className="mx-auto grid max-w-[1180px] grid-cols-1 gap-3 px-4 pb-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
            {families.map((f) => (
              <button key={f} type="button" onClick={() => pickFamily(f)} className="flex flex-col items-start gap-2 rounded-2xl border border-border bg-card p-5 text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span aria-hidden="true" className={cn("flex size-9 items-center justify-center rounded-xl", familyMeta[f].softClass)}><span className={cn("size-3 rounded", familyMeta[f].dotClass)} /></span>
                <span className="text-base font-extrabold">{familyMeta[f].label}</span>
                <span className="text-[13px] leading-relaxed text-muted-foreground">{familyBlurbs[f]}</span>
              </button>
            ))}
          </section>
        ) : null}

        <section id="offres" className="scroll-mt-20 bg-card py-14">
          <div className="mx-auto flex max-w-[1180px] flex-col gap-8 px-4 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-bold uppercase tracking-wider text-primary">Offres</span>
                <h2 className="text-3xl font-extrabold tracking-tight">Trouve la formule qui te ressemble</h2>
              </div>
              {families.length > 1 ? (
                <div role="group" aria-label="Filtrer par famille" className="flex flex-wrap gap-2">
                  {(["all", ...families] as const).map((f) => (
                    <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cn("inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-bold", filter === f ? "border-primary bg-primary text-white" : "border-input bg-card text-foreground hover:border-primary/40")}>
                      {f !== "all" ? <span aria-hidden="true" className={cn("size-2 rounded-full", familyMeta[f].dotClass)} /> : null}{f === "all" ? "Toutes" : familyMeta[f].label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            {catalogue.isPending ? <p role="status" className="text-sm text-muted-foreground">Chargement des offres…</p>
              : catalogue.isError ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm"><p>Impossible de charger les offres pour le moment.</p><Button variant="secondary" onClick={() => void catalogue.refetch()}>Réessayer</Button></div>
              : shown.length === 0 ? <p className="text-sm text-muted-foreground">Aucune offre n'est disponible pour le moment.</p>
              : <div className="grid grid-cols-1 gap-5 md:grid-cols-2">{shown.map((s) => <OfferCard key={s.id} service={s} />)}</div>}
          </div>
        </section>

        <section id="etapes" className="mx-auto flex max-w-[1180px] scroll-mt-20 flex-col gap-8 px-4 py-14 sm:px-6">
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold uppercase tracking-wider text-primary">Comment ça marche</span>
            <h2 className="text-3xl font-extrabold tracking-tight">De ta demande au premier entraînement</h2>
          </div>
          <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title} className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5">
                <span aria-hidden="true" className="flex size-9 items-center justify-center rounded-full bg-brand-950 text-sm font-extrabold text-lime">{i + 1}</span>
                <span className="text-base font-extrabold">{s.title}</span>
                <span className="text-sm leading-relaxed text-muted-foreground">{s.text}</span>
              </li>
            ))}
          </ol>
        </section>

        <section id="faq" className="mx-auto flex max-w-[820px] scroll-mt-20 flex-col gap-4 px-4 pb-14 sm:px-6">
          <h2 className="text-3xl font-extrabold tracking-tight">Questions fréquentes</h2>
          {faq.map((item, i) => (
            <details key={item.q} open={i === 0} className="group rounded-2xl border border-border bg-card px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-bold [&::-webkit-details-marker]:hidden">
                {item.q}<span aria-hidden="true" className="text-xl text-primary group-open:hidden">+</span><span aria-hidden="true" className="hidden text-xl text-primary group-open:inline">−</span>
              </summary>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">{item.a}</p>
            </details>
          ))}
        </section>

        {publicLinks.whatsapp ? (
          <section className="mx-auto max-w-[1180px] px-4 pb-16 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-6 rounded-[28px] bg-brand-950 p-8 sm:p-10">
              <div className="flex max-w-[560px] flex-col gap-2">
                <h2 className="text-[28px] font-extrabold tracking-tight text-white sm:text-[32px]">Pas sûre de la formule ?</h2>
                <p className="text-base leading-relaxed text-sidebar-foreground">Écris à ta coach sur WhatsApp, elle t'oriente vers l'accompagnement adapté.</p>
              </div>
              <Button asChild className="h-[52px] rounded-[14px] bg-lime px-6 text-base font-extrabold text-brand-950 hover:bg-lime/90">
                <a href={publicLinks.whatsapp} target="_blank" rel="noopener noreferrer">Écrire sur WhatsApp</a>
              </Button>
            </div>
          </section>
        ) : null}
      </main>

      <footer className="border-t border-border bg-card">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-6 text-sm sm:px-6">
          <span className="font-extrabold">K'FIT</span>
          <span className="text-muted-foreground">© {new Date().getFullYear()}</span>
          <div className="flex-1" />
          {publicLinks.instagram ? <a href={publicLinks.instagram} target="_blank" rel="noopener noreferrer" className="font-semibold">Instagram</a> : null}
          {publicLinks.whatsapp ? <a href={publicLinks.whatsapp} target="_blank" rel="noopener noreferrer" className="font-semibold">WhatsApp</a> : null}
          {/* « Confidentialité » and « Conditions » appear once legal validation is done (pre-prod blocker). */}
          <a href="/admin" className="font-semibold">Espace coach</a>
        </div>
      </footer>
    </div>
  );
}
