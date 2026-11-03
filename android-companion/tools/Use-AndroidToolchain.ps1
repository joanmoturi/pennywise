[CmdletBinding()]
param(
    [string]$JavaHome = $env:JAVA_HOME,
    [string]$SdkRoot = $env:ANDROID_HOME
)

if (!$JavaHome) {
    $jdkRoot = Join-Path $env:LOCALAPPDATA 'PennywiseTools\jdk17'
    $jdk = Get-ChildItem -LiteralPath $jdkRoot -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path -LiteralPath (Join-Path $_.FullName 'bin\javac.exe') } |
        Sort-Object Name -Descending | Select-Object -First 1
    if ($jdk) { $JavaHome = $jdk.FullName }
}
if (!$JavaHome -or !(Test-Path -LiteralPath (Join-Path $JavaHome 'bin\javac.exe'))) {
    throw 'JDK 17 not found. Set JAVA_HOME or pass -JavaHome; see ANDROID_COMPANION_GUIDE.md.'
}
$javacVersion = (& (Join-Path $JavaHome 'bin\javac.exe') -version 2>&1 | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $javacVersion -notmatch '^javac 17\.') {
    throw "This project requires JDK 17; detected: $javacVersion"
}

if (!$SdkRoot) { $SdkRoot = Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
foreach ($required in @('platforms\android-35\android.jar', 'build-tools\34.0.0\aapt2.exe', 'platform-tools\adb.exe')) {
    if (!(Test-Path -LiteralPath (Join-Path $SdkRoot $required))) {
        throw "Missing SDK component: $required. See ANDROID_COMPANION_GUIDE.md."
    }
}

$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $SdkRoot
$env:ANDROID_SDK_ROOT = $SdkRoot
$env:PATH = "$JavaHome\bin;$SdkRoot\platform-tools;$env:PATH"
Write-Output "Using $javacVersion; SDK $SdkRoot (process-local environment only)."
