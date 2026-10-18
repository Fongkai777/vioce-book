import {test,beforeEach,after} from "node:test";
import assert from "node:assert/strict";
import {registerHooks} from "node:module";
import {readFileSync,existsSync} from "node:fs";
import {fileURLToPath} from "node:url";
import ts from "typescript";
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
const paths=["auth/login","auth/logout","admin/users","admin/feedback","quota","samples","preferences","feedback","embed","answer","transcribe","speech","ocr","history/summary"];
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
