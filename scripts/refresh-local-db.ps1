<#
.SYNOPSIS
    Odswieza LOKALNA baze testowa PS ENVI kopia danych produkcyjnych i maskuje
    kolumny identyfikujace.

.DESCRIPTION
    Wzorzec miedzysystemowy: 40_wiki/firma/technologie/srodowisko-testowe-lokalne.md
    (odpowiednik scripts/refresh-local-db.ps1 z AQM i FIDmana, ale na MySQL/MariaDB).

    Piec krokow:
      1. dump z kylosa (WYLACZNIE odczyt: mysqldump --single-transaction --skip-lock-tables),
      2. odtworzenie do OSOBNEJ bazy lokalnej (domyslnie `envikons_local`),
      3. podmiana DEFINER-a wyzwalaczy na root@localhost,
      4. przelot maskujacy (scripts/mask-local-db.sql),
      5. weryfikacja przelotu (scripts/verify-local-mask.sql) - cichy przelot = blad.

    Droga jest jednokierunkowa: prod -> laptop. Skrypt nie umie zapisac niczego na prodzie.

    ZASADA NADRZEDNA: nic z tej bazy nie opuszcza laptopa - MIMO maskowania.
    Maskowanie nie jest anonimizacja; nazwy klientow wyciekaja przez wolne teksty
    (Contracts.Name, Cases.Name, Letters.Description, Milestones.Name, Tasks.Name).

.PARAMETER Database
    Docelowa baza lokalna. Domyslnie `envikons_local`.
    `envikons_myEnvi` jest ZABRONIONA: taka sama nazwe ma baza produkcyjna na kylosie
    ORAZ wspoldzielona lokalna kopia robocza, na ktorej pracuja migracje i inne sesje.

.PARAMETER SkipDownload
    Uzywa najnowszego dumpu juz lezacego w katalogu dumpow zamiast ciagnac nowy.

.EXAMPLE
    pwsh -File C:\Apache24\htdocs\PS-nodeJS\scripts\refresh-local-db.ps1
#>

