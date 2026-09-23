# Phase 2C consumer sideload preparation.
# Signs a temporary copy of the frozen unsigned AppX and stops before installation.
# The project owner double-clicks that copy in Windows App Installer.
# This file must not call Add-AppxPackage or Remove-AppxPackage.
param(
  [Parameter(Mandatory = $true)][string]$Package,
  [string]$Evidence = 'store-evidence/consumer-2026-09-23'
)
$ErrorActionPreference = 'Stop'
$expectedName = 'SwiftLocal-0.4.1-store-x64.appx'
$expectedBytes = 1115695293
$expectedSha256 = '38a1ea9d89e956c1dbcdecb21f85bca673d7ab70301b16e66f68c819d7eed404'
$sourceRun = '35758117387'
$sourceCommit = '5b0e2c2eb9150c2142a1057b61c4675832a61878'
$friendlyName = 'SwiftLocal consumer sideload'
$root = Split-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -Parent
Set-Location $root
if (-not [IO.Path]::IsPathRooted($Evidence)) { $Evidence = Join-Path $root $Evidence }
New-Item -ItemType Directory -Force $Evidence | Out-Null
$own = Get-Content -LiteralPath $PSCommandPath -Raw
if ($own -match '(?m)^\s*(Add-AppxPackage|Remove-AppxPackage)\b') {
  throw 'This preparation script must not install or remove the package.'
}
if ($env:OS -ne 'Windows_NT') { throw 'Phase 2C sideload preparation runs on Windows.' }

$identity = Get-Content (Join-Path $root 'build/store/partner-center-identity.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($identity.identityName -cne 'JTKC.SwiftLocal' -or $identity.publisher -cne 'CN=48CB75C0-3F50-44EF-87EB-8203F196B957' -or $identity.publisherDisplayName -cne 'JTKC' -or $identity.packageFamilyName -cne 'JTKC.SwiftLocal_j44a9ewx73faj' -or $identity.storeId -cne '9P6Z4M7VLWPD' -or $identity.packageVersion -cne '1.0.0.0' -or $identity.productVersion -cne '0.4.1') {
  throw 'partner-center-identity.json no longer matches the frozen Phase 2C candidate.'
}
$Package = (Resolve-Path -LiteralPath $Package).Path
$leaf = Split-Path $Package -Leaf
if ($leaf -cne $expectedName) { throw "Filename is '$leaf'. The frozen candidate is $expectedName." }
$item = Get-Item -LiteralPath $Package
if ($item.Length -ne $expectedBytes) { throw "Byte size is $($item.Length). The frozen candidate is $expectedBytes. Refusing to sign a different package." }
$actualSha = (Get-FileHash -LiteralPath $Package -Algorithm SHA256).Hash.ToLowerInvariant()
if ($actualSha -cne $expectedSha256) { throw "SHA-256 is $actualSha. The frozen candidate is $expectedSha256. Refusing to sign a different package." }

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [IO.Compression.ZipFile]::OpenRead($Package)
try {
  $entry = $zip.GetEntry('AppxManifest.xml')
  if (-not $entry) { throw 'AppxManifest.xml is missing from the AppX.' }
  $reader = New-Object IO.StreamReader($entry.Open())
  try { $manifest = $reader.ReadToEnd() } finally { $reader.Dispose() }
} finally { $zip.Dispose() }
$required = @(
  'Name="JTKC.SwiftLocal"',
  'Publisher="CN=48CB75C0-3F50-44EF-87EB-8203F196B957"',
  '<PublisherDisplayName>JTKC</PublisherDisplayName>',
  'Version="1.0.0.0"',
  '<DisplayName>SwiftLocal</DisplayName>',
  'DisplayName="SwiftLocal"',
  'ProcessorArchitecture="x64"',
  'Id="SwiftLocal"'
)
foreach ($value in $required) {
  if ($manifest -notlike "*$value*") { throw "Manifest is missing $value" }
}
if ($manifest -match 'StoreSpike|NOT FOR SUBMISSION|SwiftLocal TEST|store-TEST|Version="0\.4\.1') {
  throw 'Manifest does not match the official Store identity.'
}

$current = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
$build = [int]$current.CurrentBuild
$ubr = [string]$current.UBR
$installationType = [string]$current.InstallationType
$os = Get-CimInstance Win32_OperatingSystem
if ($build -lt 22000 -or $installationType -ne 'Client' -or [string]$os.Caption -notlike '*Windows 11*') {
  throw "Phase 2C requires consumer Windows 11. Found $([string]$os.Caption) / $([string]$current.ProductName), installation type $installationType, build $build."
}
if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
  throw "The frozen candidate is x64. This process is $env:PROCESSOR_ARCHITECTURE."
}
$sdk = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1
if (-not $sdk) { throw 'Windows SDK signtool.exe is unavailable. Install the Windows SDK, then rerun this preparation script.' }
$existing = @(Get-ChildItem Cert:\CurrentUser\My, Cert:\CurrentUser\TrustedPeople -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -eq $friendlyName })
if ($existing.Count -gt 0) { throw "A '$friendlyName' certificate already exists. Run remove-sideload-certificate.ps1 before preparing another copy." }

