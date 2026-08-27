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
  Run:  bootstrap.cmd            (execute)
        bootstrap.cmd -WhatIf    (dry-run: print the plan, change nothing)
#>
[CmdletBinding(SupportsShouldProcess)]
param()
# 'Continue', not 'Stop': every native command below already guards itself with a
# $LASTEXITCODE check. Under 'Stop', Windows PowerShell 5.1 turns any native-command
# *stderr* line (`gh auth status` when logged out, `git clone` progress, winget noise)
# into a terminating NativeCommandError that aborts the whole run BEFORE its own Log line -
# the exact reason the installer died at `gh auth status` on a fresh machine instead of
# falling through to `gh auth login`, and why nothing reached bootstrap.log.
$ErrorActionPreference = 'Continue'

# -- Config -- override any of these in bootstrap.config.ps1 beside this file
$RepoUrl          = 'https://github.com/envi-konsulting/ENVI.SB.git'
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
$PullLauncher   = "$env:USERPROFILE\.envi\kanon-pull.ps1"  # N3 auto-pull launcher (stable, space-free per-user path; NOT inside the clone)
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
  foreach ($drive in (Get-PSDrive -PSProvider FileSystem -ErrorAction SilentlyContinue)) {
    foreach ($name in $DriveFsRootNames) {
      $root = Join-Path $drive.Root $name
      if (-not (Test-Path -LiteralPath $root)) { continue }
      $hit = Get-ChildItem -LiteralPath $root -Directory -Recurse -Depth 4 -Filter '.skills' -Force -ErrorAction SilentlyContinue |
             Select-Object -First 1
      if ($hit) { return $hit.FullName }
    }
  }
  return $null
}

function Start-GoogleDriveApp {
  # ponytail: launch.bat, not the exe. Verified on a live install: GoogleDriveFS.exe sits in a
  # VERSIONED subfolder ("...\Drive File Stream\128.0.0.0\GoogleDriveFS.exe") that changes on
  # every update, while "...\Drive File Stream\launch.bat" is the stable entry point Google
  # itself keeps in place. Ceiling: 64-bit Program Files only (Drive ships no 32-bit build).
  if (Get-Process 'GoogleDriveFS' -ErrorAction SilentlyContinue) {
    Log "[N1] Google Drive for Desktop is already running"
    return
  }
  $launcher = Join-Path $env:ProgramFiles 'Google\Drive File Stream\launch.bat'
  if (-not (Test-Path -LiteralPath $launcher)) {
    Log "[N1] Google Drive for Desktop not found at '$launcher'. If winget could not install it, get it from https://www.google.com/drive/download/ and re-run bootstrap.cmd."
    return
  }
  Start-Process -FilePath $launcher -WindowStyle Hidden
  Log "[N1] started Google Drive for Desktop - its sign-in window should appear"
}

function Resolve-SkillDriveRoot {
  # The employee's Drive letter, UI language and shortcut placement all differ from the
  # owner's, so the configured path is a guess: use it only if it actually exists.
  if (Test-Path -LiteralPath $script:SkillDriveRoot) {
    Log "[N1] Google Drive skills path reachable: $script:SkillDriveRoot"
    return
  }
  Log "[N1] configured skills path not reachable ('$script:SkillDriveRoot') - searching mounted Google Drive roots ..."
  $found = Find-SkillDriveRoot
  $attempt = 0
  while (-not $found -and -not $WhatIfPreference -and $attempt -lt 3) {
    $attempt++
    # winget installs Google Drive but never launches it, and no drive letter is mounted
    # until a human signs in - so start the app for them, then wait and re-probe.
    Start-GoogleDriveApp
    Log "[N1] no .skills folder found on any mounted Drive yet. Do this in the Google Drive window that just opened (attempt $attempt/3):"
    Log "[N1]   1. Sign in with your ENVI Google account."
    Log "[N1]   2. In Drive on the web, find the shared skills folder under 'Shared with me', right-click -> Organise -> Add shortcut to Drive -> My Drive."
    Log "[N1]   3. Wait until a new drive (usually G:) shows up in Explorer."
    Read-Host "[N1] Press Enter to check again, or type S + Enter to skip skills for now" | ForEach-Object {
      if ($_ -match '^\s*[sS]') { $attempt = 99 }
    }
    if ($attempt -ne 99) { $found = Find-SkillDriveRoot }
  }
  if ($found) {
    $script:SkillDriveRoot = $found
    Log "[N1] Google Drive skills path detected: $found"
  } else {
    Log "[N1] Google Drive skills path still not found - skills sync will be skipped this run (not a hard fail). Re-run bootstrap.cmd after signing in, or pin the path in bootstrap.config.ps1: `$SkillDriveRoot = 'X:\...\SB\.skills'"
  }
}