[CmdletBinding()]
param(
    [string]$Database = 'envikons_local',
    [switch]$SkipDownload,
    [string]$MariaDbBin = 'C:\Program Files\MariaDB 10.6\bin',
    [string]$DumpDir = 'C:\systems-dev\ps-envi\tmp\dumps'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$MysqlExe = Join-Path $MariaDbBin 'mysql.exe'
$MysqlDumpExe = Join-Path $MariaDbBin 'mysqldump.exe'

# Bazy, ktorych ten skrypt NIE MA PRAWA nadpisac.
$ForbiddenTargets = @('envikons_myenvi', 'mysql', 'information_schema', 'performance_schema', 'sys')

function Read-EnvFile {
    param([Parameter(Mandatory = $true)][string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { throw "Brak pliku env: $Path" }
    $map = @{}
    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmed = $line.Trim()
        if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
        $idx = $trimmed.IndexOf('=')
        if ($idx -lt 1) { continue }
        $key = $trimmed.Substring(0, $idx).Trim()
        $value = $trimmed.Substring($idx + 1).Trim()
        # dotenv zdejmuje cudzyslowy otaczajace wartosc - tu tak samo, inaczej
        # haslo poszloby do klienta razem z cudzyslowami (blad 1045).
        if ($value.Length -ge 2 -and (
                ($value.StartsWith('"') -and $value.EndsWith('"')) -or
                ($value.StartsWith("'") -and $value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $map[$key] = $value
    }
    return $map
}

function Invoke-Mysql {
    param(
        [Parameter(Mandatory = $true)][string]$Password,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [string]$InputFile,
        [string]$OutputFile
    )
    $previous = $env:MYSQL_PWD
    $env:MYSQL_PWD = $Password
    try {
        $quoted = ($Arguments | ForEach-Object { '"' + $_ + '"' }) -join ' '
        $cmd = '"' + $MysqlExe + '" ' + $quoted
        if ($InputFile) { $cmd += ' < "' + $InputFile + '"' }
        if ($OutputFile) { $cmd += ' > "' + $OutputFile + '"' }
        & cmd.exe /c "$cmd"
        if ($LASTEXITCODE -ne 0) { throw "mysql zakonczyl sie kodem $LASTEXITCODE" }
    }
    finally { $env:MYSQL_PWD = $previous }
}

# ---------------------------------------------------------------- 0. Wejscie
foreach ($exe in @($MysqlExe, $MysqlDumpExe)) {
    if (-not (Test-Path -LiteralPath $exe)) { throw "Brak klienta MariaDB: $exe" }
}

$prodEnv = Read-EnvFile (Join-Path $RepoRoot '.env')              # -> kylos (zrodlo dumpu)
$localEnv = Read-EnvFile (Join-Path $RepoRoot '.env.development') # -> localhost (cel)

$prodHost = $prodEnv['DB_HOST']; $prodUser = $prodEnv['DB_USER']
$prodPass = $prodEnv['DB_PASSWORD']; $prodDb = $prodEnv['DB_NAME']
$localHost = $localEnv['DB_HOST']; $localUser = $localEnv['DB_USER']
$localPass = $localEnv['DB_PASSWORD']

# ------------------------------------------------------------- Bezpieczniki
if ($localHost -notin @('localhost', '127.0.0.1')) {
    throw "BEZPIECZNIK: cel musi byc localhost/127.0.0.1, a .env.development wskazuje '$localHost'. Przerwane."
}
if ($Database.ToLowerInvariant() -in $ForbiddenTargets) {
    throw "BEZPIECZNIK: baza '$Database' jest na liscie zabronionych celow (prod kylos ma te sama nazwe co wspoldzielona kopia lokalna). Przerwane."
}
if ($prodHost -in @('localhost', '127.0.0.1')) {
    throw "BEZPIECZNIK: .env wskazuje na localhost - to plik produkcyjny i cos jest nie tak z konfiguracja. Przerwane."
}

Write-Host "Zrodlo (tylko odczyt): $prodHost/$prodDb"
Write-Host "Cel (lokalny):         $localHost/$Database"

# ------------------------------------------------------------- 1. Dump prod
if (-not (Test-Path -LiteralPath $DumpDir)) { New-Item -ItemType Directory -Path $DumpDir -Force | Out-Null }

if ($SkipDownload) {
    $dumpFile = Get-ChildItem -LiteralPath $DumpDir -Filter 'kylos-*.sql' |
        Where-Object { $_.Name -notlike '*-local.sql' } |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $dumpFile) { throw "-SkipDownload, a w $DumpDir nie ma zadnego dumpu kylos-*.sql" }
    $dumpPath = $dumpFile.FullName
    Write-Host "[1/5] -SkipDownload: uzywam $($dumpFile.Name) z $($dumpFile.LastWriteTime)"
}
else {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmm'
    $dumpPath = Join-Path $DumpDir "kylos-$stamp.sql"
    Write-Host "[1/5] mysqldump z $prodHost ..."
    $previous = $env:MYSQL_PWD
    $env:MYSQL_PWD = $prodPass
    try {
        $args = @('-h', $prodHost, '-u', $prodUser, '--single-transaction', '--skip-lock-tables',
                  '--triggers', '--default-character-set=utf8mb4', $prodDb)
        $quoted = ($args | ForEach-Object { '"' + $_ + '"' }) -join ' '
        & cmd.exe /c ('"' + $MysqlDumpExe + '" ' + $quoted + ' > "' + $dumpPath + '"')
        if ($LASTEXITCODE -ne 0) { throw "mysqldump zakonczyl sie kodem $LASTEXITCODE" }
    }
    finally { $env:MYSQL_PWD = $previous }
    Write-Host "      dump: $dumpPath ($([math]::Round((Get-Item $dumpPath).Length / 1MB, 1)) MB)"
}

# --------------------------------------------- 2. Podmiana DEFINER wyzwalaczy
# Dump niesie wyzwalacze z definerem konta, ktorego lokalnie nie ma -> blad 1449
# przy kazdym INSERT do Letters/Cases. Podmieniamy na root@localhost.
$localSqlPath = Join-Path (Split-Path $dumpPath -Parent) `
    ([System.IO.Path]::GetFileNameWithoutExtension($dumpPath) + '-local.sql')
$content = [System.IO.File]::ReadAllText($dumpPath, [System.Text.Encoding]::UTF8)
$pattern = 'DEFINER=`[^`]+`@`[^`]+`'
$hits = ([regex]::Matches($content, $pattern)).Count
$content = [regex]::Replace($content, $pattern, 'DEFINER=`root`@`localhost`')
[System.IO.File]::WriteAllText($localSqlPath, $content, (New-Object System.Text.UTF8Encoding($false)))
$content = $null
Write-Host "[2/5] DEFINER podmieniony w $hits miejscach -> $(Split-Path $localSqlPath -Leaf)"

# ------------------------------------------------------------- 3. Odtworzenie
Write-Host "[3/5] odtwarzam do $Database ..."
Invoke-Mysql -Password $localPass -Arguments @('-h', $localHost, '-u', $localUser,
    '--default-character-set=utf8mb4', '-e',
    "DROP DATABASE IF EXISTS ``$Database``; CREATE DATABASE ``$Database`` DEFAULT CHARACTER SET utf8mb4;")
Invoke-Mysql -Password $localPass -Arguments @('-h', $localHost, '-u', $localUser,
    '--default-character-set=utf8mb4', $Database) -InputFile $localSqlPath

# --------------------------------------------------------------- 4. Maskowanie
Write-Host '[4/5] przelot maskujacy ...'
Invoke-Mysql -Password $localPass -Arguments @('-h', $localHost, '-u', $localUser,
    '--default-character-set=utf8mb4', $Database) -InputFile (Join-Path $PSScriptRoot 'mask-local-db.sql')

# -------------------------------------------------------------- 5. Weryfikacja
Write-Host '[5/5] weryfikacja przelotu ...'
$reportPath = Join-Path $env:TEMP "ps-envi-mask-report-$PID.txt"
Invoke-Mysql -Password $localPass -Arguments @('-h', $localHost, '-u', $localUser,
    '--default-character-set=utf8mb4', '-B', '-N', $Database) `
    -InputFile (Join-Path $PSScriptRoot 'verify-local-mask.sql') -OutputFile $reportPath

$left = 0; $masked = 0; $problems = @()
foreach ($row in Get-Content -LiteralPath $reportPath) {
    if ($row.Trim() -eq '') { continue }
    $cols = $row -split "`t"
    if ($cols.Count -lt 3) { continue }
    $count = [int]$cols[2]
    if ($cols[0] -eq 'ZOSTALO') {
        $left += $count
        if ($count -gt 0) { $problems += "$($cols[1]): $count" }
    }
    else {
        $masked += $count
        Write-Host ("      zamaskowane {0,-32} {1}" -f $cols[1], $count)
    }
}
Remove-Item -LiteralPath $reportPath -Force -ErrorAction SilentlyContinue

if ($left -gt 0) {
    throw "BEZPIECZNIK: po maskowaniu zostaly niezamaskowane wartosci -> $($problems -join '; ')"
}
if ($masked -eq 0) {
    throw 'BEZPIECZNIK: przelot maskujacy nic nie trafil. Cichy przelot jest gorszy niz jego brak - sprawdz mape kolumn w mask-local-db.sql.'
}

Write-Host ''
Write-Host "GOTOWE. Baza $Database odswiezona i zamaskowana ($masked wartosci)."
Write-Host 'Konta dev nie sa potrzebne: logowanie idzie obejsciem ENABLE_DEV_LOGIN (POST /login {"dev_mode":true}).'
Write-Host 'Nic z tej bazy nie opuszcza laptopa - maskowanie NIE jest anonimizacja.'
