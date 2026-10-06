# Starts the Cloudflare tunnel for the laptop deployment. Idempotent.
# Run by the "Inrent Cloudflare Tunnel" scheduled task at logon (see scripts/register-tunnel-task.ps1).
# Exit 0: tunnel already running, or cloudflared ran and exited cleanly.
# Exit 1: Docker/web not ready in time, or cloudflared exited with an error (the task restarts it).

$ErrorActionPreference = 'Stop'

$repo      = Split-Path -Parent $PSScriptRoot
$cfDir     = Join-Path $repo 'infrastructure\cloudflared'
$config    = Join-Path $cfDir 'config.yml'
$exe       = 'C:\Program Files (x86)\cloudflared\cloudflared.exe'
$tunnel    = 'inrent-laptop'
$healthUrl = 'http://127.0.0.1:3000/api/health'

# Already running? Match on the full command line so other cloudflared processes are ignored.
$running = Get-CimInstance Win32_Process -Filter "Name='cloudflared.exe'" |
    Where-Object { $_.CommandLine -like "*run $tunnel*" }
if ($running) {
    Write-Output "Tunnel '$tunnel' already running (pid $($running.ProcessId -join ', ')); nothing to do."
    exit 0
}

# Wait for Docker (up to ~3 minutes).
$deadline = (Get-Date).AddMinutes(3)
while ($true) {
    & docker info *> $null
    if ($LASTEXITCODE -eq 0) { break }
    if ((Get-Date) -gt $deadline) { Write-Output 'Docker did not answer within 3 minutes.'; exit 1 }
    Start-Sleep -Seconds 5
}

# Wait for the web app health endpoint to return 200 (up to ~5 minutes).
$deadline = (Get-Date).AddMinutes(5)
while ($true) {
    try {
        $r = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode -eq 200) { break }
    } catch { }
    if ((Get-Date) -gt $deadline) { Write-Output "$healthUrl did not return 200 within 5 minutes."; exit 1 }
    Start-Sleep -Seconds 5
}

# Start hidden and stay attached: if the tunnel dies the script exits non-zero and the task retries.
$cfArgs = @('tunnel', '--protocol', 'http2', '--config', "`"$config`"", '--no-autoupdate', 'run', $tunnel)
$p = Start-Process -FilePath $exe -ArgumentList $cfArgs -WindowStyle Hidden -PassThru `
    -RedirectStandardOutput (Join-Path $cfDir 'tunnel.log') `
    -RedirectStandardError  (Join-Path $cfDir 'tunnel.err.log')
Write-Output "Started cloudflared pid $($p.Id)."
$p.WaitForExit()
exit $(if ($p.ExitCode -eq 0) { 0 } else { 1 })
