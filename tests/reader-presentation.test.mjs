import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { feedbackTags, feedbackTagLabels, preferenceInstructions } from "../lib/personalization.ts";

test("legacy feedback identifiers retain readable English labels", () => {
  assert.deepEqual(feedbackTags, ["语气生硬", "太长", "不够详细", "没答到点", "引用有问题"]);
  for (const tag of feedbackTags) {
    assert.ok(feedbackTagLabels[tag]);
    assert.doesNotMatch(feedbackTagLabels[tag], /\p{Script=Han}/u);
  }
  assert.match(preferenceInstructions({ guidance: "请用中文回答" }), /请用中文回答/);
});

test("reader and admin UI copy stays English without translating user content", () => {
  for (const name of ["app/page.tsx", "app/reader-controls.tsx", "app/admin/feedback-list.tsx", "lib/reading-history.ts"]) {
    const source = readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\p{Script=Han}/u, name);
  }
  const controls = readFileSync(new URL("../app/reader-controls.tsx", import.meta.url), "utf8");
  assert.match(controls, /feedbackTagLabels\[tag\]/);
  assert.match(controls, /Save suggestion as preference/);
  assert.match(controls, /Other messages and the full book are not uploaded/);
});
