import {test} from "node:test";
import assert from "node:assert/strict";
import {quoteProvider,priceUsage,verifiedVoiceSeconds} from "../lib/provider-pricing.ts";
import {pcmWav} from "../lib/voice-turn.ts";
const url="https://api.openai.com/v1/responses";
const body=JSON.stringify({model:"gpt-5-mini",input:"你好，hello",max_output_tokens:1400});
test("official GPT-5 mini reserves model-priced token upper estimate, not flat expensive rates",()=>{
  const quote=quoteProvider("answer",body,url);
  assert.equal(quote.micros,Math.ceil((new TextEncoder().encode(body).length+256)*.25+1400*2));
  assert.ok(quote.micros<4000);
  assert.ok(quoteProvider("answer",body,url.replace("api.openai.com","proxy.example")).micros>50000);
  assert.equal(quoteProvider("answer",body.replace("gpt-5-mini","unpriced-model"),url).policy,"unverified-fallback-v1");
});
test("provider usage prices cached input separately and counts reasoning only once",()=>{
  const quote=quoteProvider("answer",body,url);
  assert.deepEqual(priceUsage(quote,{model:"gpt-5-mini-2025-08-07",usage:{input_tokens:10000,input_tokens_details:{cached_tokens:2000},output_tokens:1000,output_tokens_details:{reasoning_tokens:800},total_tokens:11000}}),
    {micros:4050,inputTokens:10000,cachedTokens:2000,outputTokens:1000});
  assert.equal(priceUsage(quote,{usage:{input_tokens:10000,output_tokens:1000}}).micros,4500);
});
test("missing, malformed, mismatched model and incomplete usage never release reservations",()=>{
  const quote=quoteProvider("answer",body,url);
  for(const usage of [{},{input_tokens:1},{input_tokens:-1,output_tokens:0},{input_tokens:"10",output_tokens:2},
    {input_tokens:10,output_tokens:2,input_tokens_details:{cached_tokens:11}},{input_tokens:10,output_tokens:2,total_tokens:10},
    {input_tokens:Infinity,output_tokens:0},{input_tokens:2.5,output_tokens:0}]) assert.equal(priceUsage(quote,{usage}),null);
  assert.equal(priceUsage(quote,{model:"other-model",usage:{input_tokens:10,output_tokens:2}}),null);
  assert.equal(priceUsage(quoteProvider("answer",body,"https://proxy.example"),{usage:{input_tokens:10,output_tokens:2}}),null);
});
test("embeddings use prompt tokens; OCR settles image usage without counting base64 as text",()=>{
  const embed=quoteProvider("embed",JSON.stringify({model:"text-embedding-3-small",input:["hello"]}),url);
  assert.equal(priceUsage(embed,{usage:{prompt_tokens:1000,total_tokens:1000}}).micros,20);
  const ocr=quoteProvider("ocr",body,url);
  assert.equal(ocr.micros,500000);
  assert.equal(priceUsage(ocr,{usage:{input_tokens:2000,output_tokens:3000}}).micros,6500);
});
test("transcription no longer reserves a dollar for a validated short recording",async()=>{
  const wav=pcmWav(new Float32Array(16000*10),16000), seconds=await verifiedVoiceSeconds(wav);
  const form=new FormData();form.set("model","gpt-4o-mini-transcribe");
  const quote=quoteProvider("transcribe",form,url,seconds);
  assert.equal(seconds,10);assert.ok(quote.micros<20000);
  assert.equal(priceUsage(quote,{usage:{input_tokens:1000,output_tokens:100,total_tokens:1100}}).micros,1750);
  assert.equal(quoteProvider("transcribe",form,url).micros,1000000,"unverified duration keeps fallback");
});
test("PCM duration is server-verified and malformed, compressed, oversized and forged headers fail",async()=>{
  await assert.rejects(verifiedVoiceSeconds(new Blob(["not a WAV"])));
  await assert.rejects(verifiedVoiceSeconds(pcmWav(new Float32Array(0),16000)));
  await assert.rejects(verifiedVoiceSeconds(pcmWav(new Float32Array(16000*61),16000)));
  const wav=await pcmWav(new Float32Array(16000),16000).arrayBuffer();
  for(const offset of [0,4,8,12,16,20,22,24,28,32,34,36,40]){
    const copy=wav.slice(0);new Uint8Array(copy)[offset]^=1;
    await assert.rejects(verifiedVoiceSeconds(new Blob([copy])));
  }
});
test("binary TTS explicitly stays estimated, not claimed as actual output tokens",()=>{
  const quote=quoteProvider("speech",JSON.stringify({model:"gpt-4o-mini-tts",input:"Hello"}),url);
  assert.equal(quote.policy,"openai-tts-estimate-2026-10-19");
  assert.equal(priceUsage(quote,{}),null);assert.ok(quote.micros>0&&quote.micros<10000);
});
