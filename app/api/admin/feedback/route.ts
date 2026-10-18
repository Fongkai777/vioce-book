import { readerDatabase } from "@/lib/reader-settings";
import { apiErrorResponse, requireAdminUser } from "@/lib/quota";
export async function GET() {
  try {
    await requireAdminUser();
    const rows = await readerDatabase().prepare(`SELECT f.*, u.display_name FROM answer_feedback f
      JOIN app_users u ON f.user_id=u.user_id ORDER BY f.updated_at DESC LIMIT 100`).all();
    return Response.json({ feedback: rows.results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return apiErrorResponse(error); }
}
