import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import { saveBook, getBook, listBooks, deleteBook } from "../lib/book-library.ts";
import { buildBM25Index, restoreBM25Index, bm25Scores, BM25_VERSION } from "../lib/retrieval.mjs";

const chunks = [{id:"one",sectionTitle:"Chapter 1",text:"queen rabbit queen 幸福之路",embedding:[1,0]}, {id:"two",sectionTitle:"Chapter 2",text:"rabbit patience 耐心",embedding:[0,1]}];
const book = id => ({id,name:id,pages:2,chapters:2,chunks:2,fileSize:0,storedAt:"2026-10-19",lastOpenedAt:"2026-10-19",index:structuredClone(chunks)});
function result(request) { return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}); }
async function edit(owner,id,change) {
  const db=await result(indexedDB.open("voicebook-library",2));
  try {
    const tx=db.transaction("book-content","readwrite"),store=tx.objectStore("book-content");
    const done=new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});
    const row=await result(store.get(`${owner}:${id}`));
    const next=change(row);if(next)store.put(next);
    await done;return row;
  } finally {db.close();}
}
test("statistics survive serialization with identical English and Chinese scores",async()=>{
  const saved=await buildBM25Index(chunks),loaded=structuredClone(chunks);
  assert.equal(await restoreBM25Index(loaded,JSON.parse(JSON.stringify(saved))),true);
  for(const query of ["queen rabbit","幸福","耐心","unknown"])assert.deepEqual(bm25Scores(query,loaded),bm25Scores(query,chunks));
  assert.equal(await restoreBM25Index(loaded,{...saved,version:0}),false);
  assert.equal(await restoreBM25Index(loaded,{...saved,df:[["queen",999]]}),false);
  loaded[0].text="different content";assert.equal(await restoreBM25Index(loaded,saved),false);
  assert.equal(bm25Scores("queen",loaded)[0],0);
});
test("book save and reload hydrate cache without tokenizing passages; metadata stays lightweight",async()=>{
  await saveBook("alice",book("persist"));
  const row=await edit("alice","persist",()=>null);assert.equal(row.bm25.version,BM25_VERSION);
  const match=String.prototype.match;let tokenizations=0;
  String.prototype.match=function(pattern){if(pattern?.source==="[\\p{L}\\p{N}]+")tokenizations++;return match.call(this,pattern);};
  try {
    const reopened=await getBook("alice","persist");
    assert.equal(tokenizations,0,"reload uses stored term frequencies, not tokenization");
    assert.ok(bm25Scores("queen",reopened.index)[0]>0);assert.equal(tokenizations,1,"only the query is tokenized");
  } finally {String.prototype.match=match;}
  assert.ok((await listBooks("alice")).every(row=>!("bm25"in row)&&!("index"in row)));
  assert.equal(await getBook("bob","persist"),undefined);
});
test("old, stale and corrupt caches rebuild locally without network or vector changes",async()=>{
  const originalFetch=globalThis.fetch;globalThis.fetch=()=>{throw Error("no network permitted");};
  try {
    await saveBook("alice",book("old"));
    for(const corrupt of [undefined,{version:0},{version:BM25_VERSION,fingerprint:"stale"}]){
      await edit("alice","old",row=>({...row,bm25:corrupt}));
      assert.deepEqual((await getBook("alice","old")).index,chunks);
      assert.equal((await edit("alice","old",()=>null)).bm25.version,BM25_VERSION);
    }
    await saveBook("bob",book("old"));await deleteBook("alice","old");
    assert.equal(await edit("alice","old",()=>null),undefined);
    assert.ok((await edit("bob","old",()=>null)).bm25);
  } finally {globalThis.fetch=originalFetch;}
});
test("lazy cache write cannot resurrect a book deleted while its fingerprint is computed",async()=>{
  await saveBook("alice",book("race"));await edit("alice","race",row=>({...row,bm25:undefined}));
  const digest=crypto.subtle.digest;let started,release;
  const entered=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
  crypto.subtle.digest=async function(...args){started();await gate;return digest.apply(this,args);};
  try {
    const opening=getBook("alice","race");await entered;
    await deleteBook("alice","race");release();await opening;
    assert.equal(await getBook("alice","race"),undefined);
    assert.equal(await edit("alice","race",()=>null),undefined);
  } finally {release();crypto.subtle.digest=digest;}
});
test("lazy cache upgrade cannot overwrite a newer save from another tab",async()=>{
  await saveBook("alice",book("replace"));await edit("alice","replace",row=>({...row,bm25:undefined}));
  const digest=crypto.subtle.digest;let started,release,first=true;
  const entered=new Promise(resolve=>started=resolve),gate=new Promise(resolve=>release=resolve);
  crypto.subtle.digest=async function(...args){if(first){first=false;started();await gate;}return digest.apply(this,args);};
  try {
    const opening=getBook("alice","replace");await entered;
    const newer=book("replace");newer.index[0].text="new chapter content";
    await saveBook("alice",newer);release();await opening;
    const reopened=await getBook("alice","replace");
    assert.deepEqual(reopened.index,newer.index);
    assert.equal(await restoreBM25Index(reopened.index,(await edit("alice","replace",()=>null)).bm25),true);
  } finally {release();crypto.subtle.digest=digest;}
});
