@echo off
setlocal
set "ROOT=%~dp0..\.."
cd /d "%ROOT%"

set "MASTER=C:\Users\Tim\My Drive\AI_Coordination\V2_CURRENT_POPULATION_MASTER.txt"
set "ARCHIVE=C:\Users\Tim\My Drive\AI_Coordination\V2_TERMINAL_ARCHIVE.txt"
set "EVIDENCE=C:\Users\Tim\My Drive\AI_Coordination\V2_EVIDENCE_COMPANION.jsonl"
set "DB=data\pipeline_local.db"
set "API_PORT=8765"
set "APP_PORT=8080"

echo Pipeline Explorer local SQLite launcher
echo Repo: %ROOT%
echo.

if not exist "%MASTER%" (
  echo ERROR: master file not found:
  echo %MASTER%
  pause
  exit /b 1
)
if not exist "%ARCHIVE%" (
  echo ERROR: archive file not found:
  echo %ARCHIVE%
  pause
  exit /b 1
)
if not exist "%EVIDENCE%" (
  echo ERROR: evidence file not found:
  echo %EVIDENCE%
  pause
  exit /b 1
)

echo Importing current local Drive files into SQLite...
python tools\local-store\import_master.py --master "%MASTER%" --archive "%ARCHIVE%" --evidence "%EVIDENCE%" --db "%DB%"
if errorlevel 1 (
  echo ERROR: import failed.
  pause
  exit /b 1
)

echo.
echo Checking local API at http://127.0.0.1:%API_PORT% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$h=Invoke-RestMethod 'http://127.0.0.1:%API_PORT%/health' -TimeoutSec 2;if($h.ok){exit 0}}catch{};exit 1"
if errorlevel 1 (
  echo Starting SQLite API at http://127.0.0.1:%API_PORT% ...
  start "Pipeline SQLite API" cmd /k python tools\local-store\local_store_api.py --db "%DB%" --port %API_PORT%
) else (
  echo Existing SQLite API is healthy; reusing it.
)

echo Checking local app server at http://127.0.0.1:%APP_PORT% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$r=Invoke-WebRequest 'http://127.0.0.1:%APP_PORT%/pipeline.html' -UseBasicParsing -TimeoutSec 2;if($r.StatusCode -eq 200){exit 0}}catch{};exit 1"
if errorlevel 1 (
  echo Starting local app server at http://127.0.0.1:%APP_PORT% ...
  start "Pipeline Local App" cmd /k python -m http.server %APP_PORT%
) else (
  echo Existing local app server is healthy; reusing it.
)

echo Waiting for local API...
powershell -NoProfile -ExecutionPolicy Bypass -Command "for($i=0;$i -lt 20;$i++){try{$h=Invoke-RestMethod 'http://127.0.0.1:%API_PORT%/health' -TimeoutSec 2;if($h.ok){exit 0}}catch{};Start-Sleep -Milliseconds 500};exit 1"
if errorlevel 1 (
  echo ERROR: SQLite API did not become healthy.
  pause
  exit /b 1
)

echo.
echo Opening Pipeline Explorer with bounded local SQLite source...
start "" "http://127.0.0.1:%APP_PORT%/pipeline.html?src=local"

echo.
echo Opened: http://127.0.0.1:%APP_PORT%/pipeline.html?src=local
echo API:    http://127.0.0.1:%API_PORT%/health
echo.
echo Close the two command windows titled Pipeline SQLite API and Pipeline Local App when done.
endlocal
