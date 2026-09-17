export type HttpJsonResponse<TBody = unknown> = {
  status: number;
  body: TBody;
};

export type PublicHttpRequestContext = {
  requestId: string;
  ipAddress: string | null;
  userAgent: string | null;
};
