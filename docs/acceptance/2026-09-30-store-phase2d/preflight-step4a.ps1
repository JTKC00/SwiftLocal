# Read-only Step 4A preflight. Never activates, installs, signs, trusts or removes anything.
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
$evidence = Join-Path $root 'store-evidence/phase2d'
$receiptPath = Join-Path $evidence 'step4a-preflight-completed.json'
if (Test-Path -LiteralPath $receiptPath) { throw 'Preserve the existing preflight; do not overwrite it.' }
$signing = Get-Content -LiteralPath (Join-Path $evidence 'signing/signing.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$thumb = '30E81230B7C3CCB8D19D5D6A67F975DDB8D93450'
$subject = 'CN=48CB75C0-3F50-44EF-87EB-8203F196B957'
$family = 'JTKC.SwiftLocal_j44a9ewx73faj'
$report = [ordered]@{status='UNVERIFIED';scope='read-only preflight; no app launch or package/certificate mutation';startedAt=(Get-Date).ToString('o')}
function Hash([string]$Path) { (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant() }
try {
  $packages = @(Get-AppxPackage -Name 'JTKC.SwiftLocal')
  if ($packages.Count -ne 1 -or [string]$packages[0].Version -cne '1.0.0.0' -or $packages[0].PackageFamilyName -cne $family -or $packages[0].Publisher -cne $subject) { throw 'Installed baseline identity/version differs. STOP.' }
  $manifest = Get-AppxPackageManifest -Package $packages[0].PackageFullName
  $appIds = @($manifest.Package.Applications.Application | ForEach-Object { [string]$_.Id })
  if ($appIds.Count -ne 1 -or $appIds[0] -cne 'SwiftLocal') { throw 'Application Id differs. STOP.' }
  $report.package = $packages | Select-Object Name,Publisher,Version,Architecture,PackageFullName,PackageFamilyName,InstallLocation,Status
  $report.applicationId = $appIds[0]; $report.aumid = "$family!$($appIds[0])"
  $processes = @(Get-Process -Name SwiftLocal -ErrorAction SilentlyContinue)
  $report.swiftLocalProcessCountBefore = $processes.Count
  if ($processes.Count) { throw 'SwiftLocal is running. STOP without closing or launching it.' }
  if ($signing.certificateThumbprint -cne $thumb -or $signing.certificateSubject -cne $subject) { throw 'Signing receipt differs. STOP.' }
  $machineCert = Get-Item -LiteralPath "Cert:\LocalMachine\TrustedPeople\$thumb"
  $userCert = Get-Item -LiteralPath "Cert:\CurrentUser\My\$thumb"
  if ($machineCert.Subject -cne $subject -or $userCert.Subject -cne $subject -or $machineCert.HasPrivateKey -or -not $userCert.HasPrivateKey -or $machineCert.NotAfter -le (Get-Date)) { throw 'Temporary certificate/trust differs or expired. STOP.' }
  $report.certificate = [ordered]@{thumbprint=$thumb;subject=$subject;machineTrustStore='LocalMachine/TrustedPeople';machineTrustPresent=$true;machineHasPrivateKey=$machineCert.HasPrivateKey;userSigningKeyPresent=$userCert.HasPrivateKey;expires=$machineCert.NotAfter.ToString('o')}
  if ((Hash $signing.signToolPath) -cne $signing.signToolSha256) { throw 'Existing SDK SignTool changed. STOP.' }
  $results = @()
  foreach ($record in $signing.packages) {
    $signedHash = Hash $record.signedPath
    if ($signedHash -cne $record.signedSha256 -or (Get-Item -LiteralPath $record.signedPath).Length -ne $record.signedBytes) { throw 'Retained signed copy changed. STOP.' }
    $signature = Get-AuthenticodeSignature -LiteralPath $record.signedPath
    if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Thumbprint -cne $thumb -or $signature.SignerCertificate.Subject -cne $subject) { throw 'Signature invalid or different signing certificate. STOP.' }
    $verifyText = & $signing.signToolPath verify /pa $record.signedPath 2>&1
    if ($LASTEXITCODE -ne 0) { throw 'SDK signature verification failed. STOP.' }
    $verifyText | Set-Content -LiteralPath (Join-Path $evidence "step4a-signature-$($record.version).log") -Encoding UTF8
    $unsignedHash = Hash $record.unsignedPath
    if ($unsignedHash -cne $record.unsignedSha256 -or (Get-Item -LiteralPath $record.unsignedPath).Length -ne $record.unsignedBytes) { throw 'Retained unsigned package changed. STOP.' }
    if ($record.version -ceq '1.0.1.0' -and $unsignedHash -cne 'd737b781d16e0b9b6dd23e876626df1095756816c6527a11945ff30c96fc4e4a') { throw 'Unsigned update fixture differs. STOP.' }
    $results += [ordered]@{version=$record.version;unsignedSha256=$unsignedHash;unsignedBytes=$record.unsignedBytes;signedSha256=$signedHash;signedBytes=$record.signedBytes;signature='PASS';signerThumbprint=$signature.SignerCertificate.Thumbprint}
  }
  if ($results.Count -ne 2) { throw 'Two-version receipt missing. STOP.' }
  $report.packages = $results
  $bookmarks = @()
  foreach ($channel in @('Microsoft-Windows-AppXDeploymentServer/Operational','Microsoft-Windows-AppxPackaging/Operational')) {
    $log = Get-WinEvent -ListLog $channel
    $last = Get-WinEvent -LogName $channel -MaxEvents 1 -ErrorAction SilentlyContinue
    $bookmarks += [ordered]@{channel=$channel;enabled=$log.IsEnabled;lastRecordId=if($last){$last.RecordId}else{0};capturedAt=(Get-Date).ToString('o')}
  }
  $report.deploymentEventBookmarks = $bookmarks
  $report.swiftLocalProcessCountAfter = @(Get-Process -Name SwiftLocal -ErrorAction SilentlyContinue).Count
  if ($report.swiftLocalProcessCountAfter) { throw 'SwiftLocal started during preflight. STOP.' }
  $report.status='PASS'; $report.completedAt=(Get-Date).ToString('o')
} catch { $report.status='FAIL'; $report.error=[string]$_.Exception.Message; throw }
finally { $report | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $receiptPath -Encoding UTF8 }
Write-Host 'Step 4A package/signature/trust/process preflight PASS. Nothing installed, launched or changed.'
