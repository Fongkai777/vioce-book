import { assertSameOrigin } from "@/lib/request-security";
import { readerDatabase } from "@/lib/reader-settings";
import { apiErrorResponse, requireApiUser } from "@/lib/quota";
import { feedbackTags } from "@/lib/personalization";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const raw = await request.text();
    if (raw.length > 24000) return Response.json({ error: "Feedback is too long" }, { status: 400 });
    const b = JSON.parse(raw);
    if (typeof b.exchangeId !== "string" || !/^[\w-]{1,80}$/.test(b.exchangeId) || !["helpful", "unhelpful"].includes(b.rating) || typeof b.question !== "string" || typeof b.answer !== "string") {
      return Response.json({ error: "Invalid feedback" }, { status: 400 });
    }
    const tags = Array.isArray(b.tags) ? feedbackTags.filter(x => b.tags.includes(x)) : [];
    const count = await readerDatabase().prepare("SELECT COUNT(*) AS n FROM answer_feedback WHERE user_id=? AND updated_at >= ? AND exchange_id != ?")
      .bind(user.userId, new Date(Date.now() - 86400000).toISOString(), b.exchangeId).first<{ n: number }>();
    if ((count?.n || 0) >= 100) return Response.json({ error: "今天提交的评价较多，请明天再试。" }, { status: 429 });
    await readerDatabase().prepare(`INSERT INTO answer_feedback (user_id, exchange_id, book_name, question, answer, rating, tags, comment, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, exchange_id) DO UPDATE SET
      rating=excluded.rating, tags=excluded.tags, comment=excluded.comment, updated_at=excluded.updated_at`)
      .bind(user.userId, b.exchangeId, String(b.bookName || "").slice(0, 200), b.question.slice(0, 2000), b.answer.slice(0, 12000), b.rating, JSON.stringify(tags), String(b.comment || "").slice(0, 1000), new Date().toISOString()).run();
    return Response.json({ ok: true });
  } catch (error) { return apiErrorResponse(error); }
}
