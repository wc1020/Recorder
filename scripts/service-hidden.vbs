Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
cmd = """" & dir & "\service-run.cmd"""
CreateObject("WScript.Shell").Run "cmd /c " & cmd, 0, False
