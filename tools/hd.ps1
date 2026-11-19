# usage: powershell -File tools/hd.ps1 -In assets/hd/x.png -Out assets/hd/x_hd.png   (high-resolution re-render of one crop; skips if output exists)
param([string]$In, [string]$Out)
$root = Split-Path -Parent $PSScriptRoot
$inP = Join-Path $root $In; $outP = Join-Path $root $Out
if (Test-Path $outP) { Write-Output "OK $Out (exists, skipped)"; exit 0 }
if (-not (Test-Path $inP)) { Write-Output "FAILED $Out (no input)"; exit 0 }
$cb = "$env:USERPROFILE\.claude\skills\codex-bridge\codex-bridge.ps1"
$p = Get-Content -Raw -Encoding UTF8 "$root\assets\prompts\_hd.txt"
$tmp = "$root\assets\gen_hd_" + [IO.Path]::GetFileNameWithoutExtension($Out)
New-Item -ItemType Directory -Force $tmp | Out-Null
& $cb image -Prompt $p -Ref $inP -Out $tmp
$f = Get-ChildItem $tmp -Filter *.png | Sort-Object LastWriteTime | Select-Object -Last 1
if ($f) { Move-Item -Force $f.FullName $outP; Write-Output "OK $Out" } else { Write-Output "FAILED $Out" }
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
