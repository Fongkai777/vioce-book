import { env } from "cloudflare:workers";
import { normalizePreferences } from "./personalization";

export function readerDatabase() {
  if (!env.DB) throw new Error("Reader database is unavailable");
  return env.DB;
}

export async function readPreferences(userId: string) {
  const row = await readerDatabase().prepare("SELECT settings FROM reader_preferences WHERE user_id = ?").bind(userId).first<{ settings: string }>();
  return normalizePreferences(row ? JSON.parse(row.settings) : null);
}
