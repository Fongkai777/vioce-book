import { authenticate, clearLoginRateLimit, enforceLoginRateLimit, setSessionCookie } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { username?: unknown; password?: unknown };
    const username = String(body.username || "");
    const password = String(body.password || "");
    if (!username || !password) return Response.json({ error: "Username and password are required" }, { status: 400 });
    const attemptKey = await enforceLoginRateLimit(request, username);
    const { token, user } = await authenticate(username, password);
    await clearLoginRateLimit(attemptKey);
    await setSessionCookie(token, new URL(request.url).protocol === "https:");
    return Response.json({ user });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