function Invoke-StepN1 {
  Log "[N1] prerequisites check starting"
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Log "[N1] ERROR: winget not found on this machine. Install 'App Installer' from the Microsoft Store (https://aka.ms/getwinget), then re-run bootstrap.cmd."
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

  # Google Drive: winget installs the client, but signing in to the account that owns the
  # skills folder is a manual step (N6 onboarding). Detect reachability only; never hard-fail.
  Resolve-SkillDriveRoot
  Log "[N1] prerequisites step done"
}

# -- N2: auth + read-only canon (repo A) clone, idempotent --
# ponytail: one flat gh auth login + setup-git call, no retry/backoff. If flaky networks
# turn out to be a real problem on employee machines, add retry logic then, not now.
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

function Invoke-StepN2 {
  Log "[N2] auth+clone step starting"

  if (Test-GhAuthenticated) {
    Log "[N2] gh already authenticated - skip login"
  } else {
    $target = 'gh auth (device-flow, https)'
    $action = 'gh auth login --hostname github.com --git-protocol https --web; gh auth setup-git'
    if ($PSCmdlet.ShouldProcess($target, $action)) {
      Log "[N2] gh not authenticated - running gh auth login (device-flow) ..."
      gh auth login --hostname github.com --git-protocol https --web
      if ($LASTEXITCODE -ne 0) {
        Log "[N2] ERROR: gh auth login failed (exit $LASTEXITCODE) - aborting N2"
        return
      }
      gh auth setup-git
      Log "[N2] gh auth login done, git credential helper configured"
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
    $target = $VaultPath
    $action = "git clone --config core.longpaths=true $RepoUrl $VaultPath"
    if ($PSCmdlet.ShouldProcess($target, $action)) {
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
        Log "[N2] ERROR: git clone failed (exit $LASTEXITCODE) - aborting N2"
        return
      }
    }
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

function Write-N3PullLauncher {
  # ponytail: point schtasks /tr and the Startup shortcut at a one-line -File launcher rather
  # than an inline -Command. The old inline `-Command "New-Item -ItemType Directory ..."`
  # carried its own nested quotes+spaces, and schtasks re-parsed the embedded `-ItemType` as
  # one of ITS options -> "Invalid argument/option - '-ItemType'", task create exit
  # -2147467259. With -File the only quoted token is a single file path, which round-trips
  # cleanly (verified under PS 5.1). The .envi mkdir moved INTO the launcher and guarded on
  # the clone existing, so a pre-clone run never pre-creates $VaultPath and blocks N2's clone.
  # Ceiling: a space in the Windows username would break the unquoted 5.1 path form; .envi
  # lives under $env:USERPROFILE, which is space-free for essentially every real account.
  param([string]$Path)
  $body = @(
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
  $launcherArgs = '-WindowStyle Hidden -NoProfile -File "{0}"' -f $PullLauncher
  $trCmd = "powershell.exe $launcherArgs"

  if ($PSCmdlet.ShouldProcess($PullLauncher, 'write hidden git-pull launcher script')) {
    Write-N3PullLauncher -Path $PullLauncher
    Log "[N3] pull launcher written: $PullLauncher"
  }

  # Periodic pull: schtasks.exe HOURLY trigger, non-elevated, /f = idempotent overwrite
  $action = "schtasks /create /tn $TaskName /tr <hidden -File pull launcher> /sc HOURLY /mo $PullEveryHours /f"
  if ($PSCmdlet.ShouldProcess($TaskName, $action)) {
    Log "[N3] registering periodic task '$TaskName' (every ${PullEveryHours}h, hidden, user context, no stored password)"
    schtasks /create /tn $TaskName /tr $trCmd /sc HOURLY /mo $PullEveryHours /f | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Log "[N3] ERROR: schtasks /create for '$TaskName' failed (exit $LASTEXITCODE)"
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

  Log "[N3] scheduled auto-pull step done"
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
    Log "[N3b] PACZKA ODRZUCONA: suma kontrolna sie nie zgadza (na dysku $sha, w manifescie $oczekiwana). Plik jest niekompletny albo podmieniony - rdzen NIE zostal zainstalowany, zostaje wersja obecna. Powtorz bootstrap.cmd, gdy Dysk skonczy synchronizacje."
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
    'param([switch]$Manual)'
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

function Invoke-StepN3b {
  Log "[N3b] synchronizacja obszaru projektowego (repo B) - start"
  $role = if ($script:InstallRoleResult) { $script:InstallRoleResult.Role } else { 'consumer' }
  if ($role -ne 'team') {
    Log "[N3b] rola: konsument - synchronizacja obszaru projektowego nie dotyczy tej roli, nic nie robie"
    Log "[N3b] synchronizacja obszaru projektowego - koniec"
    return
  }

  # N4: rdzen przyjezdza z paczki na Dysku (D-2). Katalog wydan lezy obok .skills,
  # ktory N1 juz odnalazl na tej maszynie - bez niego nie ma skad brac rdzenia.
  $coreRoot = $script:CoreDriveRoot
  if (-not $coreRoot) {
    if (-not $script:SkillDriveRoot -or -not (Test-Path -LiteralPath $script:SkillDriveRoot)) {
      Log "[N3b] Dysk Google nie jest osiagalny, a rdzen przyjezdza wlasnie stamtad - pomijam podmiane rdzenia, obecna wersja zostaje nietknieta. Zaloguj sie do Dysku i uruchom bootstrap.cmd jeszcze raz."
      Log "[N3b] synchronizacja obszaru projektowego - koniec"
      return
    }
    $coreRoot = Join-Path (Split-Path $script:SkillDriveRoot -Parent) '.rdzen'
  }

  $manifest = Get-RdzenManifest -CoreRoot $coreRoot
  if (-not $manifest) {
    Log "[N3b] nie widze wydania rdzenia w '$coreRoot' - pomijam podmiane rdzenia, obecna wersja zostaje nietknieta"
    Log "[N3b] synchronizacja obszaru projektowego - koniec"
    return
  }
  Log "[N3b] wydanie rdzenia na Dysku: $($manifest.wersja) (paczka $($manifest.paczka), wydane $($manifest.data))"

  $rozpakowane = Expand-RdzenPaczka -CoreRoot $coreRoot -Manifest $manifest
  if (-not $rozpakowane) {
    Log "[N3b] synchronizacja obszaru projektowego - koniec"
    return
  }

  # DWA pliki, nie jeden: silnik szuka rezydenta ikony obok siebie ($PSScriptRoot),
  # a do 2026-08-21 nie instalowal go nikt - maszyna dostawala silnik bez ikony,
  # czyli bez calej warstwy, ktora mowi czlowiekowi, co sie dzieje.
  $enviDir = Split-Path $SyncEnginePath -Parent
  foreach ($plik in @('project-sync.ps1', 'sb-tray.ps1')) {
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
  # Skutek nazwany wprost: maszyna, ktora nie uruchomila bootstrap.cmd po tej
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

  if ($PSCmdlet.ShouldProcess($SyncRunLauncher, 'zapisz launcher project-sync-run.ps1 (schtasks-safe -File launcher, D4)')) {
    Write-SyncRunLauncher -Path $SyncRunLauncher -EnginePath $SyncEnginePath -RepoPath $ProjectsClonePath
    Log "[N3b] launcher zapisany: $SyncRunLauncher"
  }

  # Periodic sync: schtasks.exe HOURLY trigger, WITHOUT -Manual (D4) - the scheduled/automatic
  # path the engine itself gates on mass-change and contact-data checks. Non-elevated, /f =
  # idempotent overwrite, same mechanism as N3's own periodic task above.
  $syncLauncherArgs = '-WindowStyle Hidden -NoProfile -File "{0}"' -f $SyncRunLauncher
  $syncTrCmd = "powershell.exe $syncLauncherArgs"
  $syncAction = "schtasks /create /tn $SyncTaskName /tr <hidden -File sync launcher> /sc HOURLY /mo $SyncEveryHours /f"
  if ($PSCmdlet.ShouldProcess($SyncTaskName, $syncAction)) {
    Log "[N3b] rejestruje zadanie cykliczne '$SyncTaskName' (co ${SyncEveryHours}h, bez okna, kontekst uzytkownika, bez -Manual)"
    schtasks /create /tn $SyncTaskName /tr $syncTrCmd /sc HOURLY /mo $SyncEveryHours /f | Out-Null
    if ($LASTEXITCODE -ne 0) {
      Log "[N3b] ERROR: schtasks /create dla '$SyncTaskName' nie powiodlo sie (exit $LASTEXITCODE)"
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
  $manualArgs = '-WindowStyle Hidden -NoProfile -File "{0}" -Manual' -f $SyncRunLauncher

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

  Log "[N3b] synchronizacja obszaru projektowego - koniec"
}

# -- N4: Obsidian shortcut + vault separation, idempotent --
# ponytail: shortcut targets explorer.exe with an obsidian://open?path=<encoded path> URI
# argument - the standard non-admin trick for firing a registered protocol handler from a
# .lnk (a .lnk's TargetPath normally expects a real file-system path, not a URL; explorer.exe
# accepts a URL argument and hands it to ShellExecute, which resolves the protocol). This
# avoids hardcoding Obsidian.exe's install path, which varies by Squirrel-installer version
# under %LOCALAPPDATA%\Obsidian\. Vault registration in obsidian.json is attempted only if
# that file already exists (Obsidian has run at least once on this machine); if absent,
# registration is skipped on purpose - the obsidian://open?path= URI registers the vault
# itself the first time it is opened, so nothing is lost by not hand-authoring the file.
# Ceiling: Start Menu only, no desktop shortcut (plan says Start Menu is enough).
function Get-ObsidianVaultUri {
  # non-mutating: builds the URI string only, safe under -WhatIf
  param([string]$Path)
  return 'obsidian://open?path=' + [uri]::EscapeDataString($Path)
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
  $lnkPath = Join-Path $startMenuDir 'ENVI Kanon (Obsidian).lnk'
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
# ponytail: runtime list is config-driven (OD-1: never a hardcoded single vendor). Install
# commands below were determined by INSPECTING this machine's real install mechanism, not
# guessed: `codex` is a shim generated by `npm install -g @openai/codex` (confirmed:
# `npm ls -g` -> @openai/codex@0.144.2; codex.ps1's own body calls
# node_modules\@openai\codex\bin\codex.js - the standard npm-global wrapper shape).
# `claude` is a single ~250MB standalone exe at $env:USERPROFILE\.local\bin\claude.exe with
# NO matching npm package and NO winget entry under that name (winget's "Claude" /
# Anthropic.Claude is the separate desktop app, confirmed via `winget list`) - that
# signature matches Anthropic's documented native/self-updating installer script, so the
# command below is the real mechanism, not a placeholder.
$N5Agents = @(
  @{ Id = 'claude'; Name = 'Claude Code'; DetectCmd = 'claude'; InstallCmd = 'irm https://claude.ai/install.ps1 | iex' }
  @{ Id = 'codex';  Name = 'Codex CLI';   DetectCmd = 'codex';  InstallCmd = 'npm install -g @openai/codex' }
)

function Test-N5AgentPresent($agent) {
  # non-mutating: read-only command lookup, safe under -WhatIf
  return [bool](Get-Command $agent.DetectCmd -ErrorAction SilentlyContinue)
}

function Invoke-N5AgentInstalls {
  foreach ($agent in $N5Agents) {
    if (Test-N5AgentPresent $agent) {
      Log "[N5] $($agent.Name) ($($agent.Id)) already present - skip"
      continue
    }
    $label = "$($agent.Name) ($($agent.Id))"
    if ($PSCmdlet.ShouldProcess($label, $agent.InstallCmd)) {
      Log "[N5] installing $label via: $($agent.InstallCmd)"
      # ponytail: run the vendor installer in an isolated child scope, NOT Invoke-Expression
      # in this function's scope. install.ps1 from claude.ai assigns to $Target; iex-ing it
      # here collided with a local named $target (PS vars are case-insensitive) -> "Cannot
      # overwrite variable Target because the variable has been optimized", which killed the
      # Claude Code install. The local is renamed ($label) AND the script runs in a fresh
      # scriptblock scope, so no caller local can be shadowed by the vendor script.
      & ([scriptblock]::Create($agent.InstallCmd))
      if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        Log "[N5] WARNING: install for $label exited $LASTEXITCODE - check manually"
      } else {
        Log "[N5] $label installed"
      }
    }
  }
  # Per-user agent account sign-in is explicitly NOT here - manual N6 checklist step.
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
  # the same BOM caution applies to YAML read by Python's `open(..., encoding="utf-8")`.
  Set-JsonFileNoBom -LiteralPath $ConfigPath -Content (($lines -join "`n") + "`n")
}

function Get-SyncSkillsScript {
  # ponytail: the sync TOOL is itself one of the packages it syncs - `envi-skill-sync.skill`
  # sits in $SkillDriveRoot next to every other .skill (verified: the ZIP carries
  # scripts/sync-skills.py, _frontmatter.py, semver_compare.py). So a standalone installer
  # copy needs no extra distribution channel: unzip that one package to TEMP and run it from
  # there. This closes the old N7 "sync-skills.py not found" gap without shipping a second
  # copy that could drift from the released one.
  # Ceiling: the staged copy is throwaway - real skills still land in the configured targets;
  # nothing on this path is kept or version-tracked.
  $inVault = Join-Path $PSScriptRoot '..\..\..\..\.claude\skills\envi-skill-sync\scripts\sync-skills.py'
  if (Test-Path -LiteralPath $inVault) {
    Log "[N5] using sync-skills.py from the vault this installer ships inside of"
    return (Resolve-Path -LiteralPath $inVault).Path
  }

  $pkg = Join-Path $SkillDriveRoot 'envi-skill-sync.skill'
  if (-not (Test-Path -LiteralPath $pkg)) {
    Log "[N5] WARNING: envi-skill-sync.skill not found in '$SkillDriveRoot' - skills sync skipped this run"
    return $null
  }
  # -WhatIf:$false na calym stagingu, i to nie jest obejscie kontroli: pod -WhatIf
  # Copy-Item nie kopiowal, a Expand-Archive i tak probowal rozpakowac nieistniejacy plik,
  # wiec KAZDY suchy przebieg instalatora umieral tutaj - instalatora nie dalo sie
  # sprawdzic inaczej niz uruchamiajac go na zywej maszynie. Katalog jest jednorazowy,
  # w TEMP, i nie zmienia niczego na maszynie uzytkownika.
  $stage = Join-Path $env:TEMP 'envi-skill-sync-bootstrap'
  if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force -WhatIf:$false -ErrorAction SilentlyContinue }
  New-Item -ItemType Directory -Path $stage -Force -WhatIf:$false | Out-Null
  # Expand-Archive only accepts a .zip extension, and a .skill IS a zip - copy, then expand.
  $zip = Join-Path $stage 'envi-skill-sync.zip'
  Copy-Item -LiteralPath $pkg -Destination $zip -Force -WhatIf:$false
  Expand-Archive -LiteralPath $zip -DestinationPath $stage -Force -WhatIf:$false
  $staged = Join-Path $stage 'scripts\sync-skills.py'
  if (-not (Test-Path -LiteralPath $staged)) {
    Log "[N5] WARNING: envi-skill-sync.skill unpacked but scripts\sync-skills.py is missing - skills sync skipped this run"
    return $null
  }
  Log "[N5] sync tooling bootstrapped from $pkg"
  return $staged
}

function Install-PythonIfMissing {
  # ponytail: probe by RUNNING python, not by Get-Command. Windows ships a Microsoft Store
  # execution alias named python.exe that Get-Command happily finds but which only opens the
  # Store - a false positive that would make the sync fail in a confusing way. sync-skills.py
  # needs no third-party package (its frontmatter parser is PyYAML-first with a stdlib
  # fallback), so a bare interpreter is enough.
  $ver = & { python --version 2>&1 }
  if ($LASTEXITCODE -eq 0 -and "$ver" -match 'Python 3') {
    Log "[N5] $ver present"
    return $true
  }
  $label = 'Python 3 (Python.Python.3.12)'
  if (-not $PSCmdlet.ShouldProcess($label, 'winget install --id Python.Python.3.12')) { return $false }
  Log "[N5] python not usable - installing $label ..."
  winget install --id Python.Python.3.12 --exact --silent --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) {
    Log "[N5] WARNING: winget install for $label exited $LASTEXITCODE - skills sync skipped this run"
    return $false
  }
  Sync-PathFromRegistry
  $ver = & { python --version 2>&1 }
  if ($LASTEXITCODE -eq 0 -and "$ver" -match 'Python 3') {
    Log "[N5] $ver installed"
    return $true
  }
  Log "[N5] WARNING: python still not usable after install - skills sync skipped this run (re-run bootstrap.cmd, a new shell picks up PATH)"
  return $false
}

function Invoke-N5SkillsSync {
  if (-not (Test-Path -LiteralPath $SkillDriveRoot)) {
    Log "[N5] Google Drive skills path not reachable: '$SkillDriveRoot'. Sign in to Google Drive with the ENVI account that holds the skills folder, then re-run bootstrap.cmd. (Full sign-in checklist = N6.) Skills sync skipped this run - idempotent, not a hard fail."
    return
  }
  Log "[N5] skills source reachable: $SkillDriveRoot"

  $enviHome = Join-Path $env:USERPROFILE '.envi'
  $syncConfigPath = Join-Path $enviHome 'sync-config.yaml'
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
        Log "[N5] $syncConfigPath still points 'claude:' at the retired pre-T3 vault ($legacySkillsPath) - treating as stale, will rewrite"
      }
    }
  }
  if (-not $needsConfig) {
    Log "[N5] $syncConfigPath already configured - skip config generation"
  } else {
    $target = $syncConfigPath
    $action = "write sync-config.yaml (source_g=$SkillDriveRoot, claude=$VaultPath\.claude\skills, codex+copilot enabled)"
    if ($PSCmdlet.ShouldProcess($target, $action)) {
      New-EnviSyncConfig -ConfigPath $syncConfigPath -SourceG $SkillDriveRoot -VaultForSkills $VaultPath
      Log "[N5] wrote $syncConfigPath (claude target = $VaultPath\.claude\skills)"
    }
  }

  $syncScript = Get-SyncSkillsScript
  if (-not $syncScript) { return }
  if (-not (Install-PythonIfMissing)) {
    return
  }
  $target = 'skills sync (sync-skills.py)'
  $action = "python `"$syncScript`""
  if ($PSCmdlet.ShouldProcess($target, $action)) {
    Log "[N5] running skills sync ..."
    python $syncScript
    if ($LASTEXITCODE -ne 0) {
      Log "[N5] WARNING: sync-skills.py exited $LASTEXITCODE"
    } else {
      Log "[N5] skills sync done"
    }
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
  Invoke-N5AgentInstalls
  Invoke-N5SkillsSync
  Invoke-N5ChannelSeparationGuard
  Log "[N5] agent runtime + skills sync step done"
}

# -- N6: stub. Real logic lands in checkpoint N6. --
$stubs = [ordered]@{
  'N6' = "checklist: README-onboarding (GitHub acct, org invite to envi-konsulting with Read/Write on ENVI.SB, Drive login, Copilot opt-out) + clean-machine test"
}

Log "=== ENVI.SB bootstrap (WhatIf=$($PSBoundParameters.ContainsKey('WhatIf') -or $WhatIfPreference)) ==="
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
Log ""
$todo = @()
if (-not $sumCanon) { $todo += "Kanon sie nie sciagnal. Uruchom bootstrap.cmd jeszcze raz i przy pytaniu o GitHub zaloguj sie w przegladarce. Jesli GitHub odmawia dostepu - popros wlasciciela o zaproszenie do zespolu (organizacji) i przyjmij je mailem." }
# Only a team member is supposed to have a project area - for a consumer, "brak" here is
# correct behaviour, not a defect, and must not generate a fix-it instruction (T6).
if ($sumRole -eq 'team' -and -not $sumProjects) { $todo += "Obszar projektowy (20_projects) sie nie sciagnal. Uruchom bootstrap.cmd jeszcze raz i przy pytaniu o GitHub zaloguj sie w przegladarce. Jesli druga proba tez nie pomoze, NIE probuj trzeci raz - wyslij plik bootstrap.log wlascicielowi, bo przyczyna moze byc za dluga sciezka do Twojego folderu domowego i wtedy powtarzanie nic nie da." }
if ($sumRole -eq 'team' -and $sumProjects -and -not $sumSyncTask) { $todo += "Synchronizacja obszaru projektowego w tle sie nie skonfigurowala. Uruchom bootstrap.cmd jeszcze raz." }
if (-not $sumSkills) { $todo += "Skille sa niewidoczne. Zaloguj sie w aplikacji Dysk Google na konto firmowe, poczekaj az pojawi sie dysk w Eksploratorze, potem uruchom bootstrap.cmd jeszcze raz." }
if ($sumSkills -and $vaultSkillCount -eq 0) { $todo += "Skille sie nie skopiowaly. Uruchom bootstrap.cmd jeszcze raz; jesli to nie pomoze, wyslij ten plik bootstrap.log wlascicielowi." }
if (-not $sumObsidian) { $todo += "Obsidian nie ma zarejestrowanego vaultu. Zamknij Obsidiana calkowicie i uruchom bootstrap.cmd jeszcze raz." }
if ($todo.Count -eq 0) {
  Log ("Nic nie zostalo do zrobienia recznie. Otworz Obsidiana - Twoj vault ({0}) powinien byc od razu widoczny." -f $(if ($sumRole -eq 'team') { 'kanon + obszar projektowy' } else { 'kanon' }))
} else {
  Log "DO ZROBIENIA:"
  for ($i = 0; $i -lt $todo.Count; $i++) { Log ("  {0}. {1}" -f ($i + 1), $todo[$i]) }
}
Log "=== bootstrap run done ==="
