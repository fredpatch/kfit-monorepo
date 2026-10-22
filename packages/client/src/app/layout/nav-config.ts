import { ClipboardList, Inbox, Layers, MessageCircle, Users, type LucideIcon } from "lucide-react";

export type NavBadgeSource = "followUpsOverdue" | "requestsNew";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Optional live counter shown next to the label. */
  badge?: NavBadgeSource;
  /** Shown in the phone bottom bar (max 3, the rest go under « Plus »). */
  mobile?: boolean;
};

export type NavGroup = { title: string | null; items: NavItem[] };

/**
 * Admin navigation (board 02). Only screens that exist today are listed:
 * « Aujourd'hui » arrives in UX-9, « Abonnements » once a subscription list exists (backlog gap).
 */
export const adminNav: NavGroup[] = [
  { title: "Coaching", items: [{ to: "/admin/suivis", label: "Suivis", icon: MessageCircle, badge: "followUpsOverdue", mobile: true }] },
  { title: "Pipeline", items: [{ to: "/admin/demandes", label: "Demandes", icon: Inbox, badge: "requestsNew", mobile: true }] },
  { title: "Clients", items: [{ to: "/admin/clients", label: "Clients", icon: Users, mobile: true }] },
  {
    title: "Configuration",
    items: [
      { to: "/admin/offres", label: "Catalogue", icon: Layers },
      { to: "/admin/questionnaires", label: "Questionnaires", icon: ClipboardList },
    ],
  },
];

export const allNavItems: NavItem[] = adminNav.flatMap((group) => group.items);
