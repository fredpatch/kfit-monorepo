import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input } from "../../components/ui/input.js";

/** Password field with a show/hide toggle (board 09). */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">
>((props, ref) => {
  const [visible, setVisible] = React.useState(false);
  return (
    <span className="relative block">
      <Input
        ref={ref}
        type={visible ? "text" : "password"}
        className="h-11 pr-11"
        {...props}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={
          visible ? "Masquer le mot de passe" : "Afficher le mot de passe"
        }
        aria-pressed={visible}
        className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {visible ? (
          <EyeOff aria-hidden="true" className="size-[18px]" />
        ) : (
          <Eye aria-hidden="true" className="size-[18px]" />
        )}
      </button>
    </span>
  );
});
PasswordInput.displayName = "PasswordInput";
