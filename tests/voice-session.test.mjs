import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const hook = registerHooks({ load(url, context, nextLoad) {
  if (!url.endsWith("/app/voice-session.tsx")) return nextLoad(url, context);
  return { format:"module", shortCircuit:true, source:ts.transpileModule(readFileSync(new URL(url), "utf8"), {
    compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
  }).outputText };
} });
const { default: VoiceSession } = await import("../app/voice-session.tsx"); hook.deregister();
const render = props => renderToStaticMarkup(createElement(VoiceSession, {
  active:true,connecting:false,level:.6,state:"listening",muted:false,transcript:"",editing:false,
  onEdit(){},onChange(){},onSend(){},onDismiss(){},onMute(){},onFinish(){},onEnd(){},...props,
}));
test("voice controls expose live level and clear microphone/stop actions", () => {
  const html = render(); assert.match(html, /aria-valuenow="60"/); assert.match(html, /I can hear you/);
  assert.match(html, /Mute microphone/); assert.match(html, /Done speaking/); assert.match(html, /End voice/);
  assert.equal(render({active:false}), "");
});
test("transcripts appear before sending and can be edited or cancelled", () => {
  const html = render({state:"reviewing",transcript:"What is the main idea?"});
  assert.match(html, /You said/); assert.match(html, /What is the main idea/); assert.match(html, /Edit transcript/);
  const editing = render({state:"reviewing",transcript:"Corrected",editing:true,muted:true});
  assert.match(editing, /<textarea/); assert.match(editing, /Automatic sending is paused/); assert.match(editing, /Send now/);
});
test("recognized text remains visible but cannot be submitted during a continuation", () => {
  const html = render({state:"transcribing",transcript:"Keep my first words"});
  assert.match(html, /Keep my first words/); assert.match(html, /Nothing has been sent yet/);
  assert.match(html, /<button disabled="">Send now<\/button>/);
});
test("ending voice with a draft offers review rather than pretending to listen", () => {
  const html = render({active:false,state:"reviewing",transcript:"Keep my first words",editing:true});
  assert.match(html, /Review your question/); assert.match(html, /Discard question/);
  assert.doesNotMatch(html, /Listening — go ahead|End voice conversation/);
});
