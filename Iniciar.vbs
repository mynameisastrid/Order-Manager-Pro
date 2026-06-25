Dim shell, dir
Set shell = CreateObject("WScript.Shell")
dir = Left(WScript.ScriptFullName, InStrRev(WScript.ScriptFullName, "\") - 1)

' Inicia o servidor em segundo plano (sem janela)
shell.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & dir & "\server.ps1""", 0, False

' Aguarda o servidor subir
WScript.Sleep 900

' Abre o browser
shell.Run "http://localhost:8080"
