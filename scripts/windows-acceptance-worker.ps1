param([Parameter(Mandatory=$true)][string]$Configuration)
$ErrorActionPreference = 'Stop'
$config = Get-Content -LiteralPath $Configuration -Raw | ConvertFrom-Json
$report = [ordered]@{ scope = 'Fresh standard user on GitHub Windows Server runner; not Windows 11 clean VM'; identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name; candidateSha256=$config.candidateSha256; baselineSha256=$config.baselineSha256; candidateSourceRun=$config.candidateSourceRun; steps = @() }
function Record($Name, $Evidence) { $script:report.steps += [ordered]@{ name=$Name; status='PASS'; evidence=$Evidence } }
function Assert($Condition, $Message) { if (-not $Condition) { throw $Message } }
function Run-Installer($Installer) {
  $p = Start-Process -FilePath $Installer -ArgumentList "/S /D=$($config.installDir)" -PassThru -Wait
  Assert ($p.ExitCode -eq 0) "Installer exited $($p.ExitCode)"
  Assert (Test-Path -LiteralPath $config.exe) 'Installer did not use the requested Unicode directory'
}
function Uninstall {
  $files = @(Get-ChildItem -LiteralPath $config.installDir -Filter 'Uninstall*.exe')
  Assert ($files.Count -eq 1) 'Expected exactly one owned uninstaller'
  $p = Start-Process -FilePath $files[0].FullName -ArgumentList '/S' -PassThru -Wait
  Assert ($p.ExitCode -eq 0) "Uninstaller exited $($p.ExitCode)"
  for ($i=0; $i -lt 240 -and (Test-Path -LiteralPath $config.exe); $i++) { Start-Sleep -Milliseconds 500 }
  Assert (-not (Test-Path -LiteralPath $config.exe)) 'Uninstall left the installed executable'
  $leftover = @(Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match 'SwiftLocal' })
  Assert ($leftover.Count -eq 0) 'Uninstall left its Apps and Features registration'
  foreach ($folder in @((Join-Path $env:USERPROFILE 'Desktop'), (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'))) {
    $links = @(Get-ChildItem -LiteralPath $folder -Filter '*SwiftLocal*.lnk' -Recurse -ErrorAction SilentlyContinue)
    Assert ($links.Count -eq 0) "Uninstall left SwiftLocal shortcuts in $folder"
  }
}
function Run-App($Phase) {
  & $config.node $config.harness $Configuration $Phase
  Assert ($LASTEXITCODE -eq 0) "Installed app acceptance failed: $Phase"
}
function Pdf-Default { (Get-Item -LiteralPath 'HKCU:\Software\Classes\.pdf').GetValue('') }
try {
  Assert ($report.identity.EndsWith('\' + $config.user)) 'Acceptance is not running as the fresh standard user'
  $profile = [Environment]::GetFolderPath('UserProfile')
  Assert ($profile -match '[^\x00-\x7f]') 'Expected a real Unicode Windows user profile'
  Assert ($profile -notmatch 'runneradmin') 'Refusing existing runner profile'
  $env:USERPROFILE = $profile
  # CreateProcessWithLogonW loads HKCU but inherits the parent's environment.
  # These are new, unredirected profiles; derive their AppData from the verified profile.
  $env:APPDATA = Join-Path $profile 'AppData\Roaming'
  $env:LOCALAPPDATA = Join-Path $profile 'AppData\Local'
  New-Item -ItemType Directory -Force -Path $env:APPDATA,$env:LOCALAPPDATA | Out-Null
  $env:TEMP = Join-Path $env:LOCALAPPDATA 'Temp'
  $env:TMP = $env:TEMP
  New-Item -ItemType Directory -Force -Path $env:TEMP | Out-Null
  $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot;$env:SystemRoot\System32\WindowsPowerShell\v1.0"
  foreach ($name in @('SWIFTLOCAL_LIBREOFFICE','SWIFTLOCAL_TESSERACT','SWIFTLOCAL_FFMPEG','SWIFTLOCAL_QPDF','PYTHONPATH','ELECTRON_RUN_AS_NODE')) { Remove-Item "Env:$name" -ErrorAction SilentlyContinue }
  foreach ($command in @('soffice','tesseract','ffmpeg','qpdf','python','node')) {
    Assert (-not (Get-Command $command -ErrorAction SilentlyContinue)) "External command available to app: $command"
  }
  $external = @('C:\Program Files\LibreOffice','C:\Program Files (x86)\LibreOffice','C:\Program Files\Tesseract-OCR','C:\Program Files (x86)\Tesseract-OCR','C:\Program Files\ffmpeg','C:\ffmpeg') | Where-Object { Test-Path -LiteralPath $_ }
  Assert ($external.Count -eq 0) "Preinstalled engine directories: $external"
  $installedEngines = @(Get-ItemProperty 'HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*','HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -match 'LibreOffice|Tesseract|FFmpeg|QPDF' } | Select-Object -ExpandProperty DisplayName)
  Assert ($installedEngines.Count -eq 0) "Preinstalled engine registrations: $installedEngines"
  Record 'fresh-user-and-no-external-engine-discovery' @{ profile=$profile; appData=$env:APPDATA; localAppData=$env:LOCALAPPDATA; temp=$env:TEMP; path=$env:PATH; registeredEngines=$installedEngines }
  Assert (-not (Test-Path -LiteralPath $config.exe)) 'Candidate already installed'
  New-Item -Path 'HKCU:\Software\Classes\.pdf' -Force | Out-Null
  Set-Item -LiteralPath 'HKCU:\Software\Classes\.pdf' -Value 'SwiftLocal.Acceptance.Default'
  if ($config.scenario -eq "fresh") {
  Run-Installer $config.candidate
  Assert ((Pdf-Default) -eq 'SwiftLocal.Acceptance.Default') 'Fresh install changed PDF default'
  $openWith = Get-Item -LiteralPath 'HKCU:\Software\Classes\.pdf\OpenWithProgids'
  Assert ($openWith.GetValueNames() -contains 'SwiftLocal.PDF') 'Missing PDF Open With registration'
  Record 'silent-install-unicode-path-and-open-with-registration' @{ directory=$config.installDir; version=(Get-Item $config.exe).VersionInfo.ProductVersion; default=(Pdf-Default) }
  try { Run-App 'fresh' } finally {
  Uninstall
  Assert (-not (Test-Path 'HKCU:\Software\Classes\SwiftLocal.PDF')) 'Uninstall left our PDF class'
  Assert ((Pdf-Default) -eq 'SwiftLocal.Acceptance.Default') 'Uninstall changed PDF default'
  Record 'uninstall-removes-app-and-owned-association' $true
  }
  } else {
  Run-Installer $config.baseline
  Record 'baseline-v0.4.0-installed' (Get-Item $config.exe).VersionInfo.ProductVersion
  Run-App 'baseline'
  # Model an existing user's preference before upgrading from the old installer.
  Set-Item -LiteralPath 'HKCU:\Software\Classes\.pdf' -Value 'SwiftLocal.Acceptance.Default'
  Run-Installer $config.candidate
  Assert ((Get-Item $config.exe).VersionInfo.ProductVersion -match '^0\.4\.1') 'Candidate version did not replace v0.4.0'
  Assert ((Pdf-Default) -eq 'SwiftLocal.Acceptance.Default') 'Upgrade changed PDF default'
  Record 'upgrade-from-v0.4.0-to-candidate' (Get-Item $config.exe).VersionInfo.ProductVersion
  try { Run-App 'upgrade' } finally {
  Uninstall
  Assert (-not (Test-Path 'HKCU:\Software\Classes\SwiftLocal.PDF')) 'Final uninstall left association'
  Record 'final-uninstall' $true
  }
  }
} catch {
  $report.steps += [ordered]@{ name='acceptance'; status='FAIL'; error=$_.Exception.Message; scriptStack=$_.ScriptStackTrace }
  Write-Error $_ -ErrorAction Continue
  $script:failed = $true
} finally {
  $report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $config.evidence 'fresh-user-lifecycle.json') -Encoding utf8
}
if ($script:failed) { exit 1 }
