import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const hook = registerHooks({ load(url, context, nextLoad) {
  if (!/\/app\/(book-manager|pdf-preview)\.tsx$/.test(url)) return nextLoad(url, context);
  return {format:"module",shortCircuit:true,source:ts.transpileModule(readFileSync(new URL(url),"utf8"),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText};
}});
const {BookInspector} = await import("../app/book-manager.tsx");
hook.deregister();
const book = {id:"test",ownerId:"alice",storageKey:"alice:test",name:"Test book",pages:3,chapters:1,chunks:1,fileSize:10,storedAt:"2026-01-01",lastOpenedAt:"2026-01-01",embeddingDimensions:2,index:[{id:"one",sectionTitle:"Start",pageStart:1,pageEnd:1,text:"A saved passage",embedding:[1,0]}]};
const render = overrides => renderToStaticMarkup(createElement(BookInspector,{book:{...book,...overrides},disabled:false,onChat:()=>{},onRemove:()=>{}}));
test("book details start with Overview and expose only two primary tabs",()=>{
  const html=render();
  assert.equal([...html.matchAll(/role="tab"/g)].length,2);
  assert.match(html,/id="detail-tab-overview"[^>]*aria-selected="true"/);
  assert.match(html,/>Content<\/button>/);
  assert.match(html,/Ready to chat/);
  assert.match(html,/<details class="technical-details"><summary>Technical details<\/summary>/);
  assert.doesNotMatch(html,/Inspect a vector|Show all \d+ values|PDF &amp; text/);
  assert.match(html,/Not recorded for this copy/);
});
test("overview distinguishes sample provenance, recorded OCR and invalid copies",()=>{
  assert.match(render({importedFrom:"Voicebook sample"}),/Cloud sample library/);
  assert.match(render({extraction:{ocrPages:2,readablePages:3},author:"Author"}),/OCR used on 2 of 3 pages/);
  const invalid=render({index:[]});
  assert.match(invalid,/Needs attention/);
  assert.match(invalid,/<button class="manager-primary" disabled=""/);
});
