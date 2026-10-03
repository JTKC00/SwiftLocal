"use strict";
// Evidence helper only. No activation, database open, native tool or product write.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto"), assert = require("node:assert/strict");
const { readLocalStorage } = require("./read-localstorage-offline");
const root = path.resolve(__dirname, "../../.."), evidence = path.join(root, "store-evidence/phase2d");
const read = file => JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const normalized = tree => [...tree.files].map(f => ({ ...f, relativePath: f.relativePath.replaceAll("\\", "/") })).sort((a,b) => a.relativePath.localeCompare(b.relativePath));
const equal = (a,b) => { try { assert.deepEqual(a,b); return true; } catch { return false; } };
function compare(stage) {
  assert.ok(["b-step4a-preflight", "c-after-update-before-launch"].includes(stage));
  const before = read(path.join(evidence, "b-before-update-inventory.json"));
  const after = read(path.join(evidence, `${stage}-inventory.json`));
  const process = read(path.join(evidence, `${stage}-no-launch.json`));
  const baseline = read(path.join(__dirname, "b-before-update-summary.json"));
  const config = read(path.join(evidence, "store-baseline/store-config.json"));
  const post = stage === "c-after-update-before-launch";
  const receipt = path.join(evidence, `${stage}-comparison.json`);
  assert.ok(!fs.existsSync(receipt), "Preserve existing comparison");
  const report = {status:"UNVERIFIED",stage,scope:"read-only persisted state and cross-channel comparison; helper never launches apps; prior launch must be checked separately",capturedAt:after.capturedAt};
  try {
    assert.equal(process.status,"PASS"); assert.equal(process.processesBefore.length,0); assert.equal(process.processesAfter.length,0);
    assert.equal(after.package.length,1); const p = after.package[0];
    assert.equal(p.Version,post ? "1.0.1.0" : "1.0.0.0"); assert.equal(p.Name,baseline.package.name);
    assert.equal(p.Publisher,baseline.package.publisher); assert.equal(p.PackageFamilyName,baseline.package.pfn); assert.equal(p.Architecture,9);
    assert.equal(process.aumid,baseline.package.aumid); assert.deepEqual(process.applicationIds,[baseline.package.applicationId]);
    report.package = {before:baseline.package,after:{name:p.Name,publisher:p.Publisher,version:p.Version,fullName:p.PackageFullName,pfn:p.PackageFamilyName,applicationId:process.applicationIds[0],aumid:process.aumid,architecture:"x64"}};
    assert.equal(after.nsisInstallFiles.length,1); assert.equal(after.nsisInstallFiles[0].errors.length,0);
    assert.equal(after.nsisInstallFiles[0].files.length,19730); assert.deepEqual(normalized(after.nsisInstallFiles[0]),normalized(before.nsisInstallFiles[0]),"NSIS install file changed");
    assert.deepEqual(after.nsisUninstallRegistration,before.nsisUninstallRegistration,"NSIS uninstall registration changed");
    assert.equal(after.nsisState.length,before.nsisState.length);
    for(let i=0;i<before.nsisState.length;i++) { assert.equal(after.nsisState[i].errors.length,0); assert.equal(after.nsisState[i].exists,before.nsisState[i].exists); assert.deepEqual(normalized(after.nsisState[i]),normalized(before.nsisState[i]),"NSIS durable profile changed"); }
    assert.equal(after.userOutput.tree.errors.length,0); assert.deepEqual(normalized(after.userOutput.tree),normalized(before.userOutput.tree),"Normal user output changed");
    assert.deepEqual(after.pdfUserChoice,before.pdfUserChoice,"PDF UserChoice changed");
    assert.equal(after.pdfUserChoice.values.ProgId,"FoxitReader.Document"); assert.equal(after.pdfUserChoice.values.Hash,"lNCw115bAok=");
    const nsis = after.pdfClasses.find(c=>c.progId==="SwiftLocal.PDF");
    const store = after.pdfClasses.find(c=>c.application?.values.AppUserModelID===baseline.package.aumid);
    assert.ok(nsis && store,"One PDF registration missing"); assert.deepEqual(nsis,before.pdfClasses.find(c=>c.progId===nsis.progId));
    assert.equal(store.progId,baseline.openWith.store.progId);
    assert.ok(Object.hasOwn(after.pdfOpenWith.values,nsis.progId)&&Object.hasOwn(after.pdfOpenWith.values,store.progId));
    report.nsis = {installFiles:19730,installByteIntegrity:"PASS",durableProfileIntegrity:"PASS",uninstallRegistration:"PASS",priorUserOutputs:"PASS"};
    report.pdf = {default:after.pdfUserChoice.values,defaultUnchanged:"PASS",nsisProgId:nsis.progId,storeProgId:store.progId,bothRegistered:"PASS",explorerGui:"UNVERIFIED; no new GUI observation"};
    const tree = after.storeState.find(s=>s.category.startsWith("B:")).tree;
    assert.equal(tree.errors.length,0);
    const prefix = "LocalCache/Roaming/SwiftLocal Store/";
    const files = normalized(tree).filter(f=>f.relativePath.startsWith(prefix)).map(f=>({...f,relativePath:f.relativePath.slice(prefix.length)}));
    const profile = path.join(tree.path,"LocalCache/Roaming/SwiftLocal Store");
    // Cross-check bytes against the just-captured inventory before interpreting.
    for(const file of files) assert.equal(hash(fs.readFileSync(path.join(profile,file.relativePath))),file.sha256,"State changed during inspection");
    const storage = readLocalStorage(path.join(profile,"session/Local Storage/leveldb"),Object.keys(baseline.rendererStorage));
    assert.deepEqual(storage.values,baseline.rendererStorage,"Durable localStorage value lost/changed");
    const settings = read(path.join(profile,"tools.json")), jobs = read(path.join(profile,"jobs-state.json"));
    assert.equal(settings.defaultOutputDir,config.output,"Output preference lost/changed"); assert.deepEqual(settings.toolPaths,{});
    const job = jobs.jobs.find(j=>j.id===baseline.job.id); assert.ok(job,"Seeded job missing");
    assert.equal(job.status,"done"); assert.equal(job.type,"pdf-compress"); assert.equal(job.outputPaths.length,1);
    assert.equal(hash(fs.readFileSync(job.outputPaths[0])),baseline.output.sha256,"Seeded output lost/changed");
    const saved = path.join(evidence,"step4a-state-before");
    if(!post) {
      assert.ok(!fs.existsSync(saved),"Do not replace pre-update state copies");
      assert.deepEqual(files,[...baseline.physicalProfileFileInventory].sort((a,b)=>a.relativePath.localeCompare(b.relativePath)),"Pre-update profile differs from frozen baseline; STOP");
      // Evidence copies stay under ignored workspace; no writes to the profile.
      for(const file of files) { const dest=path.join(saved,file.relativePath); fs.mkdirSync(path.dirname(dest),{recursive:true}); fs.copyFileSync(path.join(profile,file.relativePath),dest); }
    } else {
      const oldSettings=read(path.join(saved,"tools.json")), oldJobs=read(path.join(saved,"jobs-state.json"));
      assert.deepEqual(settings,oldSettings,"Durable settings changed");
      assert.equal(jobs.version,oldJobs.version); assert.deepEqual(jobs.jobs,oldJobs.jobs,"Durable jobs semantic record changed");
    }
    const oldMap=new Map(baseline.physicalProfileFileInventory.map(f=>[f.relativePath,f])), newMap=new Map(files.map(f=>[f.relativePath,f]));
    const differences=[];
    for(const name of [...new Set([...oldMap.keys(),...newMap.keys()])].sort()) {
      if(equal(oldMap.get(name),newMap.get(name)))continue;
      const category=name.startsWith("session/Local Storage/leveldb/") ? "A: localStorage backing bytes; app values compared separately from LevelDB metadata" : name.startsWith("session/") ? "B: browser/session/cache metadata" : "A: application-owned state";
      differences.push({path:name,category,before:oldMap.get(name)||null,after:newMap.get(name)||null});
    }
    const unknown = differences.filter(d=>d.category==="A: application-owned state"&&!['tools.json','jobs-state.json','store-runtime-paths.json'].includes(d.path));
    assert.equal(unknown.length,0,"Unclassified application-state difference requires evidence review; STOP");
    report.store = {physicalProfile:baseline.profiles.physical,theme:storage.values["swiftlocal-theme"],savedPreset:JSON.parse(storage.values["swiftlocal-presets"])[0],outputPreference:baseline.settings.defaultOutputDir,job:{id:job.id,type:job.type,status:job.status,semanticRecordRetained:"PASS"},localStorage:storage.values,localStorageMethod:storage.method,localStorageFiles:storage.files,localStorageSemanticRetention:"PASS",durableSettingsRetention:"PASS",jobRetention:"PASS",output:{...baseline.output,path:baseline.output.path,unchanged:"PASS"}};
    report.durableFiles=Object.fromEntries(Object.keys(baseline.persistedFiles).map(name=>{const afterFile=newMap.get(name);return[name,{before:baseline.persistedFiles[name],after:afterFile?{bytes:afterFile.bytes,sha256:afterFile.sha256}:null,byteIdentical:equal(oldMap.get(name),afterFile)?"PASS":"PARTIAL; semantic/classification review above"}]}));
    report.physicalProfileInventory={beforeFiles:baseline.physicalProfileFileInventory.length,afterFiles:files.length,before:baseline.physicalProfileFileInventory,after:files,differences};
    report.packageManagedDifferences=normalized(tree).filter(f=>!f.relativePath.startsWith(prefix)&&!equal(f,normalized(before.storeState.find(s=>s.category.startsWith('B:')).tree).find(old=>old.relativePath===f.relativePath))).map(f=>({category:"C: OS/package-managed metadata",...f}));
    report.processes={before:0,after:0,noLaunchPerformedByHelper:true};
    report.stateAndCrossChannelRetention="PASS";
    if(post) {
      const monitorFile=path.join(evidence,"step4a-process-monitor.json");
      const monitor=fs.existsSync(monitorFile)?read(monitorFile):null;
      report.beforeLaunchRequirement=monitor?{status:monitor.maximumObservedSwiftLocalProcesses===0?"PASS":"FAIL",observedProcesses:monitor.observedProcesses}: {status:"UNVERIFIED",reason:"Process observation receipt not yet available"};
      report.status=report.beforeLaunchRequirement.status==="PASS"?"PASS":"PARTIAL";
    } else report.status="PASS";
  } catch(error) {report.status="FAIL";report.error=error.message;throw error;}
  finally {fs.writeFileSync(receipt,JSON.stringify(report,null,2)+"\n");}
  console.log(JSON.stringify({status:report.status,stage,version:report.package.after.version,theme:report.store.theme,nsis:"PASS",pdf:"PASS",profileDifferences:report.physicalProfileInventory.differences.length,outputSha256:report.store.output.sha256}));
}
if(require.main===module)compare(process.argv[2]);
