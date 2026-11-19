# Run one wave of generations in parallel.
# -Day: facade prompts with shared head/tail; -Raw: prompt as-is; -Night: night edit of an existing day image; -Depth: depth map of an existing day image
param([string[]]$Day = @(), [string[]]$Raw = @(), [string[]]$Night = @(), [string[]]$Depth = @(), [string[]]$DayP = @())
$t = $PSScriptRoot
$logs = Join-Path (Split-Path -Parent $t) "assets"
function Split-List($a) { @($a | ForEach-Object { $_ -split "," } | Where-Object { $_ }) }
$ps = @()
$common = '-NoProfile','-ExecutionPolicy','Bypass','-File'
foreach ($n in (Split-List $Day))   { $ps += Start-Process powershell -ArgumentList ($common + @("$t\gen.ps1",'-Name',$n)) -NoNewWindow -PassThru -RedirectStandardOutput "$logs\log_$n.txt" }
foreach ($n in (Split-List $DayP))  { $ps += Start-Process powershell -ArgumentList ($common + @("$t\gen.ps1",'-Name',$n,'-Portrait')) -NoNewWindow -PassThru -RedirectStandardOutput "$logs\log_$n.txt" }
foreach ($n in (Split-List $Raw))   { $ps += Start-Process powershell -ArgumentList ($common + @("$t\gen.ps1",'-Name',$n,'-Raw')) -NoNewWindow -PassThru -RedirectStandardOutput "$logs\log_$n.txt" }
foreach ($n in (Split-List $Night)) { $ps += Start-Process powershell -ArgumentList ($common + @("$t\night.ps1",'-Name',$n)) -NoNewWindow -PassThru -RedirectStandardOutput "$logs\log_${n}_n.txt" }
foreach ($n in (Split-List $Depth)) { $ps += Start-Process powershell -ArgumentList ($common + @("$t\depth.ps1",'-Name',$n)) -NoNewWindow -PassThru -RedirectStandardOutput "$logs\log_${n}_d.txt" }
if ($ps.Count) { $ps | Wait-Process -Timeout 580 -ErrorAction SilentlyContinue }
Get-Content "$logs\log_*.txt" -ErrorAction SilentlyContinue | Select-String "^OK|^FAILED"
Remove-Item "$logs\log_*.txt" -ErrorAction SilentlyContinue
