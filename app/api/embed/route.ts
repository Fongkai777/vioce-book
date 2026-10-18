import { authHeaders, getOpenAIConfig, jsonError, openAIError } from "@/lib/openai";
import { apiErrorResponse, consumeQuota, getQuotaSnapshot, requireApiUser } from "@/lib/quota";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { texts?: unknown; model?: unknown; purpose?: unknown };
    const purpose = body.purpose ?? "index";
    if (purpose !== "query" && purpose !== "index") return jsonError(new Error("Invalid embedding purpose"), 400);
    const model = body.model ?? "text-embedding-3-small";
    if (model !== "text-embedding-3-small" && model !== "text-embedding-v4") {
      return jsonError(new Error("Unsupported embedding model"), 400);
    }
    if (!Array.isArray(body.texts) || !body.texts.length || body.texts.length > 64) {
      return jsonError(new Error("texts must contain 1 to 64 items"), 400);
    }
    const texts = body.texts.map((text) => String(text).slice(0, 12000));
    if (purpose === "query" && (texts.length !== 1 || !texts[0].trim() || texts[0].length > 2000)) {
      return jsonError(new Error("Questions must contain 1 to 2000 characters"), 400);
    }
    const user = await requireApiUser();
    const config = getOpenAIConfig();
    const legacy = model === "text-embedding-v4";
    // Existing imported books only need a query vector, never a new document index.
    if (legacy && purpose !== "query") return jsonError(new Error("Imported-book embedding only accepts questions"), 400);
    const apiKey = legacy ? process.env.COPILOT_EMBEDDING_API_KEY : config.apiKey;
    if (!apiKey) return jsonError(new Error("Imported-book query embedding is not configured"), 503);
    const baseUrl = legacy
      ? (process.env.COPILOT_EMBEDDING_BASE_URL || "https://dashscope.aliyuncs.com/compatible-mode/v1").replace(/\/$/, "")
      : config.baseUrl;
    if (purpose === "query") {
      if ((await getQuotaSnapshot(user)).questions.remaining < 1) {
        return jsonError(new Error("Your daily question limit has been reached"), 429);
      }
      await consumeQuota(user, "queryEmbedding", 1);
    } else {
      await consumeQuota(user, "embedding", texts.reduce((total, text) => total + text.length, 0));
    }
    const upstream = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: { ...authHeaders(apiKey), "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: texts, encoding_format: "float", ...(legacy ? { dimensions: 1024 } : {}) }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!upstream.ok) throw await openAIError(upstream);
    const payload = (await upstream.json()) as { data: Array<{ embedding: number[]; index: number }> };
    const embeddings = payload.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
    const expectedSize = legacy ? 1024 : 1536;
    if (embeddings.length !== texts.length || embeddings.some((vector) =>
      vector.length !== expectedSize || vector.some((n) => !Number.isFinite(n)))) {
      throw new Error("Embedding provider returned an incompatible vector");
    }
    return Response.json({ embeddings });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
