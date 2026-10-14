import { authHeaders, getOpenAIConfig, jsonError, openAIError, responseText } from "@/lib/openai";
import { apiErrorResponse, consumeQuota, getQuotaSnapshot, requireApiUser } from "@/lib/quota";

type Context = { id: string; sectionTitle: string; pageStart: number; pageEnd: number; text: string };

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { question?: unknown; contexts?: Context[] };
    const question = String(body.question || "").trim();
    const contexts = Array.isArray(body.contexts) ? body.contexts.slice(0, 8) : [];
    if (!question || !contexts.length) return jsonError(new Error("A question and retrieved context are required"), 400);

    const user = await requireApiUser();
    await consumeQuota(user, "question", 1);

    const evidence = contexts.map((context, index) => {
      const pages = context.pageStart === context.pageEnd ? `p. ${context.pageStart}` : `pp. ${context.pageStart}-${context.pageEnd}`;
      return `[S${index + 1}] ${context.sectionTitle} (${pages})\n${context.text.slice(0, 4500)}`;
    }).join("\n\n");
    const config = getOpenAIConfig();
    const upstream = await fetch(`${config.baseUrl}/responses`, {
      method: "POST",
      headers: { ...authHeaders(config.apiKey), "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.qaModel,
        instructions: [
          "You are Voicebook, a careful reading companion.",
          "Answer only from the supplied book excerpts. If they do not support an answer, say so plainly.",
          "Use the same language as the reader. Keep the response concise and natural when spoken aloud.",
          "Cite factual claims using [S1], [S2], etc. Never invent a citation or page number.",
          "Do not use markdown tables. Prefer two or three short paragraphs.",
        ].join(" "),
        input: `Reader question:\n${question}\n\nRetrieved book excerpts:\n${evidence}`,
        max_output_tokens: 700,
      }),
    });
    if (!upstream.ok) throw await openAIError(upstream);
    const payload = await upstream.json();
    const answer = responseText(payload);
    if (!answer) throw new Error("The model returned an empty answer");
    return Response.json({ answer, quota: await getQuotaSnapshot(user) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
