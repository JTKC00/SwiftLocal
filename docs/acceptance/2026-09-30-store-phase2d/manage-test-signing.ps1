# Phase 2D only. One non-exportable key signs BOTH versions; never installs packages.
# Run Prepare/CleanupUser as the original standard user; Trust/CleanupMachine elevated.
param(
  [Parameter(Mandatory = $true)][ValidateSet('Prepare','Trust','CleanupMachine','CleanupUser')][string]$Mode,
  [string]$Evidence = 'store-evidence/phase2d/signing',
  [string]$SignTool
)
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
if (-not [IO.Path]::IsPathRooted($Evidence)) { $Evidence = Join-Path $root $Evidence }
$Evidence = [IO.Path]::GetFullPath($Evidence)
$allowed = [IO.Path]::GetFullPath((Join-Path $root 'store-evidence/phase2d')).TrimEnd('\') + '\'
if (-not $Evidence.StartsWith($allowed, [StringComparison]::OrdinalIgnoreCase)) { throw 'Signing outputs must remain under ignored store-evidence/phase2d.' }
$receiptPath = Join-Path $Evidence 'signing.json'
$subject = 'CN=48CB75C0-3F50-44EF-87EB-8203F196B957'
$frozen = '38a1ea9d89e956c1dbcdecb21f85bca673d7ab70301b16e66f68c819d7eed404'
$friendly = 'SwiftLocal Phase 2D update test'
$publicPath = Join-Path $Evidence 'phase2d-public.cer'
$copies = @(
  (Join-Path $Evidence 'SwiftLocal-0.4.1-store-1.0.0.0.developer-signed-test.appx'),
  (Join-Path $Evidence 'SwiftLocal-0.4.1-store-1.0.1.0.developer-signed-test.appx')
)
function Hash([string]$Path) { (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
function Save($Report) { $Report | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $receiptPath -Encoding UTF8 }
function Require-Admin {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Machine certificate trust requires an administrator.' }
}
if ($Mode -eq 'Prepare') {
  if (Test-Path -LiteralPath $receiptPath) { throw 'Existing signing cycle; refuse overwrite.' }
  $fixture = Get-Content -LiteralPath (Join-Path $root 'store-evidence/phase2d/update-fixture.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  if ($fixture.status -ne 'PASS' -or $fixture.baseline.sha256 -cne $frozen -or $fixture.update.identity.Version -cne '1.0.1.0') { throw 'Verified update fixture receipt missing or changed.' }
  $sources = @((Join-Path $root 'dist-store/SwiftLocal-0.4.1-store-x64.appx'), (Join-Path $root ('store-evidence/phase2d/' + $fixture.update.filename)))
  $hashes = @($frozen, [string]$fixture.update.sha256)
  $sizes = @(1115695293, [long]$fixture.update.bytes)
  for ($i=0; $i -lt 2; $i++) {
    if ((Get-Item -LiteralPath $sources[$i]).Length -ne $sizes[$i] -or (Hash $sources[$i]) -cne $hashes[$i]) { throw 'Unsigned package changed; stop acceptance.' }
  }
  if (-not $SignTool) { $SignTool = Join-Path $root 'store-evidence/signing-tools/sdk/bin/10.0.26100.0/x64/signtool.exe' }
  $SignTool = (Resolve-Path -LiteralPath $SignTool).Path
  $signature = Get-AuthenticodeSignature -LiteralPath $SignTool
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '(^|, )O=Microsoft Corporation(,|$)') { throw 'Require valid Microsoft-signed SDK SignTool.' }
  if (@(Get-ChildItem Cert:\CurrentUser\My,Cert:\LocalMachine\TrustedPeople | Where-Object {$_.FriendlyName -eq $friendly}).Count) { throw 'Prior Phase 2D certificate exists; clean up its exact receipt first.' }
  New-Item -ItemType Directory -Force $Evidence | Out-Null
  $certificate = $null; $success = $false
  try {
    $certificate = New-SelfSignedCertificate -Type Custom -Subject $subject -FriendlyName $friendly -KeyUsage DigitalSignature -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy NonExportable -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddDays(5) -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3','2.5.29.19={text}')
    if ($certificate.Subject -cne $subject) { throw 'Certificate subject mismatch.' }
    # Public DER only. There is deliberately no PFX/private-key export.
    [IO.File]::WriteAllBytes($publicPath, $certificate.Export([Security.Cryptography.X509Certificates.X509ContentType]::Cert))
    $packages = @()
    for ($i=0; $i -lt 2; $i++) {
      if (Test-Path -LiteralPath $copies[$i]) { throw 'Signed-copy path already exists.' }
      Copy-Item -LiteralPath $sources[$i] -Destination $copies[$i]
      & $SignTool sign /fd SHA256 /sha1 $certificate.Thumbprint /s My $copies[$i]
      if ($LASTEXITCODE -ne 0) { throw "Signing failed for version $i." }
      if ((Hash $sources[$i]) -cne $hashes[$i]) { throw 'Unsigned input changed during signing.' }
      $packages += [ordered]@{ version = @('1.0.0.0','1.0.1.0')[$i]; unsignedPath = $sources[$i]; unsignedBytes = $sizes[$i]; unsignedSha256 = $hashes[$i]; signedPath = $copies[$i]; signedBytes = (Get-Item -LiteralPath $copies[$i]).Length; signedSha256 = (Hash $copies[$i]); signatureVerification = 'UNVERIFIED' }
    }
    Save ([ordered]@{ status = 'PARTIAL'; scope = 'local-only signing; stopped before installation'; gui = 'UNVERIFIED'; packages = $packages; certificateThumbprint = $certificate.Thumbprint; certificateSubject = $subject; signingUserSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value; nonExportable = $true; expires = $certificate.NotAfter.ToString('o'); signToolPath = $SignTool; signToolSha256 = (Hash $SignTool); publicCertificatePath = $publicPath; trust = 'UNVERIFIED' })
    $success = $true
  } finally {
    if (-not $success -and $certificate) {
      Remove-Item -LiteralPath ('Cert:\CurrentUser\My\' + $certificate.Thumbprint) -DeleteKey -Force
      foreach ($file in @($copies[0],$copies[1],$publicPath)) { if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force } }
    }
  }
  Write-Host "Prepared both copies with one certificate. STOPPED BEFORE INSTALL. Receipt: $receiptPath"
  return
}
$report = Get-Content -LiteralPath $receiptPath -Raw -Encoding UTF8 | ConvertFrom-Json
$thumb = [string]$report.certificateThumbprint
if ($thumb -notmatch '^[A-Fa-f0-9]{40}$' -or $report.certificateSubject -cne $subject -or $report.packages[0].unsignedSha256 -cne $frozen -or $report.packages.Count -ne 2) { throw 'Receipt not for this frozen baseline/two-version cycle.' }
for ($i=0; $i -lt 2; $i++) { if ([IO.Path]::GetFullPath($report.packages[$i].signedPath) -cne $copies[$i]) { throw 'Receipt signed path differs from fixed local test-copy path.' } }
$machinePath = "Cert:\LocalMachine\TrustedPeople\$thumb"
if ($Mode -eq 'Trust') {
  Require-Admin
  if ((Hash $report.signToolPath) -cne $report.signToolSha256) { throw 'SignTool changed.' }
  $certificate = New-Object Security.Cryptography.X509Certificates.X509Certificate2($publicPath)
  if ($certificate.Thumbprint -ne $thumb -or $certificate.Subject -cne $subject -or $certificate.HasPrivateKey -or $certificate.NotAfter -le (Get-Date)) { throw 'Public certificate mismatch or expired.' }
  $store = New-Object Security.Cryptography.X509Certificates.X509Store('TrustedPeople','LocalMachine')
  $added = $false
  try {
    $store.Open('ReadWrite')
    if ($store.Certificates.Find('FindByThumbprint',$thumb,$false).Count) { throw 'Trust already present; use receipt or clean up first.' }
    $certificate.FriendlyName = $friendly; $store.Add($certificate); $added = $true
    for ($i=0; $i -lt 2; $i++) {
      if ((Hash $copies[$i]) -cne $report.packages[$i].signedSha256) { throw 'Signed copy changed.' }
      & $report.signToolPath verify /pa $copies[$i]
      if ($LASTEXITCODE -ne 0) { throw 'Signature verification failed.' }
      $signature = Get-AuthenticodeSignature -LiteralPath $copies[$i]
      if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -ne $thumb) { throw 'Both packages must share the expected valid signature.' }
      $report.packages[$i].signatureVerification = 'PASS'
    }
    $report.status = 'PASS'; $report.trust = 'PASS'; Save $report
  } catch { if ($added) { $store.Remove($certificate) }; throw }
  finally { $store.Close(); $certificate.Dispose() }
  Write-Host 'Both signatures verified. STOPPED BEFORE INSTALL.'
  return
}
if ($Mode -eq 'CleanupMachine') {
  Require-Admin
  if (Test-Path -LiteralPath $machinePath) {
    if ((Get-Item -LiteralPath $machinePath).Subject -cne $subject) { throw 'Trust subject mismatch.' }
    Remove-Item -LiteralPath $machinePath -Force
  }
  if (Test-Path -LiteralPath $machinePath) { throw 'Machine trust remains.' }
  @{ status='PARTIAL'; machineTrustRemoved=$true; keyAndCopies='UNVERIFIED'; at=(Get-Date).ToString('o') } | ConvertTo-Json | Set-Content (Join-Path $Evidence 'machine-trust-removed.json') -Encoding UTF8
  return
}
if ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -cne $report.signingUserSid) { throw 'CleanupUser requires original signing user.' }
if (Test-Path -LiteralPath $machinePath) { throw 'Remove machine trust as administrator first.' }
if (Get-AppxPackage -Name 'JTKC.SwiftLocal') { throw 'Record acceptance/uninstall state and uninstall Store before removing its test material.' }
$phaseRoot = [IO.Path]::GetFullPath((Join-Path $root 'store-evidence/phase2d'))
$derivedFiles = @(
  (Join-Path $phaseRoot 'SwiftLocal-0.4.1-store-update-fixture-1.0.1.0-x64.appx'),
  (Join-Path $phaseRoot 'rejected-encoding-attempt-SwiftLocal-0.4.1-store-update-fixture-1.0.1.0-x64.appx')
)
if ([IO.Path]::GetFullPath($report.packages[1].unsignedPath) -cne $derivedFiles[0]) { throw 'Update fixture path differs from this cycle.' }
if (Test-Path -LiteralPath $derivedFiles[0]) {
  if ((Hash $derivedFiles[0]) -cne $report.packages[1].unsignedSha256) { throw 'Update fixture changed; preserve evidence before cleanup.' }
}
$derivedDirectories = @(
  (Join-Path $phaseRoot 'update-fixture-payload'),
  (Join-Path $phaseRoot 'rejected-encoding-attempt-update-fixture-payload')
)
# Resolve and validate EVERY recursive target before deleting any scratch tree.
# These are packaging copies under ignored evidence, never installed/user state.
foreach ($target in @($derivedFiles + $derivedDirectories)) {
  if (Test-Path -LiteralPath $target) {
    $resolved = (Resolve-Path -LiteralPath $target).Path
    if (-not $resolved.StartsWith($phaseRoot.TrimEnd('\')+'\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Derived cleanup target escapes phase evidence.' }
    $item = Get-Item -LiteralPath $resolved
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refusing redirected derived test material.' }
    if ($item.PSIsContainer -and @(Get-ChildItem -LiteralPath $resolved -Recurse -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count) { throw 'Refusing a scratch tree containing reparse points.' }
  }
}
foreach ($storeName in @('CurrentUser\TrustedPeople','CurrentUser\My')) {
  $path = "Cert:\$storeName\$thumb"
  if (Test-Path -LiteralPath $path) {
    if ((Get-Item -LiteralPath $path).Subject -cne $subject) { throw 'Cleanup certificate subject mismatch.' }
    if ($storeName -eq 'CurrentUser\My') { Remove-Item -LiteralPath $path -DeleteKey -Force } else { Remove-Item -LiteralPath $path -Force }
  }
  if (Test-Path -LiteralPath $path) { throw 'Temporary certificate remains.' }
}
foreach ($file in @($copies[0],$copies[1],$publicPath)) {
  if (Test-Path -LiteralPath $file) {
    if ((Get-Item -LiteralPath $file).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Refuse to delete redirected test copy.' }
    Remove-Item -LiteralPath $file -Force
  }
}
foreach ($file in $derivedFiles) { if (Test-Path -LiteralPath $file) { Remove-Item -LiteralPath $file -Force } }
foreach ($directory in $derivedDirectories) { if (Test-Path -LiteralPath $directory) { Remove-Item -LiteralPath $directory -Recurse -Force } }
if ((Hash (Join-Path $root 'dist-store/SwiftLocal-0.4.1-store-x64.appx')) -cne $frozen) { throw 'Frozen baseline changed; stop.' }
@{ status='PASS'; scope='signing and packaging-copy cleanup only; application residue inventory is preserved'; at=(Get-Date).ToString('o'); thumbprint=$thumb; machineTrustRemoved=$true; originalUserCertificateAndKeyRemoved=$true; bothSignedTestCopiesRemoved=$true; publicCertificateRemoved=$true; derivedUpdatePackagesAndPayloadCopiesRemoved=$true; userOutputs='untouched'; installedApplicationState='untouched'; unsignedFrozenBaseline='untouched' } | ConvertTo-Json | Set-Content (Join-Path $Evidence 'cleanup.json') -Encoding UTF8
Write-Host 'Removed temporary trust/key/certificate and derived AppX test copies. User state/output and frozen baseline untouched.'
