import type { ServiceRequestStatus } from "@kfit/shared";

export const requestKeys = {
  all: ["requests"] as const,
  adminQueue: () => ["requests", "admin-queue"] as const,
  adminQueueAll: () => ["requests", "admin-queue", "all"] as const,
  adminQueueByStatus: (status: ServiceRequestStatus) =>
    ["requests", "admin-queue", status] as const,
  adminDetail: (requestId: string) =>
    ["requests", "admin-detail", requestId] as const,
};