function Get-PdfDefault {
  $choice = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.pdf\UserChoice' -ErrorAction SilentlyContinue
  $extension = Get-Item 'Registry::HKEY_CLASSES_ROOT\.pdf' -ErrorAction SilentlyContinue
  [ordered]@{
    userChoice = $(if ($choice) { [string]$choice.ProgId } else { $null })
    userChoiceHash = $(if ($choice) { [string]$choice.Hash } else { $null })
    extensionDefault = $(if ($extension) { [string]$extension.GetValue('') } else { $null })
  }
}
function Get-NsisRecords {
  $roots = @(
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*',
    'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  $found = @()
  foreach ($rootKey in $roots) {
    foreach ($app in @(Get-ItemProperty $rootKey -ErrorAction SilentlyContinue)) {
      $name = [string]$app.DisplayName
      if ($name -match 'SwiftLocal|快轉通') {
        $found += [ordered]@{ displayName = $name; displayVersion = [string]$app.DisplayVersion; publisher = [string]$app.Publisher }
      }
    }
  }
  return @($found)
}

$computer = Get-CimInstance Win32_ComputerSystem
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$machine = [ordered]@{
  recordedAt = (Get-Date).ToString('o')
  productName = [string]$current.ProductName
  installationType = $installationType
  editionId = [string]$current.EditionID
  displayVersion = [string]$current.DisplayVersion
  build = "$build.$ubr"
  currentBuild = $build
  ubr = $ubr
  osCaption = [string]$os.Caption
  architecture = $env:PROCESSOR_ARCHITECTURE
  hypervisorPresent = [bool]$computer.HypervisorPresent
  manufacturer = [string]$computer.Manufacturer
  model = [string]$computer.Model
  user = [string][Security.Principal.WindowsIdentity]::GetCurrent().Name
  isAdministrator = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  physicalOrVm = 'UNVERIFIED'
  userTypeConfirmation = 'UNVERIFIED'
  pdfDefaultBeforeInstall = Get-PdfDefault
  nsisSwiftLocal = @(Get-NsisRecords)
  nsisCoexistence = 'RECORD ONLY — Phase 2D'
}
$machine | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $Evidence 'machine.json') -Encoding UTF8

$certificate = $null
$signed = $null
$prepared = $false
try {
  $certificate = New-SelfSignedCertificate -Type Custom -Subject $identity.publisher -FriendlyName $friendlyName -KeyUsage DigitalSignature -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy NonExportable -CertStoreLocation 'Cert:\CurrentUser\My' -NotAfter (Get-Date).AddDays(3) -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
  if ($certificate.Subject -cne $identity.publisher) { throw "Certificate subject drifted: $($certificate.Subject)" }
  $trust = New-Object System.Security.Cryptography.X509Certificates.X509Store('TrustedPeople', 'CurrentUser')
  $trust.Open('ReadWrite')
  $trust.Add($certificate)
  $trust.Close()
  $signed = Join-Path $Evidence 'SwiftLocal-0.4.1-store-x64.developer-signed-test.appx'
  if (Test-Path -LiteralPath $signed) { Remove-Item -LiteralPath $signed -Force }
  Copy-Item -LiteralPath $Package -Destination $signed
  & $sdk.FullName sign /fd SHA256 /sha1 $certificate.Thumbprint /s My $signed
  if ($LASTEXITCODE -ne 0) { throw 'Developer-only signing failed.' }
  & $sdk.FullName verify /pa $signed
  if ($LASTEXITCODE -ne 0) { throw 'Developer-only signature verification failed.' }
  $signedSha = (Get-FileHash -LiteralPath $signed -Algorithm SHA256).Hash.ToLowerInvariant()
  $unsignedStill = (Get-FileHash -LiteralPath $Package -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($unsignedStill -cne $expectedSha256) { throw 'The unsigned candidate changed while the test copy was signed.' }
  $report = [ordered]@{
    status = 'PREPARED — installation not run'
    install = 'NOT RUN'
    guiAcceptance = 'UNVERIFIED'
    sourceRun = "https://github.com/JTKC00/SwiftLocal/actions/runs/$sourceRun"
    sourceCommit = $sourceCommit
    filename = $expectedName
    unsignedPath = $Package
    unsignedBytes = $expectedBytes
    unsignedSha256 = $expectedSha256
    manifestIdentity = 'JTKC.SwiftLocal'
    manifestPublisher = $identity.publisher
    manifestPublisherDisplayName = 'JTKC'
    packageVersion = '1.0.0.0'
    productVersion = '0.4.1'
    signedPath = $signed
    signedBytes = (Get-Item -LiteralPath $signed).Length
    signedSha256 = $signedSha
    certificateThumbprint = $certificate.Thumbprint
    certificateSubject = $certificate.Subject
    certificateStore = 'CurrentUser\My and CurrentUser\TrustedPeople'
    keyExportable = $false
    expires = $certificate.NotAfter.ToString('o')
  }
  $report | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $Evidence 'prepare.json') -Encoding UTF8
  $prepared = $true
  Write-Host ''
  Write-Host 'STOPPED BEFORE INSTALL.'
  Write-Host "Signed test copy: $signed"
  Write-Host "Signed SHA-256: $signedSha"
  Write-Host 'Double-click that file and complete Windows App Installer yourself.'
  Write-Host 'Do not run Add-AppxPackage. Do not run scripts/accept-store-package.ps1 for this GUI check.'
  Write-Host 'After you finish the checklist and uninstall, run remove-sideload-certificate.ps1.'
} finally {
  if (-not $prepared -and $certificate) {
    Remove-Item -LiteralPath ("Cert:\CurrentUser\TrustedPeople\" + $certificate.Thumbprint) -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath ("Cert:\CurrentUser\My\" + $certificate.Thumbprint) -ErrorAction SilentlyContinue
    if ($signed -and (Test-Path -LiteralPath $signed)) { Remove-Item -LiteralPath $signed -Force -ErrorAction SilentlyContinue }
  }
}
if (-not $prepared) { throw 'Sideload preparation did not finish.' }
