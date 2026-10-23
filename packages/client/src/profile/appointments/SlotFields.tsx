import { useState } from "react";
import { Input } from "../../components/ui/input.js";
import { Field } from "../../components/ui/field.js";
import { cn } from "../../lib/utils.js";
import { fromLocalInput, toLocalInput } from "../../lib/format.js";

/**
 * Start / end of a slot in Libreville time (UX-14, Fred 2026-10-23): the coach still types the end,
 * and a duration suggestion fills it — 1 h by default until the coach edits the end herself.
 */
const durations = [45, 60, 90] as const;
const durationLabel = (m: number) => (m === 60 ? "1 h" : m === 90 ? "1 h 30" : `${m} min`);

export type Slot = { start: string; end: string; location: string };

export function addMinutes(local: string, minutes: number): string {
  const iso = fromLocalInput(local);
  return iso ? toLocalInput(new Date(Date.parse(iso) + minutes * 60_000)) : "";
}

export function SlotFields({ value, onChange }: { value: Slot; onChange: (next: Slot) => void }) {
  const [endTouched, setEndTouched] = useState(Boolean(value.end));
  const startIso = fromLocalInput(value.start), endIso = fromLocalInput(value.end);
  const minutes = startIso && endIso ? Math.round((Date.parse(endIso) - Date.parse(startIso)) / 60_000) : null;
  const endError = minutes !== null && minutes <= 0 ? "La fin doit être après le début." : undefined;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Début (Libreville)">
          {(p) => <Input {...p} required type="datetime-local" value={value.start} onChange={(e) => onChange({ ...value, start: e.target.value, end: endTouched ? value.end : addMinutes(e.target.value, 60) })} />}
        </Field>
        <Field label="Fin (Libreville)" error={endError}>
          {(p) => <Input {...p} required type="datetime-local" value={value.end} onChange={(e) => { setEndTouched(true); onChange({ ...value, end: e.target.value }); }} />}
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Durée suggérée">
        <span className="text-xs font-semibold text-muted-foreground">Durée suggérée :</span>
        {durations.map((d) => (
          <button
            key={d}
            type="button"
            disabled={!value.start}
            aria-pressed={minutes === d}
            onClick={() => { setEndTouched(true); onChange({ ...value, end: addMinutes(value.start, d) }); }}
            className={cn("h-8 rounded-md border px-2.5 text-[13px] font-semibold transition-colors disabled:opacity-50", minutes === d ? "border-primary bg-brand-50 text-primary" : "border-input bg-card hover:bg-muted")}
          >
            {durationLabel(d)}
          </button>
        ))}
      </div>
      <Field label="Lieu ou canal" optionalHint="(facultatif)">
        {(p) => <Input {...p} maxLength={300} value={value.location} placeholder="Ex. : salle K'FIT, visio, domicile" onChange={(e) => onChange({ ...value, location: e.target.value })} />}
      </Field>
    </div>
  );
}
