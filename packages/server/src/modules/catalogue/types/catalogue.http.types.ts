export type HttpJsonResponse<TBody = unknown> = {
  status: number;
  body: TBody;
};
