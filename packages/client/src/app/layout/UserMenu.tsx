import { ChevronDown, LogOut, ShieldCheck } from "lucide-react";
import { useAuth } from "../../auth/state/auth-context.js";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "../../components/ui/dropdown-menu.js";

const roleLabels: Record<string, string> = { admin: "Coach · administratrice" };

/** Replaces the former « Session active » block (board 02): session details live in the account menu. */
export function UserMenu() {
  const auth = useAuth();
  if (!auth.session) return null;
  const { user, session } = auth.session;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu du compte"
        className="flex h-10 items-center gap-2 rounded-full border border-border bg-card py-0 pl-1 pr-2.5 text-sm font-semibold transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-brand-950 text-[13px] font-bold text-lime">
          K
        </span>
        <span className="hidden sm:inline">Mon compte</span>
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-bold text-foreground">{roleLabels[user.role] ?? user.role}</span>
          <span className="flex items-center gap-1.5 font-medium">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {session.freshOtp ? "Vérification récente (OTP)" : "Pas de vérification récente"}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void auth.logout()}>
          <LogOut aria-hidden="true" />
          Se déconnecter
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
