Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "g:\My Drive\04_Desarrollo_AI\Spark_Desktop"
WshShell.Environment("PROCESS")("NODE_PATH") = "C:\Users\ferna\.spark_desktop_runtime\node_modules"
WshShell.Run """C:\Users\ferna\.spark_desktop_runtime\node_modules\electron\dist\electron.exe"" ""g:\My Drive\04_Desarrollo_AI\Spark_Desktop\src\main.js""", 0, False
