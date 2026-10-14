export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function apiErrorResponse(error: unknown) {
  const status = error instanceof ApiError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Unexpected server error";
  return Response.json({ error: message }, { status });
}
