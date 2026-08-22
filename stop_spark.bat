@echo off
title Stop Spark AI Desktop
echo ==============================================
echo   Stopping Spark AI Desktop Companion...
echo ==============================================
taskkill /F /IM electron.exe 2>nul
echo Spark has been stopped successfully.
ping 127.0.0.1 -n 2 >nul
