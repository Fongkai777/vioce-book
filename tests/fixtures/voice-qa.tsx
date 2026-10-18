"use client";
// Local-only QA fixture, never a production route. Temporarily re-export from
// app/voice-qa/page.tsx to exercise the real page without real audio or APIs.
import { useEffect, useRef, useState } from "react";
import Home from "../../app/page";
import { saveBook } from "@/lib/book-library";
import { defaultPreferences } from "@/lib/personalization";
import { pcmWav } from "@/lib/voice-turn";
export default function VoiceQA() {
  const [ready, setReady] = useState(false), [events, setEvents] = useState<string[]>([]);
  const input = useRef<{context:AudioContext;gain:GainNode}|null>(null);
  const delayed = useRef(false);
  const scriptedResults = useRef<Array<string | null>>([]);
  async function pulse() { const value=input.current;if(!value)return;await value.context.resume();value.gain.gain.value=.16;setTimeout(()=>{value.gain.gain.value=0;},500); }
  function scenario(result:string | null) { scriptedResults.current=[result];void pulse(); }
  useEffect(() => {
    const originalFetch = window.fetch, originalMic = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    let stt = 0;
    const log = (text:string) => setEvents(old => [...old.slice(-5), text]);
    const quota = { questions:{used:0,limit:100,remaining:100},voice:{usedSeconds:0,limitSeconds:600,remainingSeconds:600},isAdmin:false,user:{userId:"synthetic-voice-qa",username:"qa",displayName:"Synthetic QA"} };
    window.fetch = async (resource, options) => {
      const path = String(resource); if (!path.startsWith("/api/")) return originalFetch(resource, options);
      if (path === "/api/quota") return Response.json({quota});
      if (path === "/api/preferences") return Response.json({preferences:defaultPreferences});
      if (path === "/api/transcribe") {
        stt++; const number = stt, form = options?.body as FormData;
        log(`Transcribe ${number}: ${(form.get("audio") as File).size} bytes`);
        const text = scriptedResults.current.length ? scriptedResults.current.shift() : `Synthetic question ${number}: explain the book.`;
        await new Promise(resolve => setTimeout(resolve, 200));
        log(text === null ? "Transcription request failed" : text ? `Recognized: ${text}` : "Empty transcription returned");
        if (text === null) return Response.json({error:"Synthetic transcription service failure"},{status:503});
        return Response.json({text,quota});
      }
      if (path === "/api/embed") return Response.json({embeddings:[[1,0]],quota});
      if (path === "/api/answer") {
        const question = JSON.parse(String(options?.body)).question; log(`Answer requested: ${question}`);
        await new Promise(resolve => setTimeout(resolve, delayed.current ? 8000 : 150));
        log(`Answer completed${options?.signal?.aborted ? " (cancelled)" : ""}`);
        return Response.json({answer:`Answer to ${question} The main idea is to read carefully and ask questions. [S1]`,quota});
      }
      if (path === "/api/speech") {
        await new Promise(resolve => setTimeout(resolve, 200)); log("Audio generated");
        const samples = new Float32Array(16000 * 12);
        for (let i=0;i<samples.length;i++) samples[i]=Math.sin(i*2*Math.PI*220/16000)*.015;
        return new Response(pcmWav(samples,16000),{headers:{"Content-Type":"audio/wav"}});
      }
      throw new Error(`Unexpected QA API: ${path}`);
    };
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext(), gain = context.createGain(), oscillator = context.createOscillator(), dest = context.createMediaStreamDestination();
      gain.gain.value = 0; oscillator.frequency.value = 180; oscillator.connect(gain); gain.connect(dest); oscillator.start(); await context.resume();
      input.current = {context,gain}; return dest.stream;
    };
    void saveBook("synthetic-voice-qa", {id:"qa-voice-book",name:"Synthetic voice test book",pages:1,chapters:1,chunks:1,fileSize:0,storedAt:new Date().toISOString(),lastOpenedAt:new Date().toISOString(),index:[{id:"qa-chunk",sectionTitle:"Read carefully",text:"Read carefully and ask questions about what the author means.",pageStart:1,pageEnd:1,embedding:[1,0]}]}).then(()=>setReady(true));
    return () => {window.fetch=originalFetch;navigator.mediaDevices.getUserMedia=originalMic;void input.current?.context.close();};
  },[]);
  return <>{ready && <Home />}<aside style={{position:"fixed",right:6,top:90,zIndex:999,background:"#fff",border:"1px solid #333",padding:12,fontSize:11,maxWidth:260}}><strong>Synthetic voice QA — no real mic/API</strong><button onClick={()=>{scriptedResults.current=[];void pulse();}}>Speak synthetic turn</button><button onClick={()=>scenario("")}>Empty sound only</button><button onClick={()=>scenario(null)}>Fail next turn</button><button onClick={()=>{delayed.current=!delayed.current;setEvents(old=>[...old,`Slow replies: ${delayed.current}`]);}}>Toggle slow replies</button>{events.map((event,index)=><p key={index}>{event}</p>)}</aside></>;
}
