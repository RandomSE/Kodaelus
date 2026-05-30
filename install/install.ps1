#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$InstallScript = Join-Path $PSScriptRoot "install.mjs"
if (-not (Test-Path $InstallScript)) {
    throw "Missing installer: $InstallScript"
}

node $InstallScript @args
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
