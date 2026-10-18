import test from "node:test";
import assert from "node:assert/strict";
import { indexedDB, IDBKeyRange } from "fake-indexeddb";
import { loadHistory, saveHistory, clearHistory, loadSummaries } from "../lib/reading-history.ts";
import { buildConversationContext, normalizeHistory, recallHistory, splitText, bytes, validateContext, HISTORY_BUDGET, SUMMARY_BATCH } from "../lib/conversation-context.ts";

test("full history survives more than 20 turns, migration, concurrent saves and scoped clearing", async () => {
  globalThis.indexedDB = indexedDB; globalThis.IDBKeyRange = IDBKeyRange;
  const map = new Map();
  globalThis.localStorage = { get length() { return map.size; }, key: i => [...map.keys()][i], getItem: k => map.get(k) ?? null, setItem: (k,v) => map.set(k,v), removeItem: k => map.delete(k) };
  const turns = Array.from({ length: 80 }, (_, i) => ({ id: String(i), question: `问题${i}`, answer: `原始回答${i}[S1]`, sources: [{ text: "原始引用" }] }));
  map.set("voicebook-history:alice:book", JSON.stringify(turns.slice(0,20)));
  assert.deepEqual(await loadHistory("alice", "book"), turns.slice(0,20));
  assert.equal(map.size, 0);
  await saveHistory("alice", "book", turns, { cached: "记忆" });
  assert.deepEqual(await loadHistory("alice", "book"), turns);
  await Promise.all([saveHistory("alice","book",[{ id:"tab-a", question:"甲" }]), saveHistory("alice","book",[{ id:"tab-b", question:"乙" }])]);
  assert.equal((await loadHistory("alice","book")).length,82);
  await saveHistory("alice", "second", [{id:"other"}]);
  await saveHistory("bob", "book", [{id:"private"}], {secret:"private memory"});
  await clearHistory("alice", "book");
  assert.equal((await loadHistory("alice", "book")).length,0);
  assert.deepEqual(await loadSummaries("alice", "book"),{});
  assert.equal((await loadHistory("alice", "second")).length,1);
  await clearHistory("alice");
  assert.equal((await loadHistory("alice", "second")).length,0);
  assert.equal((await loadHistory("bob", "book"))[0].id,"private");
  assert.equal((await loadSummaries("bob", "book")).secret,"private memory");
  map.set("voicebook-history:alice:broken", "invalid JSON");
  await assert.rejects(loadHistory("alice","broken"));
  assert.equal(map.get("voicebook-history:alice:broken"),"invalid JSON");
});
test("short conversations send every turn verbatim, regardless of turn count", async () => {
  const turns = Array.from({length:100},(_,i)=>({question:`question ${i}`,answer:`answer ${i}`}));
  const plan = await buildConversationContext("followup",turns,{},async()=>{throw new Error("Must not summarize");});
  assert.equal(plan.mode,"full"); assert.deepEqual(plan.turns,turns); assert.equal(plan.totalTurns,100);
  assert.deepEqual(validateContext(plan),plan);
});
test("long history summarizes every earlier byte, recalls old specifics and reuses cached summaries", async () => {
  const turns = Array.from({length:200},(_,i)=>({question:i===0?"最初的阅读目标是海鸥项目，截止周五":`topic ${i}`,answer:"解释与讨论。".repeat(90)}));
  const original = JSON.stringify(turns), cache = {}, inputs=[];
  const summarize = async text => { inputs.push(text); return text.includes("海鸥项目")?"用户目标：海鸥项目，周五截止。":"其他阅读讨论摘要。"; };
  const plan = await buildConversationContext("我最初的海鸥项目要求是什么？",turns,cache,summarize);
  assert.equal(plan.mode,"compressed"); assert.ok(plan.turns.length > 3);
  assert.ok(plan.recalled.some(x=>x.includes("海鸥项目")));
  assert.ok(inputs.every(x=>bytes(x)<=SUMMARY_BATCH));
  const cut=turns.length-plan.turns.length;
  const expected=normalizeHistory(turns.slice(0,cut)).map((x,i)=>`第 ${i+1} 轮\n用户：${x.question}\n助手：${x.answer}`).join("\n\n");
  assert.equal(inputs.join(""),expected);
  assert.ok(bytes(JSON.stringify(plan))<=HISTORY_BUDGET);
  const count=inputs.length;
  await buildConversationContext("new query",turns,cache,summarize);
  assert.equal(inputs.length,count); assert.equal(JSON.stringify(turns),original);
});
test("hierarchical summaries shrink and a huge single turn is not silently dropped", async () => {
  const turns=[{question:"长问题",answer:"字".repeat(120000)}];
  const inputs=[];
  const context=await buildConversationContext("长问题",turns,{},async text=>{inputs.push(text); assert.ok(bytes(text)<=SUMMARY_BATCH);return "摘要".repeat(300);});
  assert.ok(inputs.some(text=>text.startsWith("摘要"))); assert.equal(context.totalTurns,1); assert.equal(context.mode,"compressed");
  assert.equal(turns[0].answer.length,120000);
});
test("summary failure preserves originals and already completed cache blocks",async()=>{
  const turns=[{question:"goal",answer:"x".repeat(400000)}],cache={}; let calls=0;
  await assert.rejects(buildConversationContext("why",turns,cache,async()=>{if(++calls===2)throw new Error("offline");return "first summary";}),/offline/);
  assert.equal(Object.keys(cache).length,1); assert.equal(turns[0].answer.length,400000);
});
test("UTF-8 splitting is lossless, early recall is relevant, and oversized inputs fail explicitly",()=>{
  const text="🕊中文 hello ".repeat(3000), parts=splitText(text,16000);
  assert.equal(parts.join(""),text);assert.ok(parts.every(x=>bytes(x)<=16000));
  assert.match(recallHistory("第 1 轮说了什么",[{question:"apricot",answer:"first"},{question:"orange",answer:"second"}]).join(""),/apricot/);
  assert.throws(()=>validateContext({mode:"full",turns:[],summary:"",recalled:[],totalTurns:20}),/Incomplete/);
  assert.throws(()=>validateContext({mode:"full",turns:[{question:"a",answer:"x".repeat(HISTORY_BUDGET+100)}],summary:"",recalled:[],totalTurns:1}),/oversized/);
});
