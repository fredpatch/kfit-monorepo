import { useLayoutEffect, type ReactNode } from "react";
import { cn } from "../../lib/utils.js";
import { Button } from "../ui/button.js";

/**
 * Bearer-token pages must not leak their URL through the Referer header (S5.5/S6 rule).
 * One shared hook instead of a copy in every public page.
 */
export function useNoReferrer() {
  useLayoutEffect(() => {
    const existing = document.querySelector<HTMLMetaElement>('meta[name="referrer"]');
    const meta = existing ?? document.createElement("meta");
    const previous = meta.content;
    meta.name = "referrer";
    meta.content = "no-referrer";
    if (!existing) document.head.appendChild(meta);
    return () => {
      if (existing) meta.content = previous;
      else meta.remove();
    };
  }, []);
}

type PublicShellProps = {
  /** Right side of the header: the document number or the page kind (boards 11b–11h). */
  tag?: ReactNode;
  children: ReactNode;
  /** Sticky bottom bar: one main action, within thumb reach. */
  actions?: ReactNode;
  className?: string;
};

/**
 * Shared customer-page layout (UX-12, boards 11b–11h): brand left, reference right,
 * scrolling content, sticky action bar. Mobile-first; centred column on larger screens.
 */
export function PublicShell({ tag, children, actions, className }: PublicShellProps) {
  useNoReferrer();
  return (
    <div className="min-h-dvh bg-background text-foreground sm:py-8">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background sm:min-h-0 sm:overflow-hidden sm:rounded-2xl sm:border sm:border-border sm:shadow-sm">
        <header className="flex items-center gap-2.5 p-4">
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-[10px] bg-brand-950 text-[13px] font-extrabold text-lime">K</span>
          <span className="flex-1 text-[15px] font-extrabold">K'FIT</span>
          {tag ? <span className="text-xs text-muted-foreground tabular-nums">{tag}</span> : null}
        </header>
        <main className={cn("flex flex-1 flex-col gap-4 px-5 pb-6 pt-1", className)}>{children}</main>
        {actions ? <div className="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-card px-4 pb-5 pt-3">{actions}</div> : null}
      </div>
    </div>
  );
}

export function PublicTitle({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <h1 id={id} tabIndex={-1} className="text-[26px] font-extrabold leading-tight tracking-tight focus:outline-none">
      {children}
    </h1>
  );
}

/** White card used for the content blocks of every customer page. */
export function PublicCard({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("flex flex-col gap-3 rounded-[18px] border border-border bg-card p-4", className)}>{children}</section>;
}

/** Small print at the bottom of the content: link privacy, who to contact. */
export function PublicNote({ children }: { children: ReactNode }) {
  return <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>;
}

/** Loading and unavailable states shared by all token pages. */
export function PublicLoading({ label, tag }: { label: string; tag?: ReactNode }) {
  return (
    <PublicShell tag={tag}>
      <p role="status" className="text-sm text-muted-foreground">{label}</p>
    </PublicShell>
  );
}

export function PublicUnavailable({ title, message, onRetry, tag }: { title: string; message: string; onRetry?: () => void; tag?: ReactNode }) {
  return (
    <PublicShell tag={tag}>
      <PublicTitle>{title}</PublicTitle>
      <p role="alert" className="text-[15px] leading-relaxed text-muted-foreground">{message}</p>
      {onRetry ? (
        <Button variant="secondary" className="self-start" onClick={onRetry}>
          Réessayer
        </Button>
      ) : null}
      <PublicNote>Si le lien a expiré, demande un nouveau lien à ton coach.</PublicNote>
    </PublicShell>
  );
}

/** Amounts on customer pages are shown in FCFA (Fred 2026-10-23; admin stays XAF). */
export function moneyFcfa(value: number): string {
  return `${value.toLocaleString("fr-FR")} FCFA`;
}

/** Primary action button for the sticky bar. */
export const publicPrimaryClass = "h-[52px] w-full rounded-[14px] text-base font-bold";
