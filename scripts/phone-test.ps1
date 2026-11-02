# Puts a TEST copy of the Android app on a phone plugged in with a USB cable.
#
# The test app ("Volita (test)") installs next to the real one and talks to the dev server on this computer over
# the cable, so new features can be tried on the phone before anything is deployed. The real app is untouched.
#
# Needs: USB debugging on in the phone's developer options, the phone plugged in and unlocked, and the dev server
# running in another window:  npm run build ; npx netlify-cli@latest dev --dir dist --offline --port 8888 --no-open
#
# Run from the project folder:  powershell -ExecutionPolicy Bypass -File scripts/phone-test.ps1

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$sdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
$adb = Join-Path $sdk 'platform-tools\adb.exe'
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = $sdk

$devices = (& $adb devices) | Select-Object -Skip 1 | Where-Object { $_ -match '\tdevice$' }
if (-not $devices) {
  Write-Host 'No phone found. Plug it in, unlock it, allow USB debugging when it asks, then run this again.' -ForegroundColor Yellow
  exit 1
}

Write-Host 'Building the web app...'
npm run build
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host 'Pointing the test app at this computer...'
$env:VOLITA_DEV_SERVER = 'http://localhost:8888'
npx cap sync android
if ($LASTEXITCODE -ne 0) { exit 1 }

try {
  Write-Host 'Building the test app...'
  Push-Location (Join-Path $root 'android')
  .\gradlew.bat assembleDebug --console=plain
  if ($LASTEXITCODE -ne 0) { exit 1 }
  Pop-Location
} finally {
  # Always put the real configuration back, so a later release build still points at the live site.
  Remove-Item Env:VOLITA_DEV_SERVER -ErrorAction SilentlyContinue
  npx cap sync android | Out-Null
}

$apk = Join-Path $root 'android\app\build\outputs\apk\debug\app-debug.apk'
Write-Host 'Installing on the phone...'
& $adb install -r $apk
if ($LASTEXITCODE -ne 0) { exit 1 }

# Lets the phone reach the dev server on this computer through the cable.
& $adb reverse tcp:8888 tcp:8888
& $adb shell am start -n com.brandigail.volita.test/com.brandigail.volita.MainActivity | Out-Null

Write-Host ''
Write-Host 'Done. "Volita (test)" is open on the phone.' -ForegroundColor Green
Write-Host 'Keep the dev server running and the cable plugged in while you try it.'
Write-Host 'If the page is blank, run:  adb reverse tcp:8888 tcp:8888'
