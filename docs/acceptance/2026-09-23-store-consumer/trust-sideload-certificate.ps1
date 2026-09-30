# Trust only the public certificate of the frozen Phase 2C test copy.
# Run elevated for LocalMachine\TrustedPeople, then install through the owner's normal GUI.
param([string]$Evidence = 'store-evidence/consumer-2026-09-23')
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
if (-not [IO.Path]::IsPathRooted($Evidence)) { $Evidence = Join-Path $root $Evidence }
$Evidence = [IO.Path]::GetFullPath($Evidence)
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Public-certificate trust requires an administrator PowerShell. Package installation must still use the normal user GUI.'
}
$preparePath = Join-Path $Evidence 'prepare.json'
$prepare = Get-Content -LiteralPath $preparePath -Raw -Encoding UTF8 | ConvertFrom-Json
$thumb = [string]$prepare.certificateThumbprint
if ($thumb -notmatch '^[0-9A-Fa-f]{40}$' -or $prepare.unsignedSha256 -cne '38a1ea9d89e956c1dbcdecb21f85bca673d7ab70301b16e66f68c819d7eed404') {
  throw 'Preparation receipt does not identify this frozen candidate and certificate.'
}
$signed = Join-Path $Evidence 'SwiftLocal-0.4.1-store-x64.developer-signed-test.appx'
$publicCertificatePath = Join-Path $Evidence 'sideload-public.cer'
if ((Get-FileHash -LiteralPath $signed -Algorithm SHA256).Hash.ToLowerInvariant() -cne $prepare.signedSha256) {
  throw 'Signed test copy changed. Do not install it.'
}
$certificate = New-Object Security.Cryptography.X509Certificates.X509Certificate2($publicCertificatePath)
if ($certificate.Thumbprint -ne $thumb -or $certificate.Subject -cne 'CN=48CB75C0-3F50-44EF-87EB-8203F196B957' -or $certificate.HasPrivateKey -or $certificate.NotAfter -le (Get-Date)) {
  throw 'Public certificate does not match the temporary signing certificate or has expired.'
}
$signTool = [string]$prepare.signToolPath
if ((Get-FileHash -LiteralPath $signTool -Algorithm SHA256).Hash.ToLowerInvariant() -cne $prepare.signToolSha256) {
  throw 'SignTool changed since preparation.'
}
$trust = New-Object Security.Cryptography.X509Certificates.X509Store('TrustedPeople', 'LocalMachine')
$added = $false
try {
  $trust.Open('ReadWrite')
  if ($trust.Certificates.Find('FindByThumbprint', $thumb, $false).Count -gt 0) {
    throw 'This certificate is already trusted. Use the existing verified receipt or clean up first.'
  }
  $certificate.FriendlyName = 'SwiftLocal consumer sideload'
  $trust.Add($certificate)
  $added = $true
  & $signTool verify /pa $signed
  if ($LASTEXITCODE -ne 0) { throw 'Developer signature verification failed after machine trust.' }
  $signature = Get-AuthenticodeSignature -LiteralPath $signed
  if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -ne $thumb) {
    throw 'The signed AppX does not have the expected valid developer signature.'
  }
  $prepare.status = 'PASS'
  $prepare.preparation = 'READY FOR OWNER GUI INSTALL — installation not run'
  $prepare.certificateStore = 'CurrentUser\My; public-only LocalMachine\TrustedPeople'
  $prepare.trustStatus = 'PASS'
  $prepare.signatureVerification = 'PASS'
  $prepare | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $preparePath -Encoding UTF8
  Write-Host 'STOPPED BEFORE INSTALL. Temporary public certificate trusted and signature verified.'
  Write-Host 'Return to your normal user. Double-click the developer-signed AppX in Explorer yourself.'
} catch {
  if ($added) { $trust.Remove($certificate) }
  throw
} finally {
  $trust.Close()
  $certificate.Dispose()
}
