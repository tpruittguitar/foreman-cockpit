@echo off
setlocal
cd /d "%~dp0\..\.."
python tools\local-store\publish_exports_to_drive.py
exit /b %ERRORLEVEL%
