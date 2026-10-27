import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  emailEnabledKey,
  hasRole,
  notificationKinds,
  notificationSettingKeys,
  notificationSettingRegistry,
  privacyPurgeDelayDaysKey,
  reminderDaysKey,
  retentionEmailOutboxDaysKey,
  retentionNotificationsDaysKey,
  retentionProspectInactiveMonthsKey,
  retentionSecurityLogsDaysKey,
  type NotificationSettingDefinition,
  type NotificationSettingKey,
  type NotificationSettings,
} from "@kfit/shared";
import { AdminPage } from "../../app/layout/AdminPage.js";
import { TrustedDevicesCard } from "../../auth/components/TrustedDevicesCard.js";
import { useAuth } from "../../auth/state/auth-context.js";
import { Button } from "../../components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card.js";
import { Field } from "../../components/ui/field.js";
import { Input } from "../../components/ui/input.js";
import { Switch } from "../../components/ui/switch.js";
import { dateTimeFr } from "../../lib/format.js";
import {
  notificationErrorMessage,
  notificationKeys,
  notificationsApi,
} from "../api/notifications-api.js";

const definition = (key: NotificationSettingKey) =>
  notificationSettingRegistry[key] as NotificationSettingDefinition;
const range = (key: NotificationSettingKey) => {
  const d = definition(key);
  return d.type === "integer" ? { min: d.min, max: d.max } : { min: 0, max: 0 };
};
// TEST-01 D4: dev builds only; the chunk is not emitted in production.
const TestDataCard = import.meta.env.DEV
  ? lazy(() =>
      import("../../dev/TestDataCard.js").then((m) => ({
        default: m.TestDataCard,
      })),
    )
  : null;
const hours = Array.from({ length: 24 }, (_, h) => h);

/** S7.3b-2 D9 + RET-01 R8: the privacy keys of the registry, saved with the rest of the page. */
const privacySettings: Array<{
  key: NotificationSettingKey;
  unit: "jours" | "mois";
  hint: string;
}> = [
  {
    key: privacyPurgeDelayDaysKey,
    unit: "jours",
    hint: "Les fichiers d'un client anonymisé sont supprimés définitivement après ce délai.",
  },
  {
    key: retentionEmailOutboxDaysKey,
    unit: "jours",
    hint: "Après ce délai, l'adresse, l'objet et le texte des e-mails envoyés sont effacés. La trace de l'envoi reste.",
  },
  {
    key: retentionNotificationsDaysKey,
    unit: "jours",
    hint: "Les notifications résolues depuis plus longtemps sont supprimées.",
  },
  {
    key: retentionSecurityLogsDaysKey,
    unit: "jours",
    hint: "Les journaux de connexion et d'accès aux liens publics plus anciens sont supprimés. Les créations de comptes et les changements de rôle sont conservés.",
  },
  {
    key: retentionProspectInactiveMonthsKey,
    unit: "mois",
    hint: "Un prospect sans nouvelle demande depuis ce délai apparaît dans la Supervision. L'anonymisation reste manuelle.",
  },
];

