import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, CheckCheck, ClipboardList, FileCheck, FilePen, Flag, Inbox, MessageCircle, Settings, Wallet, X, type LucideIcon } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import type { NotificationItem, NotificationKind, NotificationListView } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { SegmentedControl } from "../../components/ui/segmented-control.js";
import { relativeDaysFr, shortDateFr } from "../../lib/format.js";
import { cn } from "../../lib/utils.js";
import { notificationErrorMessage, notificationKeys, notificationsApi } from "../api/notifications-api.js";

const kindIcons: Record<NotificationKind, LucideIcon> = {
  follow_up_overdue: MessageCircle,
  request_to_contact: Inbox,
  installment_overdue: Wallet,
  payment_proof_pending: FileCheck,
  quote_action_required: FilePen,
  preparation_blocked: ClipboardList,
  completion_due: Flag,
};

/** Shared by the bell badge and the panel: unread unresolved notifications of the session user. */
export function useUnreadNotifications() {
  return useQuery({ queryKey: notificationKeys.unread, queryFn: () => notificationsApi.unreadCount(), refetchInterval: 60_000 });
}

function NotificationRow({ item, onOpen, onRead, reading }: { item: NotificationItem; onOpen: () => void; onRead: (() => void) | null; reading: boolean }) {
  const Icon = kindIcons[item.kind];
  const unread = !item.readAt && !item.resolvedAt;
  return (
    <li className={cn("group relative flex gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-muted", unread && "bg-accent/40")}>
      <span
        aria-hidden="true"
        className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full", item.resolvedAt ? "bg-muted text-muted-foreground" : item.severity === "warning" ? "bg-warning-soft text-warning" : "bg-info-soft text-info")}
      >
        <Icon className="size-[18px]" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* The whole row opens the deep link; the « lu » button stays a separate control for keyboard users. */}
        <Link to={item.deepLink} onClick={onOpen} className="text-sm leading-snug after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">
          <span className={cn(unread ? "font-bold" : "font-semibold")}>{item.title}</span>
          {item.customerDisplayName ? <span className="text-muted-foreground"> · {item.customerDisplayName}</span> : null}
          {unread ? <span className="sr-only"> (non lue)</span> : null}
        </Link>
        <span className="truncate text-[13px] text-muted-foreground">{item.summary}</span>
        <span className="text-xs text-muted-foreground">
          {item.resolvedAt ? `Résolue le ${shortDateFr(item.resolvedAt)}` : `Détectée ${relativeDaysFr(item.firstDetectedAt)}`}
        </span>
      </div>
      {unread ? <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-primary group-hover:hidden" /> : null}
      {onRead ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="relative z-10 hidden shrink-0 group-hover:inline-flex group-focus-within:inline-flex"
          aria-label={`Marquer « ${item.title} » comme lue`}
          disabled={reading}
          onClick={onRead}
        >
          <Check aria-hidden="true" />
        </Button>
      ) : null}
    </li>
  );
}

function NotificationList({ view, onNavigate }: { view: NotificationListView; onNavigate: () => void }) {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: notificationKeys.list(view),
    queryFn: ({ pageParam }) => notificationsApi.list(view, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
  const read = useMutation({
    mutationFn: (id: string) => notificationsApi.read(id),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
    onError: (error) => toast.error(notificationErrorMessage(error)),
  });

  if (query.isPending) return <p role="status" className="px-3 py-6 text-sm text-muted-foreground">Chargement…</p>;
  if (query.isError) return <p role="alert" className="px-3 py-6 text-sm text-danger">{notificationErrorMessage(query.error)}</p>;
  const items = query.data.pages.flatMap((page) => page.items);
  if (!items.length) {
    return view === "active"
      ? <EmptyState className="m-3" title="Rien à traiter" description="Les nouvelles alertes apparaîtront ici dès qu'elles sont détectées." />
      : <EmptyState className="m-3" title="Aucune notification résolue" description="Une notification passe ici quand la situation est réglée dans le dossier." />;
  }
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-1" aria-label={view === "active" ? "Notifications à traiter" : "Notifications résolues"}>
        {items.map((item) => {
          const unread = !item.readAt && !item.resolvedAt;
          return (
            <NotificationRow
              key={item.id}
              item={item}
              reading={read.isPending && read.variables === item.id}
              onRead={unread ? () => read.mutate(item.id) : null}
              onOpen={() => {
                if (unread) read.mutate(item.id);
                onNavigate();
              }}
            />
          );
        })}
      </ul>
      {query.hasNextPage ? (
        <Button type="button" variant="secondary" size="sm" className="mx-3 self-start" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          {query.isFetchingNextPage ? "Chargement…" : "Afficher plus"}
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Notification centre (boards 12 / 12b): bell with the unread badge; panel under the bell on desktop, full-screen sheet on phones.
 * No dismiss: a notification leaves « À traiter » only when its source condition is resolved.
 */
export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<NotificationListView>("active");
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const unread = useUnreadNotifications();
  const count = unread.data?.unread ?? 0;
  const readAll = useMutation({
    mutationFn: () => notificationsApi.readAll(),
    onSuccess: (result) => toast.success(result.updated > 1 ? `${result.updated} notifications marquées comme lues.` : "Notifications marquées comme lues."),
    onError: (error) => toast.error(notificationErrorMessage(error)),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
  });

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
      }}
    >
      <DialogPrimitive.Trigger
        aria-label={count ? `Notifications, ${count} non lue${count > 1 ? "s" : ""}` : "Notifications"}
        className="relative flex size-10 items-center justify-center rounded-full border border-border bg-card transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Bell className="size-[18px]" aria-hidden="true" />
        {count ? (
          <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-danger px-1 text-[11px] font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-brand-950/40 md:bg-transparent" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col bg-card shadow-2xl md:inset-auto md:right-6 md:top-[68px] md:max-h-[min(640px,calc(100dvh-88px))] md:w-[420px] md:rounded-xl md:border md:border-border"
        >
          <div className="flex items-center gap-2 border-b border-border-subtle px-4 pb-3 pt-[max(env(safe-area-inset-top),16px)] md:pt-4">
            <DialogPrimitive.Title className="flex-1 text-lg font-extrabold tracking-tight">Notifications</DialogPrimitive.Title>
            <Button type="button" variant="ghost" size="sm" disabled={!count || readAll.isPending} onClick={() => readAll.mutate()}>
              <CheckCheck aria-hidden="true" />
              Tout marquer comme lu
            </Button>
            <DialogPrimitive.Close className="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-muted transition-colors hover:bg-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <X className="size-4" aria-hidden="true" />
              <span className="sr-only">Fermer</span>
            </DialogPrimitive.Close>
          </div>
          <div className="px-4 pt-3">
            <SegmentedControl
              aria-label="Afficher"
              value={view}
              onValueChange={setView}
              options={[
                { value: "active", label: count ? `À traiter · ${count}` : "À traiter" },
                { value: "resolved", label: "Résolues" },
              ]}
            />
          </div>
          <div className="flex-1 overflow-y-auto px-1 py-2">
            <NotificationList key={view} view={view} onNavigate={() => setOpen(false)} />
          </div>
          <div className="border-t border-border-subtle px-4 py-3 pb-[max(env(safe-area-inset-bottom),12px)]">
            <Button
              type="button"
              variant="link"
              size="sm"
              onClick={() => {
                setOpen(false);
                void navigate("/admin/reglages");
              }}
            >
              <Settings aria-hidden="true" />
              Réglages des notifications
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
