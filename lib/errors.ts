export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export function apiErrorResponse(error: unknown) {
  const status = error instanceof ApiError ? error.status : error instanceof SyntaxError ? 400 : 500;
  // Only intentionally public application errors may leave the server. Never echo
  // database errors, provider response bodies, credentials or internal paths.
  const message = error instanceof ApiError ? error.message : error instanceof SyntaxError
    ? "Invalid request format" : "Something went wrong on the server. Please try again later.";
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
