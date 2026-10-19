import {execFileSync} from "node:child_process";
import {readFileSync,existsSync} from "node:fs";

const git=(...args)=>execFileSync("git",args,{encoding:"utf8",maxBuffer:100*1024*1024});
const names=git("ls-files","--cached","--others","--exclude-standard","-z").split("\0").filter(Boolean);
const forbidden=/^(?:\.env(?!\.example$)|local-library\/|outputs\/|\.wrangler\/|\.sites-runtime\/|node_modules\/|dist\/|app\/(?:book|voice)-qa\/)|(?:^|\/)(?:llm_config\.json|id_ed25519|id_rsa)$|\.(?:sqlite|db|pem)$/i;
const patterns=[/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,/\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}/,/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/,/\bAKIA[0-9A-Z]{16}\b/];
const failures=new Set();
const scan=(name,body)=>{if(patterns.some(re=>re.test(body)))failures.add(`${name}: possible secret (value hidden)`);};
for(const name of names){
  if(name.endsWith(".backup.json") || name.startsWith("backups/"))failures.add(`${name}: backup must not be published`);
  if(forbidden.test(name))failures.add(`${name}: private/runtime file must not be published`);
  if(existsSync(name))scan(name,readFileSync(name,"utf8"));
}
if(!names.includes(".env.example"))failures.add("Missing versioned .env.example");
for(const line of readFileSync(".env.example","utf8").split("\n")){
  if(/^\w*(?:KEY|PASSWORD|SECRET|TOKEN)\w*=\s*\S/.test(line))failures.add(".env.example: secret fields must be empty");
}
// Inspect historical blobs as well: deleting a secret from HEAD is not enough.
const objects=git("rev-list","--objects","--all").trim().split("\n").filter(Boolean);
const data=execFileSync("git",["cat-file","--batch"],{input:objects.map(x=>x.split(" ")[0]).join("\n")+"\n",maxBuffer:100*1024*1024});
let offset=0,blobs=0;
for(const entry of objects){
  const end=data.indexOf(10,offset),[,type,sizeText]=data.subarray(offset,end).toString().split(" ");
  const size=Number(sizeText);offset=end+1;const body=data.subarray(offset,offset+size);offset+=size+1;
  if(type==="blob"){blobs++;scan(`history ${entry}`,body.toString("utf8"));}
}
if(failures.size){console.error([...failures].join("\n"));process.exitCode=1;}
else console.log(`Release boundaries passed: ${names.length} working-tree files, ${blobs} historical blobs. Pattern scan is not a complete security audit.`);
