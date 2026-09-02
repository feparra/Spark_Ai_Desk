@echo off
title Spark AI Desktop - Debug
set NODE_PATH=C:\Users\ferna\.spark_desktop_runtime\node_modules
cd /d C:\Users\FERNA\Documents\Spark_Desktop
echo Starting Spark (with SQLite ABI fix)...
"C:\Users\ferna\.spark_desktop_runtime\node_modules\electron\dist\electron.exe" "C:\Users\FERNA\Documents\Spark_Desktop\src\main.js" 2>&1
echo.
echo Exit code: %errorlevel%
pause