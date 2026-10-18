import { authHeaders, getOpenAIConfig, jsonError, openAIError, responseText } from "@/lib/openai";
import { apiErrorResponse, consumeQuota, requireApiUser } from "@/lib/quota";

const MAX_IMAGE_DATA_URL_LENGTH = 8_000_000;
const OCR_INDEXING_UNITS_PER_PAGE = 10_000;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { image?: unknown; pageNumber?: unknown };
    const image = typeof body.image === "string" ? body.image : "";
    const pageNumber = Math.max(1, Math.floor(Number(body.pageNumber) || 1));
    if (!/^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(image)) {
      return jsonError(new Error("A JPEG or PNG page image is required"), 400);
    }
    if (image.length > MAX_IMAGE_DATA_URL_LENGTH) {
      return jsonError(new Error("The rendered PDF page is too large for OCR"), 413);
    }

    const user = await requireApiUser();
    await consumeQuota(user, "embedding", OCR_INDEXING_UNITS_PER_PAGE);

    const config = getOpenAIConfig();
    const upstream = await fetch(`${config.baseUrl}/responses`, {
      method: "POST",
      headers: { ...authHeaders(config.apiKey), "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.ocrModel,
        instructions: [
          "You are an OCR transcription engine.",
          "Transcribe all readable text from the supplied PDF page image in natural reading order.",
          "Preserve headings, paragraphs, names, numbers, punctuation, and the original language.",
          "Do not summarize, explain, translate, or add Markdown fences.",
          "If there is no readable text, return exactly NO_TEXT.",
        ].join(" "),
        input: [{
          role: "user",
          content: [
            { type: "input_text", text: `Transcribe PDF page ${pageNumber}. Return only the page text.` },
            { type: "input_image", image_url: image, detail: "high" },
          ],
        }],
        max_output_tokens: 3500,
      }),
    });
    if (!upstream.ok) throw await openAIError(upstream);
    const payload = (await upstream.json()) as Parameters<typeof responseText>[0];
    const text = responseText(payload).trim();
    return Response.json({ text: text === "NO_TEXT" ? "" : text });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
