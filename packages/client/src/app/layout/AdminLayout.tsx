import { Suspense } from "react";
import { MoreHorizontal } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { cn } from "../../lib/utils.js";
import { useAuth } from "../../auth/state/auth-context.js";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../../components/ui/dropdown-menu.js";
import { adminNav, allNavItems, type NavItem } from "./nav-config.js";
import { useNavBadges } from "./use-nav-badges.js";
import { UserMenu } from "./UserMenu.js";

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-2 py-1">
      <span aria-hidden="true" className="flex size-[34px] items-center justify-center rounded-[10px] bg-lime text-[15px] font-extrabold text-brand-950">
        K
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-base font-extrabold tracking-tight text-white">K'FIT</span>
        <span className="text-[11px] text-sidebar-muted">Espace coach</span>
      </span>
    </div>
  );
}

function CountBadge({ value, hot }: { value: number | null; hot: boolean }) {
  if (!value) return null;
  return (
    <span className={cn("flex h-5 min-w-[22px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold", hot ? "bg-lime text-brand-950" : "bg-white/12 text-brand-100")}>
      {value}
    </span>
  );
}

function Sidebar({ badges }: { badges: ReturnType<typeof useNavBadges> }) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-6 overflow-y-auto bg-sidebar px-3.5 py-5 md:flex">
      <Brand />
      <nav aria-label="Navigation principale" className="flex flex-col gap-4">
        {adminNav.map((group) => (
          <div key={group.title ?? "root"} className="flex flex-col gap-0.5">
            {group.title ? <span className="px-2.5 pb-1.5 text-[11px] font-bold uppercase tracking-[0.08em] text-sidebar-muted">{group.title}</span> : null}
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    "flex h-[38px] items-center gap-2.5 rounded-[10px] px-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime",
                    isActive ? "bg-sidebar-active font-bold text-white" : "font-medium text-sidebar-foreground hover:bg-white/5 hover:text-white",
                  )
                }
              >
                <item.icon className="size-[18px]" aria-hidden="true" />
                <span className="flex-1">{item.label}</span>
                {item.badge ? <CountBadge value={badges[item.badge]} hot={item.badge === "followUpsOverdue"} /> : null}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}

function MobileTab({ item, badge }: { item: NavItem; badge: number | null }) {
  return (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        cn("flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", isActive ? "font-bold text-primary" : "font-semibold text-muted-foreground")
      }
    >
      <span className="relative flex">
        <item.icon className="size-[22px]" aria-hidden="true" />
        {badge ? <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{badge}</span> : null}
      </span>
      {item.label}
    </NavLink>
  );
}

/** Phone navigation (board 04b): primary screens as tabs, the rest under « Plus ». */
function MobileNav({ badges }: { badges: ReturnType<typeof useNavBadges> }) {
  const navigate = useNavigate();
  const auth = useAuth();
  const primary = allNavItems.filter((item) => item.mobile);
  const more = allNavItems.filter((item) => !item.mobile);

  return (
    <nav aria-label="Navigation principale" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card px-1 pb-[max(env(safe-area-inset-bottom),8px)] pt-1.5 md:hidden">
      {primary.map((item) => (
        <MobileTab key={item.to} item={item} badge={item.badge ? badges[item.badge] : null} />
      ))}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex min-h-12 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <MoreHorizontal className="size-[22px]" aria-hidden="true" />
          Plus
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end">
          {more.map((item) => (
            <DropdownMenuItem key={item.to} onSelect={() => void navigate(item.to)}>
              <item.icon aria-hidden="true" />
              {item.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void auth.logout()}>Se déconnecter</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </nav>
  );
}

/** Admin frame (board 02): dark sidebar on desktop, top bar with account menu, bottom tabs on phones. */
export function AdminLayout() {
  const badges = useNavBadges();

  return (
    <div className="flex min-h-dvh bg-background">
      <Sidebar badges={badges} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-card/95 px-4 backdrop-blur sm:px-8">
          <span className="flex items-center gap-2 md:hidden">
            <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-[9px] bg-brand-950 text-sm font-extrabold text-lime">
              K
            </span>
            <span className="font-extrabold tracking-tight">K'FIT</span>
          </span>
          <div className="flex-1" />
          <UserMenu />
        </header>
        <main className="w-full max-w-[1240px] flex-1 px-4 pb-28 pt-6 sm:px-8 md:pb-12">
          <Suspense fallback={<p role="status" className="text-sm text-muted-foreground">Chargement…</p>}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <MobileNav badges={badges} />
    </div>
  );
}