function SettingRow({
  id,
  label,
  hint,
  checked,
  disabled,
  onChange,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange?: (value: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-border-subtle py-3.5 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-center gap-4">
        <label htmlFor={id} className="flex flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold">{label}</span>
          {hint ? (
            <span className="text-xs text-muted-foreground">{hint}</span>
          ) : null}
        </label>
        <Switch
          id={id}
          checked={checked}
          disabled={disabled ?? false}
          onCheckedChange={onChange}
        />
      </div>
      {children}
    </div>
  );
}

/**
 * « Réglages » (board 12c). Only the closed typed keys of the S7.2 registry; the server validates every value again.
 * In-app notifications cannot be turned off: they are the operational history of what needs attention.
 */
export function NotificationSettingsPage() {
  const queryClient = useQueryClient();
  // OPS-01b S4: supervision alerts only reach superadmins, so only they see that e-mail toggle.
  const superadmin = hasRole(useAuth().session?.user ?? null, "superadmin");
  const kinds = notificationKinds.filter(
    (kind) => kind !== "supervision_alert" || superadmin,
  );
  const query = useQuery({
    queryKey: notificationKeys.settings,
    queryFn: () => notificationsApi.settings(),
  });
  const [draft, setDraft] = useState<NotificationSettings | null>(null);
  useEffect(() => {
    if (query.data) setDraft(query.data.settings);
  }, [query.data]);

  const changes = useMemo(() => {
    if (!draft || !query.data) return {};
    return Object.fromEntries(
      notificationSettingKeys
        .filter((key) => draft[key] !== query.data.settings[key])
        .map((key) => [key, draft[key]]),
    ) as Partial<NotificationSettings>;
  }, [draft, query.data]);
  const invalid = draft
    ? notificationSettingKeys.some((key) => {
        const d = definition(key),
          value = draft[key];
        return (
          d.type === "integer" &&
          (typeof value !== "number" ||
            !Number.isInteger(value) ||
            value < d.min ||
            value > d.max)
        );
      })
    : false;
  const dirty = Object.keys(changes).length > 0;

  const save = useMutation({
    mutationFn: () => notificationsApi.updateSettings(changes),
    onSuccess: (result) => {
      queryClient.setQueryData(notificationKeys.settings, result);
      toast.success("Réglages enregistrés.");
    },
    onError: (error) => toast.error(notificationErrorMessage(error)),
  });

  const set = (key: NotificationSettingKey, value: boolean | number) =>
    setDraft((current) => (current ? { ...current, [key]: value } : current));
  const emailOn = draft?.["notifications.email.enabled"] === true;

  return (
    <AdminPage
      title="Réglages"
      description="Notifications de l'espace coach : ce qui s'affiche dans l'application et ce qui est envoyé par e-mail."
      actions={
        <>
          <Button
            type="button"
            variant="secondary"
            disabled={!dirty || save.isPending}
            onClick={() => query.data && setDraft(query.data.settings)}
          >
            Annuler
          </Button>
          <Button
            type="button"
            disabled={!dirty || invalid || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </>
      }
    >
      {query.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Chargement…
        </p>
      ) : null}
      {query.isError ? (
        <p role="alert" className="text-sm text-danger">
          {notificationErrorMessage(query.error)}
        </p>
      ) : null}
      {draft ? (
        <div className="grid max-w-3xl gap-5">
          <Card>
            <CardHeader>
              <CardTitle>Dans l'application</CardTitle>
              <CardDescription>
                La cloche affiche ce qui demande une action. Une notification
                disparaît de « À traiter » quand la situation est réglée dans le
                dossier.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SettingRow
                id="in-app"
                label="Notifications dans l'application"
                hint="Toujours activées"
                checked
                disabled
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>E-mails</CardTitle>
              <CardDescription>
                Envoyés aux comptes administrateurs actifs. Ils ne contiennent
                ni montant, ni donnée de santé : seulement le type d'action, le
                nom de la cliente et un lien vers K'FIT.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <SettingRow
                id="email"
                label="Recevoir des e-mails"
                checked={emailOn}
                onChange={(v) => set("notifications.email.enabled", v)}
              />
              <SettingRow
                id="digest"
                label="Résumé quotidien"
                hint="Un seul e-mail par jour avec le nombre d'actions à traiter."
                checked={draft["notifications.daily_digest.enabled"] === true}
                disabled={!emailOn}
                onChange={(v) => set("notifications.daily_digest.enabled", v)}
              >
                {emailOn && draft["notifications.daily_digest.enabled"] ? (
                  <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    Envoyé à
                    <select
                      className="h-8 rounded-sm border border-input bg-card px-2 text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={String(draft["notifications.daily_digest.hour"])}
                      onChange={(event) =>
                        set(
                          "notifications.daily_digest.hour",
                          Number(event.target.value),
                        )
                      }
                    >
                      {hours.map((h) => (
                        <option
                          key={h}
                          value={h}
                        >{`${String(h).padStart(2, "0")}:00`}</option>
                      ))}
                    </select>
                    (heure de Libreville)
                  </label>
                ) : null}
              </SettingRow>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Rappels par type</CardTitle>
              <CardDescription>
                Un e-mail dès qu'une situation apparaît, puis un rappel tant
                qu'elle n'est pas réglée quand un rythme est proposé.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {kinds.map((kind) => {
                const key = emailEnabledKey(kind),
                  daysKey = reminderDaysKey(kind),
                  on = draft[key] === true;
                const days = daysKey ? draft[daysKey] : null,
                  bounds = daysKey ? range(daysKey) : null;
                return (
                  <SettingRow
                    key={kind}
                    id={`kind-${kind}`}
                    label={definition(key).label}
                    checked={on}
                    disabled={!emailOn}
                    onChange={(v) => set(key, v)}
                  >
                    {daysKey && bounds && emailOn && on ? (
                      <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
                        Relancer tous les
                        <input
                          type="number"
                          inputMode="numeric"
                          min={bounds.min}
                          max={bounds.max}
                          step={1}
                          className="h-8 w-16 rounded-sm border border-input bg-card px-2 text-[13px] text-foreground aria-[invalid=true]:border-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          value={Number.isNaN(days) ? "" : String(days)}
                          aria-invalid={
                            typeof days !== "number" ||
                            !Number.isInteger(days) ||
                            days < bounds.min ||
                            days > bounds.max
                          }
                          onChange={(event) =>
                            set(
                              daysKey,
                              event.target.value === ""
                                ? Number.NaN
                                : Number(event.target.value),
                            )
                          }
                        />
                        jours (de {bounds.min} à {bounds.max})
                      </label>
                    ) : null}
                  </SettingRow>
                );
              })}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Confidentialité</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {privacySettings.map(({ key, unit, hint }) => {
                const value = draft[key],
                  bounds = range(key);
                const valid =
                  typeof value === "number" &&
                  Number.isInteger(value) &&
                  value >= bounds.min &&
                  value <= bounds.max;
                return (
                  <Field
                    key={key}
                    label={definition(key).label}
                    hint={hint}
                    error={
                      valid
                        ? undefined
                        : `Saisis un nombre entier de ${unit}, de ${bounds.min} à ${bounds.max}.`
                    }
                  >
                    {(control) => (
                      <Input
                        {...control}
                        type="number"
                        inputMode="numeric"
                        min={bounds.min}
                        max={bounds.max}
                        step={1}
                        className="w-28"
                        value={
                          typeof value === "number" && !Number.isNaN(value)
                            ? String(value)
                            : ""
                        }
                        onChange={(event) =>
                          set(
                            key,
                            event.target.value === ""
                              ? Number.NaN
                              : Number(event.target.value),
                          )
                        }
                      />
                    )}
                  </Field>
                );
              })}
            </CardContent>
          </Card>
          {query.data?.updatedAt ? (
            <p className="text-xs text-muted-foreground">
              Dernière modification : {dateTimeFr(query.data.updatedAt)}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="mt-5 grid max-w-3xl gap-5">
        <TrustedDevicesCard />
      </div>
      {TestDataCard ? (
        <div className="mt-5 grid max-w-3xl gap-5">
          <Suspense fallback={null}>
            <TestDataCard />
          </Suspense>
        </div>
      ) : null}
    </AdminPage>
  );
}
