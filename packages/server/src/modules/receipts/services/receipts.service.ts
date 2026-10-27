import { financeDate } from "../../finance/services/finance.policy.js";
import {
  receiptFailure,
  receiptUuid,
  type ReceiptAction,
  type ReceiptActor,
  type ReceiptCommand,
  type ReceiptsRepository,
} from "./receipts.types.js";
const object = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === "object" && !Array.isArray(v);
export class ReceiptsService {
  constructor(private readonly repository: ReceiptsRepository) {}
  async execute(
    id: string,
    action: ReceiptAction,
    body: unknown,
    actor: ReceiptActor,
  ) {
    if (action === "public-read" || action === "public-pdf") {
      const token = /^[A-Za-z0-9_-]{43}$/.test(id) ? id : "";
      return this.repository.execute(
        token,
        !object(body) || Object.keys(body).length
          ? {
              action: "invalid-public-input",
              event: action === "public-read" ? "view" : "download",
            }
          : { action },
        actor,
      );
    }
    if (!receiptUuid.test(id) || !object(body))
      return receiptFailure("RECEIPT_INVALID_INPUT");
    let command: ReceiptCommand;
    if (action === "share") {
      const expiresAt = financeDate(body.expiresAt),
        maxUses = body.maxUses === undefined ? 3 : body.maxUses;
      if (
        Object.keys(body).some((k) => !["expiresAt", "maxUses"].includes(k)) ||
        !expiresAt ||
        typeof maxUses !== "number" ||
        !Number.isSafeInteger(maxUses) ||
        maxUses < 1 ||
        maxUses > 20
      )
        return receiptFailure("RECEIPT_INVALID_INPUT");
      command = { action, expiresAt, maxUses };
    } else if (action === "void") {
      if (
        Object.keys(body).some((k) => k !== "voidReason") ||
        typeof body.voidReason !== "string"
      )
        return receiptFailure("RECEIPT_INVALID_INPUT");
      const voidReason = body.voidReason.normalize("NFKC").trim();
      if (
        !voidReason ||
        voidReason.length > 2000 ||
        /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(voidReason)
      )
        return receiptFailure("RECEIPT_INVALID_INPUT");
      command = { action, voidReason };
    } else {
      if (Object.keys(body).length)
        return receiptFailure("RECEIPT_INVALID_INPUT");
      command = { action };
    }
    return this.repository.execute(id, command, actor);
  }
}
