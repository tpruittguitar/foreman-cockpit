# Installs tools\forge-pc-keepalive.ps1 to %LOCALAPPDATA%\Forge and registers it to start hidden at logon (current user, no admin).
$dir = Join-Path $env:LOCALAPPDATA 'Forge'; New-Item -ItemType Directory -Force -Path $dir | Out-Null
$dst = Join-Path $dir 'forge-pc-keepalive.ps1'
Copy-Item -Force (Join-Path $PSScriptRoot 'forge-pc-keepalive.ps1') $dst
$arg = '--headless powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $dst + '"'
$action = New-ScheduledTaskAction -Execute 'conhost.exe' -Argument $arg
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)
Register-ScheduledTask -TaskName 'Forge PC Keep-Alive' -Action $action -Trigger $trigger -Settings $settings -Description 'Forge: keep PC awake on AC, keep Claude app running, open Chrome for usage readings' -Force | Out-Null
Start-ScheduledTask -TaskName 'Forge PC Keep-Alive'
Start-Sleep -Seconds 5
Get-ScheduledTask -TaskName 'Forge PC Keep-Alive' | Select TaskName, State | Format-List
Get-Content (Join-Path $dir 'keepalive.log') -Tail 5 -ErrorAction SilentlyContinue
