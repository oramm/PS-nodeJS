Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. "$PSScriptRoot/dev-runtime-common.ps1"

Ensure-RuntimeDir

$backendState = Get-ServiceRuntimeState -Name 'backend' -Port $script:BackendPort -PidFilePath $script:BackendPidPath -LogPath $script:BackendLogPath -HealthUrl 'http://localhost:3000/' -RepoPath $script:BackendRepo
$frontendState = Get-ServiceRuntimeState -Name 'frontend' -Port $script:FrontendPort -PidFilePath $script:FrontendPidPath -LogPath $script:FrontendLogPath -HealthUrl $script:FrontendUrl -RepoPath $script:FrontendRepo

if ($backendState.pid) { Write-PidFile -Path $script:BackendPidPath -ProcessId $backendState.pid } else { Remove-FileIfExists -Path $script:BackendPidPath }
if ($frontendState.pid) { Write-PidFile -Path $script:FrontendPidPath -ProcessId $frontendState.pid } else { Remove-FileIfExists -Path $script:FrontendPidPath }

Write-StatusFile -BackendState $backendState -FrontendState $frontendState

Write-Host 'Dev runtime status:'
Print-StateLine -State $backendState
Print-StateLine -State $frontendState
Write-Host ("status file: {0}" -f $script:StatusPath)

if ($backendState.isRunning -and $frontendState.isRunning) {
    exit 0
}

exit 1
