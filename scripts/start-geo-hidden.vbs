Option Explicit
Dim shell, nodePath, projectRoot, command
If WScript.Arguments.Count <> 2 Then WScript.Quit 1
nodePath = WScript.Arguments(0)
projectRoot = WScript.Arguments(1)
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = projectRoot
command = """" & nodePath & """ """ & projectRoot & "\scripts\geo-local-watch.ts"""
shell.Run command, 0, False
