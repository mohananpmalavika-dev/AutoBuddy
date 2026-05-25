# Copy built APK to public/download so it is hosted by the static site
# Usage: Run this after building an APK locally (path can be the EAS download path)

param(
    [string] $apkPath = "",
    [string] $projectRoot = "..\autobuddy-mobile"
)

if (-not $apkPath) {
    Write-Host "Provide the path to the APK (e.g. path/to/autobuddy.apk)"
    exit 1
}

$dest = Join-Path -Path $projectRoot -ChildPath "public\download\autobuddy.apk"

Copy-Item -Path $apkPath -Destination $dest -Force
Write-Host "Copied APK to $dest"
Write-Host "Public URL: /download/autobuddy.apk"