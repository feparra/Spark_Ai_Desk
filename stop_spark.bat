@echo off
title Detener Spark AI Desktop
echo ==============================================
echo   Deteniendo Spark AI Desktop Companion...
echo ==============================================
taskkill /F /IM electron.exe 2>nul
echo Spark ha sido detenido correctamente.
ping 127.0.0.1 -n 2 >nul
