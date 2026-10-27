import { useEffect, useState, type FormEvent } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ArrowLeft, MailCheck } from "lucide-react";
import { firstFailedAuthPasswordRule } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Field } from "../../components/ui/field.js";
import { Input } from "../../components/ui/input.js";
import { authApiClient, type AuthApiClient } from "../api/auth-api.js";
import {
  authFailureOf,
  authMessages,
  commonAuthMessage,
  passwordPolicyMessage,
} from "../api/auth-errors.js";
import { AuthAlert, AuthHeading } from "./AuthShell.js";
import { OtpCodeInput } from "./OtpCodeInput.js";
import { PasswordInput } from "./PasswordInput.js";
import { PasswordMeter } from "./PasswordMeter.js";

/** Client cooldown before « Renvoyer le code » (rule 7, UX-10). The server rate limit still applies. */
export const RECOVERY_RESEND_COOLDOWN_SECONDS = 60;

type Step = "email" | "code" | "password";

/**
 * Mot de passe oublié (board 09, existing Sprint 1 endpoints /auth/recovery/*):
 * e-mail → 6-digit code (5 min, 5 attempts) → new password → back to Connexion (no auto-login).
 */
export function RecoveryFlow({
  initialEmail,
  onDone,
  onCancel,
  api = authApiClient,
}: {
  initialEmail: string;
  onDone(): void;
  onCancel(): void;
  api?: AuthApiClient;
}) {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState(initialEmail);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const restart = () => {
    setResetToken(null);
    setStep("email");
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="-ml-2 self-start"
        onClick={step === "email" ? onCancel : restart}
      >
        <ArrowLeft aria-hidden="true" />{" "}
        {step === "email" ? "Retour à la connexion" : "Changer d'e-mail"}
      </Button>
      {step === "email" ? (
        <EmailStep
          initialEmail={email}
          api={api}
          onSent={(sentTo) => {
            setEmail(sentTo);
            setCooldown(RECOVERY_RESEND_COOLDOWN_SECONDS);
            setStep("code");
          }}
        />
      ) : step === "code" ? (
        <CodeStep
          email={email}
          api={api}
          cooldown={cooldown}
          onResent={() => setCooldown(RECOVERY_RESEND_COOLDOWN_SECONDS)}
          onVerified={(token) => {
            setResetToken(token);
            setStep("password");
          }}
        />
      ) : (
        <PasswordStep
          resetToken={resetToken ?? ""}
          api={api}
          onDone={onDone}
          onRestart={restart}
        />
      )}
    </>
  );
}

