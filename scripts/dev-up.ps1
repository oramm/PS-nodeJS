Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. "$PSScriptRoot/dev-runtime-common.ps1"

Ensure-PathExists -Path $script:BackendRepo -Label 'Backend repository'
Ensure-PathExists -Path $script:FrontendRepo -Label 'Frontend repository'
Ensure-RuntimeDir

$backendStateBefore = Get-ServiceRuntimeState -Name 'backend' -Port $script:BackendPort -PidFilePath $script:BackendPidPath -LogPath $script:BackendLogPath -HealthUrl 'http://localhost:3000/' -RepoPath $script:BackendRepo
$frontendStateBefore = Get-ServiceRuntimeState -Name 'frontend' -Port $script:FrontendPort -PidFilePath $script:FrontendPidPath -LogPath $script:FrontendLogPath -HealthUrl $script:FrontendUrl -RepoPath $script:FrontendRepo

$backendStartedNow = $false
$frontendStartedNow = $false

if (-not $backendStateBefore.isRunning) {
    if ($backendStateBefore.pidFromPort -and (-not $backendStateBefore.pidFromFile)) {
        Write-Host ("[backend] Port {0} is occupied by pid={1}; cannot auto-start backend." -f $script:BackendPort, $backendStateBefore.pidFromPort)
    }
    else {
        $backendPid = Start-YarnInBackground -RepoPath $script:BackendRepo -LogPath $script:BackendLogPath -CommandLine 'set NODE_ENV=development&& .\node_modules\.bin\nodemon.cmd --ignore "tmp/dev-runtime/**" --exec ts-node src/index.ts'
        Write-PidFile -Path $script:BackendPidPath -ProcessId $backendPid
        Write-Host ("[backend] started pid={0}" -f $backendPid)
        $backendStartedNow = $true
    }
}
else {
    Write-Host ("[backend] already running pid={0}" -f $backendStateBefore.pid)
    if ($backendStateBefore.pidFromFile -ne $backendStateBefore.pid) {
        Write-PidFile -Path $script:BackendPidPath -ProcessId $backendStateBefore.pid
    }
}

if (-not $frontendStateBefore.isRunning) {
    if ($frontendStateBefore.pidFromPort -and (-not $frontendStateBefore.pidFromFile)) {
        Write-Host ("[frontend] Port {0} is occupied by pid={1}; cannot auto-start frontend." -f $script:FrontendPort, $frontendStateBefore.pidFromPort)
    }
    else {
        $frontendPid = Start-YarnInBackground -RepoPath $script:FrontendRepo -LogPath $script:FrontendLogPath
        Write-PidFile -Path $script:FrontendPidPath -ProcessId $frontendPid
        Write-Host ("[frontend] started pid={0}" -f $frontendPid)
        $frontendStartedNow = $true
    }
}
else {
    Write-Host ("[frontend] already running pid={0}" -f $frontendStateBefore.pid)
    if ($frontendStateBefore.pidFromFile -ne $frontendStateBefore.pid) {
        Write-PidFile -Path $script:FrontendPidPath -ProcessId $frontendStateBefore.pid
    }
}

if ($backendStartedNow) {
    [void](Wait-ForPort -Port $script:BackendPort -TimeoutSeconds 45)
}
if ($frontendStartedNow) {
    [void](Wait-ForHttp200 -Url $script:FrontendUrl -TimeoutSeconds 90)
}

$backendState = Get-ServiceRuntimeState -Name 'backend' -Port $script:BackendPort -PidFilePath $script:BackendPidPath -LogPath $script:BackendLogPath -HealthUrl 'http://localhost:3000/' -RepoPath $script:BackendRepo
$frontendState = Get-ServiceRuntimeState -Name 'frontend' -Port $script:FrontendPort -PidFilePath $script:FrontendPidPath -LogPath $script:FrontendLogPath -HealthUrl $script:FrontendUrl -RepoPath $script:FrontendRepo

if ($backendState.pid) { Write-PidFile -Path $script:BackendPidPath -ProcessId $backendState.pid } else { Remove-FileIfExists -Path $script:BackendPidPath }
if ($frontendState.pid) { Write-PidFile -Path $script:FrontendPidPath -ProcessId $frontendState.pid } else { Remove-FileIfExists -Path $script:FrontendPidPath }

Write-StatusFile -BackendState $backendState -FrontendState $frontendState

Write-Host ''
Write-Host 'Dev runtime status:'
Print-StateLine -State $backendState
Print-StateLine -State $frontendState

if ($backendState.isHealthy -and $frontendState.isHealthy) {
    Write-Host ''
    Write-Host ("Ready: backend http://localhost:{0} | frontend {1}" -f $script:BackendPort, $script:FrontendUrl)
    exit 0
}

Write-Host ''
Write-Host 'Runtime not fully healthy. Check logs with: yarn dev:logs'
exit 1
