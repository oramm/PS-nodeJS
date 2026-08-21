@echo off
REM ENVI.SB canon bootstrap launcher. Prefers PowerShell 7 (pwsh), falls back to Windows PowerShell.
setlocal
where pwsh >nul 2>&1 && (set "PS=pwsh") || (set "PS=powershell")
"%PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0bootstrap.ps1" %*
REM keep the window open so any error stays readable (full run log: bootstrap.log beside this file)
echo(
pause
