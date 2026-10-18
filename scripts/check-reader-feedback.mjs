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
assert.equal((await call("/api/samples")).response.status, 401);
const quotaBeforeSamples = (await call("/api/quota", reader)).data.quota;
const catalog = await call("/api/samples", reader);
assert.equal(catalog.response.status, 200);
assert.equal(catalog.data.samples.length, 2);
assert.ok(catalog.data.samples.every(book => book.id.startsWith("sample-") && !book.index && !book.fullText && !book.ownerId));
const sample = await call(`/api/samples?id=${catalog.data.samples[0].id}`, reader);
assert.equal(sample.response.status, 200);
assert.equal(sample.response.headers.get("cache-control"), "private, no-store");
assert.equal(sample.data.books.length, 1);
assert.equal(sample.data.books[0].index[0].embedding.length, 1536);
assert.equal((await call(`/api/samples?id=${catalog.data.samples[0].id}`)).response.status, 401);
assert.equal((await call("/api/samples?id=private-book", reader)).response.status, 404);
assert.equal((await fetch(origin + "/api/samples", { method: "POST", headers: { Cookie: reader } })).status, 405);
assert.deepEqual((await call("/api/quota", reader)).data.quota, quotaBeforeSamples);
console.log("PASS: authenticated read-only sample catalog, prebuilt vectors, unknown-book rejection, and zero quota usage on selection.");
if (process.argv.includes("--with-sample-model")) {
  const question = catalog.data.samples[0].suggestedQuestion;
  const query = await call("/api/embed", reader, "POST", { texts: [question], model: sample.data.books[0].embeddingModel, purpose: "query" });
  assert.equal(query.response.status, 200, query.data.error);
  const vector = query.data.embeddings[0];
  const ranked = sample.data.books[0].index.map(chunk => ({ chunk, score: chunk.embedding.reduce((sum, value, i) => sum + value * vector[i], 0) })).sort((a,b) => b.score - a.score);
  assert.match(ranked[0].chunk.sectionTitle, /notes/i);
  const result = await call("/api/answer", reader, "POST", { question, contexts: ranked.slice(0, 3).map(({chunk: {embedding, ...chunk}}) => chunk) });
  assert.equal(result.response.status, 200, result.data.error);
  assert.match(result.data.answer, /\[S\d+\]/);
  assert.match(result.data.answer, /claim/i);
  assert.match(result.data.answer, /location|page|source/i);
  assert.match(result.data.answer, /question|reaction/i);
  console.log("PASS: live sample query retrieves the correct pre-indexed chapter and answers with all three note components and citations.");
}
const defaults = (await call("/api/preferences", reader)).data.preferences;
assert.equal(defaults.rememberHistory, true);
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
assert.equal((await call("/api/history/summary", "", "POST", { text: "test" })).response.status,401);
assert.equal((await call("/api/history/summary", reader, "POST", { text: "" })).response.status,400);
assert.equal((await call("/api/history/summary", reader, "POST", { text: "x".repeat(17000) })).response.status,400);
if (process.argv.includes("--with-history-model")) {
  const source = "第 1 轮\n用户：我读这本书是为了海鸥项目，截止日期是周五，请帮我记住这个阅读目标。\n助手：我们会围绕这个目标展开讨论。";
  const before = (await call("/api/quota",reader)).data.quota.questions.used;
  const memory = await call("/api/history/summary",reader,"POST",{text:source});
  assert.equal(memory.response.status,200, memory.data.error);
  assert.match(memory.data.summary,/海鸥/); assert.match(memory.data.summary,/周五/);
  assert.equal((await call("/api/quota",reader)).data.quota.questions.used,before);
  const turns = [{question:"我的项目叫海鸥，周五截止。",answer:"明白。"}, ...Array.from({length:7},(_,i)=>({question:`第${i+2}个阅读问题`,answer:"我们讨论了如何核对原文。"}))];
  const contexts = [{ id:"qa-reading",sectionTitle:"阅读方法",pageStart:1,pageEnd:1,text:"核对原文可以避免将猜测误认为作者的结论。" }];
  for (const conversation of [
    {mode:"full",turns,summary:"",recalled:[],totalTurns:8},
    {mode:"compressed",turns:turns.slice(-2),summary:memory.data.summary,recalled:[source],totalTurns:8},
  ]) {
    const result=await call("/api/answer",reader,"POST",{question:"我最初说的项目叫什么，什么时候截止？",conversation,contexts});
    assert.equal(result.response.status,200,result.data.error);
    assert.match(result.data.answer,/海鸥/);assert.match(result.data.answer,/周五|星期五/);
  }
  console.log("PASS: live summary keeps original reading goal; full and compressed contexts recall first-turn details beyond three turns; summaries do not spend question quota.");
}
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