function EmailStep({
  initialEmail,
  api,
  onSent,
}: {
  initialEmail: string;
  api: AuthApiClient;
  onSent(email: string): void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<{ email: string }>({
    defaultValues: { email: initialEmail },
  });

  const submit = handleSubmit(async ({ email }) => {
    setFormError(null);
    try {
      await api.requestPasswordRecovery(email.trim());
      onSent(email.trim());
    } catch (error) {
      setFormError(commonAuthMessage(authFailureOf(error)));
    }
  });

  return (
    <>
      <AuthHeading
        title="Mot de passe oublié"
        description="Saisis l'e-mail de ton compte. Tu recevras un code à 6 chiffres."
      />
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <Field label="E-mail" error={formState.errors.email?.message}>
          {(control) => (
            <Input
              {...control}
              type="email"
              autoComplete="username"
              className="h-11"
              autoFocus
              {...register("email", { required: "Saisis ton e-mail." })}
            />
          )}
        </Field>
        <AuthAlert message={formError} />
        <Button type="submit" size="lg" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Envoi…" : "Recevoir un code"}
        </Button>
      </form>
    </>
  );
}

function CodeStep({
  email,
  api,
  cooldown,
  onResent,
  onVerified,
}: {
  email: string;
  api: AuthApiClient;
  cooldown: number;
  onResent(): void;
  onVerified(token: string): void;
}) {
  const [code, setCode] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (code.length !== 6) {
      setFormError("Saisis les 6 chiffres du code.");
      return;
    }
    setFormError(null);
    setSubmitting(true);
    try {
      const result = await api.verifyPasswordRecovery(email, code);
      onVerified(result.resetToken);
    } catch (error) {
      const failure = authFailureOf(error);
      setFormError(
        failure.code === "AUTH_RECOVERY_CODE_INVALID" ||
          failure.code === "AUTH_RECOVERY_INVALID_FORMAT"
          ? authMessages.codeInvalid
          : commonAuthMessage(failure),
      );
      setCode("");
    } finally {
      setSubmitting(false);
    }
  }

  async function resend() {
    setFormError(null);
    setResending(true);
    try {
      await api.requestPasswordRecovery(email);
      onResent();
      toast.success(authMessages.recoverySent);
    } catch (error) {
      setFormError(commonAuthMessage(authFailureOf(error)));
    } finally {
      setResending(false);
    }
  }

  return (
    <>
      <span
        aria-hidden="true"
        className="flex size-[52px] items-center justify-center rounded-2xl bg-success-soft text-success"
      >
        <MailCheck className="size-6" />
      </span>
      <AuthHeading
        title="Vérifie ta boîte mail"
        description={
          <>{authMessages.recoverySent} Le code expire dans 5 minutes.</>
        }
      />
      <form noValidate onSubmit={verify} className="flex flex-col gap-4">
        <Field label="Code de vérification" error={undefined}>
          {(control) => (
            <OtpCodeInput
              {...control}
              aria-invalid={formError === authMessages.codeInvalid || undefined}
              autoFocus
              value={code}
              onValueChange={setCode}
            />
          )}
        </Field>
        <AuthAlert message={formError} />
        <Button type="submit" size="lg" disabled={submitting}>
          {submitting ? "Vérification…" : "Vérifier"}
        </Button>
      </form>
      <p className="text-center text-[13px] text-muted-foreground">
        Code non reçu ?{" "}
        <Button
          type="button"
          variant="link"
          className="text-[13px]"
          disabled={cooldown > 0 || resending}
          onClick={() => void resend()}
        >
          {cooldown > 0
            ? `Renvoyer dans 0:${String(cooldown).padStart(2, "0")}`
            : "Renvoyer le code"}
        </Button>
      </p>
    </>
  );
}

type PasswordValues = { password: string; confirm: string };

function PasswordStep({
  resetToken,
  api,
  onDone,
  onRestart,
}: {
  resetToken: string;
  api: AuthApiClient;
  onDone(): void;
  onRestart(): void;
}) {
  const [formError, setFormError] = useState<string | null>(null);
  const [grantExpired, setGrantExpired] = useState(false);
  const { register, handleSubmit, watch, formState } = useForm<PasswordValues>({
    defaultValues: { password: "", confirm: "" },
  });
  const password = watch("password");

  const submit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await api.resetPassword(resetToken, password);
      toast.success(authMessages.resetDone);
      onDone();
    } catch (error) {
      const failure = authFailureOf(error);
      if (failure.code === "AUTH_RECOVERY_GRANT_INVALID") {
        setGrantExpired(true);
        setFormError(authMessages.grantExpired);
        return;
      }
      setFormError(
        passwordPolicyMessage(failure) ?? commonAuthMessage(failure),
      );
    }
  });

  return (
    <>
      <AuthHeading
        title="Nouveau mot de passe"
        description="Choisis un mot de passe que tu n'utilises nulle part ailleurs."
      />
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <Field
          label="Nouveau mot de passe"
          error={formState.errors.password?.message}
        >
          {(control) => (
            <PasswordInput
              {...control}
              autoComplete="new-password"
              autoFocus
              {...register("password", {
                validate: (value) =>
                  firstFailedAuthPasswordRule(value) === null
                    ? true
                    : "Le mot de passe ne respecte pas les règles ci-dessous.",
              })}
            />
          )}
        </Field>
        <PasswordMeter password={password} />
        <Field
          label="Confirme le mot de passe"
          error={formState.errors.confirm?.message}
        >
          {(control) => (
            <PasswordInput
              {...control}
              autoComplete="new-password"
              {...register("confirm", {
                validate: (value, values) =>
                  value === values.password ||
                  "Les mots de passe ne correspondent pas.",
              })}
            />
          )}
        </Field>
        <AuthAlert message={formError} />
        {grantExpired ? (
          <Button type="button" size="lg" onClick={onRestart}>
            Recommencer la récupération
          </Button>
        ) : (
          <Button type="submit" size="lg" disabled={formState.isSubmitting}>
            {formState.isSubmitting
              ? "Enregistrement…"
              : "Enregistrer le mot de passe"}
          </Button>
        )}
      </form>
    </>
  );
}
