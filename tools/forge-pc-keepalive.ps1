<# Forge PC keep-alive (Tim's PC, TIMMAY). Started hidden at logon by the Task Scheduler task "Forge PC Keep-Alive".
   1. On AC power, asks Windows not to sleep (SetThreadExecutionState, like a video player). Screen can still turn off and lock.
      On battery it releases the request so the laptop sleeps normally. Power settings are never changed.
   2. On AC power, keeps the Claude desktop app running (the link Claude uses to reach this PC) and minimizes it after a restart.
   3. Opens Chrome minimized only in the window before each usage reading (02:05, 08:05, 14:05, 20:05 local) if Chrome is
      not already open. Outside those windows it never opens Chrome, so closing Chrome yourself is respected.
   Log: %LOCALAPPDATA%\Forge\keepalive.log (state changes only). Stop: Disable-ScheduledTask -TaskName "Forge PC Keep-Alive"
   and end the powershell process, or run this file with -Uninstall. #>
param([switch]$Uninstall)
$ErrorActionPreference = 'Continue'
$dir = Join-Path $env:LOCALAPPDATA 'Forge'; New-Item -ItemType Directory -Force -Path $dir | Out-Null
$log = Join-Path $dir 'keepalive.log'
function Log($m) { $line = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $m; Add-Content -Path $log -Value $line; if ((Get-Item $log).Length -gt 1MB) { Get-Content $log -Tail 2000 | Set-Content $log } }
if ($Uninstall) { Unregister-ScheduledTask -TaskName 'Forge PC Keep-Alive' -Confirm:$false -ErrorAction SilentlyContinue; Log 'uninstalled'; exit }

$mutex = New-Object System.Threading.Mutex($false, 'Global\ForgePcKeepAlive')
if (-not $mutex.WaitOne(0)) { exit }   # one instance only

Add-Type -Namespace Forge -Name Native -MemberDefinition @'
[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint esFlags);
[DllImport("user32.dll")] public static extern bool ShowWindowAsync(System.IntPtr hWnd, int nCmdShow);
'@
$ES_CONTINUOUS = [uint32]'0x80000000'; $ES_SYSTEM_REQUIRED = [uint32]'0x00000001'
$CHROME = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$CLAUDE_AUMID = 'shell:AppsFolder\Claude_pzs8sxrjxfjjc!Claude'
$READ_TIMES = @('02:05', '08:05', '14:05', '20:05')   # must match the Claude usage-reader scheduled task
$state = @{ awake = $null; tick = 0 }

function OnAc { $b = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue; if (-not $b) { return $true }; return ($b | Where-Object { $_.BatteryStatus -eq 1 }).Count -eq 0 }
function InReadWindow {
  $now = Get-Date
  foreach ($t in $READ_TIMES) { $at = [datetime]::ParseExact($t, 'HH:mm', $null); foreach ($d in -1, 0) { $x = $at.AddDays($d); if ($now -ge $x.AddMinutes(-15) -and $now -le $x.AddMinutes(20)) { return $true } } }
  return $false
}
Log ('started pid ' + $PID)
while ($true) {
  $ac = OnAc
  if ($ac -ne $state.awake) {
    if ($ac) { [void][Forge.Native]::SetThreadExecutionState($ES_CONTINUOUS -bor $ES_SYSTEM_REQUIRED); Log 'AC power: keeping PC awake' }
    else { [void][Forge.Native]::SetThreadExecutionState($ES_CONTINUOUS); Log 'battery: normal sleep allowed' }
    $state.awake = $ac
  }
  if ($state.tick % 5 -eq 0 -and $ac) {
    if (-not (Get-Process -Name 'claude' -ErrorAction SilentlyContinue)) {
      Start-Process 'explorer.exe' $CLAUDE_AUMID; Log 'Claude desktop app was not running: started'
      Start-Sleep -Seconds 15
      Get-Process -Name 'claude' -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { [void][Forge.Native]::ShowWindowAsync($_.MainWindowHandle, 6) }
    }
    if ((InReadWindow) -and -not (Get-Process -Name 'chrome' -ErrorAction SilentlyContinue) -and (Test-Path $CHROME)) {
      Start-Process -FilePath $CHROME -ArgumentList '--start-minimized', 'about:blank' -WindowStyle Minimized; Log 'usage reading due: opened Chrome minimized'
    }
  }
  $state.tick++
  Start-Sleep -Seconds 60
}
