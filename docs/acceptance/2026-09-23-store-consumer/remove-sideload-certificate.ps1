# Removes the Phase 2C temporary CurrentUser sideload certificate.
# Run this after the project owner has uninstalled SwiftLocal from Windows Settings.
# This file must not call Add-AppxPackage or Remove-AppxPackage.
param(
  [string]$Evidence = 'store-evidence/consumer-2026-09-23'
)
$ErrorActionPreference = 'Stop'
$friendlyName = 'SwiftLocal consumer sideload'
$root = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
if (-not [IO.Path]::IsPathRooted($Evidence)) { $Evidence = Join-Path $root $Evidence }
$own = Get-Content -LiteralPath $PSCommandPath -Raw
if ($own -match '(?m)^\s*(Add-AppxPackage|Remove-AppxPackage)\b') {
  throw 'Certificate cleanup must not install or remove the package.'
}
$preparePath = Join-Path $Evidence 'prepare.json'
if (-not (Test-Path -LiteralPath $preparePath)) { throw "Missing $preparePath. Refusing to guess which certificate to remove." }
$prepare = Get-Content -LiteralPath $preparePath -Raw -Encoding UTF8 | ConvertFrom-Json
$thumb = [string]$prepare.certificateThumbprint
if ($thumb -notmatch '^[0-9A-Fa-f]{40}$') { throw 'prepare.json does not contain a certificate thumbprint.' }
foreach ($store in @('My', 'TrustedPeople')) {
  $path = "Cert:\CurrentUser\$store\$thumb"
  if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
}
$left = @(Get-ChildItem Cert:\CurrentUser\My, Cert:\CurrentUser\TrustedPeople -ErrorAction SilentlyContinue | Where-Object { $_.Thumbprint -eq $thumb -or $_.FriendlyName -eq $friendlyName })
if ($left.Count -gt 0) { throw 'The temporary sideload certificate is still present.' }
$signed = [string]$prepare.signedPath
$removedSignedCopy = $false
if ($signed -and (Test-Path -LiteralPath $signed) -and ((Split-Path $signed -Leaf) -eq 'SwiftLocal-0.4.1-store-x64.developer-signed-test.appx')) {
  Remove-Item -LiteralPath $signed -Force
  $removedSignedCopy = $true
}
[ordered]@{
  removedAt = (Get-Date).ToString('o')
  thumbprint = $thumb
  certificateRemoved = $true
  signedCopyRemoved = $removedSignedCopy
  packageUninstall = 'NOT RUN — use Windows Settings'
  userFiles = 'UNTOUCHED'
} | ConvertTo-Json | Set-Content (Join-Path $Evidence 'certificate-removed.json') -Encoding UTF8
Write-Host "Removed temporary certificate $thumb."
Write-Host 'This did not uninstall SwiftLocal and did not delete user output files.'
