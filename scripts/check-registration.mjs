// Run ONLY after UI registration of acceptance-reader in a fresh disposable DB.
// Synthetic credentials are for this loopback-only fixture, never production.
import assert from 'node:assert/strict';
const base=process.env.VOICEBOOK_QA_BASE_URL||'http://127.0.0.1:8876';
if(process.env.VOICEBOOK_QA_DISPOSABLE!=='1'||new URL(base).protocol!=='http:'||!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw new Error('Requires an explicitly disposable HTTP loopback server');
async function call(path,{method='GET',body,cookie=''}={}){
 const response=await fetch(base+path,{method,headers:{origin:base,cookie,'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
}
async function login(username,password='synthetic-reader-password'){const r=await call('/api/auth/login',{method:'POST',body:{username,password}});assert.equal(r.status,200);return r.cookie;}
const reader=await login('acceptance-reader');
const quota=(await call('/api/quota',{cookie:reader})).data.quota;
assert.equal(quota.user.role,undefined);assert.equal(quota.isAdmin,false);assert.equal(quota.questions.limit,20);assert.equal(quota.voice.limitSeconds,600);
assert.equal((await call('/api/admin/users',{cookie:reader})).status,403);
assert.equal((await call('/api/admin/feedback',{cookie:reader})).status,403);
assert.equal((await call('/api/preferences')).status,401);
const before=(await call('/api/auth/register')).data;assert.equal(before.remaining,1,'UI should have created exactly one account');
const results=await Promise.all(Array.from({length:5},(_,i)=>call('/api/auth/register',{method:'POST',body:{username:`parallel-reader-${i}`,password:'synthetic-reader-password'}})));
assert.equal(results.filter(r=>r.status===201).length,1);assert.equal(results.filter(r=>r.status===429).length,4);
const winner=results.findIndex(r=>r.status===201),other=await login(`parallel-reader-${winner}`);
const otherId=(await call('/api/quota',{cookie:other})).data.quota.user.userId;
assert.equal((await call('/api/auth/register')).data.remaining,0);
const settings={tone:'friendly',length:'brief',guidance:'Test preference: lead with the conclusion.',rememberHistory:true};
assert.equal((await call('/api/preferences',{method:'PUT',cookie:reader,body:{...settings,userId:otherId}})).status,200);
assert.deepEqual((await call('/api/preferences',{cookie:reader})).data.preferences,settings);
assert.notDeepEqual((await call('/api/preferences',{cookie:other})).data.preferences,settings);
await call('/api/auth/logout',{method:'POST',cookie:reader,body:{}});
assert.equal((await call('/api/quota',{cookie:reader})).status,401);
const again=await login('acceptance-reader');assert.deepEqual((await call('/api/preferences',{cookie:again})).data.preferences,settings);
const feedback={exchangeId:'acceptance-feedback',bookName:'Synthetic book',question:'Synthetic question',answer:'Synthetic answer [S1]',rating:'unhelpful',tags:['太长'],comment:'Use one sentence.'};
assert.equal((await call('/api/feedback',{method:'POST',cookie:again,body:feedback})).status,200);
assert.equal((await call('/api/feedback',{method:'POST',cookie:again,body:{...feedback,rating:'helpful'}})).status,200);
assert.deepEqual((await call('/api/preferences',{cookie:again})).data.preferences,settings,'Ratings must not silently become permanent preferences');
const admin=await login('acceptance-admin','synthetic-acceptance-password');
const rows=(await call('/api/admin/feedback',{cookie:admin})).data.feedback.filter(r=>r.exchange_id===feedback.exchangeId);
assert.equal(rows.length,1);assert.equal(rows[0].rating,'helpful');
assert.equal((await call('/api/admin/users',{method:'POST',cookie:admin,body:{username:'invited-reader',password:'synthetic-reader-password'}})).status,201);
assert.equal((await call('/api/auth/register')).data.remaining,0,'Admin invitation must not reset or consume public places');
console.log('PASS: UI-created account login, default quotas, regular-only permissions, 1-of-5 concurrent final-slot admission, full-day rejection, preference persistence/account isolation, feedback idempotency/admin visibility, no automatic preference mutation, separate admin invitation. Disposable DB only.');
