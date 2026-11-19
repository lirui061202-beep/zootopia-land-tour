# usage: powershell -File tools/night.ps1 -Name fru   -> assets/tex/fru_n.png (night edit of assets/tex/fru.png); skips if it already exists
param([string]$Name)
$root = Split-Path -Parent $PSScriptRoot
if (Test-Path "$root\assets\tex\${Name}_n.png") { Write-Output "OK ${Name}_n (exists, skipped)"; exit 0 }
if (-not (Test-Path "$root\assets\tex\$Name.png")) { Write-Output "FAILED ${Name}_n (no day image)"; exit 0 }
$cb = "$env:USERPROFILE\.claude\skills\codex-bridge\codex-bridge.ps1"
$pf = "$root\assets\prompts\_night.txt"
if (Test-Path "$root\assets\prompts\${Name}_night.txt") { $pf = "$root\assets\prompts\${Name}_night.txt" }
$p = Get-Content -Raw -Encoding UTF8 $pf
$tmp = "$root\assets\gen_${Name}_n"
New-Item -ItemType Directory -Force $tmp | Out-Null
& $cb image -Prompt $p -Ref "$root\assets\tex\$Name.png" -Out $tmp
$f = Get-ChildItem $tmp -Filter *.png | Sort-Object LastWriteTime | Select-Object -Last 1
if ($f) { Move-Item -Force $f.FullName "$root\assets\tex\${Name}_n.png"; Write-Output "OK ${Name}_n" } else { Write-Output "FAILED ${Name}_n" }
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
