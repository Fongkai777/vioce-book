// Deliberately synthetic provider for local Worker/browser acceptance only.
// No real API keys, microphone capture, or external fetches.
import {createServer} from 'node:http';
import {pcmWav} from '../../lib/voice-turn.ts';
const vector=Array(1536).fill(0);vector[0]=1;
const server=createServer(async(req,res)=>{
  try {
    let raw='';for await(const part of req)raw+=part;
    const body=JSON.parse(raw||'{}');
    if(req.url==='/v1/embeddings') {res.setHeader('content-type','application/json');res.end(JSON.stringify({data:(Array.isArray(body.input)?body.input:[body.input]).map(()=>({embedding:vector}))}));return;}
    if(req.url==='/v1/responses') {
      const input=JSON.parse(body.input);
      const output=input.revision_request ? 'Synthetic revised answer: ask a focused question and verify the passage. [S1]' : 'Synthetic test answer: read with a question, check the author’s claim against the passage, and keep your own interpretation separate. [S1]';
      res.setHeader('content-type','application/json');res.end(JSON.stringify({output_text:output}));return;
    }
    if(req.url==='/v1/audio/speech') {res.setHeader('content-type','audio/wav');res.end(Buffer.from(await pcmWav(new Float32Array(16000),16000).arrayBuffer()));return;}
    res.statusCode=404;res.end('{}');
  }catch{res.statusCode=400;res.end('{}');}
});
server.listen(8877,'127.0.0.1',()=>console.log('Synthetic acceptance provider: http://127.0.0.1:8877 (no paid calls)'));
