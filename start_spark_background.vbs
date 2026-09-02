Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\FERNA\Documents\Spark_Desktop"
WshShell.Environment("PROCESS")("NODE_PATH") = "C:\Users\ferna\.spark_desktop_runtime\node_modules"
WshShell.Run """C:\Users\ferna\.spark_desktop_runtime\node_modules\.bin\electron.cmd"" ""C:\Users\FERNA\Documents\Spark_Desktop\src\main.js""", 0, False