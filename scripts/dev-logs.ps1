param(
    [switch]$Follow,
    [int]$Tail = 80
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. "$PSScriptRoot/dev-runtime-common.ps1"

Ensure-RuntimeDir

Write-Host ("backend log:  {0}" -f $script:BackendLogPath)
Write-Host ("frontend log: {0}" -f $script:FrontendLogPath)
Write-Host ''

if (-not $Follow) {
    if (Test-Path -LiteralPath $script:BackendLogPath) {
        Write-Host '--- backend (tail) ---'
        Get-Content -LiteralPath $script:BackendLogPath -Tail $Tail
        Write-Host ''
    }
    else {
        Write-Host 'backend log not found'
    }

    if (Test-Path -LiteralPath $script:FrontendLogPath) {
        Write-Host '--- frontend (tail) ---'
        Get-Content -LiteralPath $script:FrontendLogPath -Tail $Tail
    }
    else {
        Write-Host 'frontend log not found'
    }
    exit 0
}

$paths = @()
if (Test-Path -LiteralPath $script:BackendLogPath) { $paths += $script:BackendLogPath }
if (Test-Path -LiteralPath $script:FrontendLogPath) { $paths += $script:FrontendLogPath }

if ($paths.Count -eq 0) {
    Write-Host 'No logs found to follow. Start runtime first: yarn dev:up'
    exit 1
}

Write-Host ("Following logs (tail={0}). Press Ctrl+C to stop." -f $Tail)
Get-Content -LiteralPath $paths -Tail $Tail -Wait
