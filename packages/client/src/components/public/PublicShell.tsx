import { useLayoutEffect, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
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
  /** Step flows (board 11b): back button before the brand. */
  onBack?: () => void;
  backLabel?: string;
  /** Step flows: progress bar under the header, 0 to 1. */
  progress?: number;
  /** Replaces "K'FIT" next to the mark, e.g. "K'FIT · Bilan santé". */
  title?: ReactNode;
};

/**
 * Shared customer-page layout (UX-12, boards 11b–11h): brand left, reference right,
 * scrolling content, sticky action bar. Mobile-first; centred column on larger screens.
 */
export function PublicShell({ tag, children, actions, className, onBack, backLabel = "Étape précédente", progress, title }: PublicShellProps) {
  useNoReferrer();
  return (
    <div className="min-h-dvh bg-background text-foreground sm:py-8">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-background sm:min-h-0 sm:overflow-hidden sm:rounded-2xl sm:border sm:border-border sm:shadow-sm">
        <header className="flex flex-col gap-3 p-4">
          <div className="flex items-center gap-2.5">
            {onBack ? (
              <button type="button" onClick={onBack} aria-label={backLabel} className="-ml-1 flex size-11 shrink-0 items-center justify-center rounded-xl bg-card text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <ArrowLeft aria-hidden="true" className="size-5" />
              </button>
            ) : (
              <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-[10px] bg-brand-950 text-[13px] font-extrabold text-lime">K</span>
            )}
            <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold">{title ?? "K'FIT"}</span>
            {tag ? <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{tag}</span> : null}
          </div>
          {progress !== undefined ? (
            <div role="progressbar" aria-label="Progression" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} className="h-1.5 overflow-hidden rounded-full bg-border">
              <div className="h-1.5 rounded-full bg-primary transition-[width] motion-reduce:transition-none" style={{ width: `${Math.round(Math.min(1, Math.max(0, progress)) * 100)}%` }} />
            </div>
          ) : null}
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

/**
 * Large radio or checkbox card (boards 11b–11d). A native input stays in the label, visually hidden,
 * so keyboard, screen readers and form semantics keep working.
 */
export function PublicChoice({ type = "radio", name, checked, onChange, disabled, label, hint, className }: {
  type?: "radio" | "checkbox"; name: string; checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean;
  label: ReactNode; hint?: ReactNode; className?: string;
}) {
  return (
    <label className={cn(
      "flex min-h-14 cursor-pointer items-center gap-3 rounded-[14px] border bg-card px-4 py-3 text-left has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60",
      checked ? "border-[1.5px] border-primary bg-accent" : "border-input",
      className,
    )}>
      <input type={type} name={name} checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="sr-only" />
      <span aria-hidden="true" className={cn("flex size-5 shrink-0 items-center justify-center border-2", type === "radio" ? "rounded-full" : "rounded-md", checked ? "border-primary bg-primary" : "border-input bg-card")}>
        {checked ? <span className={cn("bg-white", type === "radio" ? "size-2 rounded-full" : "h-2.5 w-1.5 -translate-y-px rotate-45 border-b-2 border-r-2 border-white bg-transparent")} /> : null}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-bold">{label}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  );
}

/** Primary action button for the sticky bar. */
export const publicPrimaryClass = "h-[52px] w-full rounded-[14px] text-base font-bold";
