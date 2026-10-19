import {test,beforeEach,after} from "node:test";
import assert from "node:assert/strict";
import {registerHooks} from "node:module";
import {readFileSync,existsSync} from "node:fs";
import {fileURLToPath} from "node:url";
import ts from "typescript";
import {pcmWav} from "../lib/voice-turn.ts";
import {env,jar,reset,close,database} from "./fixtures/server-runtime.mjs";
const root=new URL("../",import.meta.url),host=new URL("./fixtures/server-runtime.mjs",import.meta.url).href;
const hook=registerHooks({
  resolve(specifier,context,next){
    if(["cloudflare:workers","next/headers","next/navigation"].includes(specifier))return {url:host,shortCircuit:true};
    if(specifier.startsWith("@/"))return {url:new URL(specifier.slice(2)+".ts",root).href,shortCircuit:true};
    if(specifier.startsWith(".")&&context.parentURL&&!/\.[a-z]+$/.test(specifier)){
      const url=new URL(specifier+".ts",context.parentURL);if(existsSync(url))return {url:url.href,shortCircuit:true};
    }
    return next(specifier,context);
  },
  load(url,context,next){
    if(url.startsWith(root.href)&&url.endsWith(".ts")&&!url.includes("/node_modules/"))return {format:"module",shortCircuit:true,source:ts.transpileModule(readFileSync(fileURLToPath(url),"utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText};
    return next(url,context);
  }
});
const auth=await import("../lib/auth.ts"),quota=await import("../lib/quota.ts"),errors=await import("../lib/errors.ts"),provider=await import("../lib/openai.ts");
const ops=await import("../lib/operations.ts"),backup=await import("../lib/server-backup.ts"),cryptoBackup=await import("../lib/backup-crypto.ts");
const paths=["auth/login","auth/logout","admin/users","admin/feedback","admin/operations","admin/backup","health","quota","samples","preferences","feedback","embed","answer","transcribe","speech","ocr","history/summary"];
const routes=Object.fromEntries(await Promise.all(paths.map(async path=>[path,await import(`../app/api/${path}/route.ts`)])));
hook.deregister();
const originalFetch=globalThis.fetch;
beforeEach(()=>{reset();globalThis.fetch=async()=>{throw new Error("External fetch forbidden in server tests");};});
after(()=>{close();globalThis.fetch=originalFetch;});
const request=(path,body={},method="POST",headers={})=>new Request(`https://voicebook.test/api/${path}`,{method,headers:{"Content-Type":"application/json",...headers},body:JSON.stringify(body)});
async function reader(name="reader"){const id=await auth.createUserAccount({username:name,password:"synthetic-reader-password"});return {userId:id,username:name,displayName:name,role:"user"};}
async function login(name="reader") {const result=await auth.authenticate(name,name==="admin"?env.ADMIN_PASSWORD:"synthetic-reader-password");await auth.setSessionCookie(result.token,true);return result;}

test("all committed D1 migrations apply and bootstrap creation is idempotent under concurrency",async()=>{
  await Promise.all([auth.ensureBootstrapAdmin(),auth.ensureBootstrapAdmin()]);
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM app_users").get().n,1);
  const row=database.prepare("SELECT * FROM app_users").get();
  assert.equal(row.role,"admin");assert.notEqual(row.password_hash,env.ADMIN_PASSWORD);assert.match(row.password_hash,/^pbkdf2\$/);
});
test("password salts differ; wrong credentials and disabled users cannot log in",async()=>{
  assert.notEqual(await auth.hashPassword("same-password"),await auth.hashPassword("same-password"));
  const user=await reader();await assert.rejects(auth.authenticate(user.username,"incorrect"),{status:401});
  database.prepare("UPDATE app_users SET active=0 WHERE user_id=?").run(user.userId);
  await assert.rejects(auth.authenticate(user.username,"synthetic-reader-password"),{status:401});
});
test("sessions are hashed at rest, cookie flags are secure, expiry and logout revoke access",async()=>{
  const user=await reader();const {token}=await login();
  const row=database.prepare("SELECT * FROM auth_sessions WHERE user_id=?").get(user.userId);
  assert.notEqual(row.token_hash,token);
  assert.equal((await auth.getAuthenticatedUser()).userId,user.userId);
  assert.deepEqual(jar.get("voicebook_session").options,{httpOnly:true,sameSite:"lax",secure:true,path:"/",maxAge:604800});
  database.prepare("UPDATE auth_sessions SET expires_at='2000-01-01'").run();
  assert.equal(await auth.getAuthenticatedUser(),null);
  await login();await auth.clearSession(true);assert.equal(await auth.getAuthenticatedUser(),null);
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM auth_sessions").get().n,0);
});
test("login validates lengths and JSON before hashing and applies per-IP/account throttling",async()=>{
  assert.equal((await routes["auth/login"].POST(request("auth/login",{username:"admin",password:"x".repeat(129)}))).status,400);
  const malformed=new Request("https://voicebook.test/api/auth/login",{method:"POST",body:"{"});
  assert.equal((await routes["auth/login"].POST(malformed)).status,400);
  const req=request("auth/login",{},"POST",{"cf-connecting-ip":"192.0.2.1"});
  for(let i=0;i<10;i++)await auth.enforceLoginRateLimit(req," Admin ");
  await assert.rejects(auth.enforceLoginRateLimit(req,"admin"),{status:429});
  database.prepare("UPDATE auth_login_attempts SET window_started_at='2000-01-01'").run();
  const key=await auth.enforceLoginRateLimit(req,"admin");await auth.clearLoginRateLimit(key);
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM auth_login_attempts").get().n,0);
});
test("every mutation route rejects foreign origins before auth, parsing or provider work",async()=>{
  for(const [path,route] of Object.entries(routes))for(const method of ["POST","PUT","PATCH","DELETE"]){
    if(!route[method])continue;
    const response=await route[method](request(path,{},method,{origin:"https://attacker.test"}));
    assert.equal(response.status,403,`${path} ${method}`);
  }
  const response=await routes["auth/login"].POST(request("auth/login",{},"POST",{"sec-fetch-site":"cross-site"}));assert.equal(response.status,403);
});
test("private and model routes reject unauthenticated requests without any external fetch",async()=>{
  for(const path of ["quota","samples","preferences","admin/users","admin/feedback"]){
    assert.equal((await routes[path].GET(new Request(`https://voicebook.test/api/${path}`))).status,401,path);
  }
  const bodies={answer:{},feedback:{},"history/summary":{},embed:{texts:["question"],purpose:"query"},speech:{text:"hello"},ocr:{image:"data:image/png;base64,AAAA"}};
  for(const [path,body] of Object.entries(bodies))assert.equal((await routes[path].POST(request(path,body))).status,401,path);
  const form=new FormData();form.set("audio",new File(["synthetic audio"],"test.wav",{type:"audio/wav"}));form.set("durationSeconds","1");
  assert.equal((await routes.transcribe.POST(new Request("https://voicebook.test/api/transcribe",{method:"POST",body:form}))).status,401);
});
test("regular users cannot read or modify administrator resources",async()=>{
  await reader();await login();
  for(const method of ["GET","POST","PATCH"]){const response=await routes["admin/users"][method](method==="GET"?undefined:request("admin/users",{userId:"admin",questionLimit:500,voiceMinutesLimit:600},method));assert.equal(response.status,403);}
  assert.equal((await routes["admin/feedback"].GET()).status,403);
});
test("concurrent quota requests cannot overspend; counters and overrides are account-scoped",async()=>{
  const alice=await reader("alice"),bob=await reader("bob");
  const results=await Promise.allSettled(Array.from({length:30},()=>quota.consumeQuota(alice,"question",1)));
  assert.equal(results.filter(x=>x.status==="fulfilled").length,20);
  assert.ok(results.filter(x=>x.status==="rejected").every(x=>x.reason.status===429));
  assert.equal((await quota.getQuotaSnapshot(alice)).questions.remaining,0);
  assert.equal((await quota.getQuotaSnapshot(bob)).questions.used,0);
  database.prepare("INSERT INTO quota_overrides VALUES(?,?,?,?)").run(bob.userId,1,2,new Date().toISOString());
  await quota.consumeQuota(bob,"voice",1.1);await assert.rejects(quota.consumeQuota(bob,"voice",1),{status:429});
  assert.equal((await quota.getQuotaSnapshot(bob)).voice.usedSeconds,2);
});
test("query/index/speech/summary budgets enforce boundaries; malformed amounts do not mutate usage",async()=>{
  const user=await reader();
  for(const [meter,limit] of [["queryEmbedding",40],["embedding",750000],["speech",50000],["historySummary",500000]]){
    await quota.consumeQuota(user,meter,limit);await assert.rejects(quota.consumeQuota(user,meter,1),{status:429});
  }
  for(const amount of [NaN,Infinity,-1,0,Number.MAX_SAFE_INTEGER+1])await assert.rejects(quota.consumeQuota(user,"question",amount),{status:400});
  assert.equal((await quota.getQuotaSnapshot(user)).questions.used,0);
  assert.equal(quota.singaporeDate(new Date("2026-10-18T15:59:59Z")),"2026-10-18");
  assert.equal(quota.singaporeDate(new Date("2026-10-18T16:00:00Z")),"2026-10-19");
});
test("preference and feedback writes ignore client-supplied identity; readers cannot see other accounts",async()=>{
  const alice=await reader("alice"),bob=await reader("bob");await login("alice");
  const settings={tone:"friendly",length:"brief",guidance:"Alice only",rememberHistory:true,userId:bob.userId};
  assert.equal((await routes.preferences.PUT(request("preferences",settings,"PUT"))).status,200);
  const feedback={exchangeId:"shared-exchange",bookName:"Test",question:"Question",answer:"Answer",rating:"helpful",userId:bob.userId};
  assert.equal((await routes.feedback.POST(request("feedback",feedback))).status,200);
  assert.equal(database.prepare("SELECT user_id FROM answer_feedback").get().user_id,alice.userId);
  await login("bob");const body=await (await routes.preferences.GET()).json();assert.notEqual(body.preferences.guidance,"Alice only");
  assert.equal((await routes.feedback.POST(request("feedback",{...feedback,rating:"unhelpful"}))).status,200);
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM answer_feedback").get().n,2);
});
test("sample catalog is authenticated, allowlisted, read-only and does not spend quota",async()=>{
  const user=await reader();await login();const before=await quota.getQuotaSnapshot(user);
  const response=await routes.samples.GET(new Request("https://voicebook.test/api/samples"));assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"private, no-store");
  const body=await response.json();assert.ok(body.samples.length>0);assert.ok(body.samples.every(x=>!x.index&&!x.ownerId));
  assert.equal((await routes.samples.GET(new Request("https://voicebook.test/api/samples?id=private-book"))).status,404);
  assert.deepEqual(await quota.getQuotaSnapshot(user),before);
});
test("unknown failures and upstream error bodies cannot disclose secrets to the client",async()=>{
  const secret="synthetic confidential payload";
  assert.doesNotMatch(JSON.stringify(await errors.apiErrorResponse(new Error(secret)).json()),new RegExp(secret));
  const upstream=await provider.openAIError(Response.json({error:{message:secret}},{status:401}));
  const response=errors.apiErrorResponse(upstream);assert.equal(response.status,502);assert.doesNotMatch(JSON.stringify(await response.json()),new RegExp(secret));
  assert.equal(errors.apiErrorResponse(await provider.openAIError(new Response("",{status:429}))).status,503);
  assert.equal(errors.apiErrorResponse(new errors.ApiError("Public validation",400)).status,400);
  assert.equal(errors.apiErrorResponse(new Error("internal")).headers.get("cache-control"),"no-store");
  const configuredFailure=provider.jsonError(new Error(secret),503);assert.equal(configuredFailure.status,503);assert.doesNotMatch(JSON.stringify(await configuredFailure.json()),new RegExp(secret));
});
test("invalid answer evidence fails before consuming question quota",async()=>{
  const user=await reader();await login();
  const response=await routes.answer.POST(request("answer",{question:"Why?",contexts:[{id:"bad",text:"Some text"}]}));
  assert.equal(response.status,400);assert.equal((await quota.getQuotaSnapshot(user)).questions.used,0);
});

test("global reservations are atomic across accounts and never overspend under concurrency",async()=>{
  const outcomes=await Promise.allSettled(Array.from({length:20},(_,i)=>ops.reserveProvider(`account-${i}`,1500000)));
  const accepted=outcomes.filter(r=>r.status==="fulfilled");assert.equal(accepted.length,3);
  assert.equal(database.prepare("SELECT reserved_micros FROM operations_usage").get().reserved_micros,4500000);
  for(const r of accepted)await ops.releaseProvider(r.value);
  assert.equal(database.prepare("SELECT reserved_micros FROM operations_usage").get().reserved_micros,4500000,"releasing a lease never refunds spend");
  await assert.rejects(ops.reserveProvider("next",500001),{status:429});
  await ops.reserveProvider("next",500000);
});
test("global/user concurrency, kill switch, expiry and Singapore day rollover are enforced",async()=>{
  const now=Date.parse("2026-10-18T15:59:00Z");
  await ops.reserveProvider("alice",1000,now);await ops.reserveProvider("alice",1000,now);
  await assert.rejects(ops.reserveProvider("alice",1000,now),{status:429});
  await ops.reserveProvider("bob",1000,now);await ops.reserveProvider("carol",1000,now);
  await assert.rejects(ops.reserveProvider("dave",1000,now),{status:429});
  await ops.reserveProvider("dave",1000,now+181000);
  assert.deepEqual(database.prepare("SELECT date,reserved_micros FROM operations_usage ORDER BY date").all().map(r=>({...r})),[
    {date:"2026-10-18",reserved_micros:4000},{date:"2026-10-19",reserved_micros:1000}]);
  database.prepare("UPDATE operations_settings SET enabled=0").run();
  await assert.rejects(ops.reserveProvider("dave",1000,now+181000),{status:429});
  for(const n of [0,-1,NaN,Infinity,1.1])await assert.rejects(ops.reserveProvider("a",n),{status:400});
});
test("provider wrapper holds lease through body, charges failures, and paused service never fetches",async()=>{
  let calls=0;
  globalThis.fetch=async()=>{calls++;assert.equal(database.prepare("SELECT COUNT(*) AS n FROM operations_leases").get().n,1);return Response.json({ok:true});};
  await ops.providerFetch("embed","alice","https://provider.invalid",{method:"POST",body:'{"input":"hello"}'});
  assert.equal(calls,1);assert.equal(database.prepare("SELECT COUNT(*) AS n FROM operations_leases").get().n,0);
  globalThis.fetch=async()=>{throw new Error("synthetic provider failure");};
  await assert.rejects(ops.providerFetch("speech","alice","https://provider.invalid",{method:"POST",body:'{"input":"hello"}'}));
  const reserved=database.prepare("SELECT reserved_micros FROM operations_usage").get().reserved_micros;assert.ok(reserved>1000);
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM operations_leases").get().n,0);
  database.prepare("UPDATE operations_settings SET enabled=0").run();
  globalThis.fetch=async()=>{assert.fail("paused service must not fetch");};
  await assert.rejects(ops.providerFetch("embed","alice","https://provider.invalid",{body:"{}"}),{status:429});
  assert.equal(ops.estimateReservation("transcribe",new FormData()),1000000);
});
test("provider usage reconciles exactly once, preserving original-day accounting and legacy spend",async()=>{
  const now=Date.parse("2026-10-18T15:59:00Z");
  const id=await ops.reserveProvider("alice",10000,now);
  await ops.reserveProvider("bob",3000,now+181000); // expire lease and cross Singapore midnight
  const usage={micros:1200,inputTokens:800,cachedTokens:0,outputTokens:500};
  await Promise.all([ops.settleProvider(id,usage),ops.settleProvider(id,usage)]);
  assert.equal(database.prepare("SELECT reserved_micros FROM operations_usage WHERE date='2026-10-18'").get().reserved_micros,1200);
  assert.equal(database.prepare("SELECT reserved_micros FROM operations_usage WHERE date='2026-10-19'").get().reserved_micros,3000);
  assert.equal(database.prepare("SELECT settled_micros FROM operations_costs WHERE id=?").get(id).settled_micros,1200);
});
test("settlement records costs above reserve without hiding overspend, preventing further admission",async()=>{
  const id=await ops.reserveProvider("alice",1000);
  await ops.settleProvider(id,{micros:6000000,inputTokens:100,cachedTokens:0,outputTokens:100});
  await ops.releaseProvider(id);
  await assert.rejects(ops.reserveProvider("bob",1),/remaining daily AI budget/);
  const snapshot=await ops.operationsSnapshot();assert.equal(snapshot.settledMicros,6000000);assert.equal(snapshot.estimatedMicros,0);
});
test("known provider usage settles, incomplete/error responses stay reserved, old estimates are identifiable",async()=>{
  const url="https://api.openai.com/v1/responses",body=JSON.stringify({model:"gpt-5-mini",input:"hello",max_output_tokens:1400});
  globalThis.fetch=async()=>Response.json({usage:{input_tokens:10000,output_tokens:1000,input_tokens_details:{cached_tokens:2000}}});
  await ops.providerFetch("answer","a",url,{body});
  assert.equal(database.prepare("SELECT reserved_micros FROM operations_usage").get().reserved_micros,4050);
  globalThis.fetch=async()=>Response.json({usage:{input_tokens:1,output_tokens:1}},{status:500});
  await ops.providerFetch("answer","a",url,{body});
  globalThis.fetch=async()=>Response.json({output_text:"test",usage:{input_tokens:"1",output_tokens:1}});
  await ops.providerFetch("answer","a",url,{body});
  database.prepare("UPDATE operations_usage SET reserved_micros=reserved_micros+12345").run();
  const snapshot=await ops.operationsSnapshot();assert.equal(snapshot.settledMicros,4050);assert.equal(snapshot.legacyMicros,12345);
  assert.equal(snapshot.estimatedMicros,2*ops.estimateReservation("answer",body,url));
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM operations_leases").get().n,0);
});
test("budget denial reasons distinguish pause, concurrency and insufficient remaining budget",async()=>{
  await ops.reserveProvider("a",1000);await ops.reserveProvider("a",1000);
  await assert.rejects(ops.reserveProvider("a",1000),/Too many AI requests/);
  database.prepare("UPDATE operations_settings SET enabled=0").run();
  await assert.rejects(ops.reserveProvider("b",1000),/paused by the administrator/);
});
test("admin legacy correction preserves v2 costs, pending work, quotas, cap and request counts",async()=>{
  await login("admin");
  const id=await ops.reserveProvider("alice",10000);await ops.settleProvider(id,{micros:1200,inputTokens:800,cachedTokens:0,outputTokens:500});
  await ops.reserveProvider("bob",3000);
  database.prepare("UPDATE operations_usage SET reserved_micros=reserved_micros+4742560").run();
  const before=await ops.operationsSnapshot(),date=before.date;
  const response=await routes["admin/operations"].POST(request("admin/operations",{action:"clear-legacy-estimate",date,expectedMicros:4742560}));
  assert.equal(response.status,200);const after=await response.json();
  assert.equal(after.legacyMicros,0);assert.equal(after.reservedMicros,4200);
  assert.equal(after.settledMicros,1200);assert.equal(after.estimatedMicros,3000);
  assert.equal(after.providerRequests,before.providerRequests);assert.deepEqual(after.settings,{...before.settings});
  const audit=database.prepare("SELECT * FROM operations_audit WHERE id=?").get(`legacy-estimate-clear:${date}`);
  assert.match(audit.action,/4742560 USD micros; before=4746760; after=4200/);assert.ok(audit.actor);
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM operations_costs").get().n,2);
});
test("legacy correction rejects stale, foreign-day, malformed and repeated requests without clearing newer costs",async()=>{
  await ops.reserveProvider("alice",1000);database.prepare("UPDATE operations_usage SET reserved_micros=6000").run();
  const date=quota.singaporeDate();
  for(const amount of [0,-1,NaN,1.5])await assert.rejects(ops.clearLegacyEstimate("admin",date,amount),{status:400});
  await assert.rejects(ops.clearLegacyEstimate("admin","2000-01-01",5000),{status:400});
  await assert.rejects(ops.clearLegacyEstimate("admin",date,4999),{status:409});
  const outcomes=await Promise.allSettled([ops.clearLegacyEstimate("admin",date,5000),ops.clearLegacyEstimate("admin",date,5000)]);
  assert.equal(outcomes.filter(x=>x.status==="fulfilled").length,1);
  assert.equal(database.prepare("SELECT reserved_micros FROM operations_usage").get().reserved_micros,1000);
  database.prepare("UPDATE operations_usage SET reserved_micros=6000").run(); // an old restore cannot make the correction repeat
  await assert.rejects(ops.clearLegacyEstimate("admin",date,5000),{status:409});
  assert.equal(database.prepare("SELECT reserved_micros FROM operations_usage").get().reserved_micros,6000);
});
test("legacy correction requires admin and same origin; account allowances are untouched",async()=>{
  const user=await reader();await login();const before=await quota.getQuotaSnapshot(user);
  const body={action:"clear-legacy-estimate",date:quota.singaporeDate(),expectedMicros:5000};
  assert.equal((await routes["admin/operations"].POST(request("admin/operations",body))).status,403);
  await login("admin");
  assert.equal((await routes["admin/operations"].POST(request("admin/operations",body,"POST",{Origin:"https://foreign.test"}))).status,403);
  assert.equal((await routes["admin/operations"].POST(request("admin/operations",{...body,action:"reset-all"}))).status,400);
  assert.deepEqual(await quota.getQuotaSnapshot(user),before);
});
test("legacy adjustment failure rolls back audit and total, and other dates are untouched",async()=>{
  await ops.reserveProvider("alice",1000);const date=quota.singaporeDate();
  database.prepare("UPDATE operations_usage SET reserved_micros=6000").run();
  database.prepare("INSERT INTO operations_usage VALUES('2000-01-01',9000,1)").run();
  database.exec("CREATE TRIGGER reject_adjust BEFORE UPDATE ON operations_usage BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  await assert.rejects(ops.clearLegacyEstimate("admin",date,5000));
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM operations_audit").get().n,0);
  database.exec("DROP TRIGGER reject_adjust");await ops.clearLegacyEstimate("admin",date,5000);
  assert.equal(database.prepare("SELECT reserved_micros FROM operations_usage WHERE date='2000-01-01'").get().reserved_micros,9000);
});
test("transcription ignores forged client duration and rejects malformed audio before quota/provider usage",async()=>{
  const user=await reader();await login();
  const form=new FormData();form.set("audio",new File(["invalid audio"],"test.wav"));form.set("durationSeconds","1");
  assert.equal((await routes.transcribe.POST(new Request("https://voicebook.test/api/transcribe",{method:"POST",body:form}))).status,400);
  assert.equal((await quota.getQuotaSnapshot(user)).voice.usedSeconds,0);
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM operations_costs").get().n,0);
});
test("valid transcription bills verified WAV seconds and settles upstream tokens without forwarding client metadata",async()=>{
  const user=await reader();await login();
  const oldKey=process.env.OPENAI_API_KEY,oldBase=process.env.OPENAI_BASE_URL,oldModel=process.env.OPENAI_TRANSCRIBE_MODEL;
  process.env.OPENAI_API_KEY="synthetic-key";process.env.OPENAI_BASE_URL="https://api.openai.com/v1";process.env.OPENAI_TRANSCRIBE_MODEL="gpt-4o-mini-transcribe";
  try {
    globalThis.fetch=async(url,init)=>{
      assert.equal(init.body.has("durationSeconds"),false);
      assert.equal(database.prepare("SELECT COUNT(*) AS n FROM operations_leases").get().n,1);
      return Response.json({text:"synthetic words",usage:{input_tokens:1000,output_tokens:100,total_tokens:1100}});
    };
    const form=new FormData();form.set("audio",new File([pcmWav(new Float32Array(16000*10),16000)],"question.wav"));form.set("durationSeconds","1");
    const response=await routes.transcribe.POST(new Request("https://voicebook.test/api/transcribe",{method:"POST",body:form}));
    assert.equal(response.status,200);assert.equal((await response.json()).text,"synthetic words");
    assert.equal((await quota.getQuotaSnapshot(user)).voice.usedSeconds,10);
    assert.equal(database.prepare("SELECT reserved_micros FROM operations_usage").get().reserved_micros,1750);
  } finally {
    for(const [key,value] of [["OPENAI_API_KEY",oldKey],["OPENAI_BASE_URL",oldBase],["OPENAI_TRANSCRIBE_MODEL",oldModel]]){
      if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  }
});
test("settlement transaction failure rolls back the daily adjustment and retains the reservation",async()=>{
  const id=await ops.reserveProvider("alice",10000);
  database.exec("CREATE TRIGGER reject_settle BEFORE UPDATE ON operations_costs BEGIN SELECT RAISE(ABORT,'synthetic failure'); END");
  await assert.rejects(ops.settleProvider(id,{micros:100,inputTokens:100,cachedTokens:0,outputTokens:0}));
  assert.equal(database.prepare("SELECT reserved_micros FROM operations_usage").get().reserved_micros,10000);
  assert.equal(database.prepare("SELECT settled_micros FROM operations_costs").get().settled_micros,null);
});
test("oversized/chunked AI and login bodies are rejected before parsing or provider calls",async()=>{
  await reader();await login();
  assert.equal((await routes.speech.POST(new Request("https://voicebook.test/api/speech",{method:"POST",headers:{"Content-Length":"40001"},body:"{}"}))).status,413);
  assert.equal((await routes.speech.POST(request("speech",{text:"x".repeat(40001)}))).status,413);
  assert.equal((await routes["auth/login"].POST(request("auth/login",{password:"x".repeat(4097)}))).status,413);
});
test("operations and backup endpoints require admin, restore is same-origin, metrics contain no content",async()=>{
  await reader();await login();
  assert.equal((await routes["admin/operations"].GET()).status,403);
  assert.equal((await routes["admin/operations"].PATCH(request("admin/operations",{},"PATCH"))).status,403);
  assert.equal((await routes["admin/backup"].POST(request("admin/backup"))).status,403);
  assert.equal((await routes["admin/backup"].PUT(request("admin/backup",{},"PUT"))).status,403);
  await routes.speech.POST(request("speech",{text:""}));
  const snapshot=await ops.operationsSnapshot();assert.equal(snapshot.requests,1);assert.equal(snapshot.metrics[0].status,400);
  assert.ok(snapshot.metrics.every(r=>!('user_id' in r)&&!('text' in r)&&!('prompt' in r)));
});
test("administrator budget settings validate, pause persists, reductions do not reset spend",async()=>{
  await login("admin");await ops.reserveProvider("any",1000000);
  assert.equal((await routes["admin/operations"].PATCH(request("admin/operations",{enabled:false,dailyBudgetUsd:-1,maxConcurrent:4},"PATCH"))).status,400);
  const response=await routes["admin/operations"].PATCH(request("admin/operations",{enabled:false,dailyBudgetUsd:.5,maxConcurrent:2},"PATCH"));
  assert.equal(response.status,200);const value=await response.json();assert.equal(value.reservedMicros,1000000);assert.equal(value.settings.enabled,0);assert.equal(value.alerts.length,2);
});
test("server encrypted snapshot restores exact application data, revokes sessions and preserves spend",async()=>{
  await reader();await login("admin");await ops.operationsSettings();
  const lease=await ops.reserveProvider("reader",1000);await ops.releaseProvider(lease);
  assert.equal((await routes["admin/backup"].POST(request("admin/backup",{passphrase:"synthetic-backup-passphrase",password:"wrong"}))).status,401);
  const exported=await routes["admin/backup"].POST(request("admin/backup",{passphrase:"synthetic-backup-passphrase",password:env.ADMIN_PASSWORD}));assert.equal(exported.status,200);
  const encrypted=await exported.json();assert.equal('tables' in encrypted,false);
  const snapshot=await cryptoBackup.decryptBackup(encrypted,"synthetic-backup-passphrase");
  assert.equal('auth_sessions' in snapshot.tables,false);assert.equal('auth_login_attempts' in snapshot.tables,false);
  await reader("new-reader");database.prepare("UPDATE operations_usage SET reserved_micros=2000").run();
  const input={backup:encrypted,passphrase:"synthetic-backup-passphrase",password:env.ADMIN_PASSWORD,confirmation:"RESTORE SERVER DATA"};
  assert.equal((await routes["admin/backup"].PUT(request("admin/backup",input,"PUT"))).status,409);
  database.prepare("UPDATE operations_settings SET enabled=0").run();
  assert.equal((await routes["admin/backup"].PUT(request("admin/backup",{...input,password:"wrong"},"PUT"))).status,401);
  assert.equal((await routes["admin/backup"].PUT(request("admin/backup",input,"PUT"))).status,200);
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM app_users").get().n,2);
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM auth_sessions").get().n,0);
  assert.equal(database.prepare("SELECT enabled FROM operations_settings").get().enabled,0);
  assert.equal(database.prepare("SELECT reserved_micros FROM operations_usage").get().reserved_micros,2000);
});
test("server restore validates orphan data and rolls back completely on SQL constraint failure",async()=>{
  await reader();await login("admin");await ops.operationsSettings();
  database.prepare("UPDATE operations_settings SET enabled=0").run();
  const snapshot=await backup.exportServerSnapshot(), before=JSON.stringify(database.prepare("SELECT * FROM app_users ORDER BY user_id").all());
  const orphan=structuredClone(snapshot);orphan.tables.reader_preferences.push({user_id:"absent",settings:"{}",updated_at:"now"});
  assert.throws(()=>backup.validateServerSnapshot(orphan),{status:400});
  const broken=structuredClone(snapshot);broken.tables.app_users[0].username=broken.tables.app_users[1].username;
  await assert.rejects(backup.restoreServerSnapshot(broken,"admin"));
  assert.equal(JSON.stringify(database.prepare("SELECT * FROM app_users ORDER BY user_id").all()),before);
  assert.ok(database.prepare("SELECT COUNT(*) AS n FROM auth_sessions").get().n>0);
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM operations_audit WHERE action LIKE 'Server restore%'").get().n,0);
});
test("restore requires drained leases, corrupted backups cannot change database",async()=>{
  await login("admin");const snapshot=await backup.exportServerSnapshot();
  await ops.reserveProvider("alice",1000);database.prepare("UPDATE operations_settings SET enabled=0").run();
  await assert.rejects(backup.restoreServerSnapshot(snapshot,"admin"),{status:409});
  const encrypted=await cryptoBackup.encryptBackup(snapshot,"synthetic-backup-passphrase");encrypted.data=encrypted.data.slice(0,-8)+"AAAAAAAA";
  await assert.rejects(cryptoBackup.decryptBackup(encrypted,"synthetic-backup-passphrase"));
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM app_users").get().n,1);
});
test("health is no-store and fails closed on missing schema without leaking SQL",async()=>{
  const saved=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY="synthetic-configured-value";
  try {
    const good=await routes.health.GET();assert.equal(good.status,200);assert.equal(good.headers.get("cache-control"),"no-store");
    database.exec("DROP TABLE operations_metrics");const failed=await routes.health.GET();assert.equal(failed.status,503);assert.doesNotMatch(await failed.text(),/operations_metrics|SELECT/);
  } finally { if(saved===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=saved; }
});
