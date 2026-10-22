import { useState } from "react";
import { toast } from "sonner";
import { MessageCircle, MoreHorizontal, Plus } from "lucide-react";
import { Button } from "../components/ui/button.js";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../components/ui/card.js";
import { Field } from "../components/ui/field.js";
import { Input, NativeSelect, Textarea } from "../components/ui/input.js";
import { Switch } from "../components/ui/switch.js";
import { SegmentedControl } from "../components/ui/segmented-control.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs.js";
import { Dialog, DialogClose, DialogContent, DialogTrigger, Sheet, SheetClose, SheetContent, SheetTrigger } from "../components/ui/dialog.js";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "../components/ui/dropdown-menu.js";
import { Tooltip } from "../components/ui/tooltip.js";
import { Avatar } from "../components/ui/avatar.js";
import { EmptyState } from "../components/ui/empty-state.js";
import { StatusPill } from "../components/ui/status-pill.js";
import { appointmentStatus, cadenceState, requestStatus, subscriptionStatus, type StatusDescriptor } from "../lib/status-map.js";
import { familyMeta, offerFamilies } from "../lib/families.js";

/** DEV-only visual check of UX-1 primitives. Reachable at /__ui in `npm run dev`; excluded from production builds. */
export function UiGallery() {
  const [availability, setAvailability] = useState<"open" | "waitlist" | "closed">("waitlist");
  const [visible, setVisible] = useState(true);

  const groups: Array<[string, StatusDescriptor[]]> = [
    ["Demandes", Object.values(requestStatus)],
    ["Abonnements", Object.values(subscriptionStatus)],
    ["Rendez-vous", Object.values(appointmentStatus)],
    ["Cadence", Object.values(cadenceState)],
  ];

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10 sm:px-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs font-bold uppercase tracking-widest text-primary">UX-1 · Fondation</p>
        <h1 className="text-4xl font-extrabold tracking-tight">Galerie des composants</h1>
        <p className="text-muted-foreground">Page de contrôle visuel, disponible uniquement en développement.</p>
      </header>

      <Card>
        <CardTitle>Boutons</CardTitle>
        <div className="flex flex-wrap items-center gap-3">
          <Button>Enregistrer</Button>
          <Button variant="secondary">Secondaire</Button>
          <Button variant="ghost">Discret</Button>
          <Button variant="destructive">Annuler l'abonnement</Button>
          <Button variant="whatsapp">
            <MessageCircle />
            WhatsApp
          </Button>
          <Tooltip content="Plus d'actions">
            <Button variant="secondary" size="icon" aria-label="Plus d'actions">
              <MoreHorizontal />
            </Button>
          </Tooltip>
          <Button disabled>Désactivé</Button>
          <Button size="sm" variant="secondary">
            Petit
          </Button>
        </div>
      </Card>

      <Card>
        <CardTitle>Statuts</CardTitle>
        {groups.map(([label, items]) => (
          <div key={label} className="flex flex-wrap items-center gap-3">
            <span className="w-32 text-[13px] font-bold">{label}</span>
            <div className="flex flex-1 flex-wrap gap-2">
              {items.map((status) => (
                <StatusPill key={status.label} status={status} />
              ))}
            </div>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <span className="w-32 text-[13px] font-bold">Familles</span>
          {offerFamilies.map((family) => (
            <span key={family} className="inline-flex items-center gap-2 text-[13px] font-semibold">
              <span className={`size-2.5 rounded-[3px] ${familyMeta[family].dotClass}`} />
              {familyMeta[family].label}
            </span>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardTitle>Champs</CardTitle>
          <Field label="Nom complet">{(p) => <Input {...p} defaultValue="Mireille Ndong" />}</Field>
          <Field label="Numéro WhatsApp" error="Numéro incomplet — format international attendu.">
            {(p) => <Input {...p} type="tel" defaultValue="+241 07 12" />}
          </Field>
          <Field label="Pays">
            {(p) => (
              <NativeSelect {...p} defaultValue="Gabon">
                <option>Gabon</option>
                <option>Cameroun</option>
                <option>Afrique du Sud</option>
              </NativeSelect>
            )}
          </Field>
          <Field label="Message" optionalHint="(facultatif)" hint="Visible uniquement par la coach.">
            {(p) => <Textarea {...p} />}
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">Disponibilité</span>
            <SegmentedControl
              aria-label="Disponibilité"
              value={availability}
              onValueChange={setAvailability}
              options={[
                { value: "open", label: "Ouverte" },
                { value: "waitlist", label: "Liste d'attente" },
                { value: "closed", label: "Fermée" },
              ]}
            />
          </div>
          <label className="flex items-center justify-between gap-3 text-[13px] font-semibold">
            Visible sur la page publique
            <Switch checked={visible} onCheckedChange={setVisible} />
          </label>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-1">
              <CardTitle>Carte et liste</CardTitle>
              <CardDescription>Ligne client, état vide, menu « ⋯ ».</CardDescription>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon-sm" aria-label="Actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>Modifier la fiche</DropdownMenuItem>
                <DropdownMenuItem>Nouvel abonnement</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive>Archiver</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </CardHeader>
          <CardContent>
            {[
              ["Mireille Ndong", "Coaching nutrition · Standard", subscriptionStatus.active],
              ["Arnaud Mba", "Programme sportif 12 semaines", cadenceState.overdue],
              ["Sandrine Obiang", "Pilates · début le 29 oct.", subscriptionStatus.onboarding],
            ].map(([name, meta, status]) => (
              <div key={name as string} className="flex items-center gap-3 rounded-lg border border-border-subtle p-3">
                <Avatar name={name as string} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-bold">{name as string}</span>
                  <span className="truncate text-xs text-muted-foreground">{meta as string}</span>
                </div>
                <StatusPill status={status as StatusDescriptor} />
              </div>
            ))}
            <EmptyState title="Aucun suivi en retard" description="Un message clair + une action si utile." />
          </CardContent>
          <CardFooter>
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="destructive">Annuler l'abonnement</Button>
              </DialogTrigger>
              <DialogContent
                title="Annuler l'abonnement ?"
                description="Cette décision est enregistrée dans l'historique et ne peut pas être annulée."
                footer={
                  <>
                    <DialogClose asChild>
                      <Button variant="secondary">Retour</Button>
                    </DialogClose>
                    <Button variant="destructive-solid" onClick={() => toast.success("Abonnement annulé (démo).")}>
                      Confirmer l'annulation
                    </Button>
                  </>
                }
              />
            </Dialog>
            <Sheet>
              <SheetTrigger asChild>
                <Button>
                  <Plus />
                  Nouveau client
                </Button>
              </SheetTrigger>
              <SheetContent
                title="Nouveau client"
                description="Le numéro WhatsApp est vérifié d'abord pour éviter les doublons."
                footer={
                  <>
                    <SheetClose asChild>
                      <Button variant="secondary">Annuler</Button>
                    </SheetClose>
                    <Button onClick={() => toast.success("Fiche créée (démo).")}>Créer la fiche</Button>
                  </>
                }
              >
                <Field label="Numéro WhatsApp">{(p) => <Input {...p} type="tel" />}</Field>
                <Field label="Nom complet">{(p) => <Input {...p} />}</Field>
              </SheetContent>
            </Sheet>
          </CardFooter>
        </Card>
      </div>

      <Card>
        <Tabs defaultValue="apercu">
          <TabsList aria-label="Sections de la fiche">
            <TabsTrigger value="apercu">Aperçu</TabsTrigger>
            <TabsTrigger value="rdv" badge={5}>
              Rendez-vous
            </TabsTrigger>
            <TabsTrigger value="historique">Historique</TabsTrigger>
          </TabsList>
          <TabsContent value="apercu">Contenu de l'aperçu.</TabsContent>
          <TabsContent value="rdv">Liste des rendez-vous.</TabsContent>
          <TabsContent value="historique">Historique des décisions.</TabsContent>
        </Tabs>
      </Card>
    </main>
  );
}
