Set WshShell = CreateObject("WScript.Shell")
' Ruta al bat del agente
Dim batPath
batPath = "C:\Users\MUNDO DE PEKES\Documents\ia pekes\mundodepekes-main\print-agent\INICIAR_AGENTE.bat"

' Ejecutar el agente minimizado (sin ventana grande, solo en barra de tareas)
WshShell.Run batPath, 2, False
