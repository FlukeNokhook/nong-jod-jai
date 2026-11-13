@echo off
REM Double-click: auto push on every save in gas\ (close window to stop). Run deploy.cmd to update the Web App.
cd /d "%~dp0"
call npm.cmd run watch
