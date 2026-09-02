@echo off
title Spark AI Launcher
set NODE_PATH=C:\Users\ferna\.spark_desktop_runtime\node_modules
taskkill /F /IM electron.exe 2>nul
start "" wscript.exe "C:\Users\FERNA\Documents\Spark_Desktop\start_spark_background.vbs"
exit