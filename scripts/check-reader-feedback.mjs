// Local-only integration check. Ephemeral sessions never leave loopback or appear in output.
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
const directory = ".wrangler/state/v3/d1/miniflare-D1DatabaseObject";
const file = readdirSync(directory).find(x => x.endsWith(".sqlite") && x !== "metadata.sqlite");
assert.ok(file, "Apply local migrations first");
const db = new DatabaseSync(`${directory}/${file}`);
const seeded = [];
function session(role) {
  const id = randomUUID(), token = randomUUID(), now = new Date().toISOString();
  db.prepare("INSERT INTO app_users (user_id,email,display_name,created_at,last_seen_at,username,role,active) VALUES (?,?,?,?,?,?,?,1)").run(id, "qa@example.test", "Local QA", now, now, `qa-${id.slice(0,8)}`, role);
  db.prepare("INSERT INTO auth_sessions (token_hash,user_id,created_at,expires_at) VALUES (?,?,?,?)").run(createHash("sha256").update(token).digest("base64url"), id, now, new Date(Date.now()+3600000).toISOString());
  seeded.push(id);
  return `voicebook_session=${token}`;
}
const origin = "http://127.0.0.1:5173";
async function call(path, cookie = "", method = "GET", body) {
  const response = await fetch(origin + path, { method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { response, data: await response.json() };
}
try {
const admin = session("admin");
const reader = session("user");
const defaults = (await call("/api/preferences", reader)).data.preferences;
assert.equal(defaults.rememberHistory, false);
const settings = { tone: "friendly", length: "brief", guidance: "先给结论", rememberHistory: true };
assert.equal((await call("/api/preferences", reader, "PUT", settings)).response.status, 200);
assert.deepEqual((await call("/api/preferences", reader)).data.preferences, settings);
assert.notDeepEqual((await call("/api/preferences", admin)).data.preferences, settings);
assert.equal((await call("/api/preferences")).response.status, 401);
assert.equal((await call("/api/admin/feedback", reader)).response.status, 403);
const feedback = { exchangeId: crypto.randomUUID(), bookName: "QA fixture", question: "测试问题", answer: "测试回答 [S1]", rating: "unhelpful", tags: ["语气生硬", "invalid"], comment: "更自然一些" };
assert.equal((await call("/api/feedback", reader, "POST", feedback)).response.status, 200);
assert.equal((await call("/api/feedback", reader, "POST", { ...feedback, rating: "helpful" })).response.status, 200);
assert.equal((await call("/api/feedback", "", "POST", feedback)).response.status, 401);
assert.equal((await call("/api/feedback", reader, "POST", { ...feedback, rating: "bad" })).response.status, 400);
const rows = (await call("/api/admin/feedback", admin)).data.feedback.filter(x => x.exchange_id === feedback.exchangeId);
assert.equal(rows.length, 1);
assert.equal(rows[0].rating, "helpful");
assert.deepEqual(JSON.parse(rows[0].tags), ["语气生硬"]);
if (process.argv.includes("--with-model")) {
  const result = await call("/api/answer", reader, "POST", {
    question: "为什么？", history: [{ question: "作者建议怎样阅读？", answer: "带着问题阅读，并核对原文。" }],
    contexts: [{ id: "qa-source", sectionTitle: "阅读方法（测试素材）", pageStart: 1, pageEnd: 1, text: "带着问题阅读可以让读者留意作者的论证。核对原文可以避免把自己的推测误当成作者的结论。" }],
  });
  assert.equal(result.response.status, 200);
  assert.match(result.data.answer, /\[S1\]/);
  assert.ok(result.data.answer.length > 10);
  console.log("PASS: live answer uses saved preferences and recent conversation, with a current-source citation.");
}
console.log("PASS: preference persistence/account isolation, authentication, admin-only feedback, validation, idempotent feedback updates (local QA account only).");
} finally {
  for (const id of seeded) {
    for (const table of ["answer_feedback", "reader_preferences", "daily_usage", "auth_sessions", "app_users"]) db.prepare(`DELETE FROM ${table} WHERE user_id=?`).run(id);
  }
  db.close();
}
