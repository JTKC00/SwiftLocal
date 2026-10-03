# Removes only this cycle's temporary trust, certificate, key and test-copy files.
# A standard signing user needs an administrator to remove machine trust first.
# This file must not call Add-AppxPackage or Remove-AppxPackage.
param(
  [string]$Evidence = 'store-evidence/consumer-2026-09-23',
  [switch]$MachineTrustOnly
)
$ErrorActionPreference = 'Stop'
$friendlyName = 'SwiftLocal consumer sideload'
$root = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
if (-not [IO.Path]::IsPathRooted($Evidence)) { $Evidence = Join-Path $root $Evidence }
$Evidence = [IO.Path]::GetFullPath($Evidence)
$own = Get-Content -LiteralPath $PSCommandPath -Raw
if ($own -match '(?m)^\s*(Add-AppxPackage|Remove-AppxPackage)\b') {
  throw 'Certificate cleanup must not install or remove the package.'
}
$preparePath = Join-Path $Evidence 'prepare.json'
if (-not (Test-Path -LiteralPath $preparePath)) { throw "Missing $preparePath. Refusing to guess which certificate to remove." }
$prepare = Get-Content -LiteralPath $preparePath -Raw -Encoding UTF8 | ConvertFrom-Json
$thumb = [string]$prepare.certificateThumbprint
if ($thumb -notmatch '^[0-9A-Fa-f]{40}$' -or
    $prepare.certificateSubject -cne 'CN=48CB75C0-3F50-44EF-87EB-8203F196B957' -or
    $prepare.unsignedSha256 -cne '38a1ea9d89e956c1dbcdecb21f85bca673d7ab70301b16e66f68c819d7eed404') {
  throw 'Receipt does not identify this candidate and temporary certificate.'
}
$machineCertificatePath = "Cert:\LocalMachine\TrustedPeople\$thumb"
if ($MachineTrustOnly) {
  $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'MachineTrustOnly requires an administrator PowerShell.'
  }
  if (Test-Path -LiteralPath $machineCertificatePath) {
    $machineCertificate = Get-Item -LiteralPath $machineCertificatePath
    if ($machineCertificate.Subject -cne $prepare.certificateSubject) { throw 'Machine certificate subject differs from the receipt.' }
    Remove-Item -LiteralPath $machineCertificatePath -Force
  }
  if (Test-Path -LiteralPath $machineCertificatePath) { throw 'Temporary machine trust remains.' }
  [ordered]@{
    status = 'PARTIAL'
    removedAt = (Get-Date).ToString('o')
    thumbprint = $thumb
    machineTrustRemoved = $true
    originalUserKeyAndFiles = 'UNVERIFIED'
    guiAcceptance = 'UNVERIFIED'
  } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Evidence 'machine-trust-removed.json') -Encoding UTF8
  Write-Host 'Machine trust removed. The original signing user must run cleanup without -MachineTrustOnly to remove its key and test files.'
  return
}
if ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -cne $prepare.signingUserSid) {
  throw 'Run full cleanup as the original signing user. A different administrator uses -MachineTrustOnly first.'
}
$signed = Join-Path $Evidence 'SwiftLocal-0.4.1-store-x64.developer-signed-test.appx'
if ([IO.Path]::GetFullPath([string]$prepare.signedPath) -cne $signed) {
  throw 'Signed-copy path is outside this evidence directory. Refusing removal.'
}
# Delete by exact receipt thumbprint, never by publisher or friendly name alone.
foreach ($store in @('LocalMachine\TrustedPeople', 'CurrentUser\TrustedPeople', 'CurrentUser\My')) {
  $path = "Cert:\$store\$thumb"
  if (Test-Path -LiteralPath $path) {
    $certificate = Get-Item -LiteralPath $path
    if ($certificate.Subject -cne $prepare.certificateSubject) { throw "Certificate subject mismatch at $path." }
    if ($store -eq 'CurrentUser\My') {
      Remove-Item -LiteralPath $path -DeleteKey -Force
    } else {
      Remove-Item -LiteralPath $path -Force
    }
  }
}
foreach ($store in @('LocalMachine\TrustedPeople', 'CurrentUser\TrustedPeople', 'CurrentUser\My')) {
  if (Test-Path -LiteralPath "Cert:\$store\$thumb") { throw "Temporary certificate remains in $store." }
}
foreach ($file in @($signed, (Join-Path $Evidence 'sideload-public.cer'))) {
  if (Test-Path -LiteralPath $file) {
    if ((Get-Item -LiteralPath $file).Attributes -band [IO.FileAttributes]::ReparsePoint) {
      throw 'Refusing to delete a redirected preparation output.'
    }
    Remove-Item -LiteralPath $file -Force
  }
}
[ordered]@{
  status = 'PASS'
  removedAt = (Get-Date).ToString('o')
  thumbprint = $thumb
  certificateRemoved = $true
  machineTrustRemoved = $true
  privateKeyRemoved = $true
  signedCopyRemoved = $true
  publicCertificateFileRemoved = $true
  packageUninstall = 'UNVERIFIED — owner uses Windows Settings'
  guiAcceptance = 'UNVERIFIED'
} | ConvertTo-Json | Set-Content (Join-Path $Evidence 'certificate-removed.json') -Encoding UTF8
Write-Host "Removed temporary trust, certificate, private key and test copy for $thumb."
Write-Host 'GUI uninstall and user-output preservation still require owner confirmation.'
