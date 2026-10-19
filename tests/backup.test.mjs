import {test} from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import {encryptBackup,decryptBackup} from "../lib/backup-crypto.ts";
import {exportLocalBook,restoreLocalBook} from "../lib/local-backup.ts";
import {saveBook,deleteBook,getBook,getBookPdf} from "../lib/book-library.ts";
import {saveHistory,loadHistory,clearHistory} from "../lib/reading-history.ts";
globalThis.localStorage={getItem:()=>null,removeItem:()=>{}};
const pass="synthetic-local-backup-passphrase";
const book={id:"backup-test",name:"Private synthetic book",pages:1,chapters:1,chunks:1,fileSize:3,storedAt:"2026-10-19",lastOpenedAt:"2026-10-19",embeddingDimensions:2,
  pdf:new Blob(["pdf"]),index:[{id:"c1",sectionTitle:"Section",pageStart:1,pageEnd:1,text:"Private synthetic text",embedding:[1,0]}]};
test("backup encryption is randomized, authenticated and rejects wrong passwords/versions",async()=>{
  const a=await encryptBackup({private:"synthetic"},pass),b=await encryptBackup({private:"synthetic"},pass);
  assert.notEqual(a.data,b.data);assert.notEqual(a.salt,b.salt);assert.notEqual(a.iv,b.iv);
  assert.doesNotMatch(JSON.stringify(a),/synthetic/);assert.deepEqual(await decryptBackup(a,pass),{private:"synthetic"});
  await assert.rejects(decryptBackup(a,"wrong-passphrase"));
  await assert.rejects(decryptBackup({...a,version:2},pass));
  await assert.rejects(decryptBackup({...a,iterations:999999999},pass));
  await assert.rejects(decryptBackup({...a,data:a.data.slice(0,-8)+"AAAAAAAA"},pass));
  await assert.rejects(encryptBackup({},"short"));
});
test("local book roundtrip preserves original PDF, vectors and history without networking",async()=>{
  const beforeFetch=globalThis.fetch;globalThis.fetch=async()=>assert.fail("Backups cannot call a provider");
  try {
    await saveBook("alice",book);await saveHistory("alice",book.id,[{id:"1",question:"Question",answer:"Answer"}]);
    const encrypted=await exportLocalBook("alice",book.id,pass);
    await deleteBook("alice",book.id);await clearHistory("alice",book.id);
    await assert.rejects(restoreLocalBook("bob",encrypted,pass),/signed-in account/);
    assert.equal(await getBook("bob",book.id),undefined);
    await restoreLocalBook("alice",encrypted,pass);
    assert.deepEqual((await getBook("alice",book.id)).index,book.index);
    assert.equal(await (await getBookPdf("alice",book.id)).text(),"pdf");
    assert.equal((await loadHistory("alice",book.id))[0].answer,"Answer");
    await saveHistory("alice",book.id,[{id:"1",question:"Question",answer:"Newer answer"},{id:"2",question:"Next",answer:"Next answer"}]);
    await Promise.all([restoreLocalBook("alice",encrypted,pass),restoreLocalBook("alice",encrypted,pass)]);
    const history=await loadHistory("alice",book.id);assert.equal(history.length,2);assert.equal(history[0].answer,"Newer answer");
  } finally {globalThis.fetch=beforeFetch;}
});
test("malformed or conflicting local backup cannot overwrite an existing book",async()=>{
  await saveBook("alice",book);const encrypted=await exportLocalBook("alice",book.id,pass);
  const value=await decryptBackup(encrypted,pass);value.book.index[0].embedding=[1];
  await assert.rejects(restoreLocalBook("alice",await encryptBackup(value,pass),pass),/invalid/);
  assert.deepEqual((await getBook("alice",book.id)).index,book.index);
  value.book.index[0].embedding=[0,1];
  await assert.rejects(restoreLocalBook("alice",await encryptBackup(value,pass),pass),/different index/);
});
