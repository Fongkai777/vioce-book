import { redirect } from "next/navigation";
import { requirePageUser } from "@/lib/auth";
import AdminDashboard from "./admin-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requirePageUser("/admin");
  if (user.role !== "admin") redirect("/");
  return <AdminDashboard adminUsername={user.username} />;
}
