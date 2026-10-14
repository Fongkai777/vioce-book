import { clearSession } from "@/lib/auth";
import { apiErrorResponse } from "@/lib/errors";

export async function POST(request: Request) {
  try {
    await clearSession(new URL(request.url).protocol === "https:");
    return Response.json({ ok: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
