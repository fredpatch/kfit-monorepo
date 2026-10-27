import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { loginOtpMaxResends } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Field } from "../../components/ui/field.js";
import { authFailureOf, loginOtpFailure, loginOtpMessages } from "../api/auth-errors.js";
import { useAuth } from "../state/auth-context.js";
import { AuthAlert, AuthHeading } from "./AuthShell.js";
import { OtpCodeInput } from "./OtpCodeInput.js";

/** SEC-02b A1: « Renvoyer le code » waits this long after each send. The server limits still apply. */
export const LOGIN_RESEND_COOLDOWN_SECONDS = 30;

/** The only thing kept from step 1: the e-mail (for the mask) and the challenge. Never the password. */
export type LoginChallenge = { email: string; challengeId: string; expiresAt: string };

/** « fred@kfit.ga » → « f***@kfit.ga ». */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@");
  return at > 0 ? `${email[0]}***${email.slice(at)}` : "***";
}

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** « Nouvel appareil » (SEC-02b A1): the e-mailed code, then the session; trusting the browser is opt-in. */
export function DeviceCodeStep({ challenge: initial, onRestart }: { challenge: LoginChallenge; onRestart(message: string | null): void }) {
  const auth = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [challenge, setChallenge] = useState(initial);
  const [resends, setResends] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(() => Date.now() + LOGIN_RESEND_COOLDOWN_SECONDS * 1000);
  const [now, setNow] = useState(() => Date.now());
  const [code, setCode] = useState("");
  const [trustDevice, setTrustDevice] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const secondsLeft = Math.max(0, Math.ceil((Date.parse(challenge.expiresAt) - now) / 1000));
  const cooldown = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const resendsExhausted = resends >= loginOtpMaxResends;

  async function verify(value: string) {
    if (!/^\d{6}$/.test(value)) {
      setMessage(loginOtpMessages.format);
      input.current?.focus();
      return;
    }
    setMessage(null);
    setSubmitting(true);
    try {
      await auth.verifyLogin({ challengeId: challenge.challengeId, code: value, trustDevice });
    } catch (error) {
      const failure = loginOtpFailure(authFailureOf(error));
      if (failure.restart) return onRestart(failure.message);
      setMessage(failure.message);
      setCode("");
      input.current?.focus();
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    setMessage(null);
    setResending(true);
    try {
      const next = await auth.resendLogin(challenge.challengeId);
      setChallenge({ email: challenge.email, challengeId: next.challengeId, expiresAt: next.expiresAt });
      setResends((count) => count + 1);
      setCooldownUntil(Date.now() + LOGIN_RESEND_COOLDOWN_SECONDS * 1000);
      setNow(Date.now());
      setCode("");
      input.current?.focus();
    } catch (error) {
      const failure = loginOtpFailure(authFailureOf(error));
      if (failure.restart) return onRestart(failure.message);
      setMessage(failure.message);
    } finally {
      setResending(false);
    }
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" className="-ml-2 self-start" onClick={() => onRestart(null)}>
        <ArrowLeft aria-hidden="true" /> Retour
      </Button>
      <span aria-hidden="true" className="flex size-[52px] items-center justify-center rounded-2xl bg-success-soft text-success">
        <ShieldCheck className="size-6" />
      </span>
      <AuthHeading title="Nouvel appareil" description={`Pour protéger ton compte, saisis le code à 6 chiffres envoyé à ${maskEmail(challenge.email)}`} />
      <form noValidate onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); void verify(code); }} className="flex flex-col gap-4">
        <Field label="Code de vérification" error={undefined}>
          {(control) => (
            <OtpCodeInput
              {...control}
              ref={input}
              autoFocus
              aria-invalid={message === loginOtpMessages.invalid || undefined}
              value={code}
              onValueChange={(next) => {
                setCode(next);
                // A pasted (or autofilled) full code submits itself; typing the last digit still waits for « Valider ».
                if (next.length === 6 && next.length - code.length > 1) void verify(next);
              }}
            />
          )}
        </Field>
        <p className="text-[13px] text-muted-foreground">{secondsLeft > 0 ? `Code valable encore ${clock(secondsLeft)}` : "Code expiré"}</p>
        <label className="flex items-start gap-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-primary" checked={trustDevice} onChange={(event) => setTrustDevice(event.target.checked)} />
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">Faire confiance à cet appareil pendant 30 jours</span>
            <span className="text-[13px] text-muted-foreground">Ne coche pas sur un ordinateur partagé.</span>
          </span>
        </label>
        <AuthAlert message={message} polite />
        <Button type="submit" size="lg" disabled={submitting || secondsLeft === 0}>
          {submitting ? "Vérification…" : "Valider"}
        </Button>
      </form>
      {resendsExhausted ? (
        <p className="text-center text-[13px] text-muted-foreground">{loginOtpMessages.maxResends}</p>
      ) : (
        <p className="text-center text-[13px] text-muted-foreground">
          Code non reçu ?{" "}
          <Button type="button" variant="link" className="text-[13px]" disabled={cooldown > 0 || resending} onClick={() => void resend()}>
            {cooldown > 0 ? `Renvoyer le code (${clock(cooldown)})` : "Renvoyer le code"}
          </Button>
        </p>
      )}
    </>
  );
}
