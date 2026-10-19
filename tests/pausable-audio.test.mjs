import test from "node:test";
import assert from "node:assert/strict";
import {PausableAudio} from "../lib/pausable-audio.ts";
function fixture() {
  const nodes=[];
  const context={currentTime:0,state:"running",destination:{},createBufferSource(){
    const node={onended:null,offset:null,stopped:false,connect(){},disconnect(){},stop(){this.stopped=true;},start(_when,offset){this.offset=offset;}};
    nodes.push(node);return node;
  }};
  let active=null;
  const playback=new PausableAudio(context,{duration:10},node=>{active=node;});
  return {context,nodes,playback,get active(){return active;}};
}
test("empty ASR resumes the same audio at the paused offset without resolving early",async()=>{
  const f=fixture(),controller=new AbortController();let ended=false;
  const done=f.playback.play(controller.signal).then(()=>{ended=true;});
  f.context.currentTime=2.5;assert.equal(f.playback.pause(),true);
  assert.equal(f.active,null);assert.equal(f.nodes[0].stopped,true);
  await Promise.resolve();assert.equal(ended,false);
  f.context.currentTime=7;f.playback.resume();assert.equal(f.nodes[1].offset,2.5);
  f.nodes[1].onended();await done;assert.equal(ended,true);
});
test("confirmed interruption aborts paused audio and stale resume cannot restart it",async()=>{
  const f=fixture(),controller=new AbortController(),done=f.playback.play(controller.signal);
  f.context.currentTime=1;f.playback.pause();controller.abort();
  await assert.rejects(done,{name:"AbortError"});f.playback.resume();assert.equal(f.nodes.length,1);
});
test("repeated pauses preserve accumulated offset and completion cleans up",async()=>{
  const f=fixture(),controller=new AbortController(),done=f.playback.play(controller.signal);
  f.context.currentTime=2;f.playback.pause();assert.equal(f.playback.pause(),false);
  f.context.currentTime=5;f.playback.resume();f.playback.resume();assert.equal(f.nodes.length,2);
  f.context.currentTime=8;f.playback.pause();f.playback.resume();assert.equal(f.nodes[2].offset,5);
  f.nodes[2].onended();await done;assert.equal(f.active,null);f.playback.resume();assert.equal(f.nodes.length,3);
});
test("browser suspension produces an explicit playback error",async()=>{
  const f=fixture();f.context.state="suspended";
  await assert.rejects(f.playback.play(new AbortController().signal),/paused by your browser/);
});
