import { requireAdminUser } from "@/lib/quota";
import { assertSameOrigin } from "@/lib/request-security";
import { boundedRequest } from "@/lib/bounded-request";
import { ApiError, apiErrorResponse } from "@/lib/errors";
import { encryptBackup, decryptBackup } from "@/lib/backup-crypto";
import { exportServerSnapshot, restoreServerSnapshot } from "@/lib/server-backup";
import { enforceLoginRateLimit, clearLoginRateLimit, verifyCurrentPassword } from "@/lib/auth";
import { auditOperation } from "@/lib/operations";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request); const user = await requireAdminUser();
    const body = await (await boundedRequest(request, 4096)).json() as { passphrase?: unknown; password?: unknown };
    if (typeof body?.passphrase !== "string" || body.passphrase.length < 12 || body.passphrase.length > 256) throw new ApiError("Use a backup passphrase of 12–256 characters.", 400);
    if (typeof body.password !== "string" || !body.password || body.password.length > 128) throw new ApiError("Enter your current administrator password.", 400);
    const rateKey = await enforceLoginRateLimit(request, user.username);
    if (!await verifyCurrentPassword(user.userId, body.password)) throw new ApiError("Invalid administrator password", 401);
    const encrypted = await encryptBackup(await exportServerSnapshot(), body.passphrase);
    await auditOperation(user.userId, "Encrypted server backup downloaded");
    await clearLoginRateLimit(rateKey);
    return Response.json(encrypted, { headers: { "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="voicebook-server-${new Date().toISOString().slice(0,10)}.backup.json"` } });
  } catch (error) { return apiErrorResponse(error); }
}
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request); const user = await requireAdminUser();
    const body = await (await boundedRequest(request, 7_000_000)).json() as { confirmation?: unknown; password?: unknown; passphrase?: unknown; backup?: unknown };
    if (body?.confirmation !== "RESTORE SERVER DATA" || typeof body.password !== "string" || body.password.length > 128 ||
      typeof body.passphrase !== "string" || body.passphrase.length < 12 || body.passphrase.length > 256) throw new ApiError("Confirm restore with your current password and backup passphrase.", 400);
    const rateKey = await enforceLoginRateLimit(request, user.username);
    if (!await verifyCurrentPassword(user.userId, body.password)) throw new ApiError("Invalid administrator password", 401);
    let snapshot;
    try { snapshot = await decryptBackup(body.backup, body.passphrase, 6_000_000); }
    catch { throw new ApiError("Incorrect passphrase or damaged backup. No data was changed.", 400); }
    await restoreServerSnapshot(snapshot, user.userId);
    await clearLoginRateLimit(rateKey);
    return Response.json({ restored: true, message: "Restore complete. Sign in with an administrator from the backup. AI remains paused." }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
