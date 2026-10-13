import { authHeaders, getOpenAIConfig, jsonError, openAIError } from "@/lib/openai";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { texts?: unknown };
    if (!Array.isArray(body.texts) || !body.texts.length || body.texts.length > 64) {
      return jsonError(new Error("texts must contain 1 to 64 items"), 400);
    }
    const texts = body.texts.map((text) => String(text).slice(0, 12000));
    const config = getOpenAIConfig();
    const upstream = await fetch(`${config.baseUrl}/embeddings`, {
      method: "POST",
      headers: { ...authHeaders(config.apiKey), "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-small", input: texts, encoding_format: "float" }),
    });
    if (!upstream.ok) throw await openAIError(upstream);
    const payload = (await upstream.json()) as { data: Array<{ embedding: number[]; index: number }> };
    const embeddings = payload.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
    return Response.json({ embeddings });
  } catch (error) {
    return jsonError(error);
  }
}
