# usage: powershell -File tools/depth.ps1 -Name fru   -> assets/tex/fru_d.png (depth map of assets/tex/fru.png); skips if it already exists
param([string]$Name)
$root = Split-Path -Parent $PSScriptRoot
if (Test-Path "$root\assets\tex\${Name}_d.png") { Write-Output "OK ${Name}_d (exists, skipped)"; exit 0 }
if (-not (Test-Path "$root\assets\tex\$Name.png")) { Write-Output "FAILED ${Name}_d (no day image)"; exit 0 }
$cb = "$env:USERPROFILE\.claude\skills\codex-bridge\codex-bridge.ps1"
$p = Get-Content -Raw -Encoding UTF8 "$root\assets\prompts\_depth.txt"
$tmp = "$root\assets\gen_${Name}_d"
New-Item -ItemType Directory -Force $tmp | Out-Null
& $cb image -Prompt $p -Ref "$root\assets\tex\$Name.png" -Out $tmp
$f = Get-ChildItem $tmp -Filter *.png | Sort-Object LastWriteTime | Select-Object -Last 1
if ($f) { Move-Item -Force $f.FullName "$root\assets\tex\${Name}_d.png"; Write-Output "OK ${Name}_d" } else { Write-Output "FAILED ${Name}_d" }
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
