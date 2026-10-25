import { consentTypes, optionalConsentTypes, requiredConsentTypes, type ConsentDecisions, type ConsentDefinition, type ConsentDefinitionListResponse,
  type ConsentDefinitionResponse, type ConsentDetail, type ConsentErrorCode, type ConsentLinkResponse, type ConsentPublicResponse, type ConsentPublishImpactResponse,
  type ConsentResponse, type ConsentRecord, type ConsentType, type OptionalConsentState, type OptionalConsentType } from "@kfit/shared";

export type ConsentActor = { userId: string | null; requestId: string; ipAddress: string | null; userAgent: string | null };
export type ConsentResult = { ok: true; body: ConsentResponse | ConsentLinkResponse | ConsentPublicResponse | { accepted: true }
  | ConsentDefinitionListResponse | ConsentDefinitionResponse | ConsentPublishImpactResponse | { deleted: true } }
  | { ok: false; error: ConsentErrorCode };
export type ConsentCommand = { action: "read" } | { action: "issue"; expiresAt: Date }
  | { action: "capture"; decisions: ConsentDecisions; expectedDefinitionIds: string[] } | { action: "revoke"; consentType: ConsentType }
  | { action: "revoke_link"; tokenId: string }
  | { action: "issue_optional"; types: OptionalConsentType[]; expiresAt: Date }
  | { action: "capture_optional"; decisions: ConsentDecisions; expectedDefinitionIds: string[] };
export interface ConsentRepository {
  execute(subscriptionId: string, command: ConsentCommand, actor: ConsentActor): Promise<ConsentResult>;
  publicAccess(token: string, decisions: ConsentDecisions | null, actor: ConsentActor, rejectedInput?: "CONSENT_INVALID_INPUT"): Promise<ConsentResult>;
}
export type ConsentDefinitionCommand = { action: "definitions_list" } | { action: "definition_read"; definitionId: string }
  | { action: "definition_create"; consentType: ConsentType; title: string; content: string }
  | { action: "definition_update"; definitionId: string; title?: string; content?: string }
  | { action: "definition_delete"; definitionId: string } | { action: "definition_impact"; definitionId: string }
  | { action: "definition_publish"; definitionId: string };
