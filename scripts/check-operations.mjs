// Destructive only to an explicitly disposable LOOPBACK test database.
// Run a separate Wrangler --persist-to temp directory before using this script.
import assert from "node:assert/strict";
const base=process.env.VOICEBOOK_QA_BASE_URL||"http://127.0.0.1:8876";
if(process.env.VOICEBOOK_QA_DISPOSABLE!=="1" || !["127.0.0.1","localhost"].includes(new URL(base).hostname) || new URL(base).protocol!=="http:") {
  throw new Error("Requires VOICEBOOK_QA_DISPOSABLE=1 and a dedicated HTTP loopback test server. Never run against production.");
}
const username=process.env.VOICEBOOK_QA_USERNAME||"opsqa",password=process.env.VOICEBOOK_QA_PASSWORD||"synthetic-operations-password";
let cookie="";
async function call(path,method="GET",body) {
  const response=await fetch(base+path,{method,headers:{cookie,origin:base,"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined});
  if(response.headers.has("set-cookie"))cookie=response.headers.get("set-cookie").split(";")[0];
  const payload=await response.json();return {status:response.status,payload};
}
const login=()=>call("/api/auth/login","POST",{username,password});
assert.equal((await login()).status,200);
assert.equal((await call("/api/health")).status,200);
const initial=await call("/api/admin/operations");assert.equal(initial.status,200);assert.equal(initial.payload.settings.daily_budget_micros,5000000);
const passphrase="synthetic-qa-backup-passphrase";
const exported=await call("/api/admin/backup","POST",{passphrase,password});assert.equal(exported.status,200);assert.equal(exported.payload.format,"voicebook-encrypted");
const before=await call("/api/admin/users");
assert.equal((await call("/api/admin/users","POST",{username:`qarestore${Date.now()}`,password:"synthetic-restored-user-password"})).status,201);
assert.equal((await call("/api/admin/operations","PATCH",{enabled:false,dailyBudgetUsd:5,maxConcurrent:4})).status,200);
const restore={backup:exported.payload,passphrase,password,confirmation:"RESTORE SERVER DATA"};
assert.equal((await call("/api/admin/backup","PUT",{...restore,passphrase:"wrong-passphrase"})).status,400);
assert.equal((await call("/api/admin/backup","PUT",restore)).status,200);
assert.equal((await call("/api/admin/users")).status,401);
assert.equal((await login()).status,200);
const after=await call("/api/admin/users");assert.equal(after.payload.users.length,before.payload.users.length);
assert.equal((await call("/api/admin/operations")).payload.settings.enabled,0);
assert.equal((await call("/api/admin/operations","PATCH",{enabled:true,dailyBudgetUsd:5,maxConcurrent:4})).status,200);
console.log("Worker/D1 operations smoke passed: health, default $5, encrypted backup, wrong passphrase, transactional restore, session revocation, account recovery, explicit resume. No AI calls.");
