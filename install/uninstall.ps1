#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$CursorHome = Join-Path $env:USERPROFILE ".cursor"
$paths = @(
    (Join-Path $CursorHome "kodaelus"),
    (Join-Path $CursorHome "agents\kodaelus.md"),
    (Join-Path $CursorHome "skills\kodaelus")
)

foreach ($p in $paths) {
    if (Test-Path $p) {
        Remove-Item -Path $p -Recurse -Force
        Write-Host "Removed: $p"
    }
}

Write-Host "Kodaelus global install removed."
