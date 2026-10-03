"use strict";
// Executes the production NSIS uninstall macro against a private registry tree.
// It never registers an application, touches .pdf, or runs a product uninstaller.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (key === "--help") return { help: true };
    if (!["--compiler", "--include", "--output"].includes(key) || !args[i + 1]) throw new Error(`Unknown or incomplete option: ${key}`);
    result[key.slice(2)] = path.resolve(args[++i]);
  }
  if (!result.compiler || !result.output) throw new Error("--compiler and --output are required");
  result.include ||= path.resolve(__dirname, "../build/windows-file-associations.nsh");
  return result;
}

function powershell(code) {
  const executable = path.join(process.env.SystemRoot, "System32/WindowsPowerShell/v1.0/powershell.exe");
  const result = spawnSync(executable, ["-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference='Stop';" + code], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}
const quote = value => "'" + value.replaceAll("'", "''") + "'";

function main(options) {
  assert.equal(process.platform, "win32", "Native NSIS regression requires Windows");
  assert.ok(!fs.existsSync(options.output), "Preserve previous evidence");
  const token = crypto.randomBytes(16).toString("hex");
  const registryRoot = `Software\\SwiftLocalAcceptance\\${token}`;
  assert.match(registryRoot, /^Software\\SwiftLocalAcceptance\\[a-f0-9]{32}$/);
  const work = path.join(path.dirname(options.output), `nsis-association-${token}`);
  assert.ok(!fs.existsSync(work)); fs.mkdirSync(work, { recursive: true });
  const source = fs.readFileSync(options.include, "utf8");
  const isolated = source.replaceAll("Software\\Classes", registryRoot + "\\Classes");
  assert.ok(isolated.includes(registryRoot));
  assert.ok(!isolated.includes("Software\\Classes"), "Production registry path escaped isolation");
  const include = path.join(work, "isolated.nsh");
  const nsi = path.join(work, "regression.nsi");
  const executable = path.join(work, "regression.exe");
  fs.writeFileSync(include, isolated);
  fs.writeFileSync(nsi, `Unicode true\nSilentInstall silent\nRequestExecutionLevel user\nName "SwiftLocal isolated association regression"\nOutFile "${executable}"\n!define SHELL_CONTEXT HKCU\n!include "${include}"\nSection\n!insertmacro customUnInstall\nWriteINIStr "${path.join(work, "execution.ini")}" "execution" "completed" "yes"\nSectionEnd\n`);
  const report = { status: "UNVERIFIED", scope: "actual production uninstall macro with registry paths redirected to an isolated random HKCU tree", compilerVersion: null, sourceSha256: crypto.createHash("sha256").update(source).digest("hex"), registryIsolation: "PASS", cleanup: "UNVERIFIED" };
  let seeded = false;
  try {
    const compilerEnv = { ...process.env, NSISDIR: path.dirname(path.dirname(options.compiler)) };
    const version = spawnSync(options.compiler, ["/VERSION"], { encoding: "utf8", windowsHide: true, env: compilerEnv });
    assert.equal(version.status, 0, version.stderr); report.compilerVersion = version.stdout.trim();
    const compile = spawnSync(options.compiler, ["/V2", nsi], { encoding: "utf8", windowsHide: true, env: compilerEnv });
    fs.writeFileSync(path.join(work, "compile.log"), compile.stdout + compile.stderr);
    assert.equal(compile.status, 0, compile.stderr || compile.stdout);
    powershell(`if([Microsoft.Win32.Registry]::CurrentUser.OpenSubKey(${quote(registryRoot)})){throw 'Registry collision'};$k=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey(${quote(registryRoot + "\\Classes\\.pdf\\OpenWithProgids")});try{$k.SetValue('SwiftLocal.PDF',[byte[]]@(),[Microsoft.Win32.RegistryValueKind]::None);$k.SetValue('StorePeer.PDF',[byte[]]@(),[Microsoft.Win32.RegistryValueKind]::None);$k.SetValue('OtherPeer.PDF','peer',[Microsoft.Win32.RegistryValueKind]::String);$k.SetValue('','default-sentinel',[Microsoft.Win32.RegistryValueKind]::String)}finally{$k.Dispose()};foreach($p in @('Classes\\SwiftLocal.PDF','Classes\\Applications\\SwiftLocal.exe','UserChoice')){$s=[Microsoft.Win32.Registry]::CurrentUser.CreateSubKey(${quote(registryRoot)}+'\\'+$p);try{$s.SetValue('sentinel','preserve')}finally{$s.Dispose()}}`);
    seeded = true;
    const run = spawnSync(executable, [], { encoding: "utf8", windowsHide: true, timeout: 30000 });
    assert.equal(run.status, 0, run.error?.message || run.stderr);
    assert.match(fs.readFileSync(path.join(work, "execution.ini"), "utf8"), /completed=yes/);
    const actual = JSON.parse(powershell(`$r=${quote(registryRoot)};$k=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($r+'\\Classes\\.pdf\\OpenWithProgids');$values=@{};if($k){try{foreach($n in $k.GetValueNames()){$v=$k.GetValue($n);$values[$n]=@{kind=$k.GetValueKind($n).ToString();value=$v}}}finally{$k.Dispose()}};$own=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($r+'\\Classes\\SwiftLocal.PDF');$app=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($r+'\\Classes\\Applications\\SwiftLocal.exe');$choice=[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($r+'\\UserChoice');try{@{values=$values;ownClassExists=($null -ne $own);ownApplicationExists=($null -ne $app);userChoice=$choice.GetValue('sentinel')}|ConvertTo-Json -Depth 5 -Compress}finally{if($own){$own.Dispose()};if($app){$app.Dispose()};if($choice){$choice.Dispose()}}`));
    report.actual = actual;
    assert.equal(actual.ownClassExists, false); assert.equal(actual.ownApplicationExists, false);
    assert.equal(actual.userChoice, "preserve");
    assert.deepEqual(actual.values, { "StorePeer.PDF": { kind: "None", value: [] }, "OtherPeer.PDF": { kind: "String", value: "peer" }, "": { kind: "String", value: "default-sentinel" } }, "Peer PDF registrations must survive uninstall");
    report.peerRegistrations = "PASS"; report.ownRegistrationsRemoved = "PASS"; report.unrelatedDefault = "PASS"; report.status = "PASS";
  } catch (error) { report.status = "FAIL"; report.error = error.message; throw error; }
  finally {
    try {
      if (seeded) powershell(`[Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree(${quote(registryRoot)},$false);if([Microsoft.Win32.Registry]::CurrentUser.OpenSubKey(${quote(registryRoot)})){throw 'Isolated registry residue'}`);
      report.cleanup = "PASS";
    } catch (error) { report.cleanup = "FAIL"; report.cleanupError = error.message; report.status = "FAIL"; process.exitCode = 1; }
    fs.writeFileSync(options.output, JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify(report, null, 2));
}
if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) console.log("Usage: node scripts/verify-windows-file-association-uninstall.js --compiler <makensis.exe> --output <new receipt.json> [--include <macro.nsh>]");
    else main(options);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { parseArgs, main };
