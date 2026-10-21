import { consentTypes, requiredConsentTypes, type ConsentDecisions, type ConsentDefinition, type ConsentDetail, type ConsentErrorCode,
  type ConsentLinkResponse, type ConsentPublicResponse, type ConsentResponse, type ConsentRecord, type ConsentType } from "@kfit/shared";

export type ConsentActor = { userId: string | null; requestId: string; ipAddress: string | null; userAgent: string | null };
export type ConsentResult = { ok: true; body: ConsentResponse | ConsentLinkResponse | ConsentPublicResponse | { accepted: true } }
  | { ok: false; error: ConsentErrorCode };
export type ConsentCommand = { action: "read" } | { action: "issue"; expiresAt: Date }
  | { action: "capture"; decisions: ConsentDecisions; expectedDefinitionIds: string[] } | { action: "revoke"; consentType: ConsentType }
  | { action: "revoke_link"; tokenId: string };
export interface ConsentRepository {
  execute(subscriptionId: string, command: ConsentCommand, actor: ConsentActor): Promise<ConsentResult>;
  publicAccess(token: string, decisions: ConsentDecisions | null, actor: ConsentActor, rejectedInput?: "CONSENT_INVALID_INPUT"): Promise<ConsentResult>;
}
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isObject(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
export function parseDecisions(body: unknown): ConsentDecisions | null {
  if (!isObject(body) || Object.keys(body).length !== 1 || !isObject(body.decisions)) return null;
  const decisions = body.decisions;
  if (Object.keys(decisions).length !== 2 || !requiredConsentTypes.every(type => decisions[type] === "granted" || decisions[type] === "refused")) return null;
  return { service_terms: decisions.service_terms as "granted" | "refused", privacy_notice: decisions.privacy_notice as "granted" | "refused" };
}
export function latestDefinitions(definitions: ConsentDefinition[]): ConsentDefinition[] {
  return consentTypes.flatMap(type => {
    const rows = definitions.filter(d => d.consentType === type && d.status === "published" && /^[1-9][0-9]*$/.test(d.version));
    rows.sort((a, b) => BigInt(a.version) === BigInt(b.version) ? 0 : BigInt(a.version) > BigInt(b.version) ? -1 : 1);
    return rows.slice(0, 1);
  });
}
// A chain head, rather than wall-clock timestamps, defines current state even after lock waits.
export function currentDecisions(history: ConsentRecord[]): ConsentRecord[] | null {
  const superseded = new Set(history.flatMap(record => record.supersedesConsentRecordId ? [record.supersedesConsentRecordId] : []));
  const heads = history.filter(record => !superseded.has(record.id));
  if (new Set(heads.map(record => record.consentType)).size !== heads.length) return null;
  return heads;
}
export function requiredBundle(definitions: ConsentDefinition[], current: ConsentRecord[]): ConsentDetail["requiredBundle"] {
  const latest = latestDefinitions(definitions);
  const missingDefinitions = requiredConsentTypes.filter(type => !latest.some(d => d.consentType === type));
  return { missingDefinitions, satisfied: missingDefinitions.length === 0 && requiredConsentTypes.every(type => {
    const definition = latest.find(d => d.consentType === type)!;
    return current.some(record => record.consentType === type && record.consentDefinitionId === definition.id && record.decision === "granted");
  }) };
}
export class ConsentService {
  constructor(private readonly repository: ConsentRepository) {}
  async execute(subscriptionId: string, action: ConsentCommand["action"], body: unknown, selector: string | undefined, actor: ConsentActor): Promise<ConsentResult> {
    const invalid: ConsentResult = { ok: false, error: "CONSENT_INVALID_INPUT" };
    if (!uuidPattern.test(subscriptionId)) return invalid;
    switch (action) {
      case "read": return this.repository.execute(subscriptionId, { action }, actor);
      case "capture": {
        if (!isObject(body) || Object.keys(body).length !== 2 || !Array.isArray(body.expectedDefinitionIds)
          || body.expectedDefinitionIds.length !== 2 || !body.expectedDefinitionIds.every(id => typeof id === "string" && uuidPattern.test(id))
          || new Set(body.expectedDefinitionIds).size !== 2) return invalid;
        const decisions = parseDecisions({ decisions: body.decisions });
        return decisions ? this.repository.execute(subscriptionId, { action, decisions, expectedDefinitionIds: body.expectedDefinitionIds }, actor) : invalid;
      }
      case "issue": {
        if (!isObject(body) || Object.keys(body).length !== 1 || typeof body.expiresAt !== "string"
          || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(body.expiresAt)) return invalid;
        const expiresAt = new Date(body.expiresAt);
        return Number.isFinite(expiresAt.getTime()) && expiresAt.getTime() > Date.now()
          ? this.repository.execute(subscriptionId, { action, expiresAt }, actor) : invalid;
      }
      case "revoke": {
        if (!consentTypes.some(type => type === selector)) return invalid;
        const consentType = consentTypes.find(type => type === selector)!;
        if (requiredConsentTypes.some(type => type === consentType)) return { ok: false, error: "CONSENT_REVOCATION_FORBIDDEN" };
        return this.repository.execute(subscriptionId, { action, consentType }, actor);
      }
      case "revoke_link": return selector && uuidPattern.test(selector) ? this.repository.execute(subscriptionId, { action, tokenId: selector }, actor) : invalid;
    }
  }
  async publicAccess(token: string, body: unknown, submit: boolean, actor: ConsentActor): Promise<ConsentResult> {
    // Unknown/malformed tokens still reach the repository's sanitized failure-event path.
    const decisions = submit ? parseDecisions(body) : null;
    if (submit && !decisions) return this.repository.publicAccess(token, null, actor, "CONSENT_INVALID_INPUT");
    return this.repository.publicAccess(token, decisions, actor);
  }
}
