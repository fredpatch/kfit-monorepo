import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { firstFailedAuthPasswordRule } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Field } from "../../components/ui/field.js";
import { Input } from "../../components/ui/input.js";
import {
  authFailureOf,
  authMessages,
  commonAuthMessage,
  passwordPolicyMessage,
} from "../api/auth-errors.js";
import { useAuth } from "../state/auth-context.js";
import { AuthAlert, AuthHeading } from "./AuthShell.js";
import { PasswordInput } from "./PasswordInput.js";
import { PasswordMeter } from "./PasswordMeter.js";

const bootstrapDisabledMessage =
  "Initialisation désactivée : définis KFIT_BOOTSTRAP_TOKEN côté serveur (voir runbook).";

type Values = {
  email: string;
  password: string;
  confirm: string;
  token: string;
};

/**
 * First coach/admin account. No default credentials exist; bootstrap closes once an account is created.
 * BOOT-01 B4: production asks for « Jeton d'initialisation », sent as a header and never stored.
 */
export function BootstrapForm() {
  const auth = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, watch, formState } = useForm<Values>({
    defaultValues: { email: "", password: "", confirm: "", token: "" },
  });
  const { errors, isSubmitting } = formState;
  const password = watch("password");

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await auth.bootstrap(
        { email: values.email.trim(), password: values.password },
        auth.bootstrapTokenRequired ? values.token.trim() : undefined,
      );
      toast.success(authMessages.bootstrapDone);
    } catch (error) {
      const failure = authFailureOf(error);
      setFormError(
        passwordPolicyMessage(failure) ??
          (failure.code === "BOOTSTRAP_ALREADY_COMPLETED"
            ? "L'initialisation est déjà faite. Recharge la page pour te connecter."
            : failure.code === "AUTH_BOOTSTRAP_INVALID_FORMAT"
              ? "Vérifie l'e-mail saisi."
              : failure.code === "BOOTSTRAP_TOKEN_INVALID"
                ? "Jeton d'initialisation incorrect."
                : failure.code === "BOOTSTRAP_DISABLED"
                  ? bootstrapDisabledMessage
                  : commonAuthMessage(failure)),
      );
    }
  });

  if (!auth.bootstrapEnabled) {
    return (
      <>
        <AuthHeading title="Initialisation" />
        <AuthAlert message={bootstrapDisabledMessage} />
      </>
    );
  }

  return (
    <>
      <AuthHeading
        title="Initialisation"
        description="Crée le premier compte coach. Aucun identifiant par défaut n'est fourni."
      />
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        {auth.bootstrapTokenRequired ? (
          <Field label="Jeton d'initialisation" error={errors.token?.message}>
            {(control) => (
              <PasswordInput
                {...control}
                autoComplete="off"
                {...register("token", {
                  required: "Saisis le jeton d'initialisation.",
                })}
              />
            )}
          </Field>
        ) : null}
        <Field label="E-mail" error={errors.email?.message}>
          {(control) => (
            <Input
              {...control}
              type="email"
              autoComplete="username"
              className="h-11"
              {...register("email", { required: "Saisis l'e-mail du compte." })}
            />
          )}
        </Field>
        <Field label="Mot de passe" error={errors.password?.message}>
          {(control) => (
            <PasswordInput
              {...control}
              autoComplete="new-password"
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
        <Field label="Confirme le mot de passe" error={errors.confirm?.message}>
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
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Création…" : "Créer le compte"}
        </Button>
      </form>
    </>
  );
}
