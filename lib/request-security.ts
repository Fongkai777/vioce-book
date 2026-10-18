import { ApiError } from "./errors";

// Cookie-authenticated mutations must not accept cross-origin browser requests.
// Non-browser clients without Origin remain supported and still need a session.
export function assertSameOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError("Cross-origin requests are not allowed", 403);
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new ApiError("Cross-origin requests are not allowed", 403);
  }
}
