import { redirect } from "next/navigation";
import { requireChatGPTUser } from "@/app/chatgpt-auth";
import { isAdminUser } from "@/lib/quota";
import AdminDashboard from "./admin-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireChatGPTUser("/admin");
  if (!isAdminUser(user)) redirect("/");
  return <AdminDashboard adminEmail={user.email} />;
}
