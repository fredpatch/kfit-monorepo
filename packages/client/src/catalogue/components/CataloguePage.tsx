import { useMemo, useState, type DragEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { NavLink, useSearchParams } from "react-router";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  GripVertical,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import type { CatalogueAdminServiceOverview } from "@kfit/shared";
import {
  catalogueApiClient,
  catalogueErrorMessage,
} from "../api/catalogue-api.js";
import {
  capacitySummary,
  catalogueTabLabels,
  catalogueTabs,
  metaText,
  priceText,
  sinceDays,
  tabOf,
  type CatalogueTab,
} from "../lib/catalogue-meta.js";
import { ServiceSheet, useCatalogueRefresh } from "./ServiceSheet.js";
import { NewServiceSheet } from "./NewServiceSheet.js";
import {
  DeliverabilityChecklist,
  deliverabilityQueryKey,
} from "./DeliverabilityChecklist.js";
import { AdminPage } from "../../app/layout/AdminPage.js";
import { Button } from "../../components/ui/button.js";
import {
  Dialog,
  DialogClose,
  DialogContent,
} from "../../components/ui/dialog.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { StatusPill } from "../../components/ui/status-pill.js";
import { Switch } from "../../components/ui/switch.js";
import { cn } from "../../lib/utils.js";
import { availabilityStatus } from "../../lib/status-map.js";
import { familyMeta, familyOfSlug } from "../../lib/families.js";

const tabParam: Record<CatalogueTab, string> = {
  published: "publiees",
  drafts: "brouillons",
  archived: "archivees",
};
type Confirm = {
  kind: "publish" | "archive";
  service: CatalogueAdminServiceOverview;
} | null;

function CapacityCell({ s }: { s: CatalogueAdminServiceOverview }) {
  const c = capacitySummary(s);
  return (
    <span className="flex w-[150px] flex-col gap-1">
      <span
        className={cn(
          "text-[13px] tabular-nums",
          c.tone === "full" ? "font-bold text-danger" : "",
        )}
      >
        {c.text}
      </span>
      {c.ratio !== null ? (
        <span
          className="h-1.5 overflow-hidden rounded-full bg-border"
          aria-hidden="true"
        >
          <span
            className={cn(
              "block h-1.5 rounded-full",
              c.tone === "full"
                ? "bg-danger"
                : c.tone === "high"
                  ? "bg-primary"
                  : "bg-[#b9d7ac]",
            )}
            style={{ width: `${Math.round(c.ratio * 100)}%` }}
          />
        </span>
      ) : null}
    </span>
  );
}

/** Catalogue (board 06). Data: GET /admin/catalogue/services/overview + existing catalogue mutations. */
export function CataloguePage() {
  const [params, setParams] = useSearchParams();
  const refresh = useCatalogueRefresh();
  const query = useQuery({
    queryKey: ["catalogue", "admin-overview"],
    queryFn: () => catalogueApiClient.listAdminOverview(),
  });
  const tab =
    catalogueTabs.find((t) => tabParam[t] === params.get("vue")) ?? "published";
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  // Same query key as the checklist inside the dialog: one request, and « Publier » waits for a deliverable offer (D6).
  const publishingId = confirm?.kind === "publish" ? confirm.service.id : null;
  const readiness = useQuery({
    queryKey: deliverabilityQueryKey(publishingId ?? ""),
    queryFn: () => catalogueApiClient.deliverability(publishingId!),
    enabled: publishingId !== null,
  });
  const [busy, setBusy] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [order, setOrder] = useState<string[] | null>(null);

  const all = query.data?.services ?? [];
  const counts = useMemo(
    () =>
      Object.fromEntries(
        catalogueTabs.map((t) => [t, all.filter((s) => tabOf(s) === t).length]),
      ) as Record<CatalogueTab, number>,
    [all],
  );
  const rows = useMemo(() => {
    const inTab = all.filter((s) => tabOf(s) === tab);
    if (!order) return inTab;
    return order
      .map((id) => inTab.find((s) => s.id === id))
      .filter((s): s is CatalogueAdminServiceOverview => Boolean(s));
  }, [all, tab, order]);
  const published = all.filter((s) => tabOf(s) === "published");
  const selected = all.find((s) => s.id === openId) ?? null;
  const position = selected
    ? published.findIndex((s) => s.id === selected.id) + 1
    : 0;
  const canReorder = tab !== "archived" && rows.length > 1;

  const summary = (() => {
    if (!query.data) return "Offres, disponibilité et capacité";
    const full = published.filter(
      (s) => capacitySummary(s).tone === "full",
    ).length;
    const closed = published.filter(
      (s) => s.availabilityStatus === "temporarily_closed",
    ).length;
    const waiting = all.reduce((sum, s) => sum + s.waitlist.active, 0);
    return `${published.length} offre(s) publiée(s) · ${full} complète(s) · ${closed} fermée(s) · ${waiting} personne(s) en liste d'attente`;
  })();

  async function persistOrder(ids: string[]) {
    // Re-use the tab's own sort values in the new order, so offers in other tabs keep their place.
    const slots = rows.map((s) => s.sortOrder).sort((x, y) => x - y);
    const unique =
      new Set(slots).size === slots.length
        ? slots
        : slots.map((_, i) => (slots[0] ?? 0) + i * 10);
    setOrder(ids);
    try {
      await catalogueApiClient.reorderAdminServices(
        ids.map((serviceId, i) => ({
          serviceId,
          sortOrder: unique[i] ?? i * 10,
        })),
      );
      await refresh();
      toast.success("Ordre d'affichage mis à jour.");
    } catch (failure) {
      toast.error(catalogueErrorMessage(failure));
    } finally {
      setOrder(null);
    }
  }
  const move = (id: string, delta: number) => {
    const ids = rows.map((s) => s.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    void persistOrder(ids);
  };
  const onDrop = (event: DragEvent, targetId: string) => {
    event.preventDefault();
    if (!dragId || dragId === targetId) return setDragId(null);
    const ids = rows.map((s) => s.id);
    ids.splice(ids.indexOf(targetId), 0, ...ids.splice(ids.indexOf(dragId), 1));
    setDragId(null);
    void persistOrder(ids);
  };

  async function toggleVisible(
    s: CatalogueAdminServiceOverview,
    isPublic: boolean,
  ) {
    try {
      await catalogueApiClient.updateAdminService(s.id, { isPublic });
      await refresh();
      toast.success(
        isPublic
          ? "Offre visible sur la page publique."
          : "Offre masquée de la page publique.",
      );
    } catch (failure) {
      toast.error(catalogueErrorMessage(failure));
    }
  }

  async function runConfirm() {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm.kind === "publish")
        await catalogueApiClient.publishAdminService(confirm.service.id);
      else await catalogueApiClient.archiveAdminService(confirm.service.id);
      await refresh();
      toast.success(
        confirm.kind === "publish" ? "Offre publiée." : "Offre archivée.",
      );
      setConfirm(null);
    } catch (failure) {
      toast.error(catalogueErrorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  const setTab = (t: CatalogueTab) => {
    const merged = new URLSearchParams(params);
    if (t === "published") merged.delete("vue");
    else merged.set("vue", tabParam[t]);
    setParams(merged, { replace: true });
  };

  const Actions = ({ s }: { s: CatalogueAdminServiceOverview }) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions pour ${s.name}`}
          className="text-muted-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onSelect={() => setOpenId(s.id)}>
          Ouvrir
        </DropdownMenuItem>
        {tabOf(s) === "drafts" ? (
          <DropdownMenuItem
            onSelect={() => setConfirm({ kind: "publish", service: s })}
          >
            Publier
          </DropdownMenuItem>
        ) : null}
        {tabOf(s) === "published" ? (
          <DropdownMenuItem onSelect={() => void toggleVisible(s, !s.isPublic)}>
            {s.isPublic
              ? "Masquer de la page publique"
              : "Afficher sur la page publique"}
          </DropdownMenuItem>
        ) : null}
        {tabOf(s) !== "archived" ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              destructive
              onSelect={() => setConfirm({ kind: "archive", service: s })}
            >
              Archiver
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <AdminPage
      title="Catalogue"
      description={summary}
      actions={
        <>
          <Button asChild variant="secondary">
            <NavLink to="/" target="_blank" rel="noopener">
              <ExternalLink /> Voir la page publique
            </NavLink>
          </Button>
          <Button onClick={() => setCreating(true)}>
            <Plus /> Nouvelle offre
          </Button>
        </>
      }
    >
      {query.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Chargement du catalogue…
        </p>
      ) : query.isError ? (
        <EmptyState
          title="Impossible de charger le catalogue"
          description={catalogueErrorMessage(query.error)}
          action={
            <Button variant="secondary" onClick={() => void query.refetch()}>
              Réessayer
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-4">
          <div
            role="group"
            aria-label="Vues"
            className="-mx-1 flex gap-1 overflow-x-auto border-b border-border px-1"
          >
            {catalogueTabs.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={t === tab}
                onClick={() => setTab(t)}
                className={cn(
                  "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                  t === tab
                    ? "border-primary font-bold text-foreground"
                    : "border-transparent font-semibold text-muted-foreground hover:text-foreground",
                )}
              >
                {catalogueTabLabels[t]}
                <span className="rounded-full bg-muted px-1.5 text-[11px] font-bold tabular-nums text-muted-foreground">
                  {counts[t]}
                </span>
              </button>
            ))}
          </div>

          {rows.length === 0 ? (
            <EmptyState
              title={`Aucune offre dans « ${catalogueTabLabels[tab]} »`}
              {...(tab === "drafts"
                ? {
                    description:
                      "Crée une offre : elle apparaîtra ici jusqu'à sa publication.",
                  }
                : {})}
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    Offres · {catalogueTabLabels[tab]}
                  </caption>
                  <thead className="border-b border-border bg-[#f7f8f5] text-left text-xs font-semibold text-muted-foreground">
                    <tr>
                      {canReorder ? (
                        <th scope="col" className="w-20 px-4 py-3">
                          Ordre
                        </th>
                      ) : null}
                      <th scope="col" className="px-4 py-3">
                        Offre
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Prix
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Disponibilité
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Capacité
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Liste d'attente
                      </th>
                      {tab === "published" ? (
                        <th scope="col" className="px-4 py-3">
                          Visible
                        </th>
                      ) : null}
                      <th scope="col" className="w-12 px-2 py-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((s, i) => (
                      <tr
                        key={s.id}
                        draggable={canReorder}
                        onDragStart={() => setDragId(s.id)}
                        onDragOver={(e) => canReorder && e.preventDefault()}
                        onDrop={(e) => onDrop(e, s.id)}
                        onDragEnd={() => setDragId(null)}
                        onClick={() => setOpenId(s.id)}
                        className={cn(
                          "cursor-pointer border-b border-border-subtle last:border-0 hover:bg-[#f7f8f5]",
                          dragId === s.id ? "opacity-50" : "",
                          openId === s.id ? "bg-[#f5faf2]" : "",
                        )}
                      >
                        {canReorder ? (
                          <td
                            className="px-4 py-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span className="flex items-center gap-0.5 text-muted-foreground">
                              <GripVertical
                                className="size-4 cursor-grab"
                                aria-hidden="true"
                              />
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="size-6"
                                aria-label={`Monter ${s.name}`}
                                disabled={i === 0 || order !== null}
                                onClick={() => move(s.id, -1)}
                              >
                                <ArrowUp className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                className="size-6"
                                aria-label={`Descendre ${s.name}`}
                                disabled={
                                  i === rows.length - 1 || order !== null
                                }
                                onClick={() => move(s.id, 1)}
                              >
                                <ArrowDown className="size-3.5" />
                              </Button>
                            </span>
                          </td>
                        ) : null}
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-3">
                            <span
                              aria-hidden="true"
                              className={cn(
                                "size-2.5 shrink-0 rounded-[3px]",
                                familyMeta[familyOfSlug(s.slug)].dotClass,
                              )}
                            />
                            <span className="flex min-w-0 flex-col">
                              <span className="font-bold">{s.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {metaText(s)}
                              </span>
                            </span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                          {priceText(s)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill
                            size="sm"
                            status={availabilityStatus[s.availabilityStatus]}
                          />
                        </td>
                        <td className="px-4 py-3">
                          <CapacityCell s={s} />
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-[13px]">
                          {s.waitlist.active ? (
                            <span
                              className="font-semibold text-waitlist"
                              title={sinceDays(s.waitlist.oldestEnteredAt)}
                            >
                              {s.waitlist.active} en attente
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              {s.waitlistEnabled ? "Personne" : "-"}
                            </span>
                          )}
                        </td>
                        {tab === "published" ? (
                          <td
                            className="px-4 py-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Switch
                              checked={s.isPublic}
                              onCheckedChange={(v) => void toggleVisible(s, v)}
                              aria-label={`Visible : ${s.name}`}
                            />
                          </td>
                        ) : null}
                        <td
                          className="px-2 py-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Actions s={s} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {canReorder ? (
                  <p className="border-t border-border-subtle px-4 py-2.5 text-xs text-muted-foreground">
                    Glisser-déposer (ou flèches) pour changer l'ordre
                    d'affichage sur la page publique.
                  </p>
                ) : null}
              </div>

              {/* Mobile cards */}
              <ul className="flex flex-col gap-2 md:hidden">
                {rows.map((s) => (
                  <li key={s.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setOpenId(s.id)}
                      onKeyDown={(e) =>
                        e.key === "Enter" ? setOpenId(s.id) : undefined
                      }
                      className="flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3.5"
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span
                            aria-hidden="true"
                            className={cn(
                              "size-2.5 shrink-0 rounded-[3px]",
                              familyMeta[familyOfSlug(s.slug)].dotClass,
                            )}
                          />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate text-[15px] font-bold">
                              {s.name}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {priceText(s)}
                            </span>
                          </span>
                        </span>
                        <StatusPill
                          size="sm"
                          status={availabilityStatus[s.availabilityStatus]}
                        />
                      </span>
                      <span className="flex items-center justify-between gap-2 border-t border-border-subtle pt-2.5 text-xs">
                        <span>{capacitySummary(s).text}</span>
                        <span
                          className={
                            s.waitlist.active
                              ? "font-semibold text-waitlist"
                              : "text-muted-foreground"
                          }
                        >
                          {s.waitlist.active
                            ? `${s.waitlist.active} en attente`
                            : "-"}
                        </span>
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <ServiceSheet
        service={selected}
        position={position}
        total={published.length}
        open={selected !== null}
        onOpenChange={(o) => (o ? undefined : setOpenId(null))}
      />
      <NewServiceSheet
        open={creating}
        onOpenChange={setCreating}
        nextSortOrder={Math.max(0, ...all.map((s) => s.sortOrder)) + 10}
        onCreated={(id) => {
          setTab("drafts");
          setOpenId(id);
        }}
      />
      <Dialog
        open={confirm !== null}
        onOpenChange={(o) => (!o && !busy ? setConfirm(null) : undefined)}
      >
        {confirm ? (
          <DialogContent
            title={
              confirm.kind === "publish"
                ? `Publier « ${confirm.service.name} »`
                : `Archiver « ${confirm.service.name} »`
            }
            description={
              confirm.kind === "publish"
                ? "L'offre devient visible sur la page publique avec sa disponibilité actuelle."
                : `L'offre disparaît de la page publique et ne peut plus être modifiée. Les abonnements en cours ne changent pas.${confirm.service.occupancy.occupied ? ` (${confirm.service.occupancy.occupied} place(s) occupée(s).)` : ""}`
            }
            footer={
              <>
                <DialogClose asChild>
                  <Button variant="secondary" disabled={busy}>
                    Retour
                  </Button>
                </DialogClose>
                <Button
                  variant={
                    confirm.kind === "archive" ? "destructive-solid" : "default"
                  }
                  disabled={
                    busy ||
                    (confirm.kind === "publish" && !readiness.data?.deliverable)
                  }
                  onClick={() => void runConfirm()}
                >
                  {busy
                    ? "Enregistrement…"
                    : confirm.kind === "publish"
                      ? "Publier"
                      : "Archiver"}
                </Button>
              </>
            }
          >
            {confirm.kind === "publish" ? (
              <DeliverabilityChecklist
                serviceId={confirm.service.id}
                variants={confirm.service.variants}
                published={false}
              />
            ) : null}
          </DialogContent>
        ) : null}
      </Dialog>
    </AdminPage>
  );
}
