import type { ReactNode } from "react";

/**
 * Board 09 layout: brand panel + form panel. The brand panel is text-only until brand assets
 * (logo, coach photo) are delivered — no placeholder labels in production. Hidden below lg.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      <section aria-hidden="true" className="hidden flex-1 flex-col justify-between gap-8 bg-sidebar px-12 py-10 lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex size-10 items-center justify-center rounded-xl bg-lime text-[17px] font-extrabold text-brand-950">K</span>
          <span className="text-xl font-extrabold tracking-tight text-white">K'FIT</span>
        </div>
        <div className="flex max-w-md flex-col gap-4">
          <p className="text-[40px] font-extrabold leading-[1.1] tracking-tight text-white">Ton espace coach, prêt pour la journée.</p>
          <p className="text-base leading-relaxed text-sidebar-foreground">Suivis, rendez-vous, demandes et préparation de tes clientes au même endroit.</p>
        </div>
        <p className="text-xs text-sidebar-muted">Accès réservé à l'équipe K'FIT.</p>
      </section>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
        <div className="flex w-full max-w-[400px] flex-col gap-6">
          <div className="flex items-center gap-2 lg:hidden">
            <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-[9px] bg-brand-950 text-sm font-extrabold text-lime">K</span>
            <span className="font-extrabold tracking-tight">K'FIT</span>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

export function AuthHeading({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">{title}</h1>
      {description ? <p className="text-[15px] leading-relaxed text-muted-foreground">{description}</p> : null}
    </div>
  );
}

/** Form-level error (not tied to one field). */
export function AuthAlert({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-danger/30 bg-danger-soft px-3 py-2.5 text-[13px] font-medium text-danger">
      {message}
    </p>
  );
}
