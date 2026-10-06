# Daily Postgres backup for the inrent-prod stack.
# pg_dump (custom format) runs inside the container via docker exec (no password needed),
# the dump is copied out with docker cp, then the newest 14 are kept.
# Exit code 0 = success, non-zero = failure (also logged to backup.log).

$Container = 'inrent-prod-postgres-1'
$BackupDir = 'D:\AI_DATA\backups\inrent'
$Keep      = 14
$Log       = Join-Path $BackupDir 'backup.log'

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

function Write-Log([string]$status, [string]$msg) {
    $line = '{0} {1} {2}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $status, $msg
    Add-Content -Path $Log -Value $line
}

function Fail([string]$msg) {
    Write-Log 'FAIL' $msg
    [Console]::Error.WriteLine("BACKUP FAILED: $msg")
    exit 1
}

$stamp  = Get-Date -Format 'yyyyMMdd-HHmmss'
$target = Join-Path $BackupDir "inrent-$stamp.dump"
$inside = "/tmp/inrent-$stamp.dump"

# 1. container must be running
$running = (& docker inspect -f '{{.State.Running}}' $Container 2>$null)
if ($LASTEXITCODE -ne 0 -or "$running".Trim() -ne 'true') { Fail "container $Container is not running" }

# 2. dump inside the container (binary-safe: written to a file, not piped through PowerShell)
$out = & docker exec $Container pg_dump -U inrent -d inrent -Fc -f $inside 2>&1
if ($LASTEXITCODE -ne 0) {
    & docker exec $Container rm -f $inside 2>$null | Out-Null
    Fail "pg_dump failed: $out"
}

# 3. copy out, then clean up the temp file in the container
$out = & docker cp "${Container}:$inside" $target 2>&1
$cpCode = $LASTEXITCODE
& docker exec $Container rm -f $inside 2>$null | Out-Null
if ($cpCode -ne 0) { Fail "docker cp failed: $out" }

# 4. dump must exist and be non-empty
if (-not (Test-Path $target) -or (Get-Item $target).Length -le 0) {
    Remove-Item -Force -ErrorAction SilentlyContinue $target
    Fail "dump is missing or empty: $target"
}
$size = (Get-Item $target).Length

# 5. retention: keep newest $Keep dumps
Get-ChildItem -Path $BackupDir -Filter 'inrent-*.dump' |
    Sort-Object Name -Descending |
    Select-Object -Skip $Keep |
    Remove-Item -Force

Write-Log 'OK' "$target $size bytes"
Write-Output "Backup OK: $target ($size bytes)"
exit 0
