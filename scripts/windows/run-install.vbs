Set objShell = CreateObject("Shell.Application")
strPath = WScript.ScriptFullName
Set objFile = CreateObject("Scripting.FileSystemObject")
strFolder = objFile.GetParentFolderName(strPath)
strBatFile = strFolder & "\install-deps.bat"

objShell.ShellExecute "cmd.exe", "/c """ & strBatFile & """", strFolder, "runas", 1
