import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { TrustedDeviceSummary } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card.js";
import {
  Dialog,
  DialogClose,
  DialogContent,
} from "../../components/ui/dialog.js";
import { EmptyState } from "../../components/ui/empty-state.js";
import { Pill } from "../../components/ui/status-pill.js";
import { dateFr, dateTimeFr } from "../../lib/format.js";
import { authApiClient } from "../api/auth-api.js";
import { authFailureOf, commonAuthMessage } from "../api/auth-errors.js";

const devicesKey = ["auth", "devices"] as const;

type Pending = { kind: "one"; device: TrustedDeviceSummary } | { kind: "all" };

/** SEC-02b A4: every signed-in user manages their own trusted browsers. Removing trust never ends the current session. */
export function TrustedDevicesCard() {
  const queryClient = useQueryClient();
  const devices = useQuery({
    queryKey: devicesKey,
    queryFn: () => authApiClient.listTrustedDevices(),
  });
  const [pending, setPending] = useState<Pending | null>(null);

  const revoke = useMutation({
    mutationFn: async (target: Pending): Promise<void> => {
      if (target.kind === "all") await authApiClient.revokeAllTrustedDevices();
      else await authApiClient.revokeTrustedDevice(target.device.id);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: devicesKey }),
    onSuccess: () => setPending(null),
    onError: (error) => {
      const failure = authFailureOf(error);
      // Already removed (another tab, a password reset): the refreshed list is the answer.
      if (failure.code === "AUTH_DEVICE_NOT_FOUND") return setPending(null);
      toast.error(commonAuthMessage(failure));
    },
  });

  const list = devices.data?.devices ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appareils de confiance</CardTitle>
        <CardDescription>
          Ces navigateurs se connectent sans code pendant 30 jours.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {devices.isError ? (
          <p role="status" className="text-sm text-danger">
            {commonAuthMessage(authFailureOf(devices.error))}
          </p>
        ) : null}
        {devices.isSuccess && list.length === 0 ? (
          <EmptyState
            title="Aucun appareil de confiance."
            description="Coche « Faire confiance à cet appareil » à ta prochaine connexion pour ne plus saisir de code sur ce navigateur."
          />
        ) : null}
        {list.length ? (
          <ul className="flex flex-col divide-y divide-border">
            {list.map((device) => (
              <li
                key={device.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {device.label ?? "Appareil"}
                    {device.current ? (
                      <Pill tone="success" size="sm">
                        Cet appareil
                      </Pill>
                    ) : null}
                  </span>
                  <span className="text-[13px] text-muted-foreground">
                    Utilisé le {dateTimeFr(device.lastUsedAt)} · Confiance
                    jusqu'au {dateFr(device.trustedUntil)}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="self-start sm:self-auto"
                  onClick={() => setPending({ kind: "one", device })}
                >
                  Retirer
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        {list.length ? (
          <Button
            type="button"
            variant="secondary"
            className="self-start"
            onClick={() => setPending({ kind: "all" })}
          >
            Tout retirer
          </Button>
        ) : null}
      </CardContent>
      <Dialog
        open={pending !== null}
        onOpenChange={(open) =>
          !open && !revoke.isPending ? setPending(null) : undefined
        }
      >
        {pending ? (
          <DialogContent
            title={
              pending.kind === "all"
                ? "Retirer tous les appareils"
                : `Retirer « ${pending.device.label ?? "Appareil"} »`
            }
            description={
              pending.kind === "all"
                ? "Chaque navigateur te redemandera un code à sa prochaine connexion. Ta session actuelle reste ouverte."
                : "Ce navigateur te redemandera un code à sa prochaine connexion. Ta session actuelle reste ouverte."
            }
            footer={
              <>
                <DialogClose asChild>
                  <Button variant="secondary" disabled={revoke.isPending}>
                    Annuler
                  </Button>
                </DialogClose>
                <Button
                  variant="destructive-solid"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(pending)}
                >
                  {revoke.isPending
                    ? "Retrait…"
                    : pending.kind === "all"
                      ? "Tout retirer"
                      : "Retirer"}
                </Button>
              </>
            }
          />
        ) : null}
      </Dialog>
    </Card>
  );
}
