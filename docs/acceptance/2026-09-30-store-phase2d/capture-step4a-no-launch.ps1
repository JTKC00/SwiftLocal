# Read-only lifecycle evidence. No activation, native probes or installation.
param([Parameter(Mandatory=$true)][ValidateSet('b-step4a-preflight','c-after-update-before-launch')][string]$Stage)
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
$evidence = Join-Path $root 'store-evidence/phase2d'
$receipt = Join-Path $evidence "$Stage-no-launch.json"
if (Test-Path -LiteralPath $receipt) { throw 'Preserve the existing lifecycle receipt.' }
$expectedVersion = if ($Stage -eq 'b-step4a-preflight') { '1.0.0.0' } else { '1.0.1.0' }
$report = [ordered]@{status='UNVERIFIED';stage=$Stage;scope='read-only package/manifest/process/event inventory; no app launched by this helper';helperActivatedAnyApp=$false;priorLaunchDuringUpdate='UNVERIFIED; separate process observation receipt required';startedAt=(Get-Date).ToString('o')}
try {
  $report.processesBefore = @(Get-Process -Name SwiftLocal -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,StartTime)
  if ($report.processesBefore.Count) { throw 'SwiftLocal process exists. STOP without touching it.' }
  $package = @(Get-AppxPackage -Name JTKC.SwiftLocal)
  if ($package.Count -ne 1 -or [string]$package[0].Version -cne $expectedVersion -or $package[0].PackageFamilyName -cne 'JTKC.SwiftLocal_j44a9ewx73faj') { throw 'Unexpected package version/family; preserve result and STOP.' }
  $manifest = Get-AppxPackageManifest -Package $package[0].PackageFullName
  $manifest.Save((Join-Path $evidence "$Stage-AppxManifest.xml"))
  $report.package = $package[0] | Select-Object Name,Publisher,Version,Architecture,PackageFullName,PackageFamilyName,InstallLocation,Status
  $report.applicationIds = @($manifest.Package.Applications.Application | ForEach-Object {[string]$_.Id})
  if ($report.package.Name -cne 'JTKC.SwiftLocal' -or $report.package.Publisher -cne 'CN=48CB75C0-3F50-44EF-87EB-8203F196B957' -or $report.applicationIds.Count -ne 1 -or $report.applicationIds[0] -cne 'SwiftLocal') { throw 'Package/Application identity changed. STOP.' }
  $report.aumid = "$($package[0].PackageFamilyName)!$($report.applicationIds[0])"
  & (Join-Path $PSScriptRoot 'capture-inventory.ps1') -Stage $Stage -OutputRoot (Join-Path $env:USERPROFILE 'Downloads/SwiftLocal-Phase2D-output')
  if ($Stage -eq 'c-after-update-before-launch') {
    $preflight = Get-Content -LiteralPath (Join-Path $evidence 'step4a-preflight-completed.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $events = @()
    foreach ($bookmark in $preflight.deploymentEventBookmarks) {
      $query = "*[System[EventRecordID > $($bookmark.lastRecordId)]]"
      $entries = @(Get-WinEvent -LogName $bookmark.channel -FilterXPath $query -ErrorAction SilentlyContinue)
      foreach ($entry in $entries) {
        $xml = $entry.ToXml()
        $events += [ordered]@{channel=$bookmark.channel;recordId=$entry.RecordId;id=$entry.Id;at=$entry.TimeCreated.ToString('o');activityId=([xml]$xml).Event.System.Correlation.ActivityID;message=$entry.Message;xml=$xml;involvesSwiftLocal=($xml -match 'JTKC\.SwiftLocal' -or $entry.Message -match 'JTKC\.SwiftLocal')}
      }
    }
    $events | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidence "$Stage-deployment-events.json") -Encoding UTF8
    $report.deploymentEventsCaptured = $events.Count
    $report.swiftLocalDeploymentEvents = @($events | Where-Object {$_.involvesSwiftLocal}).Count
  }
  $report.processesAfter = @(Get-Process -Name SwiftLocal -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,StartTime)
  if ($report.processesAfter.Count) { throw 'SwiftLocal started during inventory. STOP.' }
  $report.status='PASS'; $report.completedAt=(Get-Date).ToString('o')
} catch { $report.status='FAIL'; $report.error=[string]$_.Exception.Message; throw }
finally { $report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $receipt -Encoding UTF8 }
Write-Host "$Stage captured with zero SwiftLocal processes before and after. No launch performed."
