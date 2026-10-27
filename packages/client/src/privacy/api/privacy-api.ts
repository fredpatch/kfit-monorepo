import axios, { AxiosHeaders } from "axios";
import {
  authCsrfHeaderName,
  privacyApiRoutes,
  type AnonymizeSubjectResponse,
  type ArchiveSubjectResponse,
  type CreateRetentionHoldInput,
  type PrivacySubjectType,
  type RetentionHoldListResponse,
  type RetentionHoldResponse,
  type UnarchiveReason,
  type UnarchiveSubjectResponse,
} from "@kfit/shared";
import { buildCsrfHeaders, requiresCsrfHeader } from "../../auth/api/csrf.js";

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "",
  withCredentials: true,
  headers: { accept: "application/json" },
});
http.interceptors.request.use((config) => {
  if (requiresCsrfHeader(config.method)) {
    const headers = AxiosHeaders.from(config.headers),
      token = buildCsrfHeaders(config.method)[authCsrfHeaderName];
    if (token) headers.set(authCsrfHeaderName, token);
    config.headers = headers;
  }
  return config;
});

const routes = {
  customer: {
    archive: privacyApiRoutes.archiveCustomer,
    unarchive: privacyApiRoutes.unarchiveCustomer,
    anonymize: privacyApiRoutes.anonymizeCustomer,
    param: ":customerId",
  },
  prospect: {
    archive: privacyApiRoutes.archiveProspect,
    unarchive: privacyApiRoutes.unarchiveProspect,
    anonymize: privacyApiRoutes.anonymizeProspect,
    param: ":prospectId",
  },
} as const;
const subjectRoute = (
  subjectType: PrivacySubjectType,
  action: "archive" | "unarchive" | "anonymize",
  subjectId: string,
) =>
  routes[subjectType][action].replace(
    routes[subjectType].param,
    encodeURIComponent(subjectId),
  );

/** S7.3 privacy commands (archive, unarchive, anonymize) and customer retention holds (S7.3b-2 D11). */
export const privacyApi = {
  async archive(
    subjectType: PrivacySubjectType,
    subjectId: string,
  ): Promise<ArchiveSubjectResponse> {
    return (
      await http.post<ArchiveSubjectResponse>(
        subjectRoute(subjectType, "archive", subjectId),
        {},
      )
    ).data;
  },
  async unarchive(
    subjectType: PrivacySubjectType,
    subjectId: string,
    reason: UnarchiveReason,
  ): Promise<UnarchiveSubjectResponse> {
    return (
      await http.post<UnarchiveSubjectResponse>(
        subjectRoute(subjectType, "unarchive", subjectId),
        { reason },
      )
    ).data;
  },
  /** `confirmName` is the typed name; it is sent once and never stored or logged on the client. */
  async anonymize(
    subjectType: PrivacySubjectType,
    subjectId: string,
    confirmName: string,
  ): Promise<AnonymizeSubjectResponse> {
    return (
      await http.post<AnonymizeSubjectResponse>(
        subjectRoute(subjectType, "anonymize", subjectId),
        { confirmName },
      )
    ).data;
  },
  async customerHolds(customerId: string): Promise<RetentionHoldListResponse> {
    return (
      await http.get<RetentionHoldListResponse>(privacyApiRoutes.holds, {
        params: { scopeType: "customer", scopeId: customerId },
      })
    ).data;
  },
  async createHold(
    input: CreateRetentionHoldInput,
  ): Promise<RetentionHoldResponse> {
    return (
      await http.post<RetentionHoldResponse>(privacyApiRoutes.holds, input)
    ).data;
  },
  async releaseHold(holdId: string): Promise<RetentionHoldResponse> {
    return (
      await http.post<RetentionHoldResponse>(
        privacyApiRoutes.releaseHold.replace(
          ":holdId",
          encodeURIComponent(holdId),
        ),
        {},
      )
    ).data;
  },
};
