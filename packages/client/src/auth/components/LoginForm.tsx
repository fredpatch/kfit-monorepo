import { useState } from "react";
import { useForm } from "react-hook-form";
import { developmentDemoAccount } from "@kfit/shared";
import { Button } from "../../components/ui/button.js";
import { Field } from "../../components/ui/field.js";
import { Input } from "../../components/ui/input.js";
import { authFailureOf, loginErrorMessage } from "../api/auth-errors.js";
import { useAuth } from "../state/auth-context.js";
import { AuthAlert, AuthHeading } from "./AuthShell.js";
import { PasswordInput } from "./PasswordInput.js";

type Values = { email: string; password: string };

/** Connexion (board 09). One primary action; demo account button in development builds only. */
export function LoginForm({ onForgotPassword }: { onForgotPassword(email: string): void }) {
  const auth = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setValue, getValues, formState } = useForm<Values>({ defaultValues: { email: "", password: "" } });
  const { errors, isSubmitting } = formState;

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await auth.login({ email: values.email.trim(), password: values.password });
    } catch (error) {
      setFormError(loginErrorMessage(authFailureOf(error)));
    }
  });

  return (
    <>
      <AuthHeading title="Connexion" description="Accès réservé à l'équipe K'FIT." />
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <Field label="E-mail" error={errors.email?.message}>
          {(control) => <Input {...control} type="email" autoComplete="username" className="h-11" {...register("email", { required: "Saisis ton e-mail." })} />}
        </Field>
        <div className="flex flex-col gap-1.5">
          <Field label="Mot de passe" error={errors.password?.message}>
            {(control) => <PasswordInput {...control} autoComplete="current-password" {...register("password", { required: "Saisis ton mot de passe." })} />}
          </Field>
          <Button type="button" variant="link" className="self-end text-[13px]" onClick={() => onForgotPassword(getValues("email").trim())}>
            Mot de passe oublié ?
          </Button>
        </div>
        <AuthAlert message={formError} />
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Connexion…" : "Se connecter"}
        </Button>
      </form>

      {import.meta.env.DEV ? (
        <div className="flex items-center gap-2.5 rounded-lg border border-dashed border-input px-3.5 py-3">
          <span className="rounded-sm bg-warning-soft px-1.5 py-0.5 text-[10px] font-extrabold text-warning">DEV</span>
          <span className="flex-1 text-[13px] text-muted-foreground">Visible uniquement en développement</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              setValue("email", developmentDemoAccount.email, { shouldValidate: true });
              setValue("password", developmentDemoAccount.password, { shouldValidate: true });
              setFormError(null);
            }}
          >
            Compte démo
          </Button>
        </div>
      ) : null}
    </>
  );
}
