"use client";
// Local-only fixture: temporarily re-export from app/book-qa/page.tsx.
// Real Home, library and history; synthetic books, no model calls or microphone.
import {useEffect, useState} from "react";
import Home from "../../app/page";
import {saveBook} from "../../lib/book-library";
import {saveHistory} from "../../lib/reading-history";
import {defaultPreferences} from "../../lib/personalization";
export default function BookQA() {
  const [ready,setReady]=useState(false);
  useEffect(()=>{
    const original=window.fetch;
    const owner="book-management-qa";
    window.fetch=async(resource,options)=>{
      const path=String(resource);
      if(path==="/api/quota")return Response.json({quota:{questions:{used:2,limit:50,remaining:48},voice:{usedSeconds:30,limitSeconds:600,remainingSeconds:570},isAdmin:false,user:{userId:owner,username:owner,displayName:"Library QA"}}});
      if(path==="/api/preferences")return Response.json({preferences:defaultPreferences});
      if(path.startsWith("/api/"))throw new Error(`Unexpected QA request: ${path}`);
      return original(resource,options);
    };
    void(async()=>{
      const index=Array.from({length:25},(_,i)=>({id:`qa-passage-${i}`,sectionTitle:`Section ${i+1}`,pageStart:0,pageEnd:0,text:`Passage ${i+1}. Read slowly, ask a question, and check the author's evidence. 阅读与思考。`,embedding:[1,0]}));
      const base={id:"qa-library-book",name:"The deliberate reader — QA",pages:0,chapters:25,chunks:25,fileSize:0,storedAt:"2026-10-19T00:00:00Z",lastOpenedAt:"2026-10-19T00:00:00Z",embeddingDimensions:2,importedFrom:"Voicebook sample",index};
      await saveBook(owner,base);
      await saveBook(owner,{...base,id:"qa-private",name:"Private legacy book",importedFrom:"Counseling Copilot",lastOpenedAt:"2026-10-18T00:00:00Z",index:index.slice(0,1),chunks:1});
      await saveBook(owner,{...base,id:"qa-invalid",name:"Incomplete index",index:[],chunks:0,lastOpenedAt:"2026-10-17T00:00:00Z"});
      const turns=[{id:"qa-citation-turn",question:"Where should I look?",answer:"Look at the final saved passage. [S1]",sources:[index[24]]}];
      await saveHistory(owner,base.id,turns);setReady(true);
    })();
    return()=>{window.fetch=original;};
  },[]);
  return ready?<Home/>:<p>Preparing synthetic library…</p>;
}
