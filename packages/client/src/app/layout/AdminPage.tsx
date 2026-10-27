import { useEffect, type ReactNode } from "react";

type AdminPageProps = {
  title: string;
  /** Small trail above the title, e.g. Clients / Grâce Moussavou. */
  breadcrumb?: ReactNode;
  description?: string;
  actions?: ReactNode;
  /** Extra row under the title (sub-navigation, filters). */
  toolbar?: ReactNode;
  children: ReactNode;
};

/** Page heading + content. One h1 per screen; sets the browser tab title. */
export function AdminPage({
  title,
  breadcrumb,
  description,
  actions,
  toolbar,
  children,
}: AdminPageProps) {
  useEffect(() => {
    document.title = `${title} · K'FIT`;
  }, [title]);

  return (
    <div className="flex flex-col gap-5">
      {breadcrumb ? <div className="-mb-2">{breadcrumb}</div> : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-[28px] font-extrabold leading-tight tracking-tight">
            {title}
          </h1>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {toolbar}
      {children}
    </div>
  );
}
