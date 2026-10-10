@echo off
setlocal
cd /d "%~dp0\..\.."
set "DB=data\pipeline_local.db"
set "DRIVE_OUT=C:\Users\Tim\My Drive\AI_Coordination\SQLite_Exports"

if not exist "%DB%" (
  echo ERROR: SQLite database not found: %DB%
  echo Run tools\local-store\start_pipeline_local.cmd first.
  exit /b 1
)

if not exist "%DRIVE_OUT%" mkdir "%DRIVE_OUT%"

echo Publishing generated SQLite snapshots to:
echo %DRIVE_OUT%
echo.
python tools\local-store\export_snapshots.py --db "%DB%" --out "%DRIVE_OUT%"
if errorlevel 1 exit /b 1

echo.
echo Complete. Canonical Drive files were not overwritten.
endlocal
