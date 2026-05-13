Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Obtener la ruta de la carpeta donde esta este script
Dim currentDir
currentDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Construir ruta al bat del agente con comillas para manejar espacios
Dim batPath
batPath = """" & currentDir & "\INICIAR_AGENTE.bat" & """"

' Cambiar al directorio del script para que el BAT encuentre sus archivos
WshShell.CurrentDirectory = currentDir

' Ejecutar el agente minimizado (sin ventana grande, solo en barra de tareas)
WshShell.Run batPath, 2, False


