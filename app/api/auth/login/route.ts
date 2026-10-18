import { assertSameOrigin } from "@/lib/request-security";
import { authenticate, clearLoginRateLimit, enforceLoginRateLimit, setSessionCookie } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const body = (await request.json()) as { username?: unknown; password?: unknown };
    if (!body || typeof body.username !== "string" || typeof body.password !== "string" ||
      !body.username.trim() || body.username.length > 32 || !body.password || body.password.length > 128) {
      return Response.json({ error: "A valid username and password are required" }, { status: 400 });
    }
    const username = body.username;
    const password = body.password;
    const attemptKey = await enforceLoginRateLimit(request, username);
    const { token, user } = await authenticate(username, password);
    await clearLoginRateLimit(attemptKey);
    await setSessionCookie(token, new URL(request.url).protocol === "https:");
    return Response.json({ user });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
