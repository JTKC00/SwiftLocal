# Read-only Phase 2D inventory. Personal paths/state stay in ignored local evidence.
# Does not install, uninstall, change settings/defaults or remove any state/output.
param(
  [Parameter(Mandatory = $true)][ValidatePattern('^[a-z0-9-]+$')][string]$Stage,
  [string]$Evidence = 'store-evidence/phase2d',
  [string]$OutputRoot
)
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
if (-not [IO.Path]::IsPathRooted($Evidence)) { $Evidence = Join-Path $root $Evidence }
$Evidence = [IO.Path]::GetFullPath($Evidence)
$receipt = Join-Path $Evidence "$Stage-inventory.json"
if (Test-Path -LiteralPath $receipt) { throw 'Inventory exists; preserve it and choose another stage name.' }
New-Item -ItemType Directory -Force $Evidence | Out-Null
$family = 'JTKC.SwiftLocal_j44a9ewx73faj'
function Get-Tree([string]$Path, [switch]$StateOnly) {
  $result = [ordered]@{ path = $Path; exists = (Test-Path -LiteralPath $Path); files = @(); directories = @(); errors = @() }
  if (-not $result.exists) { return $result }
  $queue = New-Object 'System.Collections.Generic.Queue[string]'
  $queue.Enqueue($Path)
  while ($queue.Count -gt 0) {
    $dir = $queue.Dequeue()
    try { $children = @(Get-ChildItem -LiteralPath $dir -Force -ErrorAction Stop) }
    catch { $result.errors += [string]$_.Exception.Message; continue }
    foreach ($item in $children) {
      $relative = $item.FullName.Substring($Path.TrimEnd('\').Length).TrimStart('\')
      if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        $result.errors += "Reparse point skipped: $relative"; continue
      }
      if ($item.PSIsContainer) {
        $result.directories += $relative
        # Caches/logs are recorded as directories but are not durable state markers.
        if ($StateOnly -and $item.Name -match '^(Cache|Code Cache|GPUCache|Dawn.*Cache|logs|crashes|temp|deno-cache|cache)$') { continue }
        $queue.Enqueue($item.FullName)
      } else {
        try { $hash = (Get-FileHash -LiteralPath $item.FullName -Algorithm SHA256 -ErrorAction Stop).Hash.ToLowerInvariant() }
        catch { $hash = $null; $result.errors += "$relative : $($_.Exception.Message)" }
        $result.files += [ordered]@{ relativePath = $relative; bytes = $item.Length; sha256 = $hash }
      }
    }
  }
  return $result
}
function Get-Registration([string]$Path) {
  $item = Get-Item -LiteralPath $Path -ErrorAction SilentlyContinue
  if (-not $item) { return $null }
  $values = [ordered]@{}
  foreach ($name in $item.GetValueNames()) { $values[$name] = $item.GetValue($name) }
  [ordered]@{ registryPath = $Path; values = $values }
}
$uninstall = @()
foreach ($keyRoot in @('HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) {
  foreach ($key in @(Get-ChildItem -LiteralPath $keyRoot -ErrorAction SilentlyContinue)) {
    $app = Get-ItemProperty -LiteralPath $key.PSPath -ErrorAction SilentlyContinue
    if ([string]$app.DisplayName -match 'SwiftLocal|快轉通') { $uninstall += Get-Registration $key.PSPath }
  }
}
$package = @(Get-AppxPackage -Name 'JTKC.SwiftLocal' | Select-Object Name,Publisher,Version,Architecture,PackageFullName,PackageFamilyName,InstallLocation,Status)
$pdfChoice = Get-Registration 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.pdf\UserChoice'
$openWith = Get-Registration 'Registry::HKEY_CLASSES_ROOT\.pdf\OpenWithProgids'
$classes = @()
if ($openWith) {
  foreach ($id in $openWith.values.Keys) {
    if (-not $id) { continue }
    $application = Get-Registration "Registry::HKEY_CLASSES_ROOT\$id\Application"
    $command = Get-Registration "Registry::HKEY_CLASSES_ROOT\$id\shell\open\command"
    $base = Get-Registration "Registry::HKEY_CLASSES_ROOT\$id"
    $classes += [ordered]@{ progId = $id; base = $base; application = $application; command = $command }
  }
}
$nsisInstall = @()
foreach ($record in $uninstall) {
  $path = [string]$record.values['InstallLocation']
  if (-not $path -and $record.values['UninstallString']) {
    $match = [regex]::Match([string]$record.values['UninstallString'], '^"([^\"]+)"')
    if ($match.Success) { $path = Split-Path $match.Groups[1].Value -Parent }
  }
  if ($path -and (Test-Path -LiteralPath $path -PathType Container)) {
    $nsisInstall += Get-Tree $path
  }
}
$storeState = @(
  [ordered]@{ category = 'A: application-owned logical Roaming profile'; tree = (Get-Tree (Join-Path $env:APPDATA 'SwiftLocal Store') -StateOnly) },
  [ordered]@{ category = 'A: application-owned Local profile if present'; tree = (Get-Tree (Join-Path $env:LOCALAPPDATA 'SwiftLocal Store') -StateOnly) },
  [ordered]@{ category = 'B: package-managed and redirected state'; tree = (Get-Tree (Join-Path $env:LOCALAPPDATA "Packages\$family") -StateOnly) }
)
$nsisState = @(
  (Get-Tree (Join-Path $env:APPDATA '快轉通 SwiftLocal') -StateOnly),
  (Get-Tree (Join-Path $env:APPDATA 'SwiftLocal') -StateOnly),
  (Get-Tree (Join-Path $env:LOCALAPPDATA '快轉通 SwiftLocal') -StateOnly)
)
$scratchState = @([ordered]@{ category = 'A: shared SwiftLocal private scratch fallback, not a migration/profile'; tree = (Get-Tree (Join-Path $env:USERPROFILE '.swiftlocal-private') -StateOnly) })
foreach ($scratch in @(Get-ChildItem -LiteralPath (Join-Path $env:LOCALAPPDATA 'Temp') -Directory -Filter '.swiftlocal-office-*' -ErrorAction SilentlyContinue)) {
  $scratchState += [ordered]@{ category = 'A: SwiftLocal-owned LibreOffice temporary scratch residue'; tree = (Get-Tree $scratch.FullName -StateOnly) }
}
$output = if ($OutputRoot) { Get-Tree ([IO.Path]::GetFullPath($OutputRoot)) } else { $null }
$windows = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
[ordered]@{
  status = 'PASS'; scope = 'read-only inventory collection; GUI acceptance not inferred'; gui = 'UNVERIFIED'
  stage = $Stage; capturedAt = (Get-Date).ToString('o'); userSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  windows = [ordered]@{ edition = $windows.EditionID; version = $windows.DisplayVersion; build = "$($windows.CurrentBuild).$($windows.UBR)"; architecture = $env:PROCESSOR_ARCHITECTURE }
  package = $package; startEntries = @(Get-StartApps | Where-Object { $_.Name -match 'SwiftLocal|快轉通' })
  pdfUserChoice = $pdfChoice; pdfOpenWith = $openWith; pdfClasses = $classes
  nsisUninstallRegistration = $uninstall; nsisInstallFiles = $nsisInstall; nsisState = $nsisState
  storeState = $storeState; sharedScratchState = $scratchState; userOutput = [ordered]@{ category = 'C: user-created output'; tree = $output }
} | ConvertTo-Json -Depth 14 | Set-Content -LiteralPath $receipt -Encoding UTF8
Write-Host "Recorded $receipt. No state or default was modified."
