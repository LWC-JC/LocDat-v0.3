@echo off
REM LocDat launcher — Windows
REM Starts a local Python web server in this folder, then opens Chrome.

setlocal

cd /d "%~dp0"

REM Try python3 then python
where py >nul 2>&1
if %errorlevel%==0 (
    start "" http://localhost:8765
    py -3 -m http.server 8765
    goto :eof
)
where python >nul 2>&1
if %errorlevel%==0 (
    start "" http://localhost:8765
    python -m http.server 8765
    goto :eof
)

echo Python 3 not found. Please install from https://www.python.org/ and try again.
pause
