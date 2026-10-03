# Read-only configuration for the actual installed channel. Does not install it.
param(
  [Parameter(Mandatory=$true)][ValidateSet('Store','NSIS')][string]$Channel,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-z0-9-]+$')][string]$Stage,
  [string]$Evidence='store-evidence/phase2d',
  [string]$OutputRoot
)
$ErrorActionPreference='Stop'
$root=Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
if(-not [IO.Path]::IsPathRooted($Evidence)){$Evidence=Join-Path $root $Evidence}
$Evidence=[IO.Path]::GetFullPath($Evidence)
if(-not $OutputRoot){$OutputRoot=Join-Path $env:USERPROFILE 'Downloads\SwiftLocal-Phase2D-output'}
$OutputRoot=[IO.Path]::GetFullPath($OutputRoot)
$phase=Join-Path $Evidence $Stage
New-Item -ItemType Directory -Force $phase | Out-Null
$config=[ordered]@{evidence=$phase;output=$OutputRoot;stateBaselineFile=(Join-Path $Evidence 'store-seeded-state.json');fixtures=(Join-Path $root 'smoke-temp/store-input');powershell=(Join-Path $env:SystemRoot 'System32/WindowsPowerShell/v1.0/powershell.exe');activate=(Join-Path $root 'scripts/store-activate.ps1');shellOpen=(Join-Path $root 'scripts/store-shell-open-pdf.ps1')}
if($Channel -eq 'Store'){
  $installed=@(Get-AppxPackage -Name JTKC.SwiftLocal)
  if($installed.Count -ne 1){throw 'Expected one installed Store package for current user.'}
  $p=$installed[0]
  if($p.Publisher -cne 'CN=48CB75C0-3F50-44EF-87EB-8203F196B957' -or $p.PackageFamilyName -cne 'JTKC.SwiftLocal_j44a9ewx73faj' -or [string]$p.Architecture -ne 'X64'){throw 'Installed identity/PFN/architecture differs.'}
  if([string]$p.Version -notin @('1.0.0.0','1.0.1.0')){throw 'Not a Phase 2D version.'}
  $config.exe=Join-Path $p.InstallLocation 'app/SwiftLocal.exe'
  $config.profile=Join-Path $env:APPDATA 'SwiftLocal Store'
  $config.profileDirectoryName='SwiftLocal Store'
  $config.expectedFamily=$p.PackageFamilyName
  $config.installedVersion=[string]$p.Version
  $config.requireFreshNativeProbe=$true
  $config.preservePreferences=$true
  $config.aumid=$p.PackageFamilyName+'!SwiftLocal'
  $registrations=@(Get-ChildItem 'Registry::HKEY_CLASSES_ROOT' | Where-Object {$_.PSChildName -like 'AppX*'} | ForEach-Object {
    $application=Get-ItemProperty -LiteralPath ($_.PSPath+'\Application') -ErrorAction SilentlyContinue
    if($application.AppUserModelID -eq $config.aumid){$_.PSChildName}
  })
  $openWith=Get-Item 'Registry::HKEY_CLASSES_ROOT\.pdf\OpenWithProgids'
  $matches=@($registrations | Where-Object {$openWith.GetValueNames() -contains $_})
  if($matches.Count -ne 1){throw 'Expected one actual Store PDF registration.'}
  $config.progId=$matches[0]
}else{
  $records=@(Get-ItemProperty 'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName -match 'SwiftLocal|快轉通'})
  if($records.Count -ne 1 -or $records[0].DisplayVersion -cne '0.4.1'){throw 'Expected the actual published NSIS v0.4.1 installation.'}
  $install=[string]$records[0].InstallLocation
  if(-not $install){$match=[regex]::Match([string]$records[0].UninstallString,'^"([^\"]+)"');if(-not $match.Success){throw 'Cannot resolve NSIS installation.'};$install=Split-Path $match.Groups[1].Value -Parent}
  $config.exe=Join-Path $install 'SwiftLocal.exe'
  $config.profile=Join-Path $env:APPDATA '快轉通 SwiftLocal'
  $config.progId='SwiftLocal.PDF'
  $config.shellOpen=Join-Path $root 'scripts/windows-shell-open-pdf.ps1'
}
if(-not (Test-Path -LiteralPath $config.exe)){throw 'Installed executable missing.'}
$file=Join-Path $phase ($Channel.ToLowerInvariant()+'-config.json')
$config | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $file -Encoding UTF8
Write-Host $file
