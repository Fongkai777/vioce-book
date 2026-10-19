import {spawnSync} from "node:child_process";
if(!process.env.npm_execpath)throw new Error("Run through pnpm audit:reviewed");
const audit=spawnSync(process.execPath,[process.env.npm_execpath,"audit","--json"],{encoding:"utf8",maxBuffer:10*1024*1024});
if(audit.error)throw audit.error;
let report;try{report=JSON.parse(audit.stdout);}catch{throw new Error("Dependency audit unavailable; refusing to report a pass");}
if(!report.metadata?.vulnerabilities || report.error)throw new Error("Registry did not return a complete vulnerability audit");
const findings=Object.values(report.advisories||{});
const unexpected=findings.filter(a=>a.github_advisory_id!=="GHSA-vfj7-8cjw-p6xm" || a.module_name!=="braces" ||
  !a.findings?.length || a.findings.some(f=>f.version!=="3.0.3" || f.dev!==true));
if(unexpected.length){console.error(unexpected.map(a=>`${a.severity}: ${a.github_advisory_id} (${a.module_name})`).join("\n"));process.exit(1);}
if(findings.length){
  if(Date.now()>Date.parse("2026-11-19T00:00:00Z"))throw new Error("Local braces mitigation review expired; recheck upstream and renew only after review");
  const proof=spawnSync(process.execPath,["--test","tests/dependency-security.test.mjs"],{stdio:"inherit"});
  if(proof.status!==0)throw new Error("Installed braces mitigation is missing or failed its regression tests");
  console.warn("1 known development advisory remains visible: GHSA-vfj7-8cjw-p6xm; installed local mitigation verified. Review expires 2026-11-19. This is not a clean raw audit.");
}else console.log("No known dependency advisories reported.");
