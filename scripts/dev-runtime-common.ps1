Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:BackendRepo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$script:FrontendRepo = 'C:\Apache24\htdocs\ENVI.ProjectSite'
$script:RuntimeDir = Join-Path $script:BackendRepo 'tmp/dev-runtime'
$script:BackendPort = 3000
$script:FrontendPort = 9000
$script:FrontendUrl = 'http://localhost:9000/docs/'

$script:BackendPidPath = Join-Path $script:RuntimeDir 'backend.pid'
$script:FrontendPidPath = Join-Path $script:RuntimeDir 'frontend.pid'
$script:BackendLogPath = Join-Path $script:RuntimeDir 'backend.log'
$script:FrontendLogPath = Join-Path $script:RuntimeDir 'frontend.log'
$script:StatusPath = Join-Path $script:RuntimeDir 'status.json'

function Ensure-PathExists {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Label
    )
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Label not found: $Path"
    }
}

function Ensure-RuntimeDir {
    if (-not (Test-Path -LiteralPath $script:RuntimeDir)) {
        New-Item -ItemType Directory -Path $script:RuntimeDir -Force | Out-Null
    }
}

function Read-PidFile {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        return $null
    }

    $raw = (Get-Content -LiteralPath $Path -Raw).Trim()
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return $null
    }

    [int]$parsedPid = 0
    if ([int]::TryParse($raw, [ref]$parsedPid)) {
        return $parsedPid
    }

    return $null
}

function Write-PidFile {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][int]$ProcessId
    )
    Set-Content -LiteralPath $Path -Value $ProcessId
}

function Remove-FileIfExists {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Force
    }
}

function Test-PidRunning {
    param([int]$ProcessId)
    if (-not $ProcessId) {
        return $false
    }
    try {
        Get-Process -Id $ProcessId -ErrorAction Stop | Out-Null
        return $true
    }
    catch {
        return $false
    }
}

function Get-ListeningPid {
    param([Parameter(Mandatory = $true)][int]$Port)
    try {
        return Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
            Select-Object -ExpandProperty OwningProcess -First 1
    }
    catch {
        return $null
    }
}

function Test-Http200 {
    param([Parameter(Mandatory = $true)][string]$Url)
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
        return ($response.StatusCode -eq 200)
    }
    catch {
        return $false
    }
}

function Wait-ForPort {
    param(
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Get-ListeningPid -Port $Port) {
            return $true
        }
        Start-Sleep -Milliseconds 700
    }
    return $false
}

function Wait-ForHttp200 {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][int]$TimeoutSeconds
    )
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Http200 -Url $Url) {
            return $true
        }
        Start-Sleep -Milliseconds 700
    }
    return $false
}

function Start-YarnInBackground {
    param(
        [Parameter(Mandatory = $true)][string]$RepoPath,
        [Parameter(Mandatory = $true)][string]$LogPath,
        [string]$CommandLine = 'yarn start'
    )
    $cmdArgs = "/c $CommandLine 1>> `"$LogPath`" 2>>&1"
    $process = Start-Process -FilePath 'cmd.exe' -ArgumentList $cmdArgs -WorkingDirectory $RepoPath -WindowStyle Minimized -PassThru
    return $process.Id
}

function Stop-ProcessByPid {
    param([int]$ProcessId)
    if (-not (Test-PidRunning -ProcessId $ProcessId)) {
        return
    }
    try {
        Stop-Process -Id $ProcessId -ErrorAction Stop
        Start-Sleep -Milliseconds 500
    }
    catch {
    }
    if (Test-PidRunning -ProcessId $ProcessId) {
        Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
    }
}

function Get-ServiceRuntimeState {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][int]$Port,
        [Parameter(Mandatory = $true)][string]$PidFilePath,
        [Parameter(Mandatory = $true)][string]$LogPath,
        [Parameter(Mandatory = $true)][string]$HealthUrl,
        [string]$RepoPath = ''
    )

    $pidFromFile = Read-PidFile -Path $PidFilePath
    $pidFromPort = Get-ListeningPid -Port $Port

    $effectivePid = $null
    $source = 'none'
    if ($pidFromFile -and (Test-PidRunning -ProcessId $pidFromFile)) {
        $effectivePid = $pidFromFile
        $source = 'pid_file'
    }
    elseif ($pidFromPort) {
        $effectivePid = [int]$pidFromPort
        $source = 'port'
    }

    $isRunning = [bool]$effectivePid
    $isHealthy = $false
    if ($isRunning) {
        if ($Name -eq 'backend') {
            $isHealthy = [bool](Get-ListeningPid -Port $Port)
        }
        else {
            $isHealthy = Test-Http200 -Url $HealthUrl
        }
    }

    return [ordered]@{
        name = $Name
        repoPath = $RepoPath
        port = $Port
        pid = $effectivePid
        pidSource = $source
        pidFromFile = $pidFromFile
        pidFromPort = if ($pidFromPort) { [int]$pidFromPort } else { $null }
        isRunning = $isRunning
        isHealthy = $isHealthy
        healthUrl = $HealthUrl
        logPath = $LogPath
        pidFilePath = $PidFilePath
        command = 'yarn start'
    }
}

function Write-StatusFile {
    param(
        [Parameter(Mandatory = $true)]$BackendState,
        [Parameter(Mandatory = $true)]$FrontendState
    )
    $status = [ordered]@{
        updatedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
        backend = $BackendState
        frontend = $FrontendState
        overallHealthy = ($BackendState.isHealthy -and $FrontendState.isHealthy)
    }
    $status | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $script:StatusPath
}

function Print-StateLine {
    param([Parameter(Mandatory = $true)]$State)
    $status = if ($State.isRunning) { 'running' } else { 'stopped' }
    $healthy = if ($State.isHealthy) { 'healthy' } else { 'unhealthy' }
    $pidText = if ($State.pid) { $State.pid } else { '-' }
    Write-Host ("[{0}] {1} | pid={2} | port={3} | source={4}" -f $State.name, $status, $pidText, $State.port, $State.pidSource)
    Write-Host ("      health={0} | log={1}" -f $healthy, $State.logPath)
}
