@echo off
set NODE_PATH=C:\Users\ferna\.spark_desktop_runtime\node_modules
set CWD=C:\Users\FERNA\Documents\Spark_Desktop
cd /d %CWD%
"C:\Users\ferna\.spark_desktop_runtime\node_modules\.bin\electron.cmd" "C:\Users\FERNA\Documents\Spark_Desktop\src\main.js"
