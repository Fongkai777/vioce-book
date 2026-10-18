import { assertSameOrigin } from "@/lib/request-security";
import { apiErrorResponse, requireApiUser } from "@/lib/quota";
import { normalizePreferences } from "@/lib/personalization";
import { readPreferences, readerDatabase } from "@/lib/reader-settings";

export async function GET() {
  try { const user = await requireApiUser(); return Response.json({ preferences: await readPreferences(user.userId) }, { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return apiErrorResponse(error); }
}
export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const raw = await request.text();
    if (raw.length > 4000) return Response.json({ error: "Preferences are too long" }, { status: 400 });
    const preferences = normalizePreferences(JSON.parse(raw));
    await readerDatabase().prepare("INSERT INTO reader_preferences (user_id, settings, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET settings = excluded.settings, updated_at = excluded.updated_at")
      .bind(user.userId, JSON.stringify(preferences), new Date().toISOString()).run();
    return Response.json({ preferences });
  } catch (error) { return apiErrorResponse(error); }
}
