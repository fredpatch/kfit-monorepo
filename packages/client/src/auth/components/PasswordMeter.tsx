import { Check, Circle } from "lucide-react";
import { authPasswordStrength, checkAuthPasswordRules } from "@kfit/shared";
import { cn } from "../../lib/utils.js";

const levels = [
  { label: "Insuffisant", bar: "bg-danger", text: "text-danger" },
  { label: "Correct", bar: "bg-warning", text: "text-warning" },
  { label: "Bon", bar: "bg-primary", text: "text-primary" },
  { label: "Excellent", bar: "bg-success", text: "text-success" },
] as const;

/**
 * Password meter (UX-10). The three required rules come from @kfit/shared (same as the server);
 * the strength level is advisory only. Shown before typing so the rules are known upfront.
 */
export function PasswordMeter({
  password,
  id,
}: {
  password: string;
  id?: string;
}) {
  const checks = checkAuthPasswordRules(password);
  const strength = authPasswordStrength(password);
  const level = levels[strength];
  // Bars filled: one red bar while rules fail, then 1-3 by advisory strength.
  const filled = password ? Math.max(strength, 1) : 0;

  return (
    <div id={id} className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3">
        <div className="grid flex-1 grid-cols-3 gap-1.5" aria-hidden="true">
          {[1, 2, 3].map((step) => (
            <span
              key={step}
              className={cn(
                "h-1.5 rounded-full transition-colors motion-reduce:transition-none",
                step <= filled ? level.bar : "bg-border",
              )}
            />
          ))}
        </div>
        <span
          aria-live="polite"
          className={cn(
            "w-20 text-right text-xs font-bold",
            password ? level.text : "text-muted-foreground",
          )}
        >
          {password ? level.label : "Robustesse"}
        </span>
      </div>
      <ul className="flex flex-col gap-1" aria-label="Règles du mot de passe">
        {checks.map((check) => (
          <li
            key={check.rule}
            className={cn(
              "flex items-center gap-2 text-xs",
              check.met ? "text-success" : "text-muted-foreground",
            )}
          >
            {check.met ? (
              <Check aria-hidden="true" className="size-3.5" />
            ) : (
              <Circle aria-hidden="true" className="size-3.5" />
            )}
            <span>{check.label}</span>
            <span className="sr-only">
              {check.met ? "- respectée" : "- non respectée"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
