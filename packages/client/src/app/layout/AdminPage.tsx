import { useEffect, type MouseEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";

type AdminPageProps = {
  title: string;
  /** Small trail above the title, e.g. Clients / Grâce Moussavou. */
  breadcrumb?: ReactNode;
  description?: string;
  actions?: ReactNode;
  /** Extra row under the title (sub-navigation, filters). */
  toolbar?: ReactNode;
  /** Screens not rebuilt yet render inside the scoped legacy stylesheet. */
  legacy?: boolean;
  children: ReactNode;
};

/** Page heading + content. One h1 per screen; sets the browser tab title. */
export function AdminPage({ title, breadcrumb, description, actions, toolbar, legacy = false, children }: AdminPageProps) {

  useEffect(() => {
    document.title = `${title} · K'FIT`;
  }, [title]);

  return (
    <div className="flex flex-col gap-5">
      {breadcrumb ? <div className="-mb-2">{breadcrumb}</div> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">{title}</h1>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {toolbar}
      {legacy ? <LegacyEmbed>{children}</LegacyEmbed> : children}
    </div>
  );
}

/**
 * Wraps a screen not rebuilt yet: scoped legacy styles, and its plain <a href="/admin/..."> links
 * are routed client-side instead of reloading the app.
 */
export function LegacyEmbed({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  function interceptLegacyLinks(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest("a");
    const href = anchor?.getAttribute("href");
    if (!anchor || !href || !href.startsWith("/admin") || anchor.target) return;
    event.preventDefault();
    void navigate(href);
  }
  return (
    <div className="legacy legacy-embedded" onClick={interceptLegacyLinks}>
      {children}
    </div>
  );
}
