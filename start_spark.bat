@echo off
title Spark AI Launcher
set NODE_PATH=C:\Users\ferna\.spark_desktop_runtime\node_modules
taskkill /F /IM electron.exe 2>nul
start "" wscript.exe "g:\My Drive\04_Desarrollo_AI\Spark_Desktop\start_spark_background.vbs"
exit