export interface ConsentDefinitionRepository {
  definitions(command: ConsentDefinitionCommand, actor: ConsentActor): Promise<ConsentResult>;
}
export { consentScopeAllows, consentScopeStatuses, type ConsentScope } from "@kfit/shared";
export const consentCommandScopes = { issue: "required", capture: "required", issue_optional: "optional", capture_optional: "optional" } as const;
export const optionalConsentLinkValidityMs = 7 * 24 * 60 * 60 * 1000;
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function isObject(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
export function parseDecisionShape(body: unknown): ConsentDecisions | null {
  if (!isObject(body) || Object.keys(body).length !== 1 || !isObject(body.decisions)) return null;
  const entries = Object.entries(body.decisions);
  if (!entries.length || !entries.every(([type, decision]) => consentTypes.some(known => known === type) && (decision === "granted" || decision === "refused"))) return null;
  return Object.fromEntries(entries) as ConsentDecisions;
}
// Every requested type answered and nothing else, so no decision is pre-checked or smuggled in.
export function requestedDecisionError(decisions: ConsentDecisions, requested: readonly ConsentType[]): ConsentErrorCode | null {
  if (Object.keys(decisions).some(type => !requested.some(asked => asked === type))) return "CONSENT_TYPE_NOT_REQUESTED";
  return requested.every(type => decisions[type]) ? null : "CONSENT_INVALID_INPUT";
}
export function parseDecisions(body: unknown, requested: readonly ConsentType[] = requiredConsentTypes): ConsentDecisions | null {
  const decisions = parseDecisionShape(body);
  return decisions && !requestedDecisionError(decisions, requested) ? decisions : null;
}
export function parseOptionalTypes(value: unknown): OptionalConsentType[] | null {
  if (!Array.isArray(value) || !value.length || new Set(value).size !== value.length) return null;
  return value.every(type => optionalConsentTypes.some(optional => optional === type)) ? value as OptionalConsentType[] : null;
}
function parseFutureInstant(value: unknown): Date | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
  const instant = new Date(value);
  return Number.isFinite(instant.getTime()) && instant.getTime() > Date.now() ? instant : null;
}
function parseDefinitionGuard(value: unknown, count: number): string[] | null {
  if (!Array.isArray(value) || value.length !== count || !value.every(id => typeof id === "string" && uuidPattern.test(id)) || new Set(value).size !== count) return null;
  return value as string[];
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
export function optionalConsentStates(definitions: ConsentDefinition[], current: ConsentRecord[]): Record<OptionalConsentType, OptionalConsentState> {
  const latest = latestDefinitions(definitions);
  const stateOf = (type: OptionalConsentType): OptionalConsentState => {
    const record = current.find(candidate => candidate.consentType === type);
    if (!record) return "none";
    if (record.decision !== "granted") return record.decision;
    return record.consentDefinitionId === latest.find(d => d.consentType === type)?.id ? "granted" : "renewal_required";
  };
  return { health_data: stateOf("health_data"), progress_photo_storage: stateOf("progress_photo_storage"), marketing: stateOf("marketing"), publication: stateOf("publication") };
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
        const expiresAt = isObject(body) && Object.keys(body).length === 1 ? parseFutureInstant(body.expiresAt) : null;
        return expiresAt ? this.repository.execute(subscriptionId, { action, expiresAt }, actor) : invalid;
      }
      case "issue_optional": {
        if (!isObject(body) || Object.keys(body).some(key => key !== "types" && key !== "expiresAt")) return invalid;
        const types = parseOptionalTypes(body.types);
        const expiresAt = body.expiresAt === undefined ? new Date(Date.now() + optionalConsentLinkValidityMs) : parseFutureInstant(body.expiresAt);
        return types && expiresAt ? this.repository.execute(subscriptionId, { action, types, expiresAt }, actor) : invalid;
      }
      case "capture_optional": {
        if (!isObject(body) || Object.keys(body).length !== 2) return invalid;
        const decisions = parseDecisionShape({ decisions: body.decisions });
        const types = decisions ? Object.keys(decisions) : [];
        const expectedDefinitionIds = parseDefinitionGuard(body.expectedDefinitionIds, types.length);
        if (!decisions || !parseOptionalTypes(types) || !expectedDefinitionIds) return invalid;
        return this.repository.execute(subscriptionId, { action, decisions, expectedDefinitionIds }, actor);
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
    // Only the shape is checked here; the token's requested set is known to the repository.
    const decisions = submit ? parseDecisionShape(body) : null;
    if (submit && !decisions) return this.repository.publicAccess(token, null, actor, "CONSENT_INVALID_INPUT");
    return this.repository.publicAccess(token, decisions, actor);
  }
}
const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";
const isEmptyBody = (body: unknown) => body === undefined || (isObject(body) && Object.keys(body).length === 0);
export class ConsentDefinitionService {
  constructor(private readonly repository: ConsentDefinitionRepository) {}
  async execute(action: ConsentDefinitionCommand["action"], body: unknown, definitionId: string | undefined, actor: ConsentActor): Promise<ConsentResult> {
    const invalid: ConsentResult = { ok: false, error: "CONSENT_INVALID_INPUT" };
    if (action === "definitions_list") return this.repository.definitions({ action }, actor);
    if (action === "definition_create") {
      if (!isObject(body) || Object.keys(body).length !== 3 || !isText(body.title) || !isText(body.content)) return invalid;
      const consentType = consentTypes.find(type => type === body.consentType);
      return consentType ? this.repository.definitions({ action, consentType, title: body.title, content: body.content }, actor) : invalid;
    }
    if (!definitionId || !uuidPattern.test(definitionId)) return invalid;
    switch (action) {
      case "definition_update": {
        if (!isObject(body) || !Object.keys(body).length || Object.keys(body).some(key => key !== "title" && key !== "content")
          || (body.title !== undefined && !isText(body.title)) || (body.content !== undefined && !isText(body.content))) return invalid;
        return this.repository.definitions({ action, definitionId, ...(isText(body.title) ? { title: body.title } : {}), ...(isText(body.content) ? { content: body.content } : {}) }, actor);
      }
      case "definition_delete":
      case "definition_publish": return isEmptyBody(body) ? this.repository.definitions({ action, definitionId }, actor) : invalid;
      case "definition_read":
      case "definition_impact": return this.repository.definitions({ action, definitionId }, actor);
    }
  }
}
