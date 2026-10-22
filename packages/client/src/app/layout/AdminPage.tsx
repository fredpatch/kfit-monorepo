import { useEffect, type MouseEvent, type ReactNode } from "react";
import { useNavigate } from "react-router";

type AdminPageProps = {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Extra row under the title (sub-navigation, filters). */
  toolbar?: ReactNode;
  /** Screens not rebuilt yet render inside the scoped legacy stylesheet. */
  legacy?: boolean;
  children: ReactNode;
};

/** Page heading + content. One h1 per screen; sets the browser tab title. */
export function AdminPage({ title, description, actions, toolbar, legacy = false, children }: AdminPageProps) {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = `${title} · K'FIT`;
  }, [title]);

  // Legacy screens use plain <a href="/admin/..."> links: route them client-side instead of reloading the app.
  function interceptLegacyLinks(event: MouseEvent<HTMLDivElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest("a");
    const href = anchor?.getAttribute("href");
    if (!anchor || !href || !href.startsWith("/admin") || anchor.target) return;
    event.preventDefault();
    void navigate(href);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">{title}</h1>
          {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {toolbar}
      {legacy ? (
        <div className="legacy legacy-embedded" onClick={interceptLegacyLinks}>
          {children}
        </div>
      ) : (
        children
      )}
    </div>
  );
}
