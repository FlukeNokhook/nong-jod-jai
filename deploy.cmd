@echo off
REM Double-click: push code + update Web App
cd /d "%~dp0"
call npm.cmd run deploy
pause
