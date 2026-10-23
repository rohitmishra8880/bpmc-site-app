# BPMC dev environment — saare cache / temp D: drive par (CLAUDE.md T9).
# Har naye terminal mein chalao:   . .\scripts\dev-env.ps1
# Sirf is terminal session par asar karta hai; Windows ki system/user setting nahi badalta.

$root = 'D:\BPMC\.cache'

$env:TEMP                    = "$root\temp"
$env:TMP                     = "$root\temp"
$env:npm_config_cache        = "$root\npm"          # user .npmrc mein bhi set hai
$env:PLAYWRIGHT_BROWSERS_PATH = "$root\playwright"
$env:FIREBASE_EMULATORS_PATH = "$root\firebase\emulators"
$env:XDG_CACHE_HOME          = "$root\xdg"

# JDK 21 (Firebase emulator ke liye) — system ka Java 8 nahi chhoota, sirf is session mein aage
$env:JAVA_HOME = 'D:\BPMC\.tools\jdk21'
if ($env:Path -notlike "*$env:JAVA_HOME\bin*") { $env:Path = "$env:JAVA_HOME\bin;$env:Path" }

foreach ($d in $env:TEMP, $env:npm_config_cache, $env:PLAYWRIGHT_BROWSERS_PATH, $env:FIREBASE_EMULATORS_PATH, $env:XDG_CACHE_HOME) {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Path $d -Force | Out-Null }
}

Write-Host "BPMC dev env ready -> TEMP=$env:TEMP | npm cache=$env:npm_config_cache | java=$env:JAVA_HOME" -ForegroundColor Green
