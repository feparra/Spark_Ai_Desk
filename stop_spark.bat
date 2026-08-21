@echo off
title Detener Spark AI Desktop
echo ==============================================
echo   Deteniendo Spark AI Desktop Companion...
echo ==============================================
taskkill /F /IM electron.exe 2>nul
echo Spark ha sido detenido correctamente.
timeout /t 2 >nul
