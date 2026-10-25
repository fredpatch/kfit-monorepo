import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { catalogueErrorMessage } from "../api/catalogue-api.js";

/** One catalogue mutation at a time: busy flag, French error, refresh of every catalogue query (lists, deliverability). */
export function useContentAction() {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run(work: () => Promise<unknown>, success: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      await work();
      await client.invalidateQueries({ queryKey: ["catalogue"] });
      toast.success(success);
      return true;
    } catch (failure) {
      setError(catalogueErrorMessage(failure));
      return false;
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, run };
}

export function ActionError({ message }: { message: string | null }) {
  return message ? <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-[13px] font-medium text-danger">{message}</p> : null;
}
