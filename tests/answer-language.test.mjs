import test from "node:test";
import assert from "node:assert/strict";
import { languageInstruction, questionLanguage } from "../lib/answer-language.ts";

test("answer language follows the current question, not history or instructions", () => {
  assert.equal(questionLanguage("Wait, please stop. Who is Bill the Lizard in this story?"), "English");
  assert.equal(questionLanguage("Why didn\u2019t Alice drink it \u2014 was it \u201cpoison\u201d?"), "English");
  assert.equal(questionLanguage("比尔是谁？"), "Chinese");
  assert.equal(questionLanguage("Who is Bill? 比尔是谁？"), "Chinese");
  assert.equal(questionLanguage("¿Quién es Bill?"), null);
  assert.match(languageInstruction("Who is Bill?"), /Write the entire answer in English/);
  assert.match(languageInstruction("¿Quién es Bill?"), /language of the current reader_question/);
});
