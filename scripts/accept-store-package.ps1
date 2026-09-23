param([string]$Package = '', [string]$Evidence = 'store-evidence', [switch]$RunWack)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$Evidence = [IO.Path]::GetFullPath($Evidence)
New-Item -ItemType Directory -Force $Evidence | Out-Null
$identity = Get-Content (Join-Path $root 'build/store/partner-center-identity.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$product = (Get-Content (Join-Path $root 'package.json') -Raw -Encoding UTF8 | ConvertFrom-Json).version
if ($product -cne $identity.productVersion) { throw "Product version $product does not match the Store mapping $($identity.productVersion)" }
if (!$Package) { $Package = Join-Path $root "dist-store/SwiftLocal-$product-store-x64.appx" }
$Package = (Resolve-Path $Package).Path
if (Get-AppxPackage -Name $identity.identityName) { throw "Existing $($identity.identityName) package found; refusing to replace user state" }
$sdk = Get-ChildItem "${env:ProgramFiles(x86)}/Windows Kits/10/bin/*/x64/signtool.exe" | Sort-Object FullName -Descending | Select-Object -First 1
if (!$sdk) { throw 'Windows SDK signtool.exe unavailable' }
function PdfDefault {
  $choice = Get-ItemProperty 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Explorer/FileExts/.pdf/UserChoice' -ErrorAction SilentlyContinue
  $extension = Get-Item 'Registry::HKEY_CLASSES_ROOT\.pdf' -ErrorAction SilentlyContinue
  @{ userChoice = $choice.ProgId; userChoiceHash = $choice.Hash; extensionDefault = $(if ($extension) { $extension.GetValue('') } else { $null }) } | ConvertTo-Json -Compress
}
$beforeDefault = PdfDefault
$wack = "${env:ProgramFiles(x86)}/Windows Kits/10/App Certification Kit/appcert.exe"
$report = [ordered]@{ commit = $env:GITHUB_SHA; os = (Get-CimInstance Win32_OperatingSystem).Caption; install = 'NOT RUN'; uninstall = 'NOT RUN'; defaultBefore = $beforeDefault; wack = $(if (Test-Path $wack) { 'UNVERIFIED — WACK present; not yet executed' } else { 'UNVERIFIED — WACK environment unavailable' }) }
$certificate = $null; $installed = $null
$working = Join-Path $env:TEMP ('SwiftLocal Store 中文 ' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory $working | Out-Null
$documents = Join-Path $env:USERPROFILE ('Downloads/SwiftLocal 中文 ' + [Guid]::NewGuid().ToString('N').Substring(0,8))
New-Item -ItemType Directory $documents | Out-Null
$report.documentRoot = $documents
try {
  # Non-exportable key stays in disposable Windows certificate store. No PFX/password.
  $certificate = New-SelfSignedCertificate -Type Custom -Subject $identity.publisher -FriendlyName 'SwiftLocal developer install' -KeyUsage DigitalSignature -KeyAlgorithm RSA -KeyLength 2048 -HashAlgorithm SHA256 -KeyExportPolicy NonExportable -CertStoreLocation 'Cert:/LocalMachine/My' -NotAfter (Get-Date).AddDays(3) -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3','2.5.29.19={text}')
  if ($certificate.Subject -cne $identity.publisher) { throw "Developer certificate subject drifted from the reserved publisher: $($certificate.Subject)" }
  $trust = New-Object Security.Cryptography.X509Certificates.X509Store('TrustedPeople', 'LocalMachine')
  $trust.Open('ReadWrite'); $trust.Add($certificate); $trust.Close()
  $signed = Join-Path $working (Split-Path $Package -Leaf)
  Copy-Item $Package $signed
  & $sdk.FullName sign /fd SHA256 /sha1 $certificate.Thumbprint /sm /s My $signed
  if ($LASTEXITCODE -ne 0) { throw 'Developer-only signing failed' }
  & $sdk.FullName verify /pa $signed
  if ($LASTEXITCODE -ne 0) { throw 'Developer-only signature verification failed' }
  $report.signedSha256 = (Get-FileHash $signed -Algorithm SHA256).Hash
  Add-AppxPackage -Path $signed
  $installed = Get-AppxPackage -Name $identity.identityName
  if (!$installed) { throw 'Package registration missing after Add-AppxPackage' }
  if ($installed.Name -cne $identity.identityName -or $installed.Publisher -cne $identity.publisher -or $installed.PackageFamilyName -cne $identity.packageFamilyName) {
    throw "Installed identity mismatch. name=$($installed.Name) publisher=$($installed.Publisher) family=$($installed.PackageFamilyName)"
  }
  $report.install = 'PASS'; $report.fullName = $installed.PackageFullName; $report.family = $installed.PackageFamilyName; $report.installLocation = $installed.InstallLocation
  & node -e "const fs=require('node:fs'); const {verifyManifest}=require('./scripts/verify-store-package'); verifyManifest(fs.readFileSync(process.argv[1],'utf8'))" (Join-Path $installed.InstallLocation 'AppxManifest.xml')
  if ($LASTEXITCODE -ne 0) { throw 'Installed manifest does not match the reserved identity' }
  $report.defaultAfterInstall = PdfDefault
  if ($report.defaultAfterInstall -ne $beforeDefault) { throw 'PDF default changed during package install' }
  $aumid = $installed.PackageFamilyName + '!SwiftLocal'
  $candidates = @(Get-ChildItem 'Registry::HKEY_CLASSES_ROOT' | Where-Object { $_.PSChildName -like 'AppX*' } | ForEach-Object {
    $application = Get-ItemProperty ($_.PSPath + '\Application') -ErrorAction SilentlyContinue
    if ($application.AppUserModelID -eq $aumid) { $_.PSChildName }
  })
  $pdfKey = Get-Item 'Registry::HKEY_CLASSES_ROOT\.pdf\OpenWithProgids' -ErrorAction SilentlyContinue
  $progIds = @($candidates | Where-Object { $pdfKey -and $_ -in $pdfKey.GetValueNames() })
  if ($progIds.Count -ne 1) { throw "Expected one package PDF Open With ProgID; found $($progIds -join ',')" }
  $report.pdfProgId = $progIds[0]
  # Match real document usage: Unicode input/output in Downloads, outside virtualized AppData.
  $fixtures = Join-Path $documents '輸入 文件'; New-Item -ItemType Directory $fixtures | Out-Null
  Copy-Item 'smoke-temp/store-input/*' $fixtures
  $profile = Join-Path $env:APPDATA $identity.profileDirectoryName
  # Desktop Bridge may virtualize AppData; choose the actual package profile after activation if needed.
  $config = @{ exe = Join-Path $installed.InstallLocation 'app/SwiftLocal.exe'; evidence = $Evidence; output = (Join-Path $documents '輸出 文件'); fixtures = $fixtures; powershell = "$env:SystemRoot/System32/WindowsPowerShell/v1.0/powershell.exe"; activate = (Join-Path $PSScriptRoot 'store-activate.ps1'); shellOpen = (Join-Path $PSScriptRoot 'store-shell-open-pdf.ps1'); aumid = $aumid; progId = $progIds[0]; profile = $profile; profileDirectoryName = $identity.profileDirectoryName; expectedFamily = $identity.packageFamilyName }
  $configPath = Join-Path $working 'config.json'; $config | ConvertTo-Json | Set-Content $configPath -Encoding UTF8
  $before = & node -e "const v=require('./scripts/verify-release-artifacts');const m=v.buildPayloadManifest(process.argv[1]);console.log(JSON.stringify(Object.fromEntries(Object.entries(m).map(([n,v])=>[n,{bytes:v.bytes,sha256:v.sha256}]))))" $installed.InstallLocation
  $before | Set-Content (Join-Path $Evidence 'installed-files-before.json')
  & node scripts/accept-store-windows.js $configPath store
  $report.smoke = $(if ($LASTEXITCODE -eq 0) { 'PASS' } else { 'FAIL' })
  Get-WinEvent -FilterHashtable @{ LogName = 'Application'; Level = 2; StartTime = (Get-Date).AddMinutes(-15) } -ErrorAction SilentlyContinue | Where-Object { $_.Message -match 'soffice|LibreOffice|SwiftLocal' } | Select-Object TimeCreated, ProviderName, Id, Message | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $Evidence 'application-errors.json') -Encoding UTF8
  $after = & node -e "const v=require('./scripts/verify-release-artifacts');const m=v.buildPayloadManifest(process.argv[1]);console.log(JSON.stringify(Object.fromEntries(Object.entries(m).map(([n,v])=>[n,{bytes:v.bytes,sha256:v.sha256}]))))" $installed.InstallLocation
  if ($before -ne $after) { throw 'Installed package files changed during smoke' }
  $report.installedPayloadUnchanged = 'PASS'
  if ((Test-Path $wack) -and $RunWack) {
    & $wack reset
    $wackReport = Join-Path $Evidence 'wack.xml'
    $certification = Start-Process $wack -ArgumentList @('test', '-appxpackagepath', ('"' + $signed + '"'), '-reportoutputpath', ('"' + $wackReport + '"')) -PassThru
    if (!$certification.WaitForExit(1200000)) {
      Stop-Process -Id $certification.Id -Force -ErrorAction SilentlyContinue
      $report.wack = 'UNVERIFIED — WACK exceeded 20-minute execution limit'
    } else {
      $report.wackExitCode = $certification.ExitCode
      $report.wack = $(if (Test-Path $wackReport) { 'EXECUTED — inspect wack.xml categories; execution is not PASS' } else { 'UNVERIFIED — WACK ran without producing a report' })
      if (Test-Path $wackReport) {
        & node scripts/read-store-wack.js $wackReport (Join-Path $Evidence 'wack-summary.json')
        $report.wack = $(if ($LASTEXITCODE -eq 0) { 'PASS — review optional findings in wack-summary.json' } else { 'FAIL — report incomplete, invalid or required checks failed' })
      }
    }
  } elseif (Test-Path $wack) { $report.wack = 'UNVERIFIED — WACK present but not requested' }
} catch {
  $report.error = $_.Exception.ToString()
  Get-AppxLog -ErrorAction SilentlyContinue | Out-String | Set-Content (Join-Path $Evidence 'appx-deployment.log')
  throw
} finally {
  if ($installed) {
    try {
      Get-Process SwiftLocal -ErrorAction SilentlyContinue | Where-Object { $_.Path -like ($installed.InstallLocation + '\*') } | Stop-Process -Force
      Remove-AppxPackage -Package $installed.PackageFullName
      $report.uninstall = $(if (Get-AppxPackage -Name $identity.identityName) { 'FAIL' } else { 'PASS' })
    } catch { $report.uninstall = 'FAIL'; $report.uninstallError = $_.Exception.Message }
  }
  $report.defaultAfterUninstall = PdfDefault
  $report.pdfDefaultPreserved = $(if ($report.defaultAfterUninstall -eq $beforeDefault -and (!$report.defaultAfterInstall -or $report.defaultAfterInstall -eq $beforeDefault)) { 'PASS' } else { 'FAIL' })
  if ($certificate) {
    Remove-Item ('Cert:/LocalMachine/TrustedPeople/' + $certificate.Thumbprint) -ErrorAction SilentlyContinue
    Remove-Item ('Cert:/LocalMachine/My/' + $certificate.Thumbprint) -ErrorAction SilentlyContinue
  }
  $report | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $Evidence 'lifecycle.json') -Encoding UTF8
}
if ($report.smoke -ne 'PASS' -or $report.uninstall -ne 'PASS' -or $report.pdfDefaultPreserved -ne 'PASS' -or $report.wack -like 'FAIL*') { throw 'Installed Store acceptance failed; inspect lifecycle and conversion evidence' }
