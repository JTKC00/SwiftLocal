# Read-only process sampling while the owner updates through App Installer.
# Never launches/closes an app. All writes are ignored evidence in the workspace.
$ErrorActionPreference='Stop'
$root=Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
$evidence=Join-Path $root 'store-evidence/phase2d'
$output=Join-Path $evidence 'step4a-process-monitor.json'
$stop=Join-Path $evidence 'step4a-process-monitor.stop'
if ((Test-Path -LiteralPath $output) -or (Test-Path -LiteralPath $stop)) {throw 'Existing monitor evidence; refuse overwrite.'}
$started=Get-Date; $seen=@{}; $samples=0; $maximum=0
while (-not (Test-Path -LiteralPath $stop) -and ((Get-Date)-$started).TotalMinutes -lt 30) {
  $processes=@(Get-Process -Name SwiftLocal -ErrorAction SilentlyContinue)
  $samples++; $maximum=[Math]::Max($maximum,$processes.Count)
  foreach($process in $processes) {
    if(-not $seen.ContainsKey($process.Id)) {$seen[$process.Id]=[ordered]@{id=$process.Id;name=$process.ProcessName;observedAt=(Get-Date).ToString('o')}}
  }
  Start-Sleep -Milliseconds 250
}
[ordered]@{status=if($seen.Count){'FAIL'}else{'PASS'};scope='read-only 250ms process samples; owner no-launch confirmation remains required';startedAt=$started.ToString('o');endedAt=(Get-Date).ToString('o');samples=$samples;maximumObservedSwiftLocalProcesses=$maximum;observedProcesses=@($seen.Values);stoppedByReceiptFlag=(Test-Path -LiteralPath $stop)} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $output -Encoding UTF8
Write-Host 'Step 4A process observation receipt saved. No application input performed.'
