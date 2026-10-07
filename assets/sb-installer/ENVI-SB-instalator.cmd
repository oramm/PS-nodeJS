@echo off
REM ENVI Second Brain - instalator, wersja 0.14.14. Dwuklik: wypakowuje instalator do
REM %USERPROFILE%\.envi\instalator i uruchamia go. Log: tam, bootstrap.log.
setlocal
set "SB_INSTALATOR=%~f0"
set "SB_INSTALATOR_DIR=%USERPROFILE%\.envi\instalator"
set "SB_INSTALATOR_KONIEC=%SB_INSTALATOR_DIR%\bootstrap.koniec"
set "SB_INSTALATOR_WERSJA=0.14.14"
set "PSModulePath="
set "SB_TU=%~dp0"
set "SB_Z_ZIPA="
if defined TEMP call :czy_temp "%TEMP%"
if defined LOCALAPPDATA call :czy_temp "%LOCALAPPDATA%\Temp"
if defined SB_Z_ZIPA goto :zip
if exist "%SB_INSTALATOR_KONIEC%" del /f /q "%SB_INSTALATOR_KONIEC%"
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop';$f=$env:SB_INSTALATOR;$d=$env:SB_INSTALATOR_DIR;$null=New-Item -ItemType Directory -Force -Path $d;$b=[IO.File]::ReadAllBytes($f);$t=[Text.Encoding]::ASCII.GetString($b);$o=$t.IndexOf(':SB-LADUNEK'+[char]13);if($o -lt 0){throw 'brak ladunku w pliku'};$o+=13;$r=[regex]'\G#SB-PLIK ([\w.-]+) (\d+)\r\n';$m=$r.Match($t,$o);$ile=0;while($m.Success){$n=[int]$m.Groups[2].Value;$s=[IO.File]::Create((Join-Path $d $m.Groups[1].Value));$s.Write($b,$m.Index+$m.Length,$n);$s.Close();$ile++;$o=$m.Index+$m.Length+$n+2;$m=$r.Match($t,$o)};if($ile -ne 3){throw ('ladunek niepelny: '+$ile+' plikow')}"
if errorlevel 1 goto :blad
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%SB_INSTALATOR_DIR%\bootstrap.ps1" %*
set "KOD=%ERRORLEVEL%"
echo(
if exist "%SB_INSTALATOR_KONIEC%" goto :koniec
echo PRZEBIEG SIE URWAL (kod wyjscia %KOD%) - instalator nie doszedl do podsumowania.
echo Najczestsza przyczyna: antywirus (np. Avast) zabral plik instalatora do Kwarantanny w trakcie pracy.
echo  1. Otworz antywirusa i sprawdz Kwarantanne - jesli jest tam bootstrap.ps1 albo ENVI-SB-instalator.cmd, to wlasnie to.
echo  2. Wyslij wlascicielowi plik %SB_INSTALATOR_DIR%\bootstrap.log
echo Zapis przebiegu: %SB_INSTALATOR_DIR%\bootstrap.log
pause
if "%KOD%"=="0" set "KOD=1"
exit /b %KOD%
:koniec
echo Zapis przebiegu: %SB_INSTALATOR_DIR%\bootstrap.log
pause
exit /b %KOD%
:czy_temp
set "SB_T=%~1\"
call set "SB_R=%%SB_TU:%SB_T%=%%"
if /i not "%SB_R%"=="%SB_TU%" set "SB_Z_ZIPA=1"
exit /b 0
:zip
echo(
echo Ten plik uruchomiono z wnetrza archiwum ZIP. Windows trzyma go wtedy w folderze tymczasowym:
echo   %SB_TU%
echo a antywirus zabiera pliki z tego miejsca, wiec instalacja by sie nie udala.
echo  1. Zamknij to okno.
echo  2. W folderze Pobrane kliknij prawym przyciskiem myszy plik ENVI-SB-instalator.zip i wybierz Wyodrebnij wszystkie.
echo  3. W wypakowanym folderze kliknij dwukrotnie ENVI-SB-instalator.cmd.
pause
exit /b 2
:blad
echo(
echo Nie udalo sie wypakowac instalatora do %SB_INSTALATOR_DIR% - zapis pliku zostal zablokowany.
echo Najczestsza przyczyna: antywirus (np. Avast) zabral wczesniej plik do Kwarantanny i do restartu blokuje to miejsce (komunikat: Odmowa dostepu).
echo  1. Uruchom komputer ponownie.
echo  2. Pobierz instalator jeszcze raz ze strony SB w PS, wypakuj ZIP (Wyodrebnij wszystkie) i uruchom ENVI-SB-instalator.cmd z wypakowanego folderu.
echo  3. Jesli to sie powtorzy, sprawdz Kwarantanne antywirusa i wyslij wlascicielowi zrzut tego okna.
pause
exit /b 1
:SB-LADUNEK
#SB-PLIK bootstrap.ps1 138942
#Requires -Version 5.1
<#
  ENVI.SB canon bootstrap - two roles, resolved from server state, never asked as a
  question (T6, D2): 'consumer' (canon read-only, no project area) and 'team' (same,
  plus repo B project area + its background sync). See Resolve-InstallRole.
  N0: scaffold. N1: prerequisites. N2: auth+clone (canon repo A) - also resolves and
  logs the role, and decides the canon push-lock purely from server permissions.push
  (D1: role NEVER lifts that lock, only the server does). N2b: projects repo (repo B)
  clone, team role only (T3, gated by role in T6). N3: scheduled canon auto-pull.
  N3b: project-area sync engine + schtasks + "Synchronizuj teraz" shortcut, team role
  only (T6). N4: Obsidian shortcut + vault registration. N5: agent runtime(s) + skills
  from Drive G:. N6 remains a stub.

  T3 (2026-08-06): collapsed the old two-vault layout (canon-only clone +
  a separate empty "own vault") into ONE Obsidian vault. Reason: SB knowledge
  and project notes cross-link with [[wikilinks]], and Obsidian wikilinks do
  not resolve across separate vaults - two vaults silently broke that graph.
  $VaultPath (below) is now that single vault root. Canon repo A clones
  directly INTO it (its own tracked tree already puts 40_wiki/, _index.md and
  CLAUDE.md at the clone root - this is not a new convention, it is exactly
  how the owner's own live vault is laid out today), and repo B (the writable
  team project repo) clones into a nested $VaultPath\20_projects. The old,
  now-orphaned second vault is detected and retired by Invoke-LegacyOwnVaultCleanup
  - see the hard safety gate on that function before touching it.
  Run:  ENVI-SB-instalator.cmd          (execute; built by build-instalator.ps1, J1)
        ENVI-SB-instalator.cmd -WhatIf  (dry-run: print the plan, change nothing)
        powershell -File bootstrap.ps1  (developer path, log beside this file)
#>
[CmdletBinding(SupportsShouldProcess)]
param()
# 0.14.6: instalator chodzi WYLACZNIE pod Windows PowerShell 5.1. dawny bootstrap.cmd wolal pwsh, a pod
# pwsh 7 (a) katalog siodemki nie ma starego interpretera (FATAL N5 u Michala 22.09), (b) Start-Process
# 'powershell.exe' dziedziczy PSModulePath siodemki - rezydent ikony startuje bez
# ConvertTo-SecureString i okna poczty padaja do wylogowania, (c) Tee-Object pisze log w innym
# kodowaniu. Zamiast lapac kazda roznice osobno: jedno przelaczenie na 5.1 przez `&` (ten
# operator czysci PSModulePath dla dziecka, Start-Process nie). Dziala tez przy recznym `pwsh -File`.
if ($PSVersionTable.PSEdition -eq 'Core') {
  $ps51 = Join-Path ([Environment]::SystemDirectory) 'WindowsPowerShell\v1.0\powershell.exe'
  $przekaz = @(); if ($WhatIfPreference) { $przekaz += '-WhatIf' }
  & $ps51 -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath @przekaz
  exit $LASTEXITCODE
}
# 'Continue', not 'Stop': every native command below already guards itself with a
# $LASTEXITCODE check. Under 'Stop', Windows PowerShell 5.1 turns any native-command
# *stderr* line (`gh auth status` when logged out, `git clone` progress, winget noise)
# into a terminating NativeCommandError that aborts the whole run BEFORE its own Log line -
# the exact reason the installer died at `gh auth status` on a fresh machine instead of
# falling through to `gh auth login`, and why nothing reached bootstrap.log.
$ErrorActionPreference = 'Continue'

# -- Config -- override any of these in bootstrap.config.ps1 beside this file
$RepoUrl          = 'https://github.com/envi-konsulting/ENVI.SB.git'
$PsUrl            = 'https://ps.envi.com.pl' # strona PS ENVI (GitHub Pages, CNAME), hash-route #/sbInstaller
$StanInstalatora  = "$env:USERPROFILE\.envi\instalator-stan.json"
# $VaultPath is the ONE Obsidian vault root (T3). Canon repo A clones directly here (its
# tracked tree already places 40_wiki/, _index.md and CLAUDE.md at the clone root, so no
# extra nesting is needed - see the header comment). Kept at the SAME literal path the
# installer has used since N4 ("the Obsidian vault opened by the user") precisely so an
# existing healthy canon clone from before T3 does not have to move: it just gains a
# nested 20_projects/ next to it.
$VaultPath        = "$env:USERPROFILE\ENVI-Kanon"
$ProjectsRepoUrl  = 'https://github.com/envi-konsulting/ENVI.SB.Projekty.git'
$ProjectsClonePath = Join-Path $VaultPath '20_projects'   # repo B (team project area, writable) - nested inside the vault
# Pre-T3 layout: a second, separate vault the old N4 created and auto-registered for the
# user's own notes. T3 retires it - see Invoke-LegacyOwnVaultCleanup for the safety gate
# before anything here is deleted. Left as a literal (not derived from $VaultPath) because
# it names a PAST location, not the current one.
$LegacyOwnVaultPath = "$env:USERPROFILE\Documents\ENVI-vault"
$PullEveryHours   = 4
$TaskName         = 'ENVI-Kanon-Pull'
# T6: role is resolved from server-reported state, never asked as a question - see
# Resolve-InstallRole (D2). 'auto' lets the installer decide; override to 'consumer' or
# 'team' in bootstrap.config.ps1 only for testing in a sandbox (see test-bootstrap-units.ps1).
$Role             = 'auto'
$SyncEveryHours   = 1
$SyncTaskName     = 'ENVI-SB-Projekty-Sync'
# Runtime copy of the sync engine + its schtasks-safe launcher (D3/D4) - live OUTSIDE repo B,
# same reasoning as $PullLauncher above and spelled out in project-sync.ps1's own header.
$SyncEnginePath   = "$env:USERPROFILE\.envi\project-sync.ps1"
$SyncRunLauncher  = "$env:USERPROFILE\.envi\project-sync-run.ps1"
# Resolved 2026-07-15 (owner-confirmed) = envi-skill-sync's own source_g. Built via
# [char]0x00F3 instead of a literal accented char: this file is BOM-less, and Windows
# PowerShell 5.1 reads BOM-less .ps1 by system codepage, not UTF-8 - a raw non-ASCII
# byte here would corrupt the tokenizer (the exact class of bug fixed in N1).
$SkillDriveRoot = "G:\Dyski wsp$([char]0x00F3)$([char]0x0142)dzielone\SB.ENVI\.skills"  # only a first guess (drive letter/UI language differ per machine) - N1 auto-detects when it does not exist
# N4: katalog wydan rdzenia lezy OBOK .skills na tym samym dysku, wiec domyslnie
# wyprowadza sie go z $SkillDriveRoot (ktory N1 i tak potrafi znalezc sam). Osobna
# zmienna istnieje tylko po to, zeby dalo sie go przypiac w bootstrap.config.ps1.
$CoreDriveRoot  = $null
$LogFile        = "$VaultPath\.envi\pull.log"             # append-only auto-pull log (N3), distinct from the installer's own log below
$PullLauncher   = "$env:USERPROFILE\.envi\kanon-pull.ps1"  # N3 auto-pull launcher (stable per-user path - may contain a space, see Register-ZadanieCogodzinne; NOT inside the clone)
$override = Join-Path $PSScriptRoot 'bootstrap.config.ps1'
if (Test-Path $override) { . $override }

# -- Append-only log (installer's own run log; NOT the same file as $LogFile above) --
$InstallLogFile = Join-Path $PSScriptRoot 'bootstrap.log'
function Log($m) { ('{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) | Tee-Object -FilePath $InstallLogFile -Append | Out-Host }

# -- N1: prerequisites (winget), idempotent --
# ponytail: detection = Get-Command for CLI tools (fast, no winget call needed), winget list
# for GUI-only apps that never land on PATH. Ceiling: no version pinning, no upgrade path
# beyond "present = skip"; if we ever need min-version checks, revisit here.
$N1Tools = @(
  @{ Id = 'Git.Git';          Name = 'Git';          DetectCmd = 'git' }
  @{ Id = 'GitHub.cli';       Name = 'GitHub CLI';   DetectCmd = 'gh' }
  @{ Id = 'Obsidian.Obsidian'; Name = 'Obsidian';     DetectCmd = $null }
  @{ Id = 'Google.GoogleDrive'; Name = 'Google Drive'; DetectCmd = $null }
  # M4: launcher Pythona dla serwera poczty (P6/mcp/kylos-email). 'py' i nie 'python' -
  # decyzja zamknieta w planie: atrapa ze Sklepu Microsoft nie wystawia py.exe wcale,
  # tylko python.exe/python3.exe, wiec Get-Command py nie zlapie atrapy.
  @{ Id = 'Python.Python.3.12'; Name = 'Python (py launcher)'; DetectCmd = 'py' }
)

function Test-WingetPackagePresent($id) {
  # non-mutating: read-only query, safe to run under -WhatIf and during dry-run checks
  $out = winget list --id $id --exact --accept-source-agreements 2>$null | Out-String
  return ($out -match [regex]::Escape($id))
}

function Test-N1ToolPresent($tool) {
  if ($tool.DetectCmd -and (Get-Command $tool.DetectCmd -ErrorAction SilentlyContinue)) { return $true }
  return Test-WingetPackagePresent $tool.Id
}

function Sync-PathFromRegistry {
  # Freshly-installed exes (git/gh) land in Machine/User PATH in the registry, but this
  # process's $env:Path snapshot predates the install. Re-read both scopes from the
  # registry so the SAME run can call them without relaunching the shell.
  $machine = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user    = [System.Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = @($machine, $user) -join ';'
  Log "[N1] PATH refreshed in-process from registry (Machine+User)"
}

# ponytail: filesystem probe, not the registry. Verified on a live Google Drive for Desktop
# install that HKCU\Software\Google\DriveFS holds only account preferences - there is NO
# documented mount-point value to read - so detection enumerates filesystem roots for a
# DriveFS-shaped child and searches a bounded depth for the .skills folder. Ceiling: first
# match wins and depth is 4; pin $SkillDriveRoot in bootstrap.config.ps1 if a machine has
# two .skills folders or nests the shortcut deeper.
# Non-ASCII root names are built with [char] escapes for the same BOM/codepage reason as
# $SkillDriveRoot above: "M<F3>j dysk" and "Dyski wsp<F3><142>dzielone".
$DriveFsRootNames = @(
  "M$([char]0x00F3)j dysk"
  'My Drive'
  "Dyski wsp$([char]0x00F3)$([char]0x0142)dzielone"
  'Shared drives'
)

function Find-SkillDriveRoot {
  # non-mutating: read-only filesystem search, safe under -WhatIf
  param([string[]]$KorzenieDyskow = (Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue).Root)
  foreach ($drive in $KorzenieDyskow) {
    foreach ($name in $DriveFsRootNames) {
      $root = Join-Path $drive $name
      if (-not (Test-Path -LiteralPath $root)) { continue }
      $hit = Get-ChildItem -LiteralPath $root -Directory -Recurse -Depth 4 -Filter '.skills' -Force -ErrorAction SilentlyContinue |
             Select-Object -First 1
      if ($hit) { return $hit.FullName }
    }
  }
  return $null
}

function Find-SkillDriveRootNajpierwZnana {
  # R2 (poz. 13, Agnieszka 07.10 "enter nic nie robi"): po zalogowaniu Dysku petla wolala od razu
  # Find-SkillDriveRoot - rekurencja po calym G: z dyskami wspoldzielonymi, na dysku w chmurze
  # minuty ciszy. Skonfigurowana sciezka to jeden Test-Path, wiec idzie pierwsza (TEST 30).
  param([string]$Znana)
  if ($Znana -and (Test-Path -LiteralPath $Znana)) { return $Znana }
  Log "[N1] Szukam folderu skilli na Dysku Google - to moze potrwac kilka minut, nie zamykaj tego okna."
  return Find-SkillDriveRoot
}

function Start-GoogleDriveApp {
  # ponytail: launch.bat, not the exe. Verified on a live install: GoogleDriveFS.exe sits in a
  # VERSIONED subfolder ("...\Drive File Stream\128.0.0.0\GoogleDriveFS.exe") that changes on
  # every update, while "...\Drive File Stream\launch.bat" is the stable entry point Google
  # itself keeps in place. Ceiling: 64-bit Program Files only (Drive ships no 32-bit build).
  if (Get-Process 'GoogleDriveFS' -ErrorAction SilentlyContinue) {
    Log "[N1] Dysk Google juz dziala"
    return
  }
  $launcher = Join-Path $env:ProgramFiles 'Google\Drive File Stream\launch.bat'
  if (-not (Test-Path -LiteralPath $launcher)) {
    Log "[N1] Nie znaleziono aplikacji Dysk Google w '$launcher'. Pobierz ja z https://www.google.com/drive/download/, zaloguj sie kontem, ktorym logujesz sie do PS, i uruchom ENVI-SB-instalator.cmd jeszcze raz."
    return
  }
  Start-Process -FilePath $launcher -WindowStyle Hidden
  Log "[N1] Uruchomiono Dysk Google - zaloguj sie kontem, ktorym logujesz sie do PS"
}

function Resolve-SkillDriveRoot {
  # Litera dysku i jezyk Windows roznia sie u ludzi; konfiguracja jest tylko podpowiedzia.
  if (Test-Path -LiteralPath $script:SkillDriveRoot) {
    Log "[N1] Skille na Dysku Google sa dostepne: $script:SkillDriveRoot"
    return
  }
  Log "[N1] Nie widac skonfigurowanej sciezki '$script:SkillDriveRoot' - szukam Dysku Google."
  $script:znalezionyDysk = Find-SkillDriveRootNajpierwZnana -Znana $script:SkillDriveRoot
  if (-not $script:znalezionyDysk) {
    $sprawdz = {
      $f = Find-SkillDriveRootNajpierwZnana -Znana $script:SkillDriveRoot
      if ($f) { $script:znalezionyDysk = $f; $null }
      else { Get-PoradaDysk (Test-GoogleDriveInstalled) (Test-DriveMounted) }
    }
    if ($WhatIfPreference) {
      $porada = & $sprawdz
      if ($porada) { foreach ($linia in @($porada.Lines)) { Log $linia } }
    } else {
      $null = Invoke-PetlaNaprawy -Sprawdz $sprawdz -PrzedPorada {
        param($p)
        if ($p.Kind -eq 'dysk-niezalogowany') { Start-GoogleDriveApp }
      }
    }
  }
  if ($script:znalezionyDysk) {
    $script:SkillDriveRoot = $script:znalezionyDysk
    Log "[N1] Znaleziono skille na Dysku Google: $script:SkillDriveRoot"
  } else {
    Log ('[N1] Skille zostana pominiete w tym przebiegu. Po zalogowaniu kontem, ktorym logujesz sie do PS, uruchom ENVI-SB-instalator.cmd jeszcze raz albo ustaw w bootstrap.config.ps1: $SkillDriveRoot = ''X:\...\SB.ENVI\.skills''')
  }
}

function Get-OstrzezenieWersji {
  # R2 (poz. 7, Agnieszka 02.10 uruchomila stary 0.14.12 z Pobranych). Porownanie liczbowe
  # ([version]), nie tekstowe - tekstowo "0.14.9" wychodzi nowsze niz "0.14.13" (TEST 29).
  # Numer nieczytelny po ktorejkolwiek stronie (np. budowa testowa "0.0.0-test") = brak ostrzezenia.
  param([string]$Biezaca, [string]$NaDysku, [string]$StronaSb)
  $b = $null; $d = $null
  if (-not [version]::TryParse("$Biezaca", [ref]$b) -or -not [version]::TryParse("$NaDysku", [ref]$d)) { return $null }
  if ($b -ge $d) { return $null }
  return "UWAGA: uruchamiasz stary instalator (wersja $Biezaca), a aktualna wersja to $NaDysku. Pobierz nowy ze strony SB w PS ($StronaSb), wypakuj go i uruchom; stary plik z folderu Pobrane usun. Ta instalacja idzie dalej."
}

function Test-WersjaInstalatora {
  # non-mutating: sam odczyt, bezpieczne pod -WhatIf. Numer aktualnego wydania czytamy z manifestu
  # rdzenia na dysku SB.ENVI (.rdzen\rdzen-manifest.json): wydanie sklada instalator i paczke rdzenia
  # z TYM SAMYM numerem (release/build-core-package.ps1), a z tego dysku instalator i tak bierze
  # skille i rdzen. Kopia .cmd lezy na innym dysku (ENVI-MG), ktorego pracownik nie musi widziec.
  if (-not $env:SB_INSTALATOR_WERSJA) { return }
  $coreRoot = $script:CoreDriveRoot
  if (-not $coreRoot) {
    if (-not $script:SkillDriveRoot -or -not (Test-Path -LiteralPath $script:SkillDriveRoot)) { return }
    $coreRoot = Join-Path (Split-Path $script:SkillDriveRoot -Parent) '.rdzen'
  }
  $mf = Get-RdzenManifest -CoreRoot $coreRoot
  if (-not $mf) { return }
  $ostrzezenie = Get-OstrzezenieWersji -Biezaca $env:SB_INSTALATOR_WERSJA -NaDysku ([string]$mf.wersja) -StronaSb ($PsUrl.TrimEnd('/') + '/#/sbInstaller')
  if ($ostrzezenie) {
    Log "[N1] $ostrzezenie"
    $script:InstalatorStary = $ostrzezenie
  } else {
    Log "[N1] wersja instalatora $env:SB_INSTALATOR_WERSJA - najnowsze wydanie na Dysku: $($mf.wersja)"
  }
}

function Invoke-StepN1 {
  Log "[N1] prerequisites check starting"
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Log "[N1] ERROR: winget not found on this machine. Install 'App Installer' from the Microsoft Store (https://aka.ms/getwinget), then re-run ENVI-SB-instalator.cmd."
    return
  }

  $installedAny = $false
  foreach ($tool in $N1Tools) {
    if (Test-N1ToolPresent $tool) {
      Log "[N1] $($tool.Name) ($($tool.Id)) already present - skip"
      continue
    }
    $target = "$($tool.Name) ($($tool.Id))"
    $action = 'winget install --id {0} --exact --silent --accept-package-agreements --accept-source-agreements' -f $tool.Id
    if ($PSCmdlet.ShouldProcess($target, $action)) {
      Log "[N1] installing $target ..."
      # R2 (poz. 11): okna zgody nie da sie sfotografowac (Windows je zaciemnia), wiec mowimy z gory.
      Log "[N1]   Windows moze teraz zapytac 'Czy chcesz zezwolic tej aplikacji na wprowadzanie zmian na urzadzeniu?' - to instalacja $($tool.Name), kliknij Tak."
      winget install --id $tool.Id --exact --silent --accept-package-agreements --accept-source-agreements
      if ($LASTEXITCODE -ne 0) {
        Log "[N1] WARNING: winget install for $target exited $LASTEXITCODE - check manually"
      } else {
        Log "[N1] $target installed"
        $installedAny = $true
      }
    }
  }

  if ($installedAny) { Sync-PathFromRegistry }

  # M4: sprawdzenie PO PROBIE, pelna sciezka - nie ufamy samemu "winget install exit 0".
  # Dwa miejsca, bo winget bez -Scope umie wybrac instalacje per-user (LOCALAPPDATA) albo
  # dla wszystkich (C:\Windows), w zaleznosci od maszyny - zmierzone przy pisaniu tego
  # checkpointu, nie zalozone. Serwer poczty (mcp\kylos-email\start.ps1) i krok P6 szukaja
  # tych samych dwoch miejsc.
  $script:PyLauncher = $null
  foreach ($kandydatPy in @((Join-Path $env:LOCALAPPDATA 'Programs\Python\Launcher\py.exe'), (Join-Path $env:WINDIR 'py.exe'))) {
    if (Test-Path -LiteralPath $kandydatPy) { $script:PyLauncher = $kandydatPy; break }
  }
  if ($script:PyLauncher) {
    Log "[N1] Python: launcher znaleziony ($script:PyLauncher)"
    foreach ($linia in @(& $script:PyLauncher '-0p' 2>&1)) { Log "[N1]   py -0p: $linia" }
  } else {
    # Brak Pythona po probie NIE jest bledem instalacji (decyzja planu poczty M4) - krok
    # P6 (serwer poczty) sam pomija rejestracje i mowi to samo w swoim logu.
    Log "[N1] Python nie znaleziony po probie instalacji - serwer poczty zostanie pominiety (P6 zglosi to osobno, to nie jest blad)."
  }

  # Google Drive: winget installs the client, but signing in to the account that owns the
  # skills folder is a manual step (N6 onboarding). Detect reachability only; never hard-fail.
  Resolve-SkillDriveRoot
  Test-WersjaInstalatora
  Log "[N1] prerequisites step done"
}

# -- B6: dostep, ktorego brakuje - instalator mowi co robic, otwiera strone i czeka --
function Test-GitHubLogin {
  param([string]$Login)
  return ($Login -match '^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$')
}

function New-SbPowiazanieUrl {
  param([string]$PsUrl, [string]$Login)
  if (-not (Test-GitHubLogin $Login)) { return $null }
  return ($PsUrl.TrimEnd('/') + '/#/sbInstaller?githubLogin=' + $Login)
}

function Test-OtworzPowiazanie {
  param($Stan, [string]$Login)
  return ((Test-GitHubLogin $Login) -and ($null -eq $Stan -or $Stan.sbPowiazanieLogin -ne $Login))
}

function Resolve-MembershipState {
  param([int]$ExitCode, [string]$Text)
  if ($ExitCode -eq 0) {
    $state = $Text.Trim()
    if ($state -eq 'active' -or $state -eq 'pending') { return $state.ToLowerInvariant() }
    return 'unknown'
  }
  if ($Text -match 'HTTP 404|"status":"404"') { return 'none' }
  return 'unknown'
}

function Get-PoradaGitHub {
  param([string]$Stan, [string]$Login, [string]$Org, [string]$LogInstalatora)
  if (-not $Login) { $Login = '(nieznany)' }
  $url = $null
  switch ($Stan) {
    'pending' {
      $kind = 'zaproszenie-czeka'
      $url = "https://github.com/orgs/$Org/invitation"
      $lines = @(
        "GitHub: na koncie $Login czeka zaproszenie do organizacji $Org - bez jego przyjecia instalator nie pobierze wiedzy firmowej."
        "  Otwieram strone zaproszenia: $url"
        "  Kliknij tam zielony przycisk 'Join $Org', potem wroc do tego okna."
      )
    }
    'none' {
      $kind = 'brak-zaproszenia'
      $lines = @(
        "GitHub: konto $Login nie ma dostepu do wiedzy firmowej, a GitHub nie widzi dla niego zaproszenia."
        "  Popros przelozonego o zaproszenie do SB w PS. Zaproszenie przyjdzie mailem od GitHuba na adres, ktorym logujesz sie do PS."
        "  Jesli taki mail juz masz: otworz go, kliknij 'Join' i zaloguj sie na GitHubie kontem Google, ktorym logujesz sie do PS."
        "  Jesli to nie jest wlasciwe konto GitHub, wyloguj je poleceniem: gh auth logout --hostname github.com  (potem uruchom instalator jeszcze raz)."
      )
    }
    'active' {
      $kind = 'czlonek-bez-repozytorium'
      $lines = @(
        "GitHub: konto $Login jest w organizacji $Org, ale repozytorium z wiedza firmowa jest nadal niedostepne."
        "  To wyglada na usterke po naszej stronie - wyslij plik $LogInstalatora wlascicielowi."
      )
    }
    default {
      $kind = 'blad-sprawdzenia'
      $lines = @(
        "GitHub: nie udalo sie sprawdzic dostepu (brak internetu albo GitHub chwilowo nie odpowiada)."
        "  Sprawdz polaczenie z internetem i nacisnij Enter, zeby sprobowac jeszcze raz."
      )
    }
  }
  return [pscustomobject]@{ Kind = $kind; Url = $url; Lines = [string[]]$lines }
}

function Get-PoradaDysk {
  param([bool]$AplikacjaZainstalowana, [bool]$DyskPodlaczony)
  $url = $null
  if (-not $AplikacjaZainstalowana) {
    $kind = 'dysk-brak-aplikacji'
    $url = 'https://www.google.com/drive/download/'
    $lines = @(
      "Dysk Google: aplikacja Dysk Google nie jest zainstalowana na tym komputerze."
      "  Pobierz ja i zainstaluj: https://www.google.com/drive/download/"
      "  Przy instalacji Windows zapyta 'Czy chcesz zezwolic tej aplikacji na wprowadzanie zmian na urzadzeniu?' - kliknij Tak."
      "  Potem zaloguj sie kontem, ktorym logujesz sie do PS, i wroc do tego okna. Ekran Google o 'Google Play' to zwykle ostrzezenie - kliknij 'Zaloguj sie'."
    )
  } elseif (-not $DyskPodlaczony) {
    $kind = 'dysk-niezalogowany'
    $lines = @(
      "Dysk Google: aplikacja nie jest jeszcze zalogowana (albo dysk sie nie podlaczyl)."
      "  1. W oknie Dysku Google zaloguj sie kontem, ktorym logujesz sie do PS (tym samym, co na GitHubie)."
      "  2. Poczekaj, az w Eksploratorze pojawi sie nowy dysk (zwykle G:)."
      "  Google moze pokazac ekran 'Upewnij sie, ze ta aplikacja zostala pobrana z Google Play' - to zwykle ostrzezenie przy logowaniu, kliknij 'Zaloguj sie'."
    )
  } else {
    $kind = 'dysk-bez-sb'
    $lines = @(
      "Dysk Google: jestes zalogowany, ale to konto nie widzi dysku wspolnego SB.ENVI, z ktorego instalator bierze narzedzia."
      "  To konto nie ma dostepu - uzyj konta, ktorym logujesz sie do PS: w aplikacji Dysk Google kliknij swoje zdjecie i wybierz 'Dodaj inne konto'."
      "  Jesli dostep dostales przed chwila, poczekaj minute i nacisnij Enter."
      "  Nadal nic? Popros przelozonego o zaproszenie do SB w PS - ono nadaje tez dostep do Dysku."
    )
  }
  return [pscustomobject]@{ Kind = $kind; Url = $url; Lines = [string[]]$lines }
}

function Get-GhLoginArgs {
  param([bool]$Schowek)
  $argsLogin = @('auth','login','--hostname','github.com','--git-protocol','https','--web')
  if ($Schowek) { $argsLogin += '--clipboard' }
  return $argsLogin
}

function Get-GhLoginIntro {
  param([bool]$Schowek)
  "GitHub: logowanie. Za chwile gh otworzy strone logowania w przegladarce."
  # R2 (poz. 14, 15, 17): kod wygasa po 15 minutach, schowek gubi go po zrzucie ekranu, a konto
  # zalozone przez Google potwierdza dostep kodem z maila - wszystko to zatrzymalo Agnieszke 07.10.
  "  Kod jest wazny 15 minut - przejdz ponizsze kroki od razu, bez przerwy."
  "  1. W tym oknie nacisnij Enter - gh pokaze kod jednorazowy i otworzy przegladarke."
  if ($Schowek) {
    "     Kod zostal skopiowany do schowka - wklej go na stronie GitHuba (Ctrl+V)."
    "     Jesli schowek go zgubil (np. po zrobieniu zrzutu ekranu), przepisz kod z tego okna - gh wypisuje go ponizej."
  }
  else { "     Przepisz kod ze strony ponizej na strone GitHuba." }
  "  2. Na stronie logowania wybierz 'Continue with Google' i zaloguj sie tym samym kontem Google, ktorym logujesz sie do PS. Nie potrzebujesz osobnego hasla do GitHuba; jesli nie masz jeszcze konta GitHub, ta opcja je zalozy - GitHub zapyta tylko o nazwe uzytkownika."
  "     GitHub moze poprosic o potwierdzenie mailem ('Confirm access' / 'Verify via email'): otworz poczte, przepisz kod z maila od GitHuba na te strone i idz dalej."
  "  3. Kliknij 'Authorize' i wroc do tego okna."
}

function Invoke-GhLogowanie {
  # R2/D6 (poz. 15, Agnieszka 07.10 13:37: expired_token, "logowanie sie nie udalo (kod 1)", a potem
  # N2b/N3 jak gdyby nigdy nic). Porazka = pytanie o ponowienie, nie ciche przejscie dalej.
  # Kontrakt -Zaloguj: uruchamia logowanie i zostawia kod wyjscia w $LASTEXITCODE. Wynik idzie do
  # $script:GhZalogowany, NIE na wyjscie funkcji: przechwycenie wyjscia (if (Invoke-...)) zabraloby
  # gh konsole, a gh auth login pyta tylko w konsoli. Do 0.14.13 gh szlo wprost do konsoli i to
  # dzialalo u ludzi - zostawiamy ten uklad (wariant z przechwyceniem nie mierzony).
  # Sprawdzian: TEST 31 (atrapy zamiast gh i Read-Host).
  param(
    [Parameter(Mandatory)][scriptblock]$Zaloguj,
    [scriptblock]$Czytaj = { param($pytanie) try { Read-Host $pytanie } catch { 'N' } },
    [int]$Max = 3
  )
  $script:GhZalogowany = $false
  for ($i = 1; $i -le $Max; $i++) {
    $global:LASTEXITCODE = 0
    & $Zaloguj
    $kod = $LASTEXITCODE
    if ($kod -eq 0) { $script:GhZalogowany = $true; return }
    Log "GitHub: logowanie sie nie udalo (kod $kod). Najczestsza przyczyna: kod wygasl - jest wazny 15 minut."
    if ($i -ge $Max) { break }
    $odpowiedz = & $Czytaj "Sprobowac jeszcze raz z nowym kodem? Enter = tak, N + Enter = pomin logowanie. Proba $i z $Max"
    if ("$odpowiedz".Trim() -match '^[nN]') { break }
  }
  Log "GitHub: logowanie pominiete - wiedza firmowa (kanon) nie zostanie pobrana w tym przebiegu. Uruchom ENVI-SB-instalator.cmd jeszcze raz, gdy bedziesz miec 15 minut na logowanie."
}

function Invoke-PetlaNaprawy {
  param(
    [Parameter(Mandatory)][scriptblock]$Sprawdz,
    [scriptblock]$Czytaj = { param($pytanie) try { Read-Host $pytanie } catch { 'S' } },
    [scriptblock]$Pokaz = { param($tekst) Log $tekst },
    [scriptblock]$Otworz = { param($url) Open-Url $url },
    [scriptblock]$PrzedPorada = $null,
    [int]$Max = 3
  )
  $porada = & $Sprawdz
  if ($null -eq $porada) { return [pscustomobject]@{ Wynik = 'ok'; Proby = 0; Porada = $null } }
  $otwarte = @()
  for ($i = 1; $i -le $Max; $i++) {
    if ($PrzedPorada) { $null = & $PrzedPorada $porada }
    foreach ($linia in @($porada.Lines)) { $null = & $Pokaz $linia }
    if ($porada.Url -and $otwarte -notcontains $porada.Url) {
      $null = & $Otworz $porada.Url
      $otwarte += $porada.Url
    }
    $odpowiedz = & $Czytaj "Enter = sprawdz ponownie, S + Enter = pomin ten krok. Proba $i z $Max"
    if ("$odpowiedz".Trim() -match '^[sS]') {
      return [pscustomobject]@{ Wynik = 'pominiete'; Proby = ($i - 1); Porada = $porada }
    }
    $porada = & $Sprawdz
    if ($null -eq $porada) { return [pscustomobject]@{ Wynik = 'ok'; Proby = $i; Porada = $null } }
  }
  return [pscustomobject]@{ Wynik = 'wyczerpane'; Proby = $Max; Porada = $porada }
}

function Open-Url {
  param([string]$Url)
  try { Start-Process $Url -ErrorAction Stop; return $true }
  catch { Log "Nie udalo sie otworzyc przegladarki - otworz recznie: $Url"; return $false }
}

function Test-GhClipboardSupport {
  try { return ((gh auth login --help 2>&1 | Out-String) -match '--clipboard') }
  catch { return $false }
}

function Test-RepoReachable {
  param([string]$Slug)
  if (-not $Slug -or -not (Get-Command gh -ErrorAction SilentlyContinue)) { return $false }
  try {
    $null = gh api "repos/$Slug" --jq .id 2>$null
    return ($LASTEXITCODE -eq 0)
  } catch { return $false }
}

function Get-GitHubMembershipState {
  param([string]$Org)
  try {
    $txt = (gh api "user/memberships/orgs/$Org" --jq .state 2>&1 | Out-String)
    return Resolve-MembershipState $LASTEXITCODE $txt
  } catch { return 'unknown' }
}

function Get-GitHubLogin {
  try {
    $txt = gh api user --jq .login 2>$null
    if ($LASTEXITCODE -ne 0) { return $null }
    $login = "$txt".Trim()
    if (Test-GitHubLogin $login) { return $login }
  } catch {}
  return $null
}

function Read-StanInstalatora {
  param([string]$Path)
  try {
    $stan = Get-Content -LiteralPath $Path -Raw -Encoding UTF8 -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
    if ($stan -is [pscustomobject]) { return $stan }
  } catch {}
  return [pscustomobject]@{}
}

function Save-StanInstalatora {
  param([string]$Path, $Stan)
  $parent = Split-Path -Parent $Path
  if ($parent) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  # JSON z \uXXXX zachowuje rowniez obce pola Unicode w czystym ASCII.
  $json = $Stan | ConvertTo-Json -Depth 20
  $json = [regex]::Replace($json, '[^\x00-\x7F]', { param($m) '\u{0:x4}' -f [int][char]$m.Value })
  Set-JsonFileNoBom -LiteralPath $Path -Content $json
}

function Test-DriveMounted {
  param([string[]]$KorzenieDyskow = (Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue).Root)
  foreach ($drive in $KorzenieDyskow) {
    foreach ($name in $DriveFsRootNames) {
      if (Test-Path -LiteralPath (Join-Path $drive $name)) { return $true }
    }
  }
  return $false
}

function Test-GoogleDriveInstalled {
  return ([bool](Get-Process 'GoogleDriveFS' -ErrorAction SilentlyContinue) -or
    (Test-Path -LiteralPath (Join-Path $env:ProgramFiles 'Google\Drive File Stream\launch.bat')))
}

function Invoke-DostepGitHub {
  param([string]$Slug, [string]$Login, [string]$Org, [switch]$PominPetle)
  $sprawdz = {
    if (Test-RepoReachable $Slug) { $null }
    else { Get-PoradaGitHub (Get-GitHubMembershipState $Org) $Login $Org $InstallLogFile }
  }
  if ($PominPetle) {
    $porada = & $sprawdz
    if ($null -eq $porada) { return 'ok' }
    foreach ($linia in @($porada.Lines)) { Log $linia }
    return 'sprawdzone-bez-petli'
  }
  $wynik = Invoke-PetlaNaprawy -Sprawdz $sprawdz
  if ($wynik.Wynik -eq 'wyczerpane') {
    Log "GitHub: nadal brak dostepu po 3 probach. Gdy dostaniesz zaproszenie, uruchom ENVI-SB-instalator.cmd jeszcze raz."
  } elseif ($wynik.Wynik -eq 'pominiete') {
    Log "GitHub: pominieto na Twoja prosbe. Uruchom ENVI-SB-instalator.cmd jeszcze raz, gdy dostep bedzie gotowy."
  }
  return $wynik.Wynik
}

function Invoke-SbPowiazanie {
  param([string]$Login, [string]$PsUrl, [string]$StanPath, [switch]$DryRun)
  $stan = Read-StanInstalatora $StanPath
  if (-not (Test-OtworzPowiazanie $stan $Login)) {
    Log "[GitHub] strona Second Brain w PS z powiazaniem konta byla juz otwarta dla $Login - pomijam"
    return
  }
  $url = New-SbPowiazanieUrl $PsUrl $Login
  if ($DryRun) { Log "(-WhatIf) otworzylbym $url"; return }
  Log "GitHub: zalogowano jako $Login. Otwieram strone Second Brain w PS - zaloguj sie tam kontem Google, kliknij 'To moje konto' (PS dowie sie, ktore konto GitHub jest Twoje) i przeczytaj tam krotka instrukcje wylaczenia trenowania AI na koncie GitHub."
  Log "  Gdyby strona sie nie otworzyla, wejdz recznie: $url"
  if (Open-Url $url) {
    $stan | Add-Member -NotePropertyName sbPowiazanieLogin -NotePropertyValue $Login -Force
    $stan | Add-Member -NotePropertyName sbPowiazanieCzas -NotePropertyValue (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') -Force
    Save-StanInstalatora $StanPath $stan
  }
}

# -- N2: auth + read-only canon (repo A) clone, idempotent --
# Brak uprawnien wymaga dzialania czlowieka; kolejny clone nie naprawi zaproszenia.
# $VaultPath is cloned into DIRECTLY (not into a "40_wiki" subfolder of it) - repo A's own
# tracked tree already contains 40_wiki/, _index.md, CLAUDE.md and .gitignore at its root,
# so cloning it here IS what produces $VaultPath\40_wiki. N2b (below) adds repo B as a
# nested clone inside this same $VaultPath, which repo A's own .gitignore (`/*` with a
# `!40_wiki/` exception) already treats as ordinary untracked content - confirmed by reading
# the real .gitignore of ENVI.SB and by `git ls-files` on the owner's own live vault, not
# assumed.
function Test-GhAuthenticated {
  # non-mutating: read-only status query, safe under -WhatIf
  gh auth status *> $null
  return ($LASTEXITCODE -eq 0)
}

function Get-RepoSlugFromUrl {
  # non-mutating: pure string parsing, safe under -WhatIf. Derives "owner/repo" from an
  # https://github.com/... .git URL instead of typing it a second time (D2: role/push-state
  # must follow $RepoUrl / $ProjectsRepoUrl, not a name hardcoded again next to them).
  param([string]$Url)
  if ($Url -match 'github\.com[:/]+(?<slug>[^/]+/[^/]+?)(\.git)?/?$') {
    return $Matches.slug
  }
  return $null
}

function Test-RepoPushPermission {
  # non-mutating: read-only `gh api` query, safe under -WhatIf. Returns $true ONLY when the
  # server explicitly reports push:true for the currently logged-in account; every other
  # outcome (404 = no access, gh missing, offline, malformed slug, non-zero exit) returns
  # $false - the fail-safe direction D1/D2 require (a missing sync or a still-locked canon is
  # one re-run away from fixed; a wrongly-lifted push block or an unwanted clone is not).
  param([string]$Slug)
  if (-not $Slug) { return $false }
  if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { return $false }
  $out = gh api "repos/$Slug" --jq '.permissions.push' 2>$null
  if ($LASTEXITCODE -ne 0) { return $false }
  return ("$out".Trim() -eq 'true')
}

function Resolve-InstallRole {
  # Non-mutating: reads config ($Role, $ProjectsClonePath, $ProjectsRepoUrl) and does
  # read-only checks only (Test-Path, gh api) - safe under -WhatIf, never mutates anything.
  # Priority order (D2, T6 checkpoint - do not reopen without a new owner decision):
  #   1. explicit $Role in bootstrap.config.ps1 ('consumer' | 'team') always wins.
  #   2. an existing clone of repo B is treated as proof of team membership: a transient
  #      network hiccup on a later run must not degrade an already-granted member back to
  #      consumer and orphan their own project area.
  #   3. gh api repos/<repo B slug> --jq .permissions.push == 'true' -> team.
  #   4. anything else (404, no gh, offline, push:false) -> consumer.
  # NOTE: this decides ONLY the repo-B (project area + sync) role. It is deliberately
  # independent of the repo-A (canon) push-lock decided in Invoke-StepN2 below (D1) - role
  # never lifts the canon block, only the server's own permissions.push does.
  if ($Role -eq 'consumer' -or $Role -eq 'team') {
    return [pscustomobject]@{ Role = $Role; Reason = "jawna konfiguracja w bootstrap.config.ps1 (`$Role = '$Role')" }
  }
  if (Test-Path -LiteralPath (Join-Path $ProjectsClonePath '.git')) {
    return [pscustomobject]@{ Role = 'team'; Reason = "istniejacy klon obszaru projektowego w $ProjectsClonePath" }
  }
  $slug = Get-RepoSlugFromUrl -Url $ProjectsRepoUrl
  if (Test-RepoPushPermission -Slug $slug) {
    $suffix = if ($slug) { " ($slug)" } else { '' }
    return [pscustomobject]@{ Role = 'team'; Reason = "GitHub potwierdza prawo zapisu do obszaru projektowego$suffix" }
  }
  return [pscustomobject]@{ Role = 'consumer'; Reason = 'brak potwierdzonego prawa zapisu do obszaru projektowego (repo niedostepne, gh niedostepny albo offline)' }
}

function Move-FolderBezGit {
  # R1/D4 (proba u Agnieszki 2026-10-07): folder kanonu zostal po przerwanym przebiegu bez .git,
  # a git nie klonuje do niepustego katalogu (kod 128). Przenosimy go pod nowa nazwe - NIGDY
  # nie kasujemy (moga tam lezec notatki czlowieka). Zwraca $true, gdy sciezka jest wolna.
  param([string]$Sciezka)
  $cel = '{0}-stary-{1}' -f $Sciezka.TrimEnd('\'), (Get-Date -Format 'yyyy-MM-dd-HHmm')
  if (Test-Path -LiteralPath $cel) {
    Log "[N2] folder '$Sciezka' nie ma klonu (.git), a miejsce '$cel' jest zajete - nic nie przenosze; uruchom ENVI-SB-instalator.cmd jeszcze raz za minute."
    return $false
  }
  try {
    Move-Item -LiteralPath $Sciezka -Destination $cel -ErrorAction Stop
  } catch {
    Log "[N2] folder '$Sciezka' nie ma klonu (.git) i nie dal sie przeniesc ($($_.Exception.Message)). Zamknij Obsidiana i okna Eksploratora w tym folderze, potem uruchom ENVI-SB-instalator.cmd jeszcze raz."
    return $false
  }
  Log "[N2] folder '$Sciezka' nie mial klonu (.git) - przeniesiony na '$cel' (nic nie skasowane), klonuje od nowa"
  return $true
}

function Invoke-KlonKanonu {
  # Klon kanonu do $VaultPath; folder bez .git najpierw przenosi (Move-FolderBezGit). Pusty
  # katalog zostaje - git klonuje do pustego bez bledu. Zwraca $true tylko przy udanym klonie.
  $target = $VaultPath
  $action = "git clone --config core.longpaths=true $RepoUrl $VaultPath"
  if (-not $PSCmdlet.ShouldProcess($target, $action)) { return $false }
  if ((Test-Path -LiteralPath $VaultPath) -and @(Get-ChildItem -LiteralPath $VaultPath -Force -ErrorAction SilentlyContinue).Count -gt 0) {
    if (-not (Move-FolderBezGit -Sciezka $VaultPath)) { return $false }
  }
  Log "[N2] no clone at $VaultPath - git clone $RepoUrl"
  # --config (not -c): it is written into the NEW repo's config before checkout, so it
  # covers both the initial checkout AND every later git call in that clone. Measured
  # 2026-08-08 on a 131-char destination path: without it `git clone` dies with
  # "cannot create directory ... Filename too long" (exit 128) and leaves a half-checked-out
  # tree; with it the clone completes and `git status` reports zero long-path warnings.
  # Not hypothetical - the owner's own repo-B tree already loses 7 directories this way.
  # The default $VaultPath is short enough today, so this is insurance against a long
  # Windows username or a redirected profile, not a fix for a live failure.
  git clone --config core.longpaths=true $RepoUrl $VaultPath
  if ($LASTEXITCODE -ne 0) {
    Log "[N2] Nie udalo sie pobrac kanonu (kod $LASTEXITCODE). Szczegoly w pliku $InstallLogFile - uruchom ENVI-SB-instalator.cmd jeszcze raz po sprawdzeniu dostepu."
    return $false
  }
  return $true
}

function Invoke-StepN2 {
  Log "[N2] auth+clone step starting"

  if (Test-GhAuthenticated) {
    Log "[N2] gh already authenticated - skip login"
  } else {
    $target = 'gh auth (device-flow, https)'
    $czySchowek = Test-GhClipboardSupport
    $action = 'gh ' + ((Get-GhLoginArgs $czySchowek) -join ' ') + '; gh auth setup-git'
    if ($PSCmdlet.ShouldProcess($target, $action)) {
      Invoke-GhLogowanie -Zaloguj {
        foreach ($linia in @(Get-GhLoginIntro $czySchowek)) { Log $linia }
        & gh @(Get-GhLoginArgs $czySchowek)
      }
      if (-not $script:GhZalogowany) { return }
      gh auth setup-git
      Log "[N2] gh auth login done, git credential helper configured"
    }
  }

  if (Test-GhAuthenticated) {
    $canonSlug = Get-RepoSlugFromUrl -Url $RepoUrl
    $org = $canonSlug -split '/' | Select-Object -First 1
    $login = Get-GitHubLogin
    if (-not (Test-Path -LiteralPath (Join-Path $VaultPath '.git'))) {
      $dostep = Invoke-DostepGitHub -Slug $canonSlug -Login $login -Org $org -PominPetle:$WhatIfPreference
      if ($dostep -ne 'ok' -and -not $WhatIfPreference) {
        Log "[N2] kanon niepobrany - brak dostepu do GitHuba (patrz wyzej). Reszta instalacji idzie dalej; po zalogowaniu/zaproszeniu uruchom ENVI-SB-instalator.cmd jeszcze raz."
        return
      }
      $osiagalne = $dostep -eq 'ok'
    } else {
      $osiagalne = Test-RepoReachable $canonSlug
      if (-not $osiagalne) {
        Log "[N2] GitHub: nie potwierdzono dostepu do kanonu. Sprawdz internet; jesli GitHub odmawia dostepu, popros przelozonego o zaproszenie do SB w PS i przyjmij je tym samym kontem."
      }
    }
    if ($osiagalne -and (Test-GitHubLogin $login)) {
      Invoke-SbPowiazanie -Login $login -PsUrl $PsUrl -StanPath $StanInstalatora -DryRun:$WhatIfPreference
    }
  }

  $gitDir = Join-Path $VaultPath '.git'
  if (Test-Path -LiteralPath $gitDir) {
    $target = $VaultPath
    $action = "git -C $VaultPath pull --ff-only"
    if ($PSCmdlet.ShouldProcess($target, $action)) {
      Log "[N2] existing clone found at $VaultPath - pull --ff-only"
      git -C $VaultPath pull --ff-only
      if ($LASTEXITCODE -ne 0) {
        Log "[N2] WARNING: pull --ff-only failed (exit $LASTEXITCODE) - clone left untouched (dirty/diverged?)"
      }
    }
  } else {
    # -WhatIf: Invoke-KlonKanonu tylko opisuje klon i zwraca $false - przebieg na sucho idzie dalej.
    if (-not (Invoke-KlonKanonu) -and -not $WhatIfPreference) { return }
  }

  if (Test-Path -LiteralPath $gitDir) {
    # D1 (T6, sprostowanie 2026-08-08): role never lifts this block. Only the SERVER's own
    # permissions.push for the logged-in account does - that is the one axis, perpendicular
    # to consumer/team, that keeps "dodanie osoby pisza cej kanon = zmiana uprawnien w
    # organizacji GitHub" true without ever touching this installer again.
    $canonSlug = Get-RepoSlugFromUrl -Url $RepoUrl
    $canonWritable = Test-RepoPushPermission -Slug $canonSlug
    $currentPushUrl = (git -C $VaultPath remote get-url --push origin 2>$null)
    if ($canonWritable) {
      if ($currentPushUrl -eq 'DISABLED') {
        $target = "$VaultPath (origin push URL)"
        $action = "git remote set-url --push origin $RepoUrl"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
          git -C $VaultPath remote set-url --push origin $RepoUrl
          Log "[N2] GitHub potwierdza prawo zapisu do kanonu ($canonSlug) - zdejmuje wczesniej ustawiona blokade pushu"
        }
      } else {
        Log "[N2] GitHub potwierdza prawo zapisu do kanonu ($canonSlug) - blokada pushu nie jest zakladana"
      }
    } else {
      $target = "$VaultPath (origin push URL)"
      $action = 'git remote set-url --push origin DISABLED'
      if ($PSCmdlet.ShouldProcess($target, $action)) {
        git -C $VaultPath remote set-url --push origin DISABLED
        Log "[N2] brak potwierdzonego prawa zapisu do kanonu (repo niedostepne, push:false albo gh niedostepny) - push zablokowany klientowo (idempotent re-assert)"
      }
    }

    $branches = git -C $VaultPath branch -r 2>$null
    $nonMain = $branches | Where-Object { $_ -and ($_ -notmatch 'origin/main$') -and ($_ -notmatch 'origin/HEAD') }
    if ($nonMain) {
      Log "[N2] WARNING: remote branches other than main are tracked: $($nonMain -join ', ')"
    } else {
      Log "[N2] verified: only main tracked"
    }
  } else {
    Log "[N2] clone path not present this run (dry-run or clone skipped) - push-hardening + branch verification deferred to next run"
  }

  $script:InstallRoleResult = Resolve-InstallRole
  $roleLabel = if ($script:InstallRoleResult.Role -eq 'team') { 'czlonek zespolu' } else { 'konsument' }
  Log ("rola: {0} - {1}" -f $roleLabel, $script:InstallRoleResult.Reason)

  Log "[N2] auth+clone step done"
}

# -- N2b: projects repo (repo B) clone, idempotent, added in T3, made role-conditional in T6 --
# ponytail: clone-only-if-missing, nothing else. T3's job was layout + first clone; the
# rebase/conflict/push-failure sync CONTRACT (pull --rebase, abort-and-notify, push-failure
# handling) is checkpoint T4's, and role gating is T6's - both already exist by the time this
# runs. Auto-pulling here on every run would risk silently rewriting a team member's
# uncommitted local edits - worse than doing nothing. So: clone once, then leave the
# directory alone on every later run.
# T6: only role 'team' gets repo B - a 'consumer' has no project area at all (D2). Reads
# $script:InstallRoleResult set by Invoke-StepN2 (Resolve-InstallRole); if N2 was somehow
# skipped this run, falls back to the safe default (consumer, no clone).
function Invoke-StepN2b {
  Log "[N2b] projects repo (repo B) clone step starting"
  $role = if ($script:InstallRoleResult) { $script:InstallRoleResult.Role } else { 'consumer' }
  if ($role -ne 'team') {
    Log "[N2b] rola: konsument - obszar projektowy nie dotyczy tej roli, nic nie robie"
    Log "[N2b] projects repo clone step done"
    return
  }
  $gitDir = Join-Path $ProjectsClonePath '.git'
  if (Test-Path -LiteralPath $gitDir) {
    Log "[N2b] projects repo already cloned at $ProjectsClonePath - left untouched (bidirectional sync handled by N3b/project-sync.ps1, not here)"
  } else {
    $target = $ProjectsClonePath
    $action = "git clone --config core.longpaths=true $ProjectsRepoUrl $ProjectsClonePath"
    if ($PSCmdlet.ShouldProcess($target, $action)) {
      Log "[N2b] no projects clone at $ProjectsClonePath - git clone $ProjectsRepoUrl"
      # See the identical flag in Invoke-StepN2 for the measurement. It matters MORE here:
      # repo B is the one carrying the long Kontrakty/ paths, and it is also the repo the
      # sync engine runs `git add -A` over every hour - persisting core.longpaths in the clone
      # is what stops that hourly run from silently skipping directories it cannot open.
      git clone --config core.longpaths=true $ProjectsRepoUrl $ProjectsClonePath
      if ($LASTEXITCODE -ne 0) {
        Log "[N2b] ERROR: git clone failed (exit $LASTEXITCODE) - aborting N2b"
      } else {
        Log "[N2b] projects repo cloned - write access, no push hardening (this is the writable team area)"
      }
    }
  }
  Log "[N2b] projects repo clone step done"
}

# -- N3: scheduled auto-pull, git invisible, idempotent --
# ponytail: schtasks.exe, not the ScheduledTasks module. Verified by probe on this machine:
# Register-ScheduledTask AND `schtasks /sc ONLOGON` both fail "Access is denied" for a
# non-admin user (Task Scheduler treats boot/logon triggers as privileged); plain time-based
# schedules (HOURLY etc.) via schtasks.exe do not need elevation. Employee laptops are not
# assumed to be local-admin, so: periodic pull = schtasks HOURLY (no admin needed, /f =
# idempotent overwrite, no duplicate); "at logon" = a per-user Startup-folder shortcut
# (WScript.Shell - same mechanism N4 reuses for the Obsidian shortcut), which is the
# standard non-admin way to run something at logon. Both are hidden via
# `-WindowStyle Hidden` on the powershell.exe target, so no console ever flashes. Ceiling:
# if a future install path is guaranteed elevated, collapse back to one
# Register-ScheduledTask with two triggers.
function Set-ZadanieChodziNaBaterii {
  # schtasks.exe NIE MA przelacznika na te trzy ustawienia, a jego domysly brzmia:
  # nie startuj na baterii, przerwij gdy laptop na nia przejdzie, nie nadrabiaj przegapionego
  # przebiegu. Zmierzone 2026-08-27 na wszystkich trzech zadaniach na maszynie wlasciciela -
  # nikt tego nie wybieral, tak po prostu wychodzi. U kogos, kto pracuje na laptopie bez
  # zasilacza, oznacza to, ze SYNCHRONIZACJA NIE CHODZI WCALE.
  #
  # PULAPKA, ZMIERZONA, NIE ZALOZONA: instalator swiadomie omija Register-ScheduledTask, bo ten
  # wymaga administratora - ale Set-ScheduledTask na JUZ ISTNIEJACYM zadaniu tego uzytkownika
  # dziala BEZ podniesienia uprawnien. Sprawdzone 2026-08-27 na zadaniu jednorazowym, na koncie
  # bez uprawnien administratora: True/True/False -> False/False/True. Stad ta droga.
  #
  # Porazka jest LOGOWANA, NIE RZUCANA: laptop bez tej poprawki dziala dalej (gorzej, ale
  # dziala), a instalacja przerwana w polowie zostawia czlowieka z niczym.
  param([string]$Nazwa)
  try {
    $z = Get-ScheduledTask -TaskName $Nazwa -ErrorAction Stop
    $z.Settings.DisallowStartIfOnBatteries = $false
    $z.Settings.StopIfGoingOnBatteries     = $false
    $z.Settings.StartWhenAvailable         = $true
    Set-ScheduledTask -InputObject $z -ErrorAction Stop | Out-Null
    Log "[bateria] '$Nazwa' chodzi teraz takze na samej baterii i nadrabia przegapiony przebieg"
  } catch {
    Log "[bateria] NIE UDALO SIE zdjac ustawien bateryjnych z '$Nazwa' ($($_.Exception.Message)). Na samej baterii to zadanie NIE BEDZIE chodzic."
  }
}

function Get-ZapowiedzAntywirusa {
  # R2 (poz. 16, Agnieszka 07.10): RAV Endpoint Protection zatrzymal schtasks.exe /create oknem
  # "Wykryto podejrzany proces" (Zablokuj / Wznow). Spotkane dotad: Avast (kwarantanna plikow),
  # RAV Endpoint Protection (zakladanie zadania).
  param([string]$Krok)
  return "[$Krok]   Antywirus moze teraz pokazac okno w rodzaju 'Wykryto podejrzany proces' przy schtasks.exe - to ten instalator zaklada zadanie w harmonogramie Windows. Wybierz 'Wznow' albo 'Zezwol'."
}

function Register-ZadanieCogodzinne {
  # R1/D3 (proba u Agnieszki Brodziak 2026-10-07): przy spacji w profilu ("C:\Users\Agnieszka
  # Brodziak") schtasks odrzucal /tr - "Invalid argument/option - 'Brodziak\.envi\kanon-pull.ps1'".
  # PowerShell 5.1 obejmuje argument ze spacja cudzyslowem, ale cudzyslowow W SRODKU nie
  # zabezpiecza, wiec schtasks widzial koniec /tr przed sciezka. schtasks wymaga \" wewnatrz /tr.
  # Wiersz polecen skladamy tu sami (Process, nie `& schtasks`), zeby wynik nie zalezal od tego,
  # jak dana wersja PowerShella przekazuje argumenty (7.3+ robi to inaczej niz 5.1).
  # Sprawdzian: TEST 22 (prawdziwe zadanie przy sciezce ze spacja).
  param([string]$Nazwa, [string]$Polecenie, [int]$CoGodzin)
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = Join-Path ([Environment]::SystemDirectory) 'schtasks.exe'
  $psi.Arguments = '/create /tn "{0}" /tr "{1}" /sc HOURLY /mo {2} /f' -f $Nazwa, $Polecenie.Replace('"', '\"'), $CoGodzin
  $psi.UseShellExecute = $false; $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true; $psi.RedirectStandardError = $true
  $p = [System.Diagnostics.Process]::Start($psi)
  $wy = $p.StandardOutput.ReadToEnd() + $p.StandardError.ReadToEnd()
  $p.WaitForExit()
  return [pscustomobject]@{ Kod = $p.ExitCode; Wyjscie = $wy.Trim() }
}

function Write-N3PullLauncher {
  # ponytail: point schtasks /tr and the Startup shortcut at a one-line -File launcher rather
  # than an inline -Command. The old inline `-Command "New-Item -ItemType Directory ..."`
  # carried its own nested quotes+spaces, and schtasks re-parsed the embedded `-ItemType` as
  # one of ITS options -> "Invalid argument/option - '-ItemType'", task create exit
  # -2147467259. With -File the only quoted token is a single file path, which round-trips
  # cleanly (verified under PS 5.1). The .envi mkdir moved INTO the launcher and guarded on
  # the clone existing, so a pre-clone run never pre-creates $VaultPath and blocks N2's clone.
  # A space in the Windows username DOES happen (Agnieszka Brodziak, 2026-10-07) - the inner
  # quotes of /tr are escaped in Register-ZadanieCogodzinne.
  param([string]$Path)
  $body = @(
    # B3: jedna linia, ktora zdejmuje cala klase awarii "zadanie w tle wisi w nieskonczonosc":
    # bez niej git przy wygaslych poswiadczeniach czeka na wpisanie hasla, ktorego w ukrytym
    # oknie nikt nie wpisze. Z nia git konczy sie bledem, ktory ladnie w logu.
    "`$env:GIT_TERMINAL_PROMPT = '0'"
    # Menedzer poswiadczen Gita (GCM) wystawia WLASNE okno logowania i o GIT_TERMINAL_PROMPT
    # nie wie - w ukrytym zadaniu nikt go nie zobaczy, wiec proces wisi (zmierzone w Z8).
    "`$env:GCM_INTERACTIVE = 'never'"
    "if (-not (Test-Path -LiteralPath '$VaultPath\.git')) { return }"
    "New-Item -ItemType Directory -Force -Path '$VaultPath\.envi' | Out-Null"
    "git -C '$VaultPath' pull --ff-only *>> '$LogFile'"
  ) -join "`r`n"
  $dir = Split-Path $Path -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  Set-JsonFileNoBom -LiteralPath $Path -Content ($body + "`r`n")   # reused BOM-less text writer
}

function Invoke-StepN3 {
  Log "[N3] scheduled auto-pull step starting"
  # -ExecutionPolicy Bypass: na swiezym Windows 11 zasada wykonywania to Restricted, wiec
  # `powershell.exe -File launcher.ps1` konczy sie kodem 1 i zadanie jest martwe (zmierzone
  # 2026-09-08). Ten sam wzorzec ma juz skrot ikony w N3b. Bypass nie wnosi cudzyslowow,
  # wiec re-parsowanie `schtasks /tr` (patrz komentarz przy Write-N3PullLauncher) zostaje bez zmian.
  $launcherArgs = '-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $PullLauncher
  $trCmd = "powershell.exe $launcherArgs"

  if ($PSCmdlet.ShouldProcess($PullLauncher, 'write hidden git-pull launcher script')) {
    Write-N3PullLauncher -Path $PullLauncher
    Log "[N3] pull launcher written: $PullLauncher"
  }

  # Periodic pull: schtasks.exe HOURLY trigger, non-elevated, /f = idempotent overwrite
  $action = "schtasks /create /tn $TaskName /tr <hidden -File pull launcher> /sc HOURLY /mo $PullEveryHours /f"
  if ($PSCmdlet.ShouldProcess($TaskName, $action)) {
    Log "[N3] registering periodic task '$TaskName' (every ${PullEveryHours}h, hidden, user context, no stored password)"
    Log (Get-ZapowiedzAntywirusa -Krok 'N3')
    $zad = Register-ZadanieCogodzinne -Nazwa $TaskName -Polecenie $trCmd -CoGodzin $PullEveryHours
    if ($zad.Kod -ne 0) {
      Log "[N3] ERROR: schtasks /create for '$TaskName' failed (exit $($zad.Kod)): $($zad.Wyjscie)"
    } else {
      Log "[N3] periodic task '$TaskName' registered/updated (idempotent via /f)"
      Set-ZadanieChodziNaBaterii -Nazwa $TaskName
    }
  }

  # At-logon pull: per-user Startup-folder shortcut - avoids the admin-only ONLOGON trigger
  $startupDir = [Environment]::GetFolderPath('Startup')
  $lnkPath = Join-Path $startupDir "$TaskName.lnk"
  if ($PSCmdlet.ShouldProcess($lnkPath, 'create/update at-logon Startup shortcut running the pull launcher')) {
    $wsh = New-Object -ComObject WScript.Shell
    $sc = $wsh.CreateShortcut($lnkPath)
    $sc.TargetPath = 'powershell.exe'
    $sc.Arguments = $launcherArgs
    $sc.WindowStyle = 7
    $sc.Description = 'ENVI.SB canon: hidden git pull --ff-only (at logon)'
    $sc.Save()
    Log "[N3] at-logon shortcut written: $lnkPath"
  }

  # P2: rola 'konsument' nie ma obszaru projektowego, wiec JEDYNYM jej pierwszym przebiegiem
  # jest pobranie kanonu. Team dostaje swoj pierwszy przebieg w N3b (silnik).
  $roleN3 = if ($script:InstallRoleResult) { $script:InstallRoleResult.Role } else { 'consumer' }
  # R1/D4: bez klonu launcher konczy sie po cichu kodem 0 i log mowil "zakonczone (kod 0)",
  # choc kanonu nie bylo (Agnieszka 2026-10-07). Bez .git pobrania nie uruchamiamy i mowimy prawde.
  if ($roleN3 -ne 'team' -and -not (Test-Path -LiteralPath (Join-Path $VaultPath '.git'))) {
    Log "[N3] kanon niepobrany - w '$VaultPath' nie ma klonu (patrz krok N2 wyzej), wiec pierwszego pobrania nie uruchamiam. Uruchom ENVI-SB-instalator.cmd jeszcze raz."
  } elseif ($roleN3 -ne 'team' -and $PSCmdlet.ShouldProcess($PullLauncher, 'uruchom pobranie kanonu raz, synchronicznie')) {
    Log "[N3] pierwsze pobranie kanonu - startuje i czekam"
    $wynikPull = Wait-ProcesBezPytaniaOHaslo -Argumenty @('-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $PullLauncher))
    Log ("[N3] pierwsze pobranie kanonu zakonczone ({0})" -f $wynikPull)
  }

  Log "[N3] scheduled auto-pull step done"
}

# -- B3: uruchomienie procesu, ktory NIE MA PRAWA wisiec na pytaniu o haslo --
function Wait-ProcesBezPytaniaOHaslo {
  # Pierwsze pobranie kanonu i pierwszy przebieg silnika wolaja gita w UKRYTYM oknie. Gdy
  # poswiadczenia wygasly, git czeka na haslo, ktorego nikt tam nie wpisze - proces stoi do
  # konca limitu, a instalator do 2026-09-09 czytal potem ExitCode ZYWEGO procesu i pisal
  # do logu "(kod )", czyli nic. Trzy rzeczy naraz: zmienne srodowiskowe, ktore proces
  # potomny dziedziczy i przez ktore git konczy sie bledem zamiast pytac; ubicie WYLACZNIE
  # tego jednego procesu po numerze, gdy limit minie; i zdanie w logu, ktore mowi prawde.
  param([string[]]$Argumenty, [int]$LimitSek = 300)
  $stare = @{}
  foreach ($n in @('GIT_TERMINAL_PROMPT', 'GCM_INTERACTIVE')) { $stare[$n] = [Environment]::GetEnvironmentVariable($n) }
  $env:GIT_TERMINAL_PROMPT = '0'
  $env:GCM_INTERACTIVE = 'never'
  try {
    $p = Start-Process -FilePath 'powershell.exe' -ArgumentList $Argumenty -WindowStyle Hidden -PassThru
    $p | Wait-Process -Timeout $LimitSek -ErrorAction SilentlyContinue
    if (-not $p.HasExited) {
      # Drzewo, nie jeden proces: pod powershell.exe siedza git.exe, git-remote-https i GCM,
      # a Stop-Process zabija wylacznie rodzica i zostawia wnuki wiszace na oknie hasla.
      & taskkill.exe /PID $p.Id /T /F 2>&1 | Out-Null
      return ("przerwano po {0} s" -f $LimitSek)
    }
    return ("kod {0}" -f $p.ExitCode)
  } finally {
    foreach ($n in @($stare.Keys)) { [Environment]::SetEnvironmentVariable($n, $stare[$n]) }
  }
}

# -- P2: dwa odczyty, z ktorych zyje podsumowanie. Oba pytaja SYSTEM, nie instalator. --
function Test-RezydentDziala {
  # Fakt = proces powershell, ktorego wiersz polecenia nazywa TEN plik rezydenta. Sciezka
  # jednoznaczna, wiec piaskownica ze swoja kopia nie widzi rezydenta produkcyjnego i odwrotnie.
  param([string]$TrayPath)
  try {
    return [bool](@(Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction Stop |
      Where-Object { $_.CommandLine -and $_.CommandLine.IndexOf($TrayPath, [StringComparison]::OrdinalIgnoreCase) -ge 0 }).Count)
  } catch { return $false }
}
function Get-StanPrzebiegu {
  # B3a: pole 'zapisano' jest stemplem POCZATKU przebiegu - silnik zapisuje stan zaraz po
  # starcie (project-sync.ps1, Write-State -Faza 'zainicjowana'), wiec sama ta godzina NIE
  # mowi, ze przebieg sie udal. Faze oddajemy razem z godzina i to wyzej decyduje, co
  # pokazac czlowiekowi. Brak pliku = nie bylo przebiegu.
  param([string]$StatePath)
  if (-not (Test-Path -LiteralPath $StatePath -PathType Leaf)) { return $null }
  $s = $null
  try { $s = Get-Content -LiteralPath $StatePath -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return $null }
  if (-not $s) { return $null }
  return @{ Czas = [string]$s.zapisano; Faza = [string]$s.faza; Opis = [string]$s.faza_opis }
}

function Get-StanCzas {
  # Godzina przebiegu WYLACZNIE dla stanu koncowego 'udana'. Kazda inna faza to przebieg,
  # ktory sie nie zakonczyl, i wtedy godzina bylaby nieprawda w miejscu, ktore ma ja mowic.
  param([string]$StatePath)
  $s = Get-StanPrzebiegu -StatePath $StatePath
  if ($s -and $s.Faza -eq 'udana') { return $s.Czas }
  return $null
}

# -- N3b: project-area sync (repo B), team role only, idempotent, added in T6 --
# D3: the runtime copy of the sync engine must live OUTSIDE repo B, at $SyncEnginePath - never
# executed from inside the repo it synchronizes. See project-sync.ps1's own header comment for
# the full argument (a repo-B write access would otherwise become a code-distribution channel
# executed under every OTHER member's credentials on their own scheduled cycle). Copying the
# engine here, on every run, IS the review gate an engine change has to pass before it can run
# unattended - the same reasoning N3's Write-N3PullLauncher already applies to kanon-pull.ps1.
#
# N4 (2026-08-21) ZMIENIA ZRODLO, NIE TE ZASADE: rdzen nie przyjezdza juz z klonu repo B,
# tylko z paczki na Dysku wspoldzielonym (D-2). Powod rozstrzygajacy: repo B jest ta sama
# droga, ktora silnik sam obsluguje, wiec blad blokujacy synchronizacje blokowal takze
# dostarczenie wlasnej poprawki. Bramka przegladu przenosi sie razem ze zrodlem: od teraz
# jest nia swiadome wydanie (tooling/release/build-core-package.ps1), a nie sam commit.
# Rdzen to DWA pliki: silnik i rezydent ikony, ktorego silnik szuka obok siebie.
function Copy-SyncEngine {
  # non-mutating helper body (the actual write happens under the caller's ShouldProcess).
  param([string]$SourcePath, [string]$DestPath)
  $destDir = Split-Path $DestPath -Parent
  if (-not (Test-Path -LiteralPath $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }
  Copy-Item -LiteralPath $SourcePath -Destination $DestPath -Force
}

function Get-Sha256Pliku {
  # Suma liczona .NET-em, nie Get-FileHash, i to jest celowe: pod -WhatIf Get-FileHash
  # zwraca $null (zmierzone), a wtedy suchy przebieg wywala sie na policzeniu sumy
  # zamiast ja pokazac. Ta postac nie zna pojecia -WhatIf, bo niczego nie zapisuje.
  param([string]$Path)
  $bajty = [System.IO.File]::ReadAllBytes($Path)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash($bajty)) -replace '-', '').ToLower() }
  finally { $sha.Dispose() }
}

function Get-RdzenManifest {
  # non-mutating: sam odczyt, bezpieczne pod -WhatIf. Zwraca $null zamiast rzucac -
  # brak Dysku nie jest awaria instalacji, tylko krokiem do powtorzenia (jak w N5).
  param([string]$CoreRoot)
  $mf = Join-Path $CoreRoot 'rdzen-manifest.json'
  if (-not (Test-Path -LiteralPath $mf)) { return $null }
  try { return (Get-Content -LiteralPath $mf -Raw | ConvertFrom-Json) }
  catch { Log "[N3b] manifest rdzenia jest nieczytelny ($mf): $($_.Exception.Message)"; return $null }
}

function Expand-RdzenPaczka {
  # Sprawdza sume kontrolna PRZED rozpakowaniem i zwraca katalog z rozpakowanym rdzeniem
  # albo $null. Dysk nie gwarantuje kompletnosci pliku - kopiuje sie w tle i potrafi byc
  # obciety - a paczka niekompletna ma sie NIE zainstalowac; to jest cala ta funkcja.
  # Cala ta funkcja jest wyjeta spod -WhatIf, i to nie jest obejscie kontroli: pracuje
  # wylacznie w jednorazowym katalogu w TEMP, a bez tego suchy przebieg nie doszedlby
  # nawet do sprawdzenia sumy - czyli do jedynej rzeczy, dla ktorej suchy przebieg warto
  # uruchamiac. Pod -WhatIf zwraca $null takze Get-FileHash (zmierzone), wiec sama suma
  # bez tego nie policzy sie wcale.
  param([string]$CoreRoot, $Manifest)
  $pkg = Join-Path $CoreRoot ([string]$Manifest.paczka)
  if (-not (Test-Path -LiteralPath $pkg)) {
    Log "[N3b] manifest wskazuje paczke '$($Manifest.paczka)', ktorej nie ma w '$CoreRoot' - rdzen NIE zostal podmieniony, zostaje wersja obecna"
    return $null
  }
  $sha = Get-Sha256Pliku -Path $pkg
  $oczekiwana = ([string]$Manifest.sha256).ToLower()
  if ($sha -ne $oczekiwana) {
    Log "[N3b] PACZKA ODRZUCONA: suma kontrolna sie nie zgadza (na dysku $sha, w manifescie $oczekiwana). Plik jest niekompletny albo podmieniony - rdzen NIE zostal zainstalowany, zostaje wersja obecna. Powtorz ENVI-SB-instalator.cmd, gdy Dysk skonczy synchronizacje."
    return $null
  }
  $stage = Join-Path $env:TEMP ('sb-rdzen-' + [string]$Manifest.wersja)
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force -WhatIf:$false -ErrorAction SilentlyContinue }
  New-Item -ItemType Directory -Path $stage -Force -WhatIf:$false | Out-Null
  # Expand-Archive przyjmuje wylacznie rozszerzenie .zip - paczka je ma, wiec kopiujemy 1:1
  # (kopia lokalna, zeby nie rozpakowywac wprost z Dysku w trakcie jego synchronizacji).
  $lokalna = Join-Path $stage ([string]$Manifest.paczka)
  Copy-Item -LiteralPath $pkg -Destination $lokalna -Force -WhatIf:$false
  Expand-Archive -LiteralPath $lokalna -DestinationPath $stage -Force -WhatIf:$false
  return $stage
}

function Write-SyncRunLauncher {
  # D4: same schtasks-quoting trap as N3's Write-N3PullLauncher (see that function's comment) -
  # `schtasks /tr` re-parses an embedded quoted argument as one of ITS OWN options. So both the
  # scheduled task and the "Synchronizuj teraz" shortcut point at this one-line -File launcher;
  # only the -Manual switch differs between the two callers (task: without, shortcut: with).
  param([string]$Path, [string]$EnginePath, [string]$RepoPath)
  $body = @(
    # Te same dwie linie, co w Write-N3PullLauncher: silnik project-sync.ps1 sam ich NIE
    # ustawia (sprawdzone odczytem), a GCM wystawia wlasne okno niezaleznie od
    # GIT_TERMINAL_PROMPT - w ukrytym zadaniu nikt go nie zobaczy (zmierzone w Z8).
    'param([switch]$Manual)'   # param() MUSI byc pierwsza instrukcja skryptu
    "`$env:GIT_TERMINAL_PROMPT = '0'"
    "`$env:GCM_INTERACTIVE = 'never'"
    "& '$EnginePath' -RepoPath '$RepoPath' -Manual:`$Manual"
  ) -join "`r`n"
  $dir = Split-Path $Path -Parent
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  Set-JsonFileNoBom -LiteralPath $Path -Content ($body + "`r`n")   # reused BOM-less text writer
}

# -- W5: znak ENVI na skrocie "Synchronizuj teraz" (prosba wlasciciela 2026-08-22) --
#
# ZADNEGO BINARIUM W REPO ANI W PACZCE. Rezydent rysuje swoja ikone kodem od N2 (warunek
# R2: rdzen nie jest aplikacja do zainstalowania, tylko zestawem skryptow) i skrot trzyma
# sie tej samej zasady - plik .ico powstaje przy instalacji, w katalogu konfiguracyjnym
# uzytkownika, obok silnika i rezydenta.
#
# TEN SAM RYSUNEK, CO IKONA W ZASOBNIKU - sprawdzane, nie deklarowane. Geometria ponizej
# jest kopia New-EnviTurbinePath z sync/sb-tray.ps1. KOPIA, a nie wywolanie tamtej funkcji:
# instalator chodzi takze wtedy, gdy rezydenta na maszynie jeszcze nie ma (pierwszy przebieg,
# paczka nie doszla z Dysku), a wciaganie kodu z cudzego pliku w trakcie instalacji dokladalo
# by tu droge awarii, ktorej ten skrypt nie potrzebuje. Przed rozjazdem kopii pilnuje test
# w test-bootstrap-units.ps1: renderuje OBA rysunki - ten stad i ten wyciety z prawdziwego
# sb-tray.ps1 - i porownuje je piksel po pikselu, a osobno sprawdza obie zielenie.
#
# BEZ PARAMETRU OBROTU, bo ikona skrotu jest STATYCZNA (decyzja wlasciciela 2026-08-22).
# Rezydent ma w swojej wersji parametr $Obrot na animacje stanu PRACUJE; tutaj go nie ma
# i nie ma byc. Zywa ikona pulpitu bylaby DRUGIM nosnikiem stanu, czego zabrania D-4, a do
# tego Windows trzyma ikony pulpitu w pamieci podrecznej i odswieza je niechetnie - pulpit
# pokazywalby stan sprzed godziny, czyli nieprawde w miejscu, ktore mialo wzmocnic
# "aplikacja komunikuje prawde".
#
# STATYCZNA NIE ZNACZY PIONOWA (R7, 2026-08-26). Znak stoi pod skosem -25 stopni, tak jak
# w firmowym logo - to ten sam kat, ktory New-EnviTurbinePath w sb-tray.ps1 trzyma jako
# wartosc domyslna, czyli jako stan spoczynku. Liczba jest tu wpisana wprost, bo ta funkcja
# jest swiadoma kopia i niczego z tamtego pliku nie czyta; rozjazdu pilnuje sprawdzian 6,
# ktory ma osobna kontrole negatywna na wypadek, gdyby skos wypadl z OBU kopii naraz.
function New-ZnakEnviPath {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.FillMode = [System.Drawing.Drawing2D.FillMode]::Winding
  for ($i = 0; $i -lt 4; $i++) {
    $m = New-Object System.Drawing.Drawing2D.Matrix
    $m.Translate(50, 50)
    $m.Rotate(($i * 90.0) - 25.0)
    $m.Translate(26, -26)
    $m.Rotate(-38.0)
    $p2 = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p2.AddEllipse(-21, -29, 42, 58)
    $p2.Transform($m)
    $path.AddPath($p2, $false)
    $p2.Dispose(); $m.Dispose()
  }
  return $path
}

function New-ZnakEnviBitmap {
  param([int]$Px)
  $bmp = New-Object System.Drawing.Bitmap $Px, $Px
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.ScaleTransform(($Px / 100.0), ($Px / 100.0))
  # Zielen stanu OK z sb-tray.ps1: jasna wyprobkowana ze znaku, ciemna z kanonu marki.
  $c1 = [System.Drawing.Color]::FromArgb(255, 155, 190, 114)
  $c2 = [System.Drawing.Color]::FromArgb(255, 46, 107, 51)
  $path = New-ZnakEnviPath
  $br = New-Object System.Drawing.Drawing2D.LinearGradientBrush `
        (New-Object System.Drawing.Point 6, 2), (New-Object System.Drawing.Point 94, 98), $c1, $c2
  $g.FillPath($br, $path)
  $br.Dispose(); $path.Dispose(); $g.Dispose()
  return $bmp
}

function ConvertTo-ObrazIco {
  # Jeden obraz w formacie, ktorego plik .ico uzywa od zawsze: naglowek DIB, potem piksele
  # OD DOLU DO GORY, potem maska. Maska jest wyzerowana celowo - przy 32 bitach na piksel
  # o przezroczystosci decyduje kanal alfa, a nie ona.
  param([System.Drawing.Bitmap]$Bmp)
  $w = $Bmp.Width; $h = $Bmp.Height
  $kopia = New-Object System.Drawing.Bitmap $Bmp
  $kopia.RotateFlip([System.Drawing.RotateFlipType]::RotateNoneFlipY)
  $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h
  $dane = $kopia.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $xor = New-Object byte[] ($w * $h * 4)
  for ($y = 0; $y -lt $h; $y++) {
    [System.Runtime.InteropServices.Marshal]::Copy([System.IntPtr]::Add($dane.Scan0, $y * $dane.Stride), $xor, $y * $w * 4, $w * 4)
  }
  $kopia.UnlockBits($dane); $kopia.Dispose()
  $maskStride = [int][Math]::Floor(($w + 31) / 32) * 4
  $and = New-Object byte[] ($maskStride * $h)

  $ms = New-Object System.IO.MemoryStream
  $bw = New-Object System.IO.BinaryWriter $ms
  $bw.Write([int]40); $bw.Write([int]$w); $bw.Write([int]($h * 2))
  $bw.Write([int16]1); $bw.Write([int16]32)
  $bw.Write([int]0); $bw.Write([int]($xor.Length + $and.Length))
  $bw.Write([int]0); $bw.Write([int]0); $bw.Write([int]0); $bw.Write([int]0)
  $bw.Write($xor); $bw.Write($and)
  $bw.Flush()
  $out = $ms.ToArray()
  $bw.Dispose(); $ms.Dispose()
  return , $out
}

function Write-ZnakEnviIco {
  # Zwraca sciezke pliku, gdy sie udalo, i $null, gdy nie. NIGDY nie przerywa instalacji:
  # brak ladnej ikony jest drobiazgiem, a przerwany bootstrap - awaria. Stad calosc w try
  # i stad Add-Type w srodku, a nie na gorze pliku (maszyna bez System.Drawing dostaje
  # ikonke systemowa i idzie dalej, zamiast wywrocic caly przebieg).
  #
  # SZESC ROZMIAROW, bo Windows bierze rozny w roznych miejscach: 16 przy nazwie pliku,
  # 32 w menu Start, 48 na pulpicie przy domyslnym ustawieniu, 256 przy "bardzo duze ikony".
  # Rozmiaru, ktorego w pliku nie ma, powloka nie dorysuje ladnie - przeskaluje najblizszy.
  param([string]$Path, [int[]]$Rozmiary = @(16, 24, 32, 48, 64, 256))
  try {
    Add-Type -AssemblyName System.Drawing -ErrorAction Stop
    $obrazy = @()
    foreach ($px in $Rozmiary) {
      $b = New-ZnakEnviBitmap -Px $px
      $obrazy += , (ConvertTo-ObrazIco -Bmp $b)
      $b.Dispose()
    }
    $ms = New-Object System.IO.MemoryStream
    $bw = New-Object System.IO.BinaryWriter $ms
    $bw.Write([int16]0); $bw.Write([int16]1); $bw.Write([int16]$Rozmiary.Count)
    $offset = 6 + (16 * $Rozmiary.Count)
    for ($i = 0; $i -lt $Rozmiary.Count; $i++) {
      # 256 zapisuje sie w katalogu jako 0 - jeden bajt na rozmiar nie pomiesci liczby 256.
      $bajt = if ($Rozmiary[$i] -ge 256) { 0 } else { $Rozmiary[$i] }
      $bw.Write([byte]$bajt); $bw.Write([byte]$bajt); $bw.Write([byte]0); $bw.Write([byte]0)
      $bw.Write([int16]1); $bw.Write([int16]32)
      $bw.Write([int]$obrazy[$i].Length); $bw.Write([int]$offset)
      $offset += $obrazy[$i].Length
    }
    foreach ($o in $obrazy) { $bw.Write($o) }
    $bw.Flush()
    $bajty = $ms.ToArray()
    $bw.Dispose(); $ms.Dispose()
    $dir = Split-Path $Path -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    # Zapis przez plik tymczasowy i podmiana: gdyby zapis padl w polowie, na dysku zostalby
    # ODCIETY plik .ico - a skrot wskazujacy na odciety plik pokazuje PUSTE miejsce, czyli
    # dokladnie ten skutek, ktoremu ma zapobiec zapasowa ikonka systemowa.
    $tmp = "$Path.tmp"
    [System.IO.File]::WriteAllBytes($tmp, $bajty)
    Move-Item -LiteralPath $tmp -Destination $Path -Force
    return $Path
  } catch {
    Log "[N3b] nie udalo sie narysowac znaku ENVI ($($_.Exception.Message))"
    return $null
  }
}

function Install-RdzenZDysku {
  # B1: rdzen z paczki na Dysku instaluje sie dla OBU rol, i to jest cala roznica wobec
  # reszty N3b. Konsument dostaje silnik na dysk WYLACZNIE po to, zeby N5 mogl go wolac
  # z -TylkoSkille - bez tego rola 'konsument' nie dostawala skilli w ogole. Konsument nie
  # dostaje ani zadania w harmonogramie, ani rezydenta, ani pierwszego przebiegu silnika.
  # (Skutek nazwany wprost i swiadomy: samoaktualizacja rdzenia z N6 u konsumenta nie
  # chodzi, bo nie ma zadania, ktore by ja odpalalo.)
  #
  # D4: sync-config.yaml powstaje TUTAJ, a nie dopiero w N5. Powod: pierwszy przebieg
  # silnika (nizej w N3b) czytal konfiguracje, ktorej N5 jeszcze nie zapisal, i zostawial
  # w stanie "skille: 0 / 0 (brak konfiguracji celow)" az do nastepnej godziny. Ten sam
  # warunek "nie nadpisuj prawdziwej konfiguracji" - jedna funkcja, wolana stad i z N5.
  # Zwraca $true, gdy rdzen jest na dysku i mozna isc dalej.

  # N4: rdzen przyjezdza z paczki na Dysku (D-2). Katalog wydan lezy obok .skills,
  # ktory N1 juz odnalazl na tej maszynie - bez niego nie ma skad brac rdzenia.
  $coreRoot = $script:CoreDriveRoot
  if (-not $coreRoot) {
    if (-not $script:SkillDriveRoot -or -not (Test-Path -LiteralPath $script:SkillDriveRoot)) {
      Log "[N3b] Dysk Google nie jest osiagalny, a rdzen przyjezdza wlasnie stamtad - pomijam podmiane rdzenia, obecna wersja zostaje nietknieta. Zaloguj sie do Dysku i uruchom ENVI-SB-instalator.cmd jeszcze raz."
      return $false
    }
    $coreRoot = Join-Path (Split-Path $script:SkillDriveRoot -Parent) '.rdzen'
  }

  $manifest = Get-RdzenManifest -CoreRoot $coreRoot
  if (-not $manifest) {
    Log "[N3b] nie widze wydania rdzenia w '$coreRoot' - pomijam podmiane rdzenia, obecna wersja zostaje nietknieta"
    return $false
  }
  Log "[N3b] wydanie rdzenia na Dysku: $($manifest.wersja) (paczka $($manifest.paczka), wydane $($manifest.data))"

  $rozpakowane = Expand-RdzenPaczka -CoreRoot $coreRoot -Manifest $manifest
  if (-not $rozpakowane) { return $false }

  # Nie jeden plik: silnik szuka rezydenta ikony obok siebie ($PSScriptRoot), a do
  # 2026-08-21 nie instalowal go nikt - maszyna dostawala silnik bez ikony, czyli bez
  # calej warstwy, ktora mowi czlowiekowi, co sie dzieje. M4: dolozone cztery skrypty
  # skrzynek poczty (menu ikony z M3) - ta sama lista, co $PlikiRdzenia/$RdzenPliki,
  # zeby swiezy install mial poczte OD RAZU, a nie dopiero po pierwszej samoaktualizacji.
  $enviDir = Split-Path $SyncEnginePath -Parent
  foreach ($plik in @('project-sync.ps1', 'sb-tray.ps1', 'poczta-lib.ps1', 'poczta-dodaj-skrzynke.ps1', 'poczta-haslo.ps1', 'poczta-usun-skrzynke.ps1')) {
    $zrodlo = Join-Path $rozpakowane $plik
    if (-not (Test-Path -LiteralPath $zrodlo)) {
      Log "[N3b] ERROR: paczka $($manifest.paczka) nie zawiera pliku $plik - rdzen jest niekompletny, zglos to wlascicielowi"
      continue
    }
    $celPliku = Join-Path $enviDir $plik
    if ($PSCmdlet.ShouldProcess($celPliku, "skopiuj $plik z wydania $($manifest.wersja) (kopia uruchamiana, poza repo B - D3)")) {
      Copy-SyncEngine -SourcePath $zrodlo -DestPath $celPliku
      Log "[N3b] $plik z wydania $($manifest.wersja) na miejscu: $celPliku"
    }
  }

  # Manifest zostaje na maszynie: bez niego nikt - ani czlowiek, ani samoaktualizacja
  # z N6, ani zestawienie wersji z N8 - nie odpowie na pytanie "ktora wersje mam".
  #
  # N6 DOKLADA DO NIEGO JEDNO POLE: 'zrodlo', czyli katalog wydan, z ktorego ten
  # rdzen przyjechal. Powod jest scisle jeden: silnik ma co godzine sprawdzac
  # manifest wydania, a NIE UMIE znalezc Dysku sam - autodetekcja liter dysku i
  # nazw katalogow ("Dyski wspoldzielone" / "Shared drives") mieszka tutaj,
  # w Find-SkillDriveRoot, i ma zostac jednym domem tej wiedzy. Zamiast
  # przepisywac ja do silnika, instalator zapisuje WYNIK swojego szukania.
  # Skutek nazwany wprost: maszyna, ktora nie uruchomila instalatora po tej
  # zmianie, ma manifest bez 'zrodlo' i samoaktualizacji NIE dostaje - silnik
  # mowi to w logu wprost, zamiast zgadywac sciezke.
  $manifestLokalny = Join-Path $enviDir 'rdzen.json'
  if ($PSCmdlet.ShouldProcess($manifestLokalny, 'zapisz manifest zainstalowanego rdzenia (z katalogiem wydan)')) {
    $mfLokalny = [ordered]@{
      wersja = [string]$manifest.wersja
      paczka = [string]$manifest.paczka
      sha256 = ([string]$manifest.sha256).ToLower()
      data   = [string]$manifest.data
      wydal  = [string]$manifest.wydal
      zmiany = [string]$manifest.zmiany
      zrodlo = $coreRoot
      zainstalowano = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
      zainstalowal  = 'bootstrap.ps1'
    }
    # KAZDY ZNAK SPOZA ASCII JAKO \uXXXX. Zmierzone 2026-08-21: sciezka katalogu
    # wydan na maszynach zespolu brzmi "G:\Dyski wspoldzielone\...", plik jest bez
    # BOM-u (patrz Set-JsonFileNoBom), a Windows PowerShell 5.1 czyta plik bez BOM-u
    # strona kodowa systemu - wiec kazdy odczyt, ktory pominie `-Encoding UTF8`,
    # dostaje sciezke, dla ktorej Test-Path zwraca False. Po ucieczce plik jest
    # czysto ASCII i czyta sie tak samo niezaleznie od zalozen czytajacego, a
    # ConvertFrom-Json rozwija sekwencje z powrotem. Silnik robi to samo w
    # ConvertTo-JsonAscii; to jest ten sam wymog, nie dwie rozne zasady.
    $jsonMf = $mfLokalny | ConvertTo-Json
    $sbMf = New-Object System.Text.StringBuilder
    foreach ($ch in $jsonMf.ToCharArray()) {
      if ([int]$ch -gt 127) { [void]$sbMf.AppendFormat('\u{0:x4}', [int]$ch) } else { [void]$sbMf.Append($ch) }
    }
    Set-JsonFileNoBom -LiteralPath $manifestLokalny -Content ($sbMf.ToString() + "`r`n")
    Log "[N3b] manifest zainstalowanego rdzenia zapisany: $manifestLokalny (zrodlo wydan: $coreRoot)"
  }

  # D4: konfiguracja celow skilli MUSI istniec przed pierwszym przebiegiem silnika nizej.
  Set-EnviSyncConfigJesliTrzeba -SourceG $script:SkillDriveRoot -Skad 'N3b'
  return $true
}

function Invoke-StepN3b {
  Log "[N3b] rdzen z Dysku i synchronizacja obszaru projektowego - start"
  if (-not (Install-RdzenZDysku)) {
    Log "[N3b] rdzen z Dysku i synchronizacja obszaru projektowego - koniec"
    return
  }
  $enviDir = Split-Path $SyncEnginePath -Parent
  $role = if ($script:InstallRoleResult) { $script:InstallRoleResult.Role } else { 'consumer' }
  if ($role -ne 'team') {
    Log "[N3b] rola: konsument - rdzen jest na dysku (N5 wola go po skille), ale zadanie w tle, skroty, rezydent ikony i przebieg silnika nie dotycza tej roli"
    Log "[N3b] rdzen z Dysku i synchronizacja obszaru projektowego - koniec"
    return
  }

  if ($PSCmdlet.ShouldProcess($SyncRunLauncher, 'zapisz launcher project-sync-run.ps1 (schtasks-safe -File launcher, D4)')) {
    Write-SyncRunLauncher -Path $SyncRunLauncher -EnginePath $SyncEnginePath -RepoPath $ProjectsClonePath
    Log "[N3b] launcher zapisany: $SyncRunLauncher"
  }

  # Periodic sync: schtasks.exe HOURLY trigger, WITHOUT -Manual (D4) - the scheduled/automatic
  # path the engine itself gates on mass-change and contact-data checks. Non-elevated, /f =
  # idempotent overwrite, same mechanism as N3's own periodic task above.
  $syncLauncherArgs = '-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $SyncRunLauncher
  $syncTrCmd = "powershell.exe $syncLauncherArgs"
  $syncAction = "schtasks /create /tn $SyncTaskName /tr <hidden -File sync launcher> /sc HOURLY /mo $SyncEveryHours /f"
  if ($PSCmdlet.ShouldProcess($SyncTaskName, $syncAction)) {
    Log "[N3b] rejestruje zadanie cykliczne '$SyncTaskName' (co ${SyncEveryHours}h, bez okna, kontekst uzytkownika, bez -Manual)"
    Log (Get-ZapowiedzAntywirusa -Krok 'N3b')
    $zad = Register-ZadanieCogodzinne -Nazwa $SyncTaskName -Polecenie $syncTrCmd -CoGodzin $SyncEveryHours
    if ($zad.Kod -ne 0) {
      Log "[N3b] ERROR: schtasks /create dla '$SyncTaskName' nie powiodlo sie (exit $($zad.Kod)): $($zad.Wyjscie)"
    } else {
      Log "[N3b] zadanie '$SyncTaskName' zarejestrowane/zaktualizowane (idempotentnie, /f)"
      Set-ZadanieChodziNaBaterii -Nazwa $SyncTaskName
    }
  }

  # "Synchronizuj teraz" shortcut: targets powershell.exe + the SAME launcher directly, WITH
  # -Manual (D4/D5) - no separate sync-now.cmd is created (D5); this is exactly the pattern
  # N3's own Startup shortcut already uses for kanon-pull.ps1.
  #
  # TWO copies since 2026-08-18, and the desktop one is not decoration: on the owner's own
  # machine the Start Menu copy was NOT findable by typing "Synchronizuj" into Start - Windows
  # Search had not indexed the freshly written .lnk, so the search fell through to Bing
  # suggestions and the button looked like it did not exist. Indexing is outside our control
  # and can lag for hours; a desktop icon appears the moment the file is written. Ceiling:
  # pinning to the taskbar is NOT done here - Windows removed the "taskbarpin" verb in Win10
  # 1607 and Win11 keeps it blocked, and the alternative (writing the opaque Taskband registry
  # blob + restarting explorer.exe on an employee's machine) is exactly the kind of fragile
  # trick this installer avoids. The summary below tells the user the two clicks instead.
  $manualArgs = '-WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "{0}" -Manual' -f $SyncRunLauncher

  # W5: znak ENVI zamiast systemowej ikonki Windows. Plik rysowany tuz przed skrotami, zeby
  # ponowny przebieg instalatora odswiezyl go razem z nimi (idempotentnie, nadpisaniem).
  $ikonaPlik = Join-Path $enviDir 'envi-znak.ico'
  if ($PSCmdlet.ShouldProcess($ikonaPlik, 'narysuj znak ENVI do pliku .ico')) {
    if (Write-ZnakEnviIco -Path $ikonaPlik) { Log "[N3b] znak ENVI narysowany: $ikonaPlik" }
  }
  # SPRAWDZONE ODCZYTEM, NIE ZALOZONE. Sciezka wlasnego pliku wchodzi do skrotu wylacznie
  # wtedy, gdy plik naprawde lezy na dysku - inaczej skrot pokazywalby PUSTE miejsce, czyli
  # wygladalby na zepsuty, a to jest gorzej niz ikonka Windows, ktora stala tu do dzis.
  # Warunek dziala takze wstecz: przy nieudanym rysowaniu, ale zachowanym pliku z poprzedniej
  # instalacji, skrot zostaje przy znaku ENVI zamiast cofac sie do ikonki systemowej.
  $ikonaSkrotu = '%SystemRoot%\System32\shell32.dll,46'
  if (Test-Path -LiteralPath $ikonaPlik) {
    $ikonaSkrotu = "$ikonaPlik,0"
  } else {
    Log "[N3b] pliku znaku ENVI nie ma - skroty dostaja ikonke systemowa, jak dotad (nigdy pusta)"
  }

  $wsh = New-Object -ComObject WScript.Shell
  foreach ($dir in @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))) {
    if (-not $dir) { continue }
    $lnkPath = Join-Path $dir 'Synchronizuj teraz (Second Brain).lnk'
    if ($PSCmdlet.ShouldProcess($lnkPath, 'utworz/zaktualizuj skrot "Synchronizuj teraz (Second Brain)"')) {
      $sc = $wsh.CreateShortcut($lnkPath)   # idempotent: CreateShortcut+Save overwrites in place
      $sc.TargetPath = 'powershell.exe'
      $sc.Arguments = $manualArgs
      $sc.WindowStyle = 7
      # Explicit icon: without it the shortcut inherits the PowerShell console icon, which on a
      # desktop reads as "some script", not as a button belonging to Second Brain. Do 2026-08-23
      # stala tu ikonka z shell32.dll - systemowa, czyli nadal "jakis skrypt Windows". Od W5
      # jest to znak ENVI, ten sam co przy zegarze; $ikonaSkrotu wyzej pilnuje zapasu.
      $sc.IconLocation = $ikonaSkrotu
      $sc.Description = 'Second Brain: wyslij i pobierz teraz zmiany z obszaru projektowego'
      $sc.Save()
      Log "[N3b] skrot 'Synchronizuj teraz' zapisany: $lnkPath"
    }
  }

  # Autostart rezydenta ikony. DO 2026-08-27 NIE BYLO GO WCALE - zmierzone: ani w folderze
  # Autostart, ani w HKCU/HKLM Run, ani w harmonogramie. Ikone podnosil wylacznie silnik przy
  # swoim cogodzinnym przebiegu, czyli po wlaczeniu komputera stala DO GODZINY bez ikony,
  # a na samej baterii - wobec ustawien wyzej - nie wstawala w ogole.
  #
  # Ten sam mechanizm, ktorego N3 uzywa juz dla pobierania kanonu (skrot w folderze Autostart,
  # WScript.Shell): wyzwalacz "przy logowaniu" w harmonogramie wymaga administratora, skrot nie.
  # Nie budujemy tu niczego nowego.
  #
  # DWA REZYDENTY NIE POWSTANA - i to nie jest zalozenie: sb-tray.ps1 trzyma zamek nazwany
  # ('Local\...') i protokol ustepowania, wiec kopia uruchomiona pozniej albo ustepuje, albo
  # przejmuje miejsce po starszej. Ten skrot wchodzi wiec w istniejacy mechanizm, a nie obok niego.
  $trayPath = Join-Path $enviDir 'sb-tray.ps1'
  $trayStan = Join-Path $enviDir 'project-sync.state.json'
  $startupDirTray = [Environment]::GetFolderPath('Startup')
  if ($startupDirTray) {
    $trayLnk = Join-Path $startupDirTray 'ENVI-SB-Ikona.lnk'
    if ($PSCmdlet.ShouldProcess($trayLnk, 'utworz/zaktualizuj skrot autostartu rezydenta ikony')) {
      $sct = $wsh.CreateShortcut($trayLnk)   # idempotentnie: CreateShortcut+Save nadpisuje w miejscu
      $sct.TargetPath = 'powershell.exe'
      # Argumenty CO DO ZNAKU takie same, jak sklada silnik przy podnoszeniu rezydenta -
      # inaczej rezydent z autostartu liczylby sciezki towarzyszace inaczej niz ten z silnika.
      $sct.Arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "{0}" -StatePath "{1}"' -f $trayPath, $trayStan
      $sct.WindowStyle = 7
      $sct.IconLocation = $ikonaSkrotu
      $sct.Description = 'Second Brain: ikona stanu przy zegarze (start przy logowaniu)'
      $sct.Save()
      Log "[N3b] skrot autostartu ikony zapisany: $trayLnk"
    }
  } else {
    Log "[N3b] nie znalazlem folderu Autostart - ikona wstanie dopiero przy przebiegu silnika, jak dotad"
  }

  # -- P2: pierwszy start - rezydent ikony i jeden przebieg silnika --
  # ZAMEK SPRAWDZONY ODCZYTEM, NIE ZALOZONY: sb-tray.ps1 liczy nazwe muteksu z MD5 sciezki
  # pliku stanu ('Local\ENVI-SB-Tray-<hash>', sb-tray.ps1:151-156) i drugi egzemplarz na tym
  # samym pliku stanu albo konczy sie kodem 3, albo przejmuje ikone po starszym kodzie.
  # Instalator nie musi wiec sam liczyc procesow: wystarczy uruchomic i poczekac NA FAKT.
  if ($PSCmdlet.ShouldProcess($trayPath, 'uruchom rezydenta ikony i poczekaj, az proces bedzie widoczny')) {
    if (Test-Path -LiteralPath $trayPath) {
      if (Test-RezydentDziala -TrayPath $trayPath) {
        Log "[N3b] rezydent ikony juz dziala - nie uruchamiam drugiego"
      } else {
        Start-Process -FilePath 'powershell.exe' -ArgumentList ('-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $trayPath), '-StatePath', ('"{0}"' -f $trayStan)) -WindowStyle Hidden | Out-Null
        $doKiedy = (Get-Date).AddSeconds(30)
        while ((Get-Date) -lt $doKiedy -and -not (Test-RezydentDziala -TrayPath $trayPath)) { Start-Sleep -Milliseconds 500 }
        Log ("[N3b] rezydent ikony po starcie: {0}" -f $(if (Test-RezydentDziala -TrayPath $trayPath) { 'dziala' } else { 'NIE WSTAL w 30 s' }))
      }
    } else {
      Log "[N3b] nie ma pliku rezydenta ($trayPath) - ikony nie ma czym uruchomic"
    }
  }
  if ($PSCmdlet.ShouldProcess($SyncRunLauncher, 'uruchom silnik raz, synchronicznie, i poczekaj na plik stanu')) {
    Log "[N3b] pierwszy przebieg silnika - startuje i czekam (do 5 min)"
    $wynikSync = Wait-ProcesBezPytaniaOHaslo -Argumenty @('-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $SyncRunLauncher))
    Log ("[N3b] proces pierwszego przebiegu: {0}" -f $wynikSync)
    # B3a: godzina TYLKO dla stanu koncowego; kazda inna faza to przebieg, ktory sie nie zakonczyl.
    $stanPrzebiegu = Get-StanPrzebiegu -StatePath $trayStan
    $czasPrzebiegu = if (-not $stanPrzebiegu) { 'nie bylo - plik stanu nie powstal' }
                     elseif ($stanPrzebiegu.Faza -eq 'udana') { $stanPrzebiegu.Czas }
                     else { "nie zakonczyl sie ({0})" -f $stanPrzebiegu.Opis }
    Log ("[N3b] pierwszy przebieg: {0}" -f $czasPrzebiegu)
  }

  Log "[N3b] rdzen z Dysku i synchronizacja obszaru projektowego - koniec"
}

# -- N4: Obsidian shortcut + vault separation, idempotent --
# ponytail: shortcut targets explorer.exe with an obsidian://open?vault=...&file=_index URI
# argument - the standard non-admin trick for firing a registered protocol handler from a
# .lnk (a .lnk's TargetPath normally expects a real file-system path, not a URL; explorer.exe
# accepts a URL argument and hands it to ShellExecute, which resolves the protocol). This
# avoids hardcoding Obsidian.exe's install path, which varies by Squirrel-installer version
# under %LOCALAPPDATA%\Obsidian\. The vault= form resolves the vault BY NAME, so obsidian.json
# registration below is not optional garnish - it is what makes this URI resolvable at all
# (see the block in Invoke-StepN4, which creates obsidian.json when Obsidian never ran).
# Ceiling: Start Menu only, no desktop shortcut (plan says Start Menu is enough).
function Get-ObsidianVaultUri {
  # non-mutating: builds the URI string only, safe under -WhatIf
  param([string]$Path)
  # vault= + file= (nie path=): otwiera vault OD RAZU na notatce startowej. Nazwa vaultu to
  # nazwa folderu; file= bez rozszerzenia .md, tak jak dokumentuje to Obsidian.
  $vaultName = Split-Path $Path.TrimEnd([char]92) -Leaf
  return 'obsidian://open?vault=' + [uri]::EscapeDataString($vaultName) + '&file=_index'
}

function New-N4VaultId {
  param($ExistingIds)
  do {
    $id = -join ((1..16) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
  } while ($ExistingIds -contains $id)
  return $id
}

function Add-ObsidianVaultEntry {
  # Non-destructive merge: adds one vault entry for $Path if not already present, never
  # touches any other entry, never sets 'open' on the new entry. Returns $true if it added
  # a new entry (caller decides whether to write the file back). $ObsidianJson.vaults must
  # already exist as a PSCustomObject (PS 5.1 ConvertFrom-Json has no -AsHashtable, so vault
  # ids are enumerated as dynamic properties via .PSObject.Properties).
  param(
    [Parameter(Mandatory)] $ObsidianJson,
    [Parameter(Mandatory)] [string]$Path
  )
  $normalized = $Path.TrimEnd('\')
  $existing = $ObsidianJson.vaults.PSObject.Properties | Where-Object {
    $_.Value.path -and ($_.Value.path.TrimEnd('\') -ieq $normalized)
  }
  if ($existing) { return $false }

  $existingIds = $ObsidianJson.vaults.PSObject.Properties.Name
  $newId = New-N4VaultId -ExistingIds $existingIds
  $tsMillis = [long]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
  $entry = [pscustomobject]@{ path = $Path; ts = $tsMillis }
  Add-Member -InputObject $ObsidianJson.vaults -NotePropertyName $newId -NotePropertyValue $entry
  return $true
}

function Set-JsonFileNoBom {
  # [System.IO.File]::WriteAllText with a BOM-less UTF8Encoding - Set-Content -Encoding UTF8
  # on Windows PowerShell 5.1 writes a BOM, which some strict JSON.parse callers (Electron
  # apps like Obsidian) can choke on. Same BOM caution as this script's own file (see N1).
  param([string]$LiteralPath, [string]$Content)
  $enc = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($LiteralPath, $Content, $enc)
}

function Invoke-StepN4 {
  Log "[N4] obsidian shortcut + vault registration step starting"
  $uri = Get-ObsidianVaultUri -Path $VaultPath

  # Start Menu shortcut (per-user, non-admin safe - same folder class as N3's Startup shortcut)
  $startMenuDir = [Environment]::GetFolderPath('Programs')
  # Stara nazwa ("Kanon") sugerowala folder, ktorego nie ma - kasujemy ja idempotentnie.
  $lnkStary = Join-Path $startMenuDir 'ENVI Kanon (Obsidian).lnk'
  if (Test-Path -LiteralPath $lnkStary) {
    Remove-Item -LiteralPath $lnkStary -Force
    Log "[N4] usunieto stary skrot: $lnkStary"
  }
  $lnkPath = Join-Path $startMenuDir 'ENVI Second Brain.lnk'
  if ($PSCmdlet.ShouldProcess($lnkPath, "create/update Start Menu shortcut opening $VaultPath as an Obsidian vault")) {
    $wsh = New-Object -ComObject WScript.Shell
    $sc = $wsh.CreateShortcut($lnkPath)
    $sc.TargetPath = Join-Path $env:WINDIR 'explorer.exe'
    $sc.Arguments = "`"$uri`""
    $sc.Description = 'ENVI SB vault (kanon 40_wiki + obszar projektowy 20_projects) - open in Obsidian'
    $sc.Save()
    Log "[N4] Start Menu shortcut written: $lnkPath"
  }

  # Non-destructive vault registration. If obsidian.json does not exist yet (Obsidian
  # installed but never launched - the normal state on a fresh machine), CREATE it with just
  # this one vault. The old "skip and rely on the Start Menu shortcut's obsidian://open?path=
  # URI" path was wrong in practice: a user who launches Obsidian from its own icon instead
  # of that shortcut lands in an empty vault picker and concludes the install failed - which
  # is exactly what happened on the first two employee machines.
  # Ceiling: if Obsidian is RUNNING while this writes, it rewrites obsidian.json on exit and
  # can drop the entry - hence the reminder below to close Obsidian before re-running.
  $obsidianJsonPath = Join-Path $env:APPDATA 'obsidian\obsidian.json'
  $obsidianJsonExists = Test-Path -LiteralPath $obsidianJsonPath
  $target = $obsidianJsonPath
  $action = if ($obsidianJsonExists) {
    "add canon vault entry (path=$VaultPath) to obsidian.json; not open, other entries untouched"
  } else {
    "create obsidian.json with the canon vault entry (path=$VaultPath)"
  }
  if ($PSCmdlet.ShouldProcess($target, $action)) {
    if ($obsidianJsonExists) {
      $json = Get-Content -LiteralPath $obsidianJsonPath -Raw | ConvertFrom-Json
    } else {
      $obsidianDir = Split-Path $obsidianJsonPath -Parent
      if (-not (Test-Path -LiteralPath $obsidianDir)) { New-Item -ItemType Directory -Path $obsidianDir -Force | Out-Null }
      $json = [pscustomobject]@{}
      Log "[N4] obsidian.json not found (Obsidian never launched) - creating it so the vault shows up without the user clicking anything"
    }
    if (-not $json.vaults) {
      Add-Member -InputObject $json -NotePropertyName 'vaults' -NotePropertyValue ([pscustomobject]@{})
    }
    $changed = Add-ObsidianVaultEntry -ObsidianJson $json -Path $VaultPath
    if ($changed) {
      if (-not $obsidianJsonExists) {
        # Only when WE created the file, i.e. there is no other vault to hijack: mark it open
        # so a fresh user gets the canon on screen instead of an empty vault picker. An
        # existing obsidian.json keeps whatever default its owner already chose.
        $entry = $json.vaults.PSObject.Properties | Where-Object { $_.Value.path -eq $VaultPath } | Select-Object -First 1
        if ($entry) { Add-Member -InputObject $entry.Value -NotePropertyName 'open' -NotePropertyValue $true -Force }
      }
      $out = $json | ConvertTo-Json -Depth 6
      Set-JsonFileNoBom -LiteralPath $obsidianJsonPath -Content $out
      Log "[N4] obsidian.json: canon vault registered$(if (-not $obsidianJsonExists) { ' and marked open (first vault on this machine)' })"
    } else {
      Log "[N4] obsidian.json: canon vault already registered - skip"
    }
  }

  # T3: there is no separate "own vault" anymore - $VaultPath IS the one vault, and it already
  # got registered above. The only thing still needed here is the `.claude\skills` subfolder
  # that N5's sync-config.yaml `claude` target and Claude Code itself expect to find inside it.
  # Created directly under $VaultPath, never under 40_wiki (repo A's tracked tree) or
  # 20_projects (repo B's tracked tree) - a stray `.claude` inside either would be someone
  # else's untracked junk showing up in their `git status`.
  $vaultSkills = Join-Path $VaultPath '.claude\skills'
  if (-not (Test-Path -LiteralPath $vaultSkills)) {
    if ($PSCmdlet.ShouldProcess($vaultSkills, 'create .claude\skills folder inside the vault')) {
      New-Item -ItemType Directory -Path $vaultSkills -Force | Out-Null
      Log "[N4] .claude\skills created inside the vault: $vaultSkills"
    }
  } else {
    Log "[N4] .claude\skills already exists inside the vault - skip"
  }

  $vaultLogs = Join-Path $VaultPath 'logs'
  if (Test-Path -LiteralPath $vaultLogs -PathType Container) {
    Log "[N4] logs already exists inside the vault - skip"
  } elseif (Test-Path -LiteralPath $vaultLogs) {
    throw "[N4] ERROR: '$vaultLogs' istnieje, ale nie jest katalogiem. Plik pozostawilem bez zmian; zmien jego nazwe albo przenies go recznie, potem uruchom ENVI-SB-instalator.cmd ponownie."
  } else {
    if ($PSCmdlet.ShouldProcess($vaultLogs, 'create local logs folder inside the vault')) {
      New-Item -ItemType Directory -Path $vaultLogs -Force | Out-Null
      Log "[N4] logs created inside the vault: $vaultLogs"
    }
  }

  Log "[N4] REMINDER: your own working notes can live directly in the vault ($VaultPath), outside 40_wiki and 20_projects - 40_wiki is the read-only canon repo (anything else at this level is outside its tracked tree), 20_projects is its own separate writable repo, so notes placed directly here never leave your machine"
  Log "[N4] obsidian shortcut + vault registration step done"
}

# -- Legacy layout cleanup (T3), idempotent, gated -------------------------------------------
# OWNER'S HARD GATE (from the T3 checkpoint, not just a comment - implement this, do not weaken
# it): this installer must NEVER silently delete anything that might be the employee's own
# work. Before removing the pre-T3 second vault below, this checks that the folder contains
# ONLY what the OLD installer itself could have put there. Any doubt -> leave it alone and log
# in Polish, in plain language, exactly what was found, so the human can decide by hand.
function Get-LegacyOwnVaultUnknownEntries {
  # non-mutating: read-only listing, safe under -WhatIf. Whitelist, not a blocklist: the old N4
  # only ever created '.claude' (skills), and Obsidian only ever creates '.obsidian' the moment
  # a human opens that folder as a vault. Anything else - a note, a document, another folder -
  # means a person put real content there, and this function's caller must not touch the folder.
  #
  # The OS/sync-junk names are whitelisted too, and that is not a loosening of the gate: the old
  # vault lives under Documents, which on these machines is commonly synced by Google Drive or
  # OneDrive, and those drop 'desktop.ini' into every folder they touch. Without this, the gate
  # would STOP on a folder that is in fact empty, the dead Obsidian entry would survive, and the
  # T3 acceptance criterion "no second, dead vault entry left in Obsidian" would quietly never be
  # met on exactly the machines it was written for. None of these names can be a person's work.
  param([string]$Path)
  return @(Get-ChildItem -LiteralPath $Path -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notin @('.claude', '.obsidian', 'desktop.ini', 'Thumbs.db', '.DS_Store') })
}

function Remove-ObsidianVaultEntryByPath {
  # Mirror of Add-ObsidianVaultEntry: removes every vault entry whose path matches (there
  # should be at most one), touches nothing else. Returns the number of entries removed, so the
  # caller only rewrites the file when something actually changed (same idempotency shape as
  # Add-ObsidianVaultEntry's boolean return).
  param(
    [Parameter(Mandatory)] $ObsidianJson,
    [Parameter(Mandatory)] [string]$Path
  )
  $normalized = $Path.TrimEnd('\')
  $toRemove = @($ObsidianJson.vaults.PSObject.Properties | Where-Object {
    $_.Value.path -and ($_.Value.path.TrimEnd('\') -ieq $normalized)
  })
  foreach ($prop in $toRemove) { $ObsidianJson.vaults.PSObject.Properties.Remove($prop.Name) }
  return $toRemove.Count
}

function Invoke-LegacyOwnVaultCleanup {
  Log "[LEGACY] sprawdzam, czy istnieje stary, osobny vault z sprzed T3 ($LegacyOwnVaultPath) ..."
  if (-not (Test-Path -LiteralPath $LegacyOwnVaultPath)) {
    Log "[LEGACY] nie znaleziono starego drugiego vaulta - nie ma nic do zrobienia (no-op)"
    return
  }

  if (Test-Path -LiteralPath (Join-Path $LegacyOwnVaultPath '.git')) {
    Log "[LEGACY] STOP: folder '$LegacyOwnVaultPath' ma wlasne repozytorium git (.git) - stary instalator nigdy tego tam nie tworzyl, wiec to nie jest znany uklad instalatora. Zostawiam ten folder w spokoju - sprawdz go recznie, zanim cokolwiek z nim zrobisz."
    return
  }

  $unknown = Get-LegacyOwnVaultUnknownEntries -Path $LegacyOwnVaultPath
  if ($unknown.Count -gt 0) {
    Log "[LEGACY] STOP: w folderze '$LegacyOwnVaultPath' oprocz elementow, ktore mogl tam zostawic tylko stary instalator (.claude, .obsidian), znalazlem: $($unknown.Name -join ', '). To moze byc Twoja wlasna praca, nie sam stary uklad instalatora - nie usuwam nic automatycznie. Jesli po sprawdzeniu uznasz, ze to naprawde martwy, stary vault, usun go recznie."
    return
  }

  # Only '.claude' and/or '.obsidian' present (or the folder is empty) - safe to retire.
  $target = $LegacyOwnVaultPath
  $action = "usun stary, osobny vault '$LegacyOwnVaultPath' (zawiera wylacznie znane elementy starego instalatora: .claude i/lub .obsidian) i wyrejestruj go z obsidian.json"
  if ($PSCmdlet.ShouldProcess($target, $action)) {
    Remove-Item -LiteralPath $LegacyOwnVaultPath -Recurse -Force
    Log "[LEGACY] usunieto stary, osobny vault: $LegacyOwnVaultPath (zawieral tylko .claude/.obsidian, czyli tylko to, co mogl tam zostawic sam instalator)"
  }

  $obsidianJsonPath = Join-Path $env:APPDATA 'obsidian\obsidian.json'
  if (-not (Test-Path -LiteralPath $obsidianJsonPath)) {
    Log "[LEGACY] obsidian.json nie istnieje - nic do wyrejestrowania"
    return
  }
  $target2 = $obsidianJsonPath
  $action2 = "wyrejestruj osierocony wpis starego vaulta (path=$LegacyOwnVaultPath) z obsidian.json"
  if ($PSCmdlet.ShouldProcess($target2, $action2)) {
    $json = Get-Content -LiteralPath $obsidianJsonPath -Raw | ConvertFrom-Json
    if ($json.vaults) {
      $removed = Remove-ObsidianVaultEntryByPath -ObsidianJson $json -Path $LegacyOwnVaultPath
      if ($removed -gt 0) {
        Set-JsonFileNoBom -LiteralPath $obsidianJsonPath -Content ($json | ConvertTo-Json -Depth 6)
        Log "[LEGACY] obsidian.json: wyrejestrowano osierocony wpis starego vaulta"
      } else {
        Log "[LEGACY] obsidian.json: brak wpisu dla $LegacyOwnVaultPath - juz czysto (no-op)"
      }
    } else {
      Log "[LEGACY] obsidian.json: brak sekcji 'vaults' - nic do wyrejestrowania"
    }
  }
}

# -- N5: agent runtime(s) (agent-agnostic) + skills sync from Drive G:, idempotent --
# ponytail: runtime list is config-driven (OD-1: never a hardcoded single vendor).
# `claude` is a single ~250MB standalone exe at $env:USERPROFILE\.local\bin\claude.exe with
# NO matching npm package and NO winget entry under that name (winget's "Claude" /
# Anthropic.Claude is the separate desktop app, confirmed via `winget list`) - that
# signature matches Anthropic's documented native/self-updating installer script, so the
# command below is the real mechanism, not a placeholder.
# Codex CLI: winget OpenAI.Codex (plan 2026-10-07, D8: wydawca OpenAI, ta sama wersja co npm,
# bez Node.js). Do 0.14.13 szlo przez npm - brak npm u Agnieszki konczyl przebieg FATAL-em.
# Istniejaca instalacja z npm (wlasciciel, Michal) aktualizowana jest nadal przez npm.
$N5Agents = @(
  @{ Id = 'claude'; Name = 'Claude Code'; DetectCmd = 'claude'; InstallCmd = 'irm https://claude.ai/install.ps1 -ErrorAction Stop | iex -ErrorAction Stop' }
  @{ Id = 'codex';  Name = 'Codex CLI';   DetectCmd = 'codex';  InstallCmd = 'winget install --id OpenAI.Codex --exact --silent --accept-package-agreements --accept-source-agreements' }
)

function Test-N5AgentPresent($agent) {
  # non-mutating: read-only command lookup, safe under -WhatIf
  return [bool](Get-Command $agent.DetectCmd -ErrorAction SilentlyContinue)
}

$script:N5Todo = @()
$script:N5Versions = @{}

function Add-N5Todo([string]$Name, [string]$Powod) {
  $Powod = $Powod -replace ' - pomijam$', ''
  Log "[N5] ${Name}: $Powod - pomijam, reszta instalacji idzie dalej"
  $powodTodo = $Powod -replace ' \(kod -?\d+\)', ''
  $script:N5Todo += "${Name}: $powodTodo. Uruchom ENVI-SB-instalator.cmd jeszcze raz; jesli problem wroci, wyslij plik $InstallLogFile wlascicielowi."
}

function Get-N5Version([string]$Command) {
  try {
    if (Get-Command $Command -ErrorAction SilentlyContinue) {
      $v = & $Command --version 2>&1 | Out-String
      if ($LASTEXITCODE -eq 0 -and $v.Trim()) { return $v.Trim() }
    }
  } catch { }
  return 'nieznana (brak polecenia lub blad odczytu)'
}

function Test-N5CodexNpm {
  if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { return $false }
  $lista = npm list -g --depth=0 --json 2>$null | Out-String
  try {
    if (($lista | ConvertFrom-Json -ErrorAction Stop).dependencies.'@openai/codex') { return $true }
  } catch { }
  $prefix = (npm prefix -g 2>$null | Out-String).Trim()
  $cmd = Get-Command codex -ErrorAction SilentlyContinue
  return ($LASTEXITCODE -eq 0 -and $prefix -and $cmd.Source -and
    $cmd.Source.StartsWith($prefix.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase))
}

function Invoke-N5Runtime {
  # Jeden dom obslugi bledow i wersji dla Node.js i obu CLI; kazde wywolanie izolowane.
  param([string]$Name, [string]$Command, [string]$InstallCmd, [string]$UpdateCmd)
  try {
    $present = [bool](Get-Command $Command -ErrorAction SilentlyContinue)
    $before = Get-N5Version $Command
    Log "[N5] ${Name}: wersja przed: $before"
    $action = if ($present) { $UpdateCmd } else { $InstallCmd }
    if (-not $PSCmdlet.ShouldProcess($Name, $action)) { return }
    $tool = ($action -split '\s+')[0]
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "brak polecenia '$tool' na tym komputerze" }
    Log "[N5] ${Name}: $action"
    Log "[N5]   Windows moze zapytac 'Czy zezwolic na wprowadzanie zmian?' - to instalacja lub aktualizacja $Name, kliknij Tak."
    # Instalator Claude w osobnym zakresie: jego $Target nie nadpisuje lokalnych zmiennych.
    $global:LASTEXITCODE = 0
    & ([scriptblock]::Create($action))
    $code = $LASTEXITCODE
    # winget: APPINSTALLER_CLI_ERROR_UPDATE_NOT_APPLICABLE (0x8A15002B).
    if ($code -ne 0 -and -not ($action -like 'winget upgrade *' -and $code -eq -1978335189)) {
      throw $(if ($tool -eq 'winget') { "winget zglosil blad (kod $code)" } else { "polecenie zakonczylo sie bledem (kod $code)" })
    }
    Sync-PathFromRegistry
    $bin = Join-Path $env:USERPROFILE '.local\bin'
    if ((Test-Path -LiteralPath $bin) -and @($env:Path -split ';') -notcontains $bin) { $env:Path += ';' + $bin }
  } catch {
    Add-N5Todo $Name $_.Exception.Message
  } finally {
    $after = Get-N5Version $Command
    $script:N5Versions[$Name] = $after
    Log "[N5] ${Name}: wersja po: $after"
  }
}

function Install-N5NodeJs {
  Invoke-N5Runtime -Name 'Node.js' -Command 'node' `
    -InstallCmd 'winget install --id OpenJS.NodeJS.LTS --exact --silent --accept-package-agreements --accept-source-agreements' `
    -UpdateCmd 'winget upgrade --id OpenJS.NodeJS.LTS --exact --silent --accept-package-agreements --accept-source-agreements'
}

function Invoke-N5AgentInstalls {
  foreach ($agent in $N5Agents) {
    try {
      $update = 'claude update'
      if ($agent.Id -eq 'codex') {
        $update = if ((Test-N5AgentPresent $agent) -and (Test-N5CodexNpm)) {
          'npm install -g @openai/codex@latest'
        } else { 'winget upgrade --id OpenAI.Codex --exact --silent --accept-package-agreements --accept-source-agreements' }
      }
      Invoke-N5Runtime -Name $agent.Name -Command $agent.DetectCmd -InstallCmd $agent.InstallCmd -UpdateCmd $update
    } catch { Add-N5Todo $agent.Name $_.Exception.Message }
  }
}

function Invoke-N5DesktopInstalls {
  foreach ($app in @(
    @{ Name = 'Claude Desktop'; Id = 'Anthropic.Claude'; Cmd = 'winget install --id Anthropic.Claude --exact --silent --accept-package-agreements --accept-source-agreements' }
    @{ Name = 'aplikacja Codex (ChatGPT)'; Id = 'OpenAI.Codex'; Cmd = 'winget install --id 9PLM9XGG6VKS -s msstore --accept-package-agreements --accept-source-agreements' }
  )) {
    try {
      if ($app.Id -eq 'Anthropic.Claude') {
        # ponytail: winget list exit 0 = pakiet obecny, niezaleznie od jezyka tabeli.
        # Przy bledzie zapytania zatrzymujemy ten krok; nie zgadujemy, ze trzeba instalowac.
        $null = winget list --id Anthropic.Claude --exact --accept-source-agreements 2>&1
        $code = $LASTEXITCODE
        if ($code -eq 0) { Log "[N5] $($app.Name) juz jest"; continue }
        # APPINSTALLER_CLI_ERROR_NO_APPLICATIONS_FOUND (0x8A150014).
        if ($code -ne -1978335212) { throw "winget zglosil blad przy sprawdzaniu aplikacji (kod $code)" }
      } elseif (Get-AppxPackage -Name 'OpenAI.Codex' -ErrorAction Stop) {
        Log "[N5] $($app.Name) juz jest"; continue
      }
      if (-not $PSCmdlet.ShouldProcess($app.Name, $app.Cmd)) { continue }
      Log "[N5]   Windows lub Sklep Microsoft moze otworzyc okno zgody - to instalacja $($app.Name), zaakceptuj ja."
      $global:LASTEXITCODE = 0
      & ([scriptblock]::Create($app.Cmd))
      if ($LASTEXITCODE -ne 0) { throw "winget zglosil blad (kod $LASTEXITCODE)" }
      Log "[N5] $($app.Name) zainstalowana"
    } catch { Add-N5Todo $app.Name $_.Exception.Message }
  }
}

function Set-N5GoogleInstructions {
  $block = @'
<!-- SB-GOOGLE:START -->
## Dysk i Dokumenty Google
Uzywaj skryptu pracownika: py -3 "%USERPROFILE%\.envi\google\sb-google.py".
W PowerShell zamiast %USERPROFILE% uzyj $env:USERPROFILE (sciezke ujmij w cudzyslowy).
Przyklady (cmd.exe; w PowerShell rozwin sciezke jak wyzej):
- Konto: py -3 "%USERPROFILE%\.envi\google\sb-google.py" status
- Wgraj plik: py -3 "%USERPROFILE%\.envi\google\sb-google.py" upload "C:\pliki\raport.pdf" --folder <folder-id>
- Utworz Dokument Google: py -3 "%USERPROFILE%\.envi\google\sb-google.py" upload "C:\pliki\raport.docx" --folder <folder-id> --jako-dokument
- Odczytaj dokument: py -3 "%USERPROFILE%\.envi\google\sb-google.py" api docs/documents/<id>
- Zmien dokument: py -3 "%USERPROFILE%\.envi\google\sb-google.py" api docs/documents/<id>:batchUpdate POST @plik.json
Usuwaj tylko do kosza: api drive/v3/files/<id> PATCH @kosz.json, gdzie kosz.json zawiera {"trashed":true}. Nigdy nie usuwaj trwale (DELETE).
Dyski wspoldzielone wymagaja supportsAllDrives; skrypt dodaje ten parametr.
Po kazdej zmianie potwierdz wynik ponownym odczytem (api); po wgraniu odczytaj drive/v3/files/<id>.
<!-- SB-GOOGLE:END -->
'@
  foreach ($relative in @('.claude\CLAUDE.md', '.codex\AGENTS.md')) {
    $file = Join-Path $env:USERPROFILE $relative
    try {
      if (-not $PSCmdlet.ShouldProcess($file, 'odswiez instrukcje Google miedzy znacznikami SB-GOOGLE')) { continue }
      $text = if (Test-Path -LiteralPath $file) { [IO.File]::ReadAllText($file) } else { '' }
      $pattern = '(?s)<!-- SB-GOOGLE:START -->.*?<!-- SB-GOOGLE:END -->'
      if ($text -match $pattern) {
        # MatchEvaluator zachowuje doslowne $env:USERPROFILE i tresci poza blokiem.
        $text = [regex]::Replace($text, $pattern, [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $block })
      } else { $text += $(if ($text -and -not $text.EndsWith("`n")) { "`n" }) + "`n" + $block + "`n" }
      $null = New-Item -ItemType Directory -Force -Path (Split-Path $file -Parent) -ErrorAction Stop
      [IO.File]::WriteAllText($file, $text, (New-Object Text.UTF8Encoding($false)))
    } catch { Add-N5Todo "Instrukcje Google ($relative)" $_.Exception.Message }
  }
}

function Invoke-N5Google {
  param([scriptblock]$Czytaj = { param($pytanie) try { Read-Host $pytanie } catch { 'N' } })
  try {
    $dir = Join-Path $env:USERPROFILE '.envi\google'
    $google = Join-Path $dir 'sb-google.py'
    $client = Join-Path (Split-Path $SkillDriveRoot -Parent) '.google\sb-pracownicy-oauth-client.json'
    $clientJest = Test-Path -LiteralPath $client
    Log ("[N5] plik klienta Google na Dysku: {0}" -f $(if ($clientJest) { 'jest' } else { 'brak' }))
    if (-not $PSCmdlet.ShouldProcess($google, 'skopiuj skrypt Google pracownika')) { return }
    $null = New-Item -ItemType Directory -Force -Path $dir -ErrorAction Stop
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'sb-google.py') -Destination $google -Force -ErrorAction Stop
    if (-not $clientJest) {
      Add-N5Todo 'Google' 'brak pliku klienta Google na Dysku - pomijam'
      return
    }
    if (-not $PSCmdlet.ShouldProcess($dir, 'skopiuj klienta OAuth i sprawdz konto Google; login gdy token nie dziala')) { return }
    Copy-Item -LiteralPath $client -Destination $dir -Force -ErrorAction Stop
    if (-not $script:PyLauncher) { throw 'brak launchera Python (py) po kroku N1' }
    $global:LASTEXITCODE = 0
    $account = & $script:PyLauncher -3 $google status 2>&1 | Out-String
    if ($LASTEXITCODE -eq 0) { Log "[N5] Google: konto $($account.Trim()) - token dziala"; return }
    Log '[N5] Google: otworzy sie przegladarka. Wybierz konto Google, ktorym logujesz sie do PS.'
    Log '[N5]   Google moze pokazac "Google nie zweryfikowal tej aplikacji" -> "Zaawansowane" -> "Przejdz do ENVI Second Brain". Kliknij Zezwol.'
    $answer = & $Czytaj 'Enter = zaloguj teraz, N = pomin'
    if ("$answer".Trim() -match '^[nN]') { throw 'logowanie pominiete' }
    $global:LASTEXITCODE = 0
    & $script:PyLauncher -3 $google login
    if ($LASTEXITCODE -ne 0) { throw "logowanie nieudane (kod $LASTEXITCODE)" }
    $account = & $script:PyLauncher -3 $google status 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw 'nie udalo sie potwierdzic konta po logowaniu' }
    Log "[N5] Google: konto $($account.Trim()) - token dziala"
  } catch { Add-N5Todo 'Google' $_.Exception.Message }
}

function Set-N5LocalBinPath {
  # R1/D5: instalator natywny Claude Code kladzie claude.exe w %USERPROFILE%\.local\bin i tylko
  # PROSI o dopisanie go do PATH (komunikat u Agnieszki 07.10). Dopisujemy sami: PATH uzytkownika,
  # bez administratora; do PATH tego procesu tez, zeby podsumowanie widzialo claude od razu.
  $kat = Join-Path $env:USERPROFILE '.local\bin'
  if (-not (Test-Path -LiteralPath $kat)) { return }
  if ($PSCmdlet.ShouldProcess('PATH uzytkownika', "dopisz $kat, gdy go brakuje")) {
    try {
      if (Add-KatalogDoPathUzytkownika -Katalog $kat) { Log "[N5] dopisano $kat do PATH uzytkownika (polecenie 'claude' zadziala w nowych oknach)" }
    } catch {
      Log "[N5] nie udalo sie dopisac $kat do PATH uzytkownika ($($_.Exception.Message)) - polecenie 'claude' moze nie dzialac w nowych oknach"
    }
    if (@($env:Path -split ';') -notcontains $kat) { $env:Path = $env:Path.TrimEnd(';') + ';' + $kat }
  }
}

function Add-KatalogDoPathUzytkownika {
  # Czyta i pisze PATH uzytkownika wprost w rejestrze (HKCU\<Klucz>), zachowujac rodzaj wartosci
  # i %ZMIENNE% nierozwiniete. [Environment]::SetEnvironmentVariable zapisalby REG_SZ z rozwinietymi
  # sciezkami. Wpis porownywany po rozwinieciu i bez koncowego '\', bez wielkosci liter. Zwraca
  # $true, gdy dopisal. Klucz inny niz 'Environment' sluzy sprawdzianowi (TEST 25).
  param([string]$Katalog, [string]$Klucz = 'Environment')
  $szukany = $Katalog.TrimEnd('\')
  $k = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($Klucz)
  try {
    $jest = @($k.GetValueNames()) -contains 'Path'
    $obecna = if ($jest) { [string]$k.GetValue('Path', '', [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames) } else { '' }
    $rodzaj = if ($jest) { $k.GetValueKind('Path') } else { [Microsoft.Win32.RegistryValueKind]::ExpandString }
    $wpisy = @($obecna -split ';' | Where-Object { $_ })
    foreach ($w in $wpisy) {
      if ([Environment]::ExpandEnvironmentVariables($w).TrimEnd('\') -eq $szukany) { return $false }
    }
    $k.SetValue('Path', (@($wpisy) + $szukany) -join ';', $rodzaj)
  } finally { $k.Close() }
  if ($Klucz -eq 'Environment') {
    # Explorer (a za nim kazde nowe okno) czyta PATH na nowo dopiero po tym komunikacie.
    try {
      if (-not ('SBBoot.Srodowisko' -as [type])) {
        Add-Type -Namespace SBBoot -Name Srodowisko -MemberDefinition '[System.Runtime.InteropServices.DllImport("user32.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)] public static extern System.IntPtr SendMessageTimeout(System.IntPtr hWnd, int Msg, System.IntPtr wParam, string lParam, int fuFlags, int uTimeout, out System.IntPtr lpdwResult);'
      }
      $r = [IntPtr]::Zero
      [void][SBBoot.Srodowisko]::SendMessageTimeout([IntPtr]0xffff, 0x1A, [IntPtr]::Zero, 'Environment', 2, 5000, [ref]$r)
    } catch { }
  }
  return $true
}

function New-EnviSyncConfig {
  # Non-interactive stand-in for envi-skill-sync's bootstrap-sync-config.ps1, which is
  # Read-Host/interactive and would hang an unattended bootstrap run. The 'claude' target
  # points at the .claude\skills folder N4 already ensured exists inside the (single, T3) vault
  # - it used to be written blank+disabled "for the user to fill in later", which for a
  # non-technical user means never.
  param([string]$ConfigPath, [string]$SourceG, [string]$VaultForSkills)
  $lines = @(
    'environments:'
    '  claude:'
    "    path: $VaultForSkills\.claude\skills"
    '    enabled: true'
    '  codex:'
    "    path: $env:USERPROFILE\.codex\skills"
    '    enabled: true'
    '  copilot:'
    "    path: $env:USERPROFILE\.copilot\skills"
    '    enabled: true'
    "source_g: $SourceG"
  )
  $configDir = Split-Path $ConfigPath -Parent
  if (-not (Test-Path $configDir)) { New-Item -ItemType Directory -Path $configDir -Force | Out-Null }
  # Reuses N4's Set-JsonFileNoBom: it is just a BOM-less text writer, not JSON-specific -
  # the same BOM caution applies to the YAML read by the sync engine (P3).
  Set-JsonFileNoBom -LiteralPath $ConfigPath -Content (($lines -join "`n") + "`n")
}

function Set-EnviSyncConfigJesliTrzeba {
  # D4: JEDEN dom warunku "nie nadpisuj prawdziwej konfiguracji". Wolane dwa razy - z N3b
  # (zeby pierwszy przebieg silnika mial juz cele skilli; do 2026-09-09 konfiguracja
  # powstawala dopiero w N5, wiec stan po instalacji mowil "skille: 0 / 0 (brak
  # konfiguracji celow)" az do nastepnej godziny) i z N5 (bo Dysk mogl pojawic sie po
  # drodze). Drugie wywolanie nie ma nic do roboty, gdy pierwsze zapisalo.
  param([string]$SourceG, [string]$Skad = 'N5')
  $syncConfigPath = Join-Path (Join-Path $env:USERPROFILE '.envi') 'sync-config.yaml'
  # A config left by an EARLIER bootstrap may carry the old blank 'claude:' path. Treat that
  # as "not configured yet" and rewrite it, so an employee who already ran the installer once
  # gets the fix on the next run instead of being told to edit YAML by hand. A config with a
  # real claude path (the owner's machine, or any hand-tuned one) is never touched.
  $needsConfig = $true
  if (Test-Path -LiteralPath $syncConfigPath) {
    $existing = Get-Content -LiteralPath $syncConfigPath -Raw
    # Anchored to the claude: block specifically, and \s is avoided after 'path:' on purpose:
    # \s matches newlines, so a blank "path:" would falsely match the next line's content.
    if ($existing -match '(?m)^\s*claude:[ \t]*\r?\n[ \t]*path:[ \t]*\S') {
      $needsConfig = $false
      # T3 migration, added on top of the rule above (not a replacement for it): a config
      # written BEFORE the single-vault merge points 'claude:' at the old, now-retired second
      # vault - not a hand-tuned path, a stale one, and the folder it names may no longer even
      # exist once Invoke-LegacyOwnVaultCleanup has run. Detected by literal match against the
      # known legacy value only, so any OTHER real path (already correct, or genuinely
      # hand-tuned) is still left alone per the original rule.
      $legacySkillsPath = Join-Path $LegacyOwnVaultPath '.claude\skills'
      $legacyPattern = '(?m)^\s*claude:[ \t]*\r?\n[ \t]*path:[ \t]*' + [regex]::Escape($legacySkillsPath) + '[ \t]*\r?$'
      if ($existing -match $legacyPattern) {
        $needsConfig = $true
        Log "[$Skad] $syncConfigPath still points 'claude:' at the retired pre-T3 vault ($legacySkillsPath) - treating as stale, will rewrite"
      }
    }
  }
  if (-not $needsConfig) {
    Log "[$Skad] $syncConfigPath already configured - skip config generation"
    return
  }
  if (-not $SourceG) {
    Log "[$Skad] nie znam sciezki skilli na Dysku - konfiguracji celow nie zapisuje w tym przebiegu"
    return
  }
  $action = "write sync-config.yaml (source_g=$SourceG, claude=$VaultPath\.claude\skills, codex+copilot enabled)"
  if ($PSCmdlet.ShouldProcess($syncConfigPath, $action)) {
    New-EnviSyncConfig -ConfigPath $syncConfigPath -SourceG $SourceG -VaultForSkills $VaultPath
    Log "[$Skad] wrote $syncConfigPath (claude target = $VaultPath\.claude\skills)"
  }
}


function Invoke-N5SkillsSync {
  if (-not (Test-Path -LiteralPath $SkillDriveRoot)) {
    Log "[N5] Nie widac skilli na Dysku Google: '$SkillDriveRoot'. Zaloguj sie w aplikacji Dysk Google kontem, ktorym logujesz sie do PS, poczekaj na podlaczenie dysku i uruchom ENVI-SB-instalator.cmd jeszcze raz. Skille zostana pominiete w tym przebiegu."
    return
  }
  Log "[N5] skills source reachable: $SkillDriveRoot"

  Set-EnviSyncConfigJesliTrzeba -SourceG $SkillDriveRoot -Skad 'N5'

  # P3: skille kopiuje SILNIK (project-sync.ps1 -TylkoSkille), a nie Python.
  # Powod: swiezy Windows 11 ma pod nazwa `python` atrape ze sklepu, ktora otwiera
  # Store zamiast wykonac skrypt - a rdzen i tak jedzie na kazda maszyne.
  if (-not (Test-Path -LiteralPath $SyncEnginePath)) {
    Log "[N5] sync engine not installed yet ('$SyncEnginePath') - skills sync skipped this run"
    return
  }
  $target = 'skills sync (project-sync.ps1 -TylkoSkille)'
  $action = "powershell -File `"$SyncEnginePath`" -TylkoSkille -SkillDriveRoot `"$SkillDriveRoot`""
  if ($PSCmdlet.ShouldProcess($target, $action)) {
    Log "[N5] running skills sync ..."
    $out = & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File $SyncEnginePath `
             -TylkoSkille -SkillDriveRoot $SkillDriveRoot 2>&1
    foreach ($linia in @($out)) { Log "[N5] $linia" }
    $m = [regex]::Match(($out -join "`n"), 'SKILLE-PODSUMOWANIE zainstalowane=(\d+) na_dysku=(\d+)')
    # D1: OBIE liczby z tego samego zrodla. Silnik liczy: zainstalowane = paczki, ktore po
    # kroku sa w porzadku we WSZYSTKICH swoich wlaczonych celach na tej maszynie; na_dysku =
    # paczki majace tu co najmniej jeden cel. Liczenie katalogow w vaultcie dawalo "35 / 33".
    if ($m.Success) {
      $script:SkilleZainstalowane = [int]$m.Groups[1].Value
      $script:SkilleNaDysku = [int]$m.Groups[2].Value
    }
    Log "[N5] skills sync done (szczegoly per skill w project-sync.log)"
  }
}

function Invoke-N5PocztaSync {
  # M4: menu skrzynek (M3, sb-tray.ps1) juz wola silnik z -TylkoPoczta po kazdej zmianie -
  # tu wolamy go RAZ po pierwszym przebiegu instalatora, zeby nowa osoba miala serwer
  # poczty zarejestrowany od startu, a nie dopiero po pierwszej godzinnej synchronizacji.
  # Implementacja jest jedna (w silniku); instalator tylko nie pomija PIERWSZEGO wywolania.
  if (-not (Test-Path -LiteralPath $SyncEnginePath)) {
    Log "[N5] sync engine not installed yet ('$SyncEnginePath') - poczta sync skipped this run"
    return
  }
  $target = 'poczta sync (project-sync.ps1 -TylkoPoczta)'
  $action = "powershell -File `"$SyncEnginePath`" -TylkoPoczta"
  if ($PSCmdlet.ShouldProcess($target, $action)) {
    Log "[N5] running poczta sync ..."
    $out = & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File $SyncEnginePath -TylkoPoczta 2>&1
    foreach ($linia in @($out)) { Log "[N5] $linia" }
    $m = [regex]::Match(($out -join "`n"), 'POCZTA-PODSUMOWANIE skrzynek=(\d+) zarejestrowanych=(\d+)')
    if ($m.Success) {
      $script:PocztaSkrzynek = [int]$m.Groups[1].Value
      $script:PocztaZarejestrowanych = [int]$m.Groups[2].Value
    }
    Log "[N5] poczta sync done (szczegoly w project-sync.log)"
  }
}

function Invoke-N5ChannelSeparationGuard {
  # non-mutating: read-only git query. Enforces the Distribution-split locked decision:
  # git canon = knowledge only; skill PACKAGES + skill TOOLING must never enter the git
  # channel. ponytail: the plan's literal evidence command (grep -c skill) was imprecise -
  # substring 'skill' also matches legit knowledge docs like
  # 40_wiki/second-brain/skills-management.md (a doctrine page, not a package/tool), so it
  # cried wolf. Refined to match the actual channel artifacts: a file ending in `.skill`
  # (a package) or living under a skill-tooling path (`.claude/skills/`). Knowledge docs
  # under 40_wiki/**.md are intentionally NOT flagged. Non-fatal WARNING, same as before.
  $gitDir = Join-Path $VaultPath '.git'
  if (-not (Test-Path -LiteralPath $gitDir)) {
    Log "[N5] channel-separation check deferred - $VaultPath not present this run"
    return
  }
  $files = git -C $VaultPath ls-files
  $leaks = @($files | Where-Object { $_ -match '\.skill$' -or $_ -match '(^|/)\.claude/skills/' })
  if ($leaks.Count -eq 0) {
    Log "[N5] channel-separation check PASS: 0 skill packages/tooling in git canon"
  } else {
    Log "[N5] WARNING: channel-separation check FAILED: $($leaks.Count) skill package/tooling file(s) leaked into git canon: $($leaks -join ', ')"
  }
}

function Invoke-StepN5 {
  Log "[N5] agent runtime + skills sync step starting"
  # R1/D1: najpierw skille (silnik kopiuje pliki z Dysku, nie potrzebuje agentow), potem Node.js
  # i agenci. Do 0.14.13 bylo odwrotnie i wyjatek przy agencie zabieral skille (Agnieszka 07.10).
  Invoke-N5SkillsSync
  Invoke-N5PocztaSync
  Install-N5NodeJs
  Invoke-N5AgentInstalls
  Set-N5LocalBinPath
  Invoke-N5DesktopInstalls
  Set-N5GoogleInstructions
  Invoke-N5Google
  Invoke-N5ChannelSeparationGuard
  Log "[N5] agent runtime + skills sync step done"
}

# -- N6: stub. Real logic lands in checkpoint N6. --
$stubs = [ordered]@{
  'N6' = "checklist: README-onboarding (GitHub acct, org invite to envi-konsulting with Read/Write on ENVI.SB, Drive login, Copilot opt-out) + clean-machine test"
}

# J1: numer wydania wbity w ENVI-SB-instalator.cmd - pierwszy wpis przebiegu mowi, ktora wersje uruchomiono.
$wersjaInstalatora = if ($env:SB_INSTALATOR_WERSJA) { "wersja $env:SB_INSTALATOR_WERSJA" } else { 'bez numeru wydania (uruchomiony wprost)' }
Log "=== ENVI.SB bootstrap, $wersjaInstalatora (WhatIf=$($PSBoundParameters.ContainsKey('WhatIf') -or $WhatIfPreference)) ==="
Log "Zapis przebiegu: $InstallLogFile"
try {
# Runs once, before N1: retires the pre-T3 second vault if - and only if - it is safe to do so.
# Independent of the N1-N6 sequence below (different, now-obsolete path), so it never blocks it.
Invoke-LegacyOwnVaultCleanup
foreach ($id in @('N1', 'N2', 'N2b', 'N3', 'N3b', 'N4', 'N5', 'N6')) {
  if ($id -eq 'N1') {
    Invoke-StepN1
    continue
  }
  if ($id -eq 'N2') {
    Invoke-StepN2
    continue
  }
  if ($id -eq 'N2b') {
    Invoke-StepN2b
    continue
  }
  if ($id -eq 'N3') {
    Invoke-StepN3
    continue
  }
  if ($id -eq 'N3b') {
    Invoke-StepN3b
    continue
  }
  if ($id -eq 'N4') {
    Invoke-StepN4
    continue
  }
  if ($id -eq 'N5') {
    Invoke-StepN5
    continue
  }
  $desc = $stubs[$id]
  if ($PSCmdlet.ShouldProcess($id, $desc)) {
    # ponytail: stub - real implementation arrives in checkpoint $id
    Log "[$id] (stub) $desc"
  }
}
} catch {
  # Last-resort net: any unexpected terminating error still lands in bootstrap.log instead of
  # only flashing in a console window that closes on exit.
  Log "FATAL: unhandled error - $($_.Exception.Message) [$($_.InvocationInfo.ScriptName):$($_.InvocationInfo.ScriptLineNumber)]"
}
# -- Closing summary: state of THIS machine, plus only the steps a human still has to do.
# ponytail: derived from live probes at the end of the run, never from what the steps above
# intended to do - a step can warn and continue, and the user must not have to read the log
# backwards to find out. Only failed/missing items produce an instruction line.
Log ""
Log "=== PODSUMOWANIE / SUMMARY ==="
# T6: role drives which lines below even apply - a consumer never had a project area to
# begin with, so its absence must not read as a defect (see $todo below).
$sumRole = if ($script:InstallRoleResult) { $script:InstallRoleResult.Role } else { 'consumer' }
$sumRoleLabel = if ($sumRole -eq 'team') { 'czlonek zespolu' } else { 'konsument' }
$sumCanon = Test-Path -LiteralPath (Join-Path $VaultPath '.git')
$sumProjects = Test-Path -LiteralPath (Join-Path $ProjectsClonePath '.git')
$sumSkills = Test-Path -LiteralPath $SkillDriveRoot
$sumObsidian = Test-Path -LiteralPath (Join-Path $env:APPDATA 'obsidian\obsidian.json')
$vaultSkillCount = @(Get-ChildItem -LiteralPath (Join-Path $VaultPath '.claude\skills') -Directory -ErrorAction SilentlyContinue).Count
# Read/write is the SERVER's answer (D1), never derived from role - a consumer whose account
# was just added to the writers list is already "do zapisu" here, before anyone touches T6 again.
$sumCanonPushUrl = if ($sumCanon) { (git -C $VaultPath remote get-url --push origin 2>$null) } else { $null }
$sumCanonAccess = if (-not $sumCanon) { 'BRAK' } elseif ("$sumCanonPushUrl" -eq 'DISABLED') { 'do odczytu' } else { 'do zapisu' }
$sumSyncTask = $false
if ($sumRole -eq 'team') {
  schtasks /query /tn $SyncTaskName *> $null
  $sumSyncTask = ($LASTEXITCODE -eq 0)
}
Log ("Twoja rola:                        {0}" -f $sumRoleLabel)
# T6: the vault label follows the ROLE, not the wording of the T3-era summary. A consumer has
# no project area at all (that is correct behaviour, see the $todo guard below), so calling
# their vault "kanon + projekty" would describe something they will never find and read as a
# failed install - the same class of confusion that already cost two employee machines in N4.
$sumVaultLabel = if ($sumRole -eq 'team') { 'Twoj vault (kanon + projekty):    ' } else { 'Twoj vault (kanon):               ' }
Log ("{0} {1}  [{2}]" -f $sumVaultLabel, $VaultPath, $(if ($sumCanon) { 'OK' } else { 'BRAK' }))
Log ("  - kanon 40_wiki:                 [{0}] ({1})" -f $(if ($sumCanon) { 'OK' } else { 'BRAK' }), $sumCanonAccess)
if ($sumRole -eq 'team') {
  Log ("  - obszar projektowy 20_projects: [{0}]" -f $(if ($sumProjects) { 'OK' } else { 'BRAK' }))
  Log ("  - synchronizacja w tle:          [{0}]" -f $(if ($sumSyncTask) { 'OK' } else { 'BRAK' }))
  # Stan odczytany, nie zadeklarowany - skrot na pulpicie jest jedynym, ktory uzytkownik
  # znajdzie od razu (menu Start zalezy od indeksu wyszukiwania, ktory potrafi sie spoznic).
  $sumSyncLnk = Test-Path -LiteralPath (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Synchronizuj teraz (Second Brain).lnk')
  Log ("  - skrot 'Synchronizuj teraz':    [{0}] pulpit i menu Start" -f $(if ($sumSyncLnk) { 'OK' } else { 'BRAK' }))
  if ($sumSyncLnk) {
    Log "    (chcesz go miec na pasku zadan? prawy przycisk na ikonie -> Pokaz wiecej opcji -> Przypnij do paska zadan)"
  }
} else {
  Log "  - obszar projektowy 20_projects: nie dotyczy tej roli (konsument)"
}
Log ("Skille na Dysku Google:            {0}  [{1}]" -f $SkillDriveRoot, $(if ($sumSkills) { 'OK' } else { 'BRAK' }))
Log ("Skille w Twoim vaultcie:           {0} szt." -f $vaultSkillCount)
Log ("Obsidian - vaulty zarejestrowane:  {0}" -f $(if ($sumObsidian) { 'OK' } else { 'BRAK' }))
# P2: trzy linie odczytane z systemu po zakonczeniu krokow, nie z tego, co kroki zamierzaly.
$sumEnviDir = Split-Path $SyncEnginePath -Parent
# B2: rezydent ikony i silnik sa CZESCIA ROLI 'czlonek zespolu'. Konsument nie dostaje ich
# z zalozenia (patrz Install-RdzenZDysku), wiec linia "Ikona ... nie" i pozycja "do zrobienia"
# opisywalyby u niego usterke, ktorej nie ma - ta sama klasa myslenia, co przy 20_projects.
$sumTray = $false
$sumPrzebieg = $null
$sumPrzebiegOpis = $null
if ($sumRole -eq 'team') {
  $sumTray = Test-RezydentDziala -TrayPath (Join-Path $sumEnviDir 'sb-tray.ps1')
  # B3a: godzine podajemy tylko dla stanu koncowego 'udana'; kazda inna faza znaczy, ze
  # przebieg sie NIE zakonczyl, i wtedy mowimy, czym stoi.
  $stanSum = Get-StanPrzebiegu -StatePath (Join-Path $sumEnviDir 'project-sync.state.json')
  if ($stanSum -and $stanSum.Faza -eq 'udana') { $sumPrzebieg = $stanSum.Czas }
  elseif ($stanSum) { $sumPrzebiegOpis = ("nie zakonczyl sie ({0})" -f $stanSum.Opis) }
  Log ("Ikona przy zegarze (rezydent):     {0}" -f $(if ($sumTray) { 'dziala' } else { 'nie' }))
  Log ("Pierwszy przebieg:                 {0}" -f $(if ($sumPrzebieg) { $sumPrzebieg } else { $(if ($sumPrzebiegOpis) { $sumPrzebiegOpis } else { 'nie bylo' }) }))
} else {
  # Konsument nie ma silnika: jego pierwszym przebiegiem jest pobranie kanonu, a slad
  # zostawia sam git - FETCH_HEAD dostaje nowa date przy kazdym pobraniu.
  $fh = Join-Path $VaultPath '.git\FETCH_HEAD'
  if (Test-Path -LiteralPath $fh) { $sumPrzebieg = (Get-Item -LiteralPath $fh).LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss') }
  Log ("Pierwsze pobranie kanonu:          {0}" -f $(if ($sumPrzebieg) { $sumPrzebieg } else { 'nie bylo' }))
}
Log ("Skille:                            {0} / {1} aktualne" -f `
  $(if ($null -ne $script:SkilleZainstalowane) { $script:SkilleZainstalowane } else { '?' }), `
  $(if ($null -ne $script:SkilleNaDysku) { $script:SkilleNaDysku } else { '?' }))
# M4: ta sama zasada co przy skillach - liczba czytana z wyniku silnika (-TylkoPoczta),
# nie zalozona. '?' znaczy "silnik jeszcze nie odpowiedzial", nie "zero skrzynek".
Log ("Skrzynki poczty:                   {0} / {1} zarejestrowane w aplikacji Claude" -f `
  $(if ($null -ne $script:PocztaZarejestrowanych) { $script:PocztaZarejestrowanych } else { '?' }), `
  $(if ($null -ne $script:PocztaSkrzynek) { $script:PocztaSkrzynek } else { '?' }))
# R1: agenci w podsumowaniu - stan odczytany (Get-Command), nie zamiar z N5. Brakujacy agent
# albo Node.js to pozycja DO ZROBIENIA, nie FATAL i nie cisza.
$todoAgenci = @()
foreach ($ag in @(@{ Name = 'Node.js'; DetectCmd = 'node' }) + @($N5Agents)) {
  $agJest = [bool](Get-Command $ag.DetectCmd -ErrorAction SilentlyContinue)
  Log ("{0,-35}{1}" -f ($ag.Name + ':'), $(if ($agJest) { 'OK - ' + $script:N5Versions[$ag.Name] } else { 'BRAK' }))
  if (-not $agJest -and -not @($script:N5Todo | Where-Object { $_.StartsWith($ag.Name + ':') }).Count) { $todoAgenci += ("{0} sie nie zainstalowal. Uruchom ENVI-SB-instalator.cmd jeszcze raz (na okno 'Czy zezwolic na wprowadzanie zmian?' odpowiedz Tak); jesli wroci, wyslij plik $InstallLogFile wlascicielowi." -f $ag.Name) }
}
# Zasada 'Restricted' nie zostawia sladu w logu silnika, bo skrypt w ogole nie startuje -
# jedynym sygnalem jest kod ostatniego wyniku w harmonogramie (0 = OK, 267011 = jeszcze nie bylo).
$todoZadania = @()
foreach ($zad in @($TaskName, $SyncTaskName)) {
  if ($zad -eq $SyncTaskName -and $sumRole -ne 'team') { continue }
  $wynik = $null
  try { $wynik = (Get-ScheduledTaskInfo -TaskName $zad -ErrorAction Stop).LastTaskResult } catch { }
  Log ("Zadanie '{0}': ostatni wynik {1}" -f $zad, $(if ($null -ne $wynik) { $wynik } else { 'nieznany (zadania nie ma?)' }))
  if ($null -ne $wynik -and $wynik -ne 0 -and $wynik -ne 267011) {
    $todoZadania += ("Zadanie w tle '{0}' skonczylo sie bledem (kod {1}). Uruchom ENVI-SB-instalator.cmd jeszcze raz; jesli kod wroci, wyslij plik $InstallLogFile wlascicielowi." -f $zad, $wynik)
  }
}
Log ""
$todo = @()
if (-not $sumCanon) { $todo += "Kanon sie nie sciagnal. Uruchom ENVI-SB-instalator.cmd jeszcze raz i przy pytaniu o GitHub zaloguj sie w przegladarce. Jesli GitHub odmawia dostepu - popros przelozonego o zaproszenie do SB w PS i przyjmij je na stronie https://github.com/orgs/envi-konsulting/invitation (albo w mailu od GitHuba)." }
# Only a team member is supposed to have a project area - for a consumer, "brak" here is
# correct behaviour, not a defect, and must not generate a fix-it instruction (T6).
if ($sumRole -eq 'team' -and -not $sumProjects) { $todo += "Obszar projektowy (20_projects) sie nie sciagnal. Uruchom ENVI-SB-instalator.cmd jeszcze raz i przy pytaniu o GitHub zaloguj sie w przegladarce. Jesli druga proba tez nie pomoze, NIE probuj trzeci raz - wyslij plik $InstallLogFile wlascicielowi, bo przyczyna moze byc za dluga sciezka do Twojego folderu domowego i wtedy powtarzanie nic nie da." }
if ($sumRole -eq 'team' -and $sumProjects -and -not $sumSyncTask) { $todo += "Synchronizacja obszaru projektowego w tle sie nie skonfigurowala. Uruchom ENVI-SB-instalator.cmd jeszcze raz." }
if (-not $sumSkills) { $todo += "Skille sa niewidoczne. Zaloguj sie w aplikacji Dysk Google kontem, ktorym logujesz sie do PS, poczekaj az pojawi sie dysk w Eksploratorze, potem uruchom ENVI-SB-instalator.cmd jeszcze raz." }
if ($sumSkills -and $vaultSkillCount -eq 0) { $todo += "Skille sie nie skopiowaly. Uruchom ENVI-SB-instalator.cmd jeszcze raz; jesli to nie pomoze, wyslij plik $InstallLogFile wlascicielowi." }
if (-not $sumObsidian) { $todo += "Obsidian nie ma zarejestrowanego vaultu. Zamknij Obsidiana calkowicie i uruchom ENVI-SB-instalator.cmd jeszcze raz." }
# P2: kazde "nie" z trzech linii wyzej ma tu swoja pozycje - inaczej podsumowanie mowiloby
# o usterce i zostawialo czlowieka bez jednego ruchu, ktorym da sie ja odkrecic.
if ($sumRole -eq 'team' -and -not $sumTray) { $todo += "Ikona Second Brain przy zegarze nie dziala. Wyloguj sie i zaloguj ponownie (skrot w Autostarcie podniesie ja sam) albo uruchom ENVI-SB-instalator.cmd jeszcze raz." }
if ($sumRole -ne 'team' -and -not $sumPrzebieg) { $todo += "Pierwsze pobranie wiedzy firmowej sie nie odbylo. Uruchom ENVI-SB-instalator.cmd jeszcze raz po zalogowaniu do GitHub; jesli wroci, wyslij plik $InstallLogFile wlascicielowi." }
if ($sumRole -eq 'team' -and -not $sumPrzebieg) { $todo += "Pierwsza synchronizacja sie nie odbyla. Kliknij skrot 'Synchronizuj teraz (Second Brain)' na pulpicie; jesli nic sie nie stanie, wyslij plik $InstallLogFile wlascicielowi." }
$todo += $todoZadania
$todo += $todoAgenci
$todo += $script:N5Todo
# Stary instalator na PIERWSZYM miejscu: kolejne pozycje kaza uruchomic instalator jeszcze raz,
# a bez tego czlowiek uruchomilby ponownie ten sam stary plik (weryfikacja R2).
if ($script:InstalatorStary) { $todo = @($script:InstalatorStary -replace ' Ta instalacja idzie dalej\.$', '') + $todo }
if ($todo.Count -eq 0) {
  Log ("Nic nie zostalo do zrobienia recznie. Otworz Obsidiana - Twoj vault ({0}) powinien byc od razu widoczny." -f $(if ($sumRole -eq 'team') { 'kanon + obszar projektowy' } else { 'kanon' }))
} else {
  Log "DO ZROBIENIA:"
  for ($i = 0; $i -lt $todo.Count; $i++) { Log ("  {0}. {1}" -f ($i + 1), $todo[$i]) }
}
# R3/R2: strona SB w PS, sekcja "Po instalacji - co dalej" (router hashowy, sekcja z ?sekcja=).
$urlPoInstalacji = $PsUrl.TrimEnd('/') + '/#/sbInstaller?sekcja=po-instalacji'
if ($WhatIfPreference) {
  Log "(-WhatIf) otworzylbym strone SB w PS, sekcja 'Po instalacji - co dalej': $urlPoInstalacji"
} else {
  Log "Otwieram strone SB w PS, sekcja 'Po instalacji - co dalej': jak uruchomic Claude i Codex i co zrobic, gdy cos nie wyszlo. Gdyby sie nie otworzyla, wejdz recznie: $urlPoInstalacji"
  $null = Open-Url $urlPoInstalacji
}
Log "Pelny zapis przebiegu (ten plik wyslij, gdy cos nie dziala): $InstallLogFile"
Log "=== bootstrap run done ==="
# R2: znacznik konca (poz. 3). ENVI-SB-instalator.cmd kasuje ten plik przed startem i po przebiegu
# sprawdza, czy jest - brak znaczy, ze przebieg sie urwal przed podsumowaniem (Avast zabijal skrypt
# w trakcie, a czlowiek widzial tylko "nacisnij dowolny klawisz"). Zapis .NET-em, nie Set-Content:
# ma powstac takze pod -WhatIf. Bez zmiennej (uruchomienie wprost, nie z .cmd) - nic nie piszemy.
if ($env:SB_INSTALATOR_KONIEC) {
  try { [System.IO.File]::WriteAllText($env:SB_INSTALATOR_KONIEC, (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')) }
  catch { Log "Nie udalo sie zapisac znacznika konca '$env:SB_INSTALATOR_KONIEC' ($($_.Exception.Message)) - okno instalatora powie, ze przebieg sie urwal, choc doszedl do konca." }
}

#SB-PLIK README-onboarding.md 9143
# Second Brain ENVI: pierwsze uruchomienie na Twoim komputerze

Ten dokument prowadzi Cię przez pierwsze uruchomienie firmowego Second Brain na nowym komputerze. Nie zakładasz żadnych kont i niczego nikomu nie wysyłasz: do wszystkiego używasz **jednego konta Google, którym logujesz się do PS ENVI**. Tym samym kontem logujesz się do Dysku Google i do GitHuba.

Jeśli utkniesz na którymś kroku, nic straconego. Instalator sam powie po polsku, czego brakuje, i da się go uruchomić ponownie, patrz sekcja "Jeśli coś wygląda na zawieszone" na końcu.

## Zanim uruchomisz instalator

Trzy rzeczy, każdą robisz raz.

### 1. Dostęp do Second Brain

Dostęp nadaje Twój przełożony w PS ENVI: zaprasza Cię do Second Brain jednym kliknięciem. Bez takiego zaproszenia PS nie wyda instalatora, więc skoro go pobrałeś(aś), dostęp już masz.

Zaproszenie na GitHubie przychodzi **mailem od GitHuba na adres, którym logujesz się do PS**. Nie zakładasz konta GitHub osobno i nie wysyłasz nikomu swojej nazwy użytkownika.

1. Otwórz mail od GitHuba (zajrzyj też do folderu ze spamem) i kliknij **Join**.
2. Na stronie logowania wybierz **Continue with Google** i zaloguj się tym samym kontem Google, którym logujesz się do PS. Jeśli nie masz jeszcze konta GitHub, ta opcja założy je za Ciebie, a GitHub zapyta tylko o nazwę użytkownika.

Jeśli maila nie widzisz, zaproszenie możesz przyjąć też na stronie [github.com/orgs/envi-konsulting/invitation](https://github.com/orgs/envi-konsulting/invitation). Jeśli i tam go nie ma, poproś przełożonego o zaproszenie do Second Brain w PS.

Po przyjęciu zaproszenia masz dostęp do wiedzy firmowej, **tylko do odczytu**, więc nie możesz w niej niczego przypadkowo zepsuć ani nadpisać.

### 2. Dysk Google

Zainstaluj Dysk Google na komputerze (albo zaloguj się, jeśli już go masz) **tym samym kontem, którym logujesz się do PS**. Zwykle już jesteś tak zalogowany(a). Sprawdzisz to, klikając swoje zdjęcie w prawym górnym rogu aplikacji Dysk Google: powinien tam być ten adres.

Po zalogowaniu na Twoim komputerze pojawi się dysk `G:`. Z niego instalator pobiera narzędzia dla agenta.

**To normalne:** jeśli uruchomisz instalator, zanim zdążysz się zalogować do Dysku Google, instalator grzecznie Cię o tym poinformuje i zatrzyma tylko ten jeden etap. To nie jest błąd. Po zalogowaniu wystarczy uruchomić plik jeszcze raz.

### 3. Wyłączenie trenowania AI na koncie GitHub

Po przyjęciu zaproszenia wyłącz wykorzystywanie Twoich danych do trenowania modeli. Otwórz [ustawienia Copilot](https://github.com/settings/copilot/features), na samym dole w sekcji **Privacy** przy opcji **Allow GitHub to use my data for AI model training** wybierz **Disabled** (zapisuje się samo). Nazwa i lokalizacja tej opcji mogą się nieznacznie zmieniać w interfejsie GitHuba.

Robimy to, bo treści firmowe nie powinny trafiać do trenowania modeli zewnętrznych dostawców. To prosta zasada firmowa dotycząca konta GitHub jako takiego.

## Co robi instalator (jeden plik)

Całą resztę załatwia jeden plik: **`ENVI-SB-instalator.cmd`**. Pobierasz go ze strony instalatora w PS ENVI jako ZIP. Najpierw go wypakuj: kliknij pobrany ZIP prawym przyciskiem myszy i wybierz **Wyodrębnij wszystkie**, potem kliknij dwukrotnie `ENVI-SB-instalator.cmd` w wypakowanym folderze. Nie uruchamiaj go z wnętrza ZIP-a: Windows trzyma wtedy plik w folderze tymczasowym, skąd antywirus potrafi go zabrać, więc instalator w takim miejscu zatrzyma się i poprosi o wypakowanie.

1. Uruchamiasz `ENVI-SB-instalator.cmd` (dwuklik).
2. W pewnym momencie instalator poprosi o zalogowanie do GitHuba. Naciśnij Enter: kod jednorazowy trafi do schowka, a w przeglądarce otworzy się strona GitHuba. Wklej kod (Ctrl+V), wybierz **Continue with Google** i zaloguj się tym samym kontem Google co do PS. Nie wpisujesz żadnych haseł do samego instalatora.
3. Gdy instalator czegoś nie może zrobić, bo brakuje dostępu do GitHuba albo do Dysku, nie kończy się błędem. Mówi po polsku, czego brakuje, otwiera stronę, na której to naprawisz, i czeka. Po naprawie naciśnij **Enter**, a instalator sprawdzi ponownie. Klawisz **S** pomija dany krok. Po trzech próbach bez skutku instalator przerywa ten krok i prosi, żeby uruchomić go jeszcze raz, gdy dostęp będzie gotowy.
4. Raz, gdy instalator potwierdzi, że masz dostęp do wiedzy firmowej, otworzy w przeglądarce stronę Second Brain w PS z pytaniem o Twoje konto GitHub. Zaloguj się tam do PS, jeśli trzeba, i kliknij **To moje konto**. Dzięki temu PS wie, które konto GitHub jest Twoje.
5. Dalej wszystko dzieje się automatycznie:
   - na komputerze pojawia się **jeden** folder, Twój Second Brain, a w Menu Start skrót **"ENVI Second Brain"**, który otwiera go w Obsidianie od razu na notatce startowej,
   - w tym folderze jest wiedza firmowa (**tylko do odczytu**) oraz, jeśli pracujesz zespołowo nad projektami, osobny obszar projektowy, w którym możesz zapisywać zmiany,
   - wiedza firmowa sama, cicho, odświeża się w tle co kilka godzin (i przy każdym logowaniu): nie musisz nic klikać, nie zobaczysz żadnego czarnego okienka konsoli,
   - do niczego z tego nie są potrzebne uprawnienia administratora ani znajomość komend git. Ich w ogóle nie zobaczysz.

**Ważne, koniecznie przeczytaj:** Otwierasz cały folder ENVI-Kanon, w Obsidianie i dla agenta. Piszesz w `20_projects`, czytasz `40_wiki`. `40_wiki` na Twoim komputerze jest tylko do odczytu i nadpisuje się samo, więc ręczna zmiana tam zniknie. Linki między folderami działają, bo to jeden vault. Zielona ikona przy zegarze (pod strzałką) pokazuje stan synchronizacji; "Synchronizuj teraz" wysyła Twoje zmiany od razu.

**Jeśli pracujesz zespołowo:** instalator sam rozpoznaje, że masz dostęp do wspólnego obszaru projektowego, i nie musisz nic w tej sprawie wybierać ani ustawiać. Dostajesz wtedy dodatkowo skrót **"Synchronizuj teraz (Second Brain)"** w dwóch miejscach: **na pulpicie** i w Menu Start. Poznasz go po **zielonym znaku ENVI** (turbina), tym samym, który program pokazuje przy zegarze, więc oba miejsca wyglądają tak samo i nie trzeba szukać skrótu wśród innych ikon. Kliknij go, kiedy chcesz od razu wysłać swoje zmiany i pobrać zmiany innych osób, zamiast czekać na automatyczne odświeżenie w tle. Po kliknięciu zobaczysz krótkie powiadomienie z wynikiem: wysłano, nie było nic nowego do wysłania, albo trzeba czyjejś pomocy. Nic więcej nie musisz robić.

Dwie rzeczy, które zaskakują przy pierwszym użyciu tego skrótu. Po pierwsze **nie otwiera żadnego okna**: jest uruchamiany celowo bez konsoli, więc jedynym znakiem, że zadziałał, jest to powiadomienie. Po drugie **wyszukiwarka w Menu Start może go przez jakiś czas nie znajdować**, bo Windows indeksuje nowe skróty z opóźnieniem; dlatego ta sama ikona leży od razu na pulpicie. Jeśli wolisz mieć ją na pasku zadań, kliknij ikonę na pulpicie prawym przyciskiem, wybierz "Pokaż więcej opcji", potem "Przypnij do paska zadań". Tego jednego kroku instalator nie zrobi za Ciebie, bo Windows blokuje przypinanie do paska z poziomu programu.

Plik jest bezpieczny do uruchomienia wielokrotnie. Jeśli coś przerwiesz w połowie albo któryś krok wcześniej pominiesz, po prostu uruchom `ENVI-SB-instalator.cmd` jeszcze raz.

## Logowanie do agenta (Claude Code / Codex)

Na komputerze zainstalowany jest agent (Claude Code i/lub Codex; używasz tego, który pasuje do zadania, nie ma znaczenia który akurat wybierzesz). Przy pierwszym uruchomieniu narzędzie poprosi Cię o zalogowanie się. Na start używasz swojego prywatnego konta, koszt pokrywa firma w ramach pilotażu. To logowanie robisz raz na narzędzie, potem działa samo.

## Skrzynki poczty

Żeby agent widział Twoją skrzynkę pocztową, kliknij ikonę Second Brain przy zegarze, wybierz "Skrzynki poczty", a potem "Dodaj skrzynkę…". Wybierz skrzynkę wspólną z listy albo wpisz dane swojego konta. Hasło wpisujesz raz, w oknie, które się otworzy: nikt, także agent, go nie widzi. Po hasło do skrzynki wspólnej (np. `faktury@`) zapytaj osobę, która tę skrzynkę prowadzi. Agent go nie zna i nie może Ci go podać.

## Jeśli coś wygląda na zawieszone

Najczęstsza przyczyna to zwykle jedna z dwóch rzeczy:

- nie przyjęłaś/przyjąłeś jeszcze zaproszenia do organizacji envi-konsulting na GitHubie (mail od GitHuba na adres logowania do PS), albo
- jesteś zalogowany(a) do Dysku Google innym kontem niż to, którym logujesz się do PS.

W obu przypadkach instalator wyświetli, co dokładnie zrobić. Dokończ brakujący krok i naciśnij Enter albo uruchom `ENVI-SB-instalator.cmd` ponownie: to bezpieczne i nic nie nadpisze. Jeśli zaproszenia w ogóle nie dostałaś/dostałeś, poproś przełożonego o zaproszenie do Second Brain w PS.

Jeśli prosimy Cię o zapis przebiegu instalacji: to plik `bootstrap.log` w folderze `%USERPROFILE%\.envi\instalator` (wklej tę ścieżkę w pasek adresu Eksploratora). Instalator podaje pełną ścieżkę na końcu każdego przebiegu.

#SB-PLIK sb-google.py 12794
"""Google Drive, Docs i Sheets dla agenta pracownika (token szyfrowany DPAPI).

login [--force] - zgoda Google w przegladarce; dzialajacy token pomija login
status - email konta; kod 0 gdy token dziala, 1 gdy brak lub blad
api <sciezka-lub-URL> [METODA] [JSON | @plik.json] - domyslnie GET
upload <plik> [--folder ID] [--name NAZWA] [--jako-dokument]
selftest - sprawdza DPAPI

Sciezki: drive/v3/files, docs/documents, sheets/spreadsheets.
Usuwanie = przeniesienie do kosza, nigdy trwale usuniecie:
  api drive/v3/files/<id> PATCH '{"trashed":true}'
"""
import argparse, base64, ctypes, ctypes.wintypes as wt, hashlib, http.server
import json, mimetypes, os, secrets, sys, time, urllib.error, urllib.parse, urllib.request, webbrowser
from pathlib import Path

DIR = Path(os.environ.get("SB_GOOGLE_DIR", os.path.dirname(os.path.abspath(__file__))))
CLIENT_FILE = DIR / "sb-pracownicy-oauth-client.json"
TOKEN_FILE = DIR / "sb-google.token.dpapi"
API_BASE = os.environ.get("SB_GOOGLE_API_BASE", "https://www.googleapis.com/").rstrip("/") + "/"
DOCS_BASE = os.environ.get("SB_GOOGLE_DOCS_BASE", "https://docs.googleapis.com/v1/")
SHEETS_BASE = os.environ.get("SB_GOOGLE_SHEETS_BASE", "https://sheets.googleapis.com/v4/")
SCOPES = ["https://www.googleapis.com/auth/" + s for s in ("drive", "documents", "spreadsheets")]
ACCESS_TOKEN = None
PRIVATE = []


class _Blob(ctypes.Structure):
    _fields_ = [("cbData", wt.DWORD), ("pbData", ctypes.POINTER(ctypes.c_char))]


def _dpapi(data, protect):
    buf = ctypes.create_string_buffer(data, len(data))
    src = _Blob(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char)))
    dst = _Blob()
    fn = ctypes.windll.crypt32.CryptProtectData if protect else ctypes.windll.crypt32.CryptUnprotectData
    if not fn(ctypes.byref(src), None, None, None, None, 1, ctypes.byref(dst)):
        raise ctypes.WinError()
    try:
        return ctypes.string_at(dst.pbData, dst.cbData)
    finally:
        ctypes.windll.kernel32.LocalFree(dst.pbData)


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    # Nie przekazuj Bearer ani danych OAuth pod adres z przekierowania.
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _request(req):
    with urllib.request.build_opener(_NoRedirect).open(req, timeout=60) as r:
        raw = r.read()
        return json.loads(raw) if raw.strip() else {}


def _post(url, fields):
    return _request(urllib.request.Request(url, urllib.parse.urlencode(fields).encode()))


def _token_uri(client):
    return os.environ.get("SB_GOOGLE_TOKEN_URI", client.get("token_uri", "https://oauth2.googleapis.com/token"))


def access_token():
    global ACCESS_TOKEN
    if ACCESS_TOKEN is None:
        p = json.loads(_dpapi(TOKEN_FILE.read_bytes(), False))
        if not isinstance(p, dict) or any(not isinstance(p.get(k), str) or not p[k]
                for k in ("client_id", "client_secret", "refresh_token")):
            raise ValueError("Nieprawidlowy plik tokenu Google. Uruchom login.")
        PRIVATE.extend(p[k] for k in ("client_id", "client_secret", "refresh_token"))
        ACCESS_TOKEN = _post(_token_uri(p), {
            "client_id": p["client_id"], "client_secret": p["client_secret"],
            "refresh_token": p["refresh_token"], "grant_type": "refresh_token",
        })["access_token"]
        PRIVATE.append(ACCESS_TOKEN)
    return ACCESS_TOKEN


def api_url(path, method="GET"):
    parsed = urllib.parse.urlsplit(path)
    if parsed.scheme or parsed.netloc:
        host = parsed.hostname or ""
        if (parsed.scheme != "https" or not host.endswith(".googleapis.com")
                or parsed.username is not None or parsed.password is not None
                or parsed.port not in (None, 443)):
            raise ValueError("Dozwolone sa tylko adresy HTTPS w domenie *.googleapis.com.")
        url = path
    else:
        path = path.lstrip("/")
        base = API_BASE
        for prefix, target in (("docs/", DOCS_BASE), ("sheets/", SHEETS_BASE)):
            if path.startswith(prefix):
                base, path = target, path[len(prefix):]
                break
        url = base.rstrip("/") + "/" + path
    parts = urllib.parse.urlsplit(url)
    if parts.path.startswith("/drive/v3/"):
        query = urllib.parse.parse_qsl(parts.query, keep_blank_values=True)
        keys = {k for k, v in query}
        if "supportsAllDrives" not in keys:
            query.append(("supportsAllDrives", "true"))
        if parts.path.rstrip("/") == "/drive/v3/files" and method.upper() == "GET" and "includeItemsFromAllDrives" not in keys:
            query.append(("includeItemsFromAllDrives", "true"))
        url = urllib.parse.urlunsplit(parts._replace(query=urllib.parse.urlencode(query)))
    return url


def api(path, method="GET", body=None):
    url = api_url(path, method)
    if body is not None:
        if body.startswith("@"):
            body = Path(body[1:]).read_text(encoding="utf-8-sig")
        body = json.dumps(json.loads(body)).encode()
    return _request(urllib.request.Request(url, method=method.upper(), data=body,
                    headers={"Authorization": "Bearer " + access_token(), "Content-Type": "application/json"}))


def status():
    return api("drive/v3/about?fields=user")["user"]["emailAddress"]


def login(force=False):
    global ACCESS_TOKEN
    if TOKEN_FILE.exists() and not force:
        try:
            print("Token dziala. Konto: " + status())
            return
        except (OSError, ValueError, KeyError, TypeError):
            ACCESS_TOKEN = None
    client = json.loads(CLIENT_FILE.read_text(encoding="utf-8-sig"))["installed"]
    PRIVATE.extend(client[k] for k in ("client_id", "client_secret"))
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    state, result = secrets.token_urlsafe(16), {}

    class Handler(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            q = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(self.path).query))
            valid = q.get("state") == state and ("code" in q or "error" in q)
            if valid:
                result.update(q)
            self.send_response(200 if valid else 400)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.end_headers()
            self.wfile.write(b"Gotowe, mozesz zamknac karte." if valid else b"Nieprawidlowe wywolanie.")

        def log_message(self, *args):
            pass

    with http.server.HTTPServer(("127.0.0.1", 0), Handler) as srv:
        redirect = f"http://127.0.0.1:{srv.server_port}/"
        url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
            "client_id": client["client_id"], "redirect_uri": redirect, "response_type": "code",
            "scope": " ".join(SCOPES), "access_type": "offline", "prompt": "consent",
            "state": state, "code_challenge": challenge, "code_challenge_method": "S256",
        })
        print("Zaloguj sie kontem Google, ktorym logujesz sie do PS i kliknij Zezwol.")
        print('Google moze pokazac "Google nie zweryfikowal tej aplikacji":')
        print('wybierz "Zaawansowane", potem "Przejdz do ENVI Second Brain".')
        print("Jesli przegladarka sie nie otworzyla, skopiuj ten adres do przegladarki:")
        print(url, flush=True)
        deadline = time.monotonic() + float(os.environ.get("SB_GOOGLE_LOGIN_TIMEOUT", "300"))
        webbrowser.open(url)
        while not result:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise ValueError("Nie bylo zgody w ciagu 5 minut - uruchom login jeszcze raz.")
            srv.timeout = min(1, remaining)
            srv.handle_request()
    if "error" in result:
        raise ValueError("Zgoda Google nieudana.")
    tok = _post(_token_uri(client), {
        "code": result["code"], "client_id": client["client_id"], "client_secret": client["client_secret"],
        "redirect_uri": redirect, "grant_type": "authorization_code", "code_verifier": verifier,
    })
    if not tok.get("refresh_token"):
        raise ValueError("Google nie oddal refresh tokenu - powtorz login --force.")
    payload = {"client_id": client["client_id"], "client_secret": client["client_secret"],
               "refresh_token": tok["refresh_token"], "scopes": SCOPES, "token_uri": _token_uri(client)}
    DIR.mkdir(parents=True, exist_ok=True)
    # Zapis atomowy: nie tracimy poprzedniego tokenu przy przerwaniu zapisu.
    temporary = TOKEN_FILE.with_suffix(".tmp")
    temporary.write_bytes(_dpapi(json.dumps(payload).encode(), True))
    temporary.replace(TOKEN_FILE)
    print("Zapisano zaszyfrowany token Google.")


def upload(local_file, folder=None, name=None, jako_dokument=False):
    path = Path(local_file)
    metadata = {"name": name or path.name}
    if folder:
        metadata["parents"] = [folder]
    if jako_dokument:
        kind = {".docx": "document", ".odt": "document", ".txt": "document", ".md": "document",
                ".xlsx": "spreadsheet", ".csv": "spreadsheet", ".pptx": "presentation"}.get(path.suffix.lower())
        if not kind:
            raise ValueError("Nieobslugiwany typ pliku do konwersji na dokument Google.")
        metadata["mimeType"] = "application/vnd.google-apps." + kind
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    boundary = "sb_google_" + secrets.token_hex(24)
    body = (f"--{boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n".encode()
            + json.dumps(metadata).encode() + f"\r\n--{boundary}\r\nContent-Type: {mime}\r\n\r\n".encode()
            + path.read_bytes() + f"\r\n--{boundary}--\r\n".encode())
    url = API_BASE + "upload/drive/v3/files?" + urllib.parse.urlencode({
        "uploadType": "multipart", "supportsAllDrives": "true", "fields": "id,name,mimeType,parents,webViewLink"})
    return _request(urllib.request.Request(url, data=body, headers={
        "Authorization": "Bearer " + access_token(), "Content-Type": "multipart/related; boundary=" + boundary}))


def main(argv=None):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("login", help="Zgoda Google").add_argument("--force", action="store_true")
    commands.add_parser("status", help="Sprawdz konto bez logowania")
    p = commands.add_parser("api", help="Wywolaj Google API")
    p.add_argument("path")
    p.add_argument("method", nargs="?", default="GET")
    p.add_argument("body", nargs="?")
    p = commands.add_parser("upload", help="Wyslij plik na Drive")
    p.add_argument("local_file")
    p.add_argument("--folder")
    p.add_argument("--name")
    p.add_argument("--jako-dokument", action="store_true")
    commands.add_parser("selftest", help="Sprawdz DPAPI")
    args = parser.parse_args(argv)
    try:
        if args.command == "login":
            login(args.force)
        elif args.command == "status":
            print(status())
        elif args.command == "selftest":
            assert _dpapi(_dpapi(b"proba", True), False) == b"proba"
            print("DPAPI OK")
        else:
            result = api(args.path, args.method, args.body) if args.command == "api" else upload(
                args.local_file, args.folder, args.name, args.jako_dokument)
            print(json.dumps(result, ensure_ascii=False, indent=1))
        return 0
    except (OSError, ValueError, KeyError, TypeError) as e:
        if args.command == "status":
            print("Brak dzialajacego tokenu Google. Uruchom login.", file=sys.stderr)
            return 1
        message = "Blad pliku, polaczenia lub danych; sprawdz konfiguracje i token (login)."
        if isinstance(e, urllib.error.HTTPError):
            try:
                error = json.loads(e.read()).get("error", {})
                detail = error.get("message", "Blad Google API") if isinstance(error, dict) else "Blad OAuth Google"
            except (ValueError, AttributeError):
                detail = "Blad Google API"
            message = f"HTTP {e.code}: {detail}"
        elif isinstance(e, ValueError) and not isinstance(e, json.JSONDecodeError):
            message = str(e)
        for private in PRIVATE:
            if private:
                message = message.replace(private, "[ukryte]")
        print(message, file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())

