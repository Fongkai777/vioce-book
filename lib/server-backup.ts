import { ApiError } from "./errors";
import { operationsSettings, operationsDatabase } from "./operations";

// An application snapshot, not a raw D1 dump. Sessions/login attempts are never
// exported; restoring revokes sessions. Operations totals cannot be rolled back.
export const backupTables = {
  app_users: ["user_id", "email", "display_name", "created_at", "last_seen_at", "username", "password_hash", "role", "active"],
  quota_overrides: ["user_id", "question_limit", "voice_seconds_limit", "updated_at"],
  daily_usage: ["user_id", "usage_date", "question_count", "voice_seconds", "embedding_characters", "speech_characters", "updated_at", "query_embedding_count", "history_summary_characters"],
  reader_preferences: ["user_id", "settings", "updated_at"],
  answer_feedback: ["user_id", "exchange_id", "book_name", "question", "answer", "rating", "tags", "comment", "updated_at"],
  operations_usage: ["date", "reserved_micros", "requests"],
} as const;
type Table = keyof typeof backupTables;
type Row = Record<string, string | number | null>;
export type ServerSnapshot = { kind: "voicebook-server"; version: 1; createdAt: string; tables: Record<Table, Row[]> };
const names = Object.keys(backupTables) as Table[];
export function validateServerSnapshot(value: unknown): ServerSnapshot {
  const data = value as ServerSnapshot;
  if (!data || data.kind !== "voicebook-server" || data.version !== 1 || typeof data.createdAt !== "string" ||
    !Number.isFinite(Date.parse(data.createdAt)) || !data.tables ||
    Object.keys(data.tables).sort().join() !== [...names].sort().join()) throw new ApiError("Incompatible server backup", 400);
  for (const name of names) {
    const rows = data.tables[name], columns: readonly string[] = backupTables[name];
    if (!Array.isArray(rows) || rows.length > 10000 || new TextEncoder().encode(JSON.stringify(rows)).length > 1_500_000) throw new ApiError("Backup table exceeds the supported restore size", 413);
    for (const row of rows) {
      if (!row || Object.keys(row).sort().join() !== [...columns].sort().join() || Object.values(row).some(v =>
        v !== null && typeof v !== "string" && !(typeof v === "number" && Number.isSafeInteger(v) && v >= 0))) throw new ApiError("Invalid backup row", 400);
    }
  }
  if (!data.tables.app_users.some(row => row.role === "admin" && row.active === 1 && row.password_hash && row.username)) throw new ApiError("Backup must contain an active administrator", 400);
  const users = new Set(data.tables.app_users.map(row => row.user_id));
  if (users.size !== data.tables.app_users.length || data.tables.app_users.some(row => typeof row.user_id !== "string" ||
    !["user", "admin"].includes(String(row.role)) || ![0, 1].includes(Number(row.active)))) throw new ApiError("Invalid backup accounts", 400);
  for (const name of ["quota_overrides", "daily_usage", "reader_preferences", "answer_feedback"] as const) {
    if (data.tables[name].some(row => !users.has(row.user_id))) throw new ApiError("Backup contains orphaned account data", 400);
  }
  if (new TextEncoder().encode(JSON.stringify(data)).length > 4_000_000) throw new ApiError("Server snapshot exceeds the 4 MB recovery limit", 413);
  return data;
}
export async function exportServerSnapshot(): Promise<ServerSnapshot> {
  // D1 batch runs these reads sequentially in one transaction: consistent snapshot.
  const results = await operationsDatabase().batch(names.map(name => operationsDatabase().prepare(`SELECT ${backupTables[name].join(",")} FROM ${name} LIMIT 10001`)));
  const snapshot = { kind: "voicebook-server", version: 1, createdAt: new Date().toISOString(),
    tables: Object.fromEntries(names.map((name, i) => [name, results[i].results])) };
  return validateServerSnapshot(snapshot);
}
export async function restoreServerSnapshot(value: unknown, actor: string) {
  const snapshot = validateServerSnapshot(value);
  const settings = await operationsSettings();
  if (settings.enabled) throw new ApiError("Pause AI before restoring server data.", 409);
  const active = await operationsDatabase().prepare("SELECT COUNT(*) AS n FROM operations_leases WHERE expires_at>?").bind(Date.now()).first<{n: number}>();
  if (active?.n) throw new ApiError("Wait for in-flight AI requests to finish before restoring.", 409);
  // One transaction: any malformed/duplicate row or constraint failure rolls
  // everything back. Keep the control plane and global spend outside replacement.
  // Recheck maintenance preconditions INSIDE the transaction. A racing enable or
  // lease insertion causes a NOT NULL failure before any replacement can occur.
  const statements = [operationsDatabase().prepare(`INSERT INTO operations_audit(id,actor,action,created_at)
    VALUES(CASE WHEN (SELECT enabled FROM operations_settings WHERE id=1)=0
      AND NOT EXISTS(SELECT 1 FROM operations_leases WHERE expires_at>?) THEN ? ELSE NULL END,?,?,?)`)
    .bind(Date.now(), crypto.randomUUID(), actor, "Server restore authorized", new Date().toISOString()),
    operationsDatabase().prepare("DELETE FROM auth_sessions"), operationsDatabase().prepare("DELETE FROM auth_login_attempts")];
  for (const name of ["answer_feedback", "reader_preferences", "daily_usage", "quota_overrides", "app_users"]) statements.push(operationsDatabase().prepare(`DELETE FROM ${name}`));
  for (const name of names) {
    const columns = backupTables[name];
    const query = `INSERT INTO ${name}(${columns.join(",")}) SELECT ${columns.map(c => `json_extract(value,'$.${c}')`).join(",")} FROM json_each(?) WHERE 1`;
    statements.push(operationsDatabase().prepare(query + (name === "operations_usage" ? " ON CONFLICT(date) DO UPDATE SET reserved_micros=MAX(reserved_micros,excluded.reserved_micros),requests=MAX(requests,excluded.requests)" : ""))
      .bind(JSON.stringify(snapshot.tables[name])));
  }
  statements.push(operationsDatabase().prepare("INSERT INTO operations_audit VALUES(?,?,?,?)").bind(crypto.randomUUID(), actor, "Server backup restored; all sessions revoked; AI remains paused", new Date().toISOString()));
  await operationsDatabase().batch(statements);
}
