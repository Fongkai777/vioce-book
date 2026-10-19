import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const hook = registerHooks({ load(url, context, nextLoad) {
  if (!/\/app\/(voice-session|reply-progress|question-message)\.tsx$/.test(url)) return nextLoad(url, context);
  return { format:"module", shortCircuit:true, source:ts.transpileModule(readFileSync(new URL(url), "utf8"), {
    compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},
  }).outputText };
} });
const { default: VoiceSession } = await import("../app/voice-session.tsx");
const { default: ReplyProgress } = await import("../app/reply-progress.tsx");
const { default: QuestionMessage } = await import("../app/question-message.tsx");
hook.deregister();
const render = props => renderToStaticMarkup(createElement(VoiceSession, {
  active:true,connecting:false,level:.6,state:"listening",muted:false,
  onMute(){},onFinish(){},onEnd(){},...props,
}));
const message = props => renderToStaticMarkup(createElement(QuestionMessage, {text:"Keep my recognized words",...props}));

test("microphone controls retain the live level but contain no transcription preview", () => {
  const html = render(); assert.match(html, /aria-valuenow="60"/); assert.match(html, /I can hear you/);
  assert.match(html, /Mute microphone/); assert.match(html, /Done speaking/); assert.match(html, /End voice/);
  assert.doesNotMatch(html, /voice-transcript|You said|Send now|Edit transcript|Stop reply/);
  assert.equal(render({active:false}), "");
});
test("recognized and sent speech use the same chat bubble without confirmation", () => {
  for (const unsent of [true,false]) {
    const html = message({unsent});
    assert.match(html, /question-row/); assert.match(html, /Keep my recognized words/);
    assert.doesNotMatch(html, /<textarea|<button|Edit transcript|Send now/);
  }
});
test("incomplete or explicitly held speech can be reviewed inside its chat message", () => {
  const html = message({unsent:true,editing:true,onChange(){},onSend(){},onLeave(){}});
  assert.match(html, /<textarea/); assert.match(html, /Not sent/); assert.match(html, /Send question/);
  assert.match(html, /Leave unsent/);
  const pending = message({unsent:true,editing:true,processing:true,onChange(){},onSend(){}});
  assert.match(pending, /Transcribing the rest/);
  assert.match(pending, /<button disabled="">Send question<\/button>/);
});
test("stop reply is next to assistant progress during generation and playback", () => {
  for (const speaking of [false,true]) {
    const html = renderToStaticMarkup(createElement(ReplyProgress, {label:"Working",detail:"Question kept",speaking,onStop(){}}));
    assert.match(html, /thinking-card reply-progress/); assert.match(html, /aria-label="Assistant reply"/);
    assert.match(html, /Stop reply/); assert.equal(/class="[^"]*\bspin\b/.test(html), !speaking);
  }
});
