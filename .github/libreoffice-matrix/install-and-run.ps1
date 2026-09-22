param(
  [Parameter(Mandatory = $true)][string]$Package,
  [Parameter(Mandatory = $true)][string]$Fixture,
  [Parameter(Mandatory = $true)][string]$Evidence
)
$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $root
$identity = Get-Content (Join-Path $root 'build/store/partner-center-identity.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$Package = (Resolve-Path $Package).Path
if (Get-AppxPackage -Name $identity.identityName) { throw "Existing $($identity.identityName) package found" }
$sdk = Get-ChildItem "${env:ProgramFiles(x86)}/Windows Kits/10/bin/*/x64/signtool.exe" | Sort-Object FullName -Descending | Select-Object -First 1
if (!$sdk) { throw 'Windows SDK signtool.exe unavailable' }
$working = Join-Path $env:TEMP ('sl-lo-matrix-sign-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $working | Out-Null
$certificate = $null
$installed = $null
try {
  $certificate = New-SelfSignedCertificate -Type Custom -Subject $identity.publisher -FriendlyName 'SwiftLocal developer install' -KeyUsage DigitalSignature -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy NonExportable -CertStoreLocation 'Cert:/LocalMachine/My' -NotAfter (Get-Date).AddDays(1) -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
  if ($certificate.Subject -cne $identity.publisher) { throw "Certificate subject drifted: $($certificate.Subject)" }
  $trust = New-Object Security.Cryptography.X509Certificates.X509Store('TrustedPeople', 'LocalMachine')
  $trust.Open('ReadWrite'); $trust.Add($certificate); $trust.Close()
  $signed = Join-Path $working (Split-Path $Package -Leaf)
  Copy-Item $Package $signed
  & $sdk.FullName sign /fd SHA256 /sha1 $certificate.Thumbprint /sm /s My $signed
  if ($LASTEXITCODE -ne 0) { throw 'Developer-only signing failed' }
  Add-AppxPackage -Path $signed
  $installed = Get-AppxPackage -Name $identity.identityName
  if ($installed.PackageFamilyName -cne $identity.packageFamilyName) { throw "Installed PFN $($installed.PackageFamilyName)" }
  $soffice = Join-Path $installed.InstallLocation 'app\resources\tools\libreoffice\program\soffice.com'
  if (!(Test-Path -LiteralPath $soffice)) { throw "Packaged soffice missing: $soffice" }
  $evidencePath = [IO.Path]::GetFullPath($Evidence)
  $evidenceDir = Split-Path $evidencePath -Parent
  New-Item -ItemType Directory -Force $evidenceDir | Out-Null
  $configPath = Join-Path $evidenceDir 'lo-matrix-config.json'
  $launchLog = Join-Path $evidenceDir 'lo-matrix-launch.log'
  $outerLog = Join-Path $evidenceDir 'lo-matrix-outer.log'
  $launchConfig = @{
    soffice = $soffice
    fixture = (Resolve-Path $Fixture).Path
    evidence = $evidencePath
    launchContext = 'package-identity'
  } | ConvertTo-Json
  [IO.File]::WriteAllText($configPath, $launchConfig, (New-Object Text.UTF8Encoding $false))
  $node = (Get-Command node.exe).Source
  $isolate = (Resolve-Path (Join-Path $PSScriptRoot 'isolate.js')).Path
  $launcher = Join-Path $evidenceDir 'launch-matrix.ps1'
  @(
    '$ErrorActionPreference = ''Continue'''
    "Set-Content -LiteralPath '$launchLog' -Value 'launcher-start'"
    "try { & '$node' '$isolate' --config '$configPath' *>> '$launchLog'; Add-Content -LiteralPath '$launchLog' -Value ('exit=' + `$LASTEXITCODE) } catch { Add-Content -LiteralPath '$launchLog' -Value `$_.Exception.ToString(); Add-Content -LiteralPath '$launchLog' -Value 'exit=1'; exit 1 }"
    'exit $LASTEXITCODE'
  ) -join "`r`n" | Set-Content -LiteralPath $launcher -Encoding ASCII
  "outer-start node=$node" | Set-Content -LiteralPath $outerLog
  # Unpackaged CreateProcess on WindowsApps\soffice.com returns EPERM. Run node inside
  # the package identity and keep soffice children in that context.
  try {
    Invoke-CommandInDesktopPackage -PackageFamilyName $identity.packageFamilyName -AppId $identity.applicationId -Command "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Args "-NoProfile -ExecutionPolicy Bypass -File `"$launcher`"" -PreventBreakaway *>&1 | Tee-Object -FilePath $outerLog -Append
    "cmdlet-returned exit=$LASTEXITCODE" | Add-Content -LiteralPath $outerLog
  } catch {
    $_.Exception.ToString() | Add-Content -LiteralPath $outerLog
    throw
  }
  $deadline = (Get-Date).AddMinutes(40)
  while ((Get-Date) -lt $deadline -and -not (Test-Path -LiteralPath $evidencePath)) {
    if ((Test-Path -LiteralPath $launchLog) -and (Select-String -LiteralPath $launchLog -Pattern '^exit=' -Quiet)) { break }
    if (-not (Test-Path -LiteralPath $launchLog)) { break }
    Start-Sleep -Seconds 5
  }
  if (Test-Path -LiteralPath $launchLog) { Get-Content -LiteralPath $launchLog | Write-Host }
  if (!(Test-Path -LiteralPath $evidencePath)) { throw 'LibreOffice path matrix produced no evidence' }
  $report = Get-Content -LiteralPath $evidencePath -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($report.fatal) { throw "LibreOffice path matrix failed: $($report.fatal)" }
  $baseline = @($report.rows | Where-Object { $_.id -eq 'baseline-short-downloads-short-profile' })
  if ($baseline.Count -ne 1 -or $baseline[0].status -ne 'PASS') { throw 'Baseline short conversion failed; matrix cannot isolate a path factor' }
} finally {
  if ($installed) { Remove-AppxPackage -Package $installed.PackageFullName -ErrorAction SilentlyContinue }
  if ($certificate) {
    Remove-Item ('Cert:/LocalMachine/TrustedPeople/' + $certificate.Thumbprint) -ErrorAction SilentlyContinue
    Remove-Item ('Cert:/LocalMachine/My/' + $certificate.Thumbprint) -ErrorAction SilentlyContinue
  }
  if (Test-Path $working) { Remove-Item $working -Recurse -Force -ErrorAction SilentlyContinue }
}
