param(
  [Parameter(Mandatory=$true)][string]$Candidate,
  [Parameter(Mandatory=$true)][string]$Baseline,
  [Parameter(Mandatory=$true)][string]$Fixtures,
  [Parameter(Mandatory=$true)][string]$Evidence,
  [Parameter(Mandatory=$true)][ValidateSet("fresh","upgrade")][string]$Scenario
)
$ErrorActionPreference = 'Stop'
if ($env:GITHUB_ACTIONS -ne 'true' -or $env:RUNNER_OS -ne 'Windows') { throw 'This lifecycle harness is restricted to disposable GitHub Windows runners' }
$user = 'SL驗收' + (Get-Random -Minimum 10000 -Maximum 99999)
$root = Join-Path $env:SystemDrive "SwiftLocal驗收-$user"
New-Item -ItemType Directory -Path $root | Out-Null
New-Item -ItemType Directory -Force -Path $Evidence | Out-Null
$evidenceRoot = Join-Path $root 'evidence'
New-Item -ItemType Directory -Path $evidenceRoot | Out-Null
$fixtureRoot = Join-Path $root '測試輸入 é'
Copy-Item -LiteralPath $Fixtures -Destination $fixtureRoot -Recurse
Copy-Item -LiteralPath $Candidate -Destination (Join-Path $root 'candidate.exe')
Copy-Item -LiteralPath $Baseline -Destination (Join-Path $root 'baseline.exe')
foreach ($file in @('accept-installed-windows.js','windows-acceptance-worker.ps1','windows-shell-open-pdf.ps1')) { Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $root }
$installDir = Join-Path $root '安裝目錄 é 日本語'
$config = [ordered]@{
  candidateSha256=(Get-FileHash -LiteralPath $Candidate -Algorithm SHA256).Hash; baselineSha256=(Get-FileHash -LiteralPath $Baseline -Algorithm SHA256).Hash;
  candidateSourceRun=$env:SWIFTLOCAL_CANDIDATE_RUN;
  scenario=$Scenario; user=$user; powershell=(Get-Process -Id $PID).Path; node=(Get-Command node.exe).Source; candidate=(Join-Path $root 'candidate.exe'); baseline=(Join-Path $root 'baseline.exe');
  installDir=$installDir; exe=(Join-Path $installDir 'SwiftLocal.exe'); fixtures=$fixtureRoot; output=(Join-Path $root '轉換結果 日本語');
  evidence=$evidenceRoot; harness=(Join-Path $root 'accept-installed-windows.js'); shellOpen=(Join-Path $root 'windows-shell-open-pdf.ps1')
}
$configFile = Join-Path $root 'config.json'
$config | ConvertTo-Json | Set-Content -LiteralPath $configFile -Encoding utf8
$plain = 'SL!' + [Guid]::NewGuid().ToString('N') + 'a9'
Write-Output "::add-mask::$plain"
$password = ConvertTo-SecureString $plain -AsPlainText -Force
$account = New-LocalUser -Name $user -Password $password -AccountNeverExpires -PasswordNeverExpires
try {
  $usersGroup = Get-LocalGroup -SID 'S-1-5-32-545'
  Add-LocalGroupMember -Group $usersGroup -Member $account
  & icacls.exe $root /grant "${user}:(OI)(CI)M" /T /Q | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Failed to grant scratch-directory access to test user' }
  $credential = [PSCredential]::new("$env:COMPUTERNAME\$user", $password)
  $pwsh = (Get-Process -Id $PID).Path
  $worker = Join-Path $root 'windows-acceptance-worker.ps1'
  $p = Start-Process -FilePath $pwsh -Credential $credential -LoadUserProfile -WorkingDirectory $root -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$worker`" -Configuration `"$configFile`"" -PassThru -RedirectStandardOutput (Join-Path $evidenceRoot 'worker.stdout.log') -RedirectStandardError (Join-Path $evidenceRoot 'worker.stderr.log')
  if (-not $p.WaitForExit(1200000)) { & taskkill.exe /PID $p.Id /T /F; throw 'Fresh-user acceptance timed out' }
  $p.Refresh()
  if ($p.ExitCode -ne 0) { throw "Fresh-user worker failed: $($p.ExitCode)" }
} finally {
  Copy-Item -Path (Join-Path $evidenceRoot '*') -Destination $Evidence -Recurse -Force
  Remove-LocalUser -Name $user -ErrorAction SilentlyContinue
}
