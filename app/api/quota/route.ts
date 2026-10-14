import { apiErrorResponse, getQuotaSnapshot, requireApiUser } from "@/lib/quota";

export async function GET() {
  try {
    const user = await requireApiUser();
    return Response.json({ quota: await getQuotaSnapshot(user) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
