"use strict";
// Hash every physical profile file, including Chromium caches. Read-only;
// no LevelDB open or application activation. Raw paths stay ignored.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),assert=require("node:assert/strict");
const stage=process.argv[2];assert.ok(["b-step4a-preflight","c-after-update-before-launch"].includes(stage));
const evidence=path.resolve(__dirname,"../../../store-evidence/phase2d");
const receipt=path.join(evidence,`${stage}-full-profile.json`);assert.ok(!fs.existsSync(receipt),"Preserve existing full-profile inventory");
const profile=path.join(process.env.LOCALAPPDATA,"Packages/JTKC.SwiftLocal_j44a9ewx73faj/LocalCache/Roaming/SwiftLocal Store");
const files=[],directories=[],startedAt=new Date().toISOString();
function walk(directory){
  for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
    const file=path.join(directory,entry.name),relativePath=path.relative(profile,file).replaceAll("\\","/");
    const stat=fs.lstatSync(file);assert.ok(!stat.isSymbolicLink(),"Reparse/symbolic target requires review");
    if(stat.isDirectory()){directories.push(relativePath);walk(file);}
    else if(stat.isFile()){const bytes=fs.readFileSync(file);files.push({relativePath,bytes:bytes.length,sha256:crypto.createHash("sha256").update(bytes).digest("hex")});}
    else throw new Error("Unsupported profile entry");
  }
}
walk(profile);files.sort((a,b)=>a.relativePath.localeCompare(b.relativePath));directories.sort();
fs.writeFileSync(receipt,JSON.stringify({status:"PASS",stage,scope:"all physical profile files including nondurable Chromium/cache metadata; no excluded directories",startedAt,completedAt:new Date().toISOString(),path:profile,files,directories},null,2)+"\n");
console.log(JSON.stringify({status:"PASS",stage,files:files.length,directories:directories.length}));
