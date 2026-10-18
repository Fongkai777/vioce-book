import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Node's built-in type stripping does not handle TSX; compile just this UI fixture.
const hook = registerHooks({ load(url, context, nextLoad) {
  if (!url.endsWith("/app/start-reading.tsx")) return nextLoad(url, context);
  return { format: "module", shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), "utf8"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText };
} });
const { default: StartReading } = await import("../app/start-reading.tsx");
hook.deregister();

function actions(books, disabled = false) {
  const html = renderToStaticMarkup(createElement(StartReading, { books, disabled, openingBookId: null, onSelect: async () => {}, onUpload: () => {}, onSamples: () => {} }));
  return [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/g)].map(match => match[0]);
}
test("an existing library offers choosing and uploading as parallel entry points", () => {
  const buttons = actions([{ id: "book-1", name: "测试书" }]);
  assert.equal(buttons.length, 3);
  assert.match(buttons[2], /Try a sample/);
  assert.match(buttons[0], /Choose from library/);
  assert.match(buttons[1], /Upload a PDF/);
  assert.ok(buttons.every(button => !button.includes('disabled=""')));
});
test("an empty library clearly directs users to upload, and loading disables both actions", () => {
  const buttons = actions([]);
  assert.match(buttons[0], /disabled=""/);
  assert.match(buttons[0], /Your library is empty/);
  assert.doesNotMatch(buttons[1], /disabled=""/);
  assert.doesNotMatch(buttons[2], /disabled=""/);
  assert.ok(actions([{ id: "book-1" }], true).every(button => button.includes('disabled=""')));
});
