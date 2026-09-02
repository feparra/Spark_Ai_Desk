Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
logFile = "C:\Users\FERNA\Documents\Spark_Desktop\spark_debug.log"
Set log = fso.CreateTextFile(logFile, True)
log.WriteLine "VBS started at " & Now
WshShell.CurrentDirectory = "C:\Users\FERNA\Documents\Spark_Desktop"
WshShell.Environment("PROCESS")("NODE_PATH") = "C:\Users\ferna\.spark_desktop_runtime\node_modules"
log.WriteLine "NODE_PATH set"
log.WriteLine "Launching electron..."
result = WshShell.Run("""C:\Users\ferna\.spark_desktop_runtime\node_modules\.bin\electron.cmd"" ""C:\Users\FERNA\Documents\Spark_Desktop\src\main.js""", 0, False)
log.WriteLine "Run returned: " & result
log.Close
