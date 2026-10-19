import test from "node:test";
import assert from "node:assert/strict";
import {normalizeCitations, stripCitations} from "../lib/citations.ts";
import {answerTextOptions, capabilityInstructions, citationInstructions} from "../lib/answer-policy.ts";
import {normalizeHistory, validateContext} from "../lib/conversation-context.ts";
import {preferenceInstructions} from "../lib/personalization.ts";
import {speechSegments} from "../lib/voice-turn.ts";

test("citation variants normalize to individually clickable source IDs", () => {
  for (const [input, expected] of [
    ["[S1]", "[S1]"], ["[ S 1 ]", "[S1]"], ["[s1,s2]", "[S1][S2]"],
    ["[S1–S3]", "[S1][S2][S3]"], ["[ S1 – S3 ]", "[S1][S2][S3]"],
    ["[S1, 2、S3；S2]", "[S1][S2][S3]"], ["[S1 S2]", "[S1][S2]"],
  ]) assert.deepEqual(normalizeCitations(input, 3), {text:expected, invalid:false}, input);
});
test("invalid references cannot expand without bounds or create unavailable links", () => {
  for (const input of ["[S0]", "[S4]", "[S3-S1]", "[S1-S999999999]", "[S1,banana]", "[S1,S4]"])
    assert.deepEqual(normalizeCitations(input, 3), {text:"", invalid:true}, input);
  assert.deepEqual(normalizeCitations("Keep [2026] and [Note]."), {text:"Keep [2026] and [Note].",invalid:false});
});
test("speech and old conversation use the same source-marker stripping", () => {
  const answer = "Claim [ S1 ] [S2,S3] [S4–S6].";
  assert.equal(stripCitations(answer), "Claim   .");
  assert.deepEqual(speechSegments(answer), ["Claim ."]);
  assert.equal(normalizeHistory([{question:"Why?",answer}])[0].answer, "Claim   .");
  const result = validateContext({mode:"compressed",turns:[],summary:answer,recalled:[answer],totalTurns:1});
  assert.equal(result.summary, "Claim   ."); assert.equal(result.recalled[0], "Claim   .");
});
test("verified GPT-5 family gets low verbosity without breaking custom models", () => {
  for (const model of ["gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-5-mini-2025-08-07"])
    assert.deepEqual(answerTextOptions(model,"balanced"), {text:{verbosity:"low"}});
  assert.deepEqual(answerTextOptions("gpt-5-mini","detailed"), {text:{verbosity:"medium"}});
  assert.deepEqual(answerTextOptions("custom-model","brief"), {});
  assert.deepEqual(answerTextOptions("gpt-4.1","balanced"), {});
});
test("default style is voice-sized, with explicit evidence and capability boundaries", () => {
  assert.match(preferenceInstructions({}), /100–180/);
  assert.match(preferenceInstructions({length:"detailed"}), /300–500/);
  assert.match(capabilityInstructions, /NO web browser/);
  assert.match(capabilityInstructions, /Do not claim the entire book lacks it/);
  assert.match(citationInstructions, /\[S1\]\[S2\]/);
});
