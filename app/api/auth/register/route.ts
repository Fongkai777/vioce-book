import { enforceRegistrationRateLimit } from "@/lib/auth";
import { registerUserAccount, registrationStatus } from "@/lib/registration";
import { monitoredRoute } from "@/lib/operations";

export const GET = monitoredRoute("auth/register", async () => Response.json(await registrationStatus()), undefined, false);

export const POST = monitoredRoute("auth/register", async (request: Request) => {
  await enforceRegistrationRateLimit(request);
  const body = await request.json() as { username?: unknown; password?: unknown; displayName?: unknown };
  if (!body || typeof body.username !== "string" || typeof body.password !== "string" ||
    body.username.length > 32 || (body.displayName !== undefined && typeof body.displayName !== "string")) {
    return Response.json({ error: "A valid username and password are required" }, { status: 400 });
  }
  await registerUserAccount({ username: body.username, password: body.password, displayName: body.displayName as string | undefined });
  // Deliberately separate creation from login. If the network drops after commit,
  // the reader can sign in without creating another account or consuming a slot.
  return Response.json({ ok: true, message: "Account created. Sign in with your new credentials." }, { status: 201 });
}, 4096, false);
