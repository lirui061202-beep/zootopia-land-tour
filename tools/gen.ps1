# 用法: powershell -File tools/gen.ps1 -Name fru [-Ref a.png]
# 读取 assets/prompts/<Name>.txt（可带公共头 _head.txt / 尾 _tail.txt），调用 codex-bridge 生图，存为 assets/tex/<Name>.png
param([string]$Name, [string]$Ref = "", [switch]$Raw, [switch]$Portrait)
$root = Split-Path -Parent $PSScriptRoot
$cb = "$env:USERPROFILE\.claude\skills\codex-bridge\codex-bridge.ps1"
$body = Get-Content -Raw -Encoding UTF8 "$root\assets\prompts\$Name.txt"
if ($Raw) { $p = $body } else {
  $head = Get-Content -Raw -Encoding UTF8 "$root\assets\prompts\_head.txt"
  $tailName = "_tail.txt"; if ($Portrait) { $tailName = "_tailP.txt" }
  $tail = Get-Content -Raw -Encoding UTF8 "$root\assets\prompts\$tailName"
  $p = "$head`n$body`n$tail"
}
$tmp = "$root\assets\gen_$Name"
New-Item -ItemType Directory -Force $tmp | Out-Null
if ($Ref) { & $cb image -Prompt $p -Ref $Ref -Out $tmp } else { & $cb image -Prompt $p -Out $tmp }
$f = Get-ChildItem $tmp -Filter *.png | Sort-Object LastWriteTime | Select-Object -Last 1
if ($f) { Move-Item -Force $f.FullName "$root\assets\tex\$Name.png"; Write-Output "OK $Name -> assets\tex\$Name.png" } else { Write-Output "FAILED $Name" }
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
