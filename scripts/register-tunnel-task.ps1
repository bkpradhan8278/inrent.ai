# Registers the per-user logon task that runs scripts/start-tunnel.ps1. No admin needed. Safe to re-run.
$ErrorActionPreference = 'Stop'

$name   = 'Inrent Cloudflare Tunnel'
$script = Join-Path $PSScriptRoot 'start-tunnel.ps1'
$user   = "$env:USERDOMAIN\$env:USERNAME"

$action   = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`""
$trigger  = New-ScheduledTaskTrigger -AtLogOn -User $user
$settings = New-ScheduledTaskSettingsSet -Hidden -StartWhenAvailable `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -RestartCount 5 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $name -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force | Out-Null
Write-Output "Registered '$name' for $user."
