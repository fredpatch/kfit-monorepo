import { ClipboardList, FileCheck, Inbox, Layers, MessageCircle, Settings, Sun, Users, type LucideIcon } from "lucide-react";

export type NavBadgeSource = "followUpsOverdue" | "requestsNew" | "todayTasks";

export type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Optional live counter shown next to the label. */
  badge?: NavBadgeSource;
  /** Shown in the phone bottom bar (max 3, the rest go under « Plus »). */
  mobile?: boolean;
  /** Active only on this exact path (the /admin home). */
  end?: boolean;
};

export type NavGroup = { title: string | null; items: NavItem[] };

/**
 * Admin navigation (board 02). Only screens that exist today are listed;
 * « Abonnements » and « Agenda » come once their screens exist (backlog).
 */
export const adminNav: NavGroup[] = [
  { title: null, items: [{ to: "/admin", label: "Aujourd'hui", icon: Sun, badge: "todayTasks", mobile: true, end: true }] },
  { title: "Coaching", items: [{ to: "/admin/suivis", label: "Suivis", icon: MessageCircle, badge: "followUpsOverdue" }] },
  { title: "Pipeline", items: [{ to: "/admin/demandes", label: "Demandes", icon: Inbox, badge: "requestsNew", mobile: true }] },
  { title: "Clients", items: [{ to: "/admin/clients", label: "Clients", icon: Users, mobile: true }] },
  {
    title: "Configuration",
    items: [
      { to: "/admin/offres", label: "Catalogue", icon: Layers },
      { to: "/admin/questionnaires", label: "Questionnaires", icon: ClipboardList },
      { to: "/admin/consentements", label: "Textes de consentement", icon: FileCheck },
      { to: "/admin/reglages", label: "Réglages", icon: Settings },
    ],
  },
];

export const allNavItems: NavItem[] = adminNav.flatMap((group) => group.items);
