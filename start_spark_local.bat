@echo off
title Spark AI Launcher
set NODE_PATH=C:\Users\ferna\.spark_desktop_runtime\node_modules
taskkill /F /IM electron.exe 2>nul
start "" "C:\Users\ferna\.spark_desktop_runtime\node_modules\.bin\electron.cmd" "C:\Users\FERNA\Documents\Spark_Desktop\src\main.js"
exit
