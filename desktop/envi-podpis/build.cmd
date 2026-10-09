@echo off
rem Buduje ENVI Podpis. "build.cmd" = wersja produkcyjna (bin\EnviPodpis.exe),
rem "build.cmd debug" = wersja testowa z lokalnym PS i /selftest (bin\EnviPodpis.debug.exe).
setlocal
cd /d "%~dp0"
set "CSC=%SystemRoot%\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist bin mkdir bin
set "OUT=bin\EnviPodpis.exe"
set "DEF="
if /i "%~1"=="debug" goto debug
goto build
:debug
set "OUT=bin\EnviPodpis.debug.exe"
set "DEF=/define:DEBUG"
:build
"%CSC%" /nologo /target:winexe /platform:anycpu /optimize+ /codepage:65001 %DEF% /win32manifest:src\app.manifest /out:%OUT% /r:System.dll /r:System.Core.dll /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:System.Web.Extensions.dll src\*.cs
if errorlevel 1 exit /b 1
echo OK: %OUT%
