import { apiErrorResponse, requireApiUser } from "@/lib/quota";
import { sampleBundle, sampleCatalog } from "@/lib/sample-catalog";

export async function GET(request: Request) {
  try {
    await requireApiUser();
    const id = new URL(request.url).searchParams.get("id");
    const headers = { "Cache-Control": "private, no-store" };
    if (id === null) return Response.json({ samples: sampleCatalog }, { headers });
    const bundle = await sampleBundle(id);
    if (!bundle) return Response.json({ error: "Sample book not found." }, { status: 404, headers });
    return Response.json(bundle, { headers });
  } catch (error) { return apiErrorResponse(error); }
}
