Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. "$PSScriptRoot/dev-runtime-common.ps1"

Ensure-RuntimeDir

$backendPid = Read-PidFile -Path $script:BackendPidPath
$frontendPid = Read-PidFile -Path $script:FrontendPidPath

if ($backendPid) {
    Write-Host ("[backend] stopping pid={0}" -f $backendPid)
    Stop-ProcessByPid -ProcessId $backendPid
}
else {
    Write-Host '[backend] pid file not found'
}

if ($frontendPid) {
    Write-Host ("[frontend] stopping pid={0}" -f $frontendPid)
    Stop-ProcessByPid -ProcessId $frontendPid
}
else {
    Write-Host '[frontend] pid file not found'
}

Start-Sleep -Milliseconds 600

$backendPortPid = Get-ListeningPid -Port $script:BackendPort
$frontendPortPid = Get-ListeningPid -Port $script:FrontendPort

if ($backendPortPid) {
    Write-Host ("[backend] warning: port {0} still occupied by pid={1}" -f $script:BackendPort, $backendPortPid)
}
if ($frontendPortPid) {
    Write-Host ("[frontend] warning: port {0} still occupied by pid={1}" -f $script:FrontendPort, $frontendPortPid)
}

Remove-FileIfExists -Path $script:BackendPidPath
Remove-FileIfExists -Path $script:FrontendPidPath
Remove-FileIfExists -Path $script:StatusPath

$backendState = Get-ServiceRuntimeState -Name 'backend' -Port $script:BackendPort -PidFilePath $script:BackendPidPath -LogPath $script:BackendLogPath -HealthUrl 'http://localhost:3000/' -RepoPath $script:BackendRepo
$frontendState = Get-ServiceRuntimeState -Name 'frontend' -Port $script:FrontendPort -PidFilePath $script:FrontendPidPath -LogPath $script:FrontendLogPath -HealthUrl $script:FrontendUrl -RepoPath $script:FrontendRepo

Write-Host ''
Write-Host 'Dev runtime status after stop:'
Print-StateLine -State $backendState
Print-StateLine -State $frontendState

if (-not $backendState.isRunning -and -not $frontendState.isRunning) {
    exit 0
}

exit 1
