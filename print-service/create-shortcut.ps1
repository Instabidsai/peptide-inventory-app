$ws = New-Object -ComObject WScript.Shell
$startup = [Environment]::GetFolderPath('Startup')
$shortcut = $ws.CreateShortcut("$startup\LabelPrintService.lnk")
$shortcut.TargetPath = "C:\Users\Not John Or Justin\Peptide Inv App\print-service\start.cmd"
$shortcut.WorkingDirectory = "C:\Users\Not John Or Justin\Peptide Inv App\print-service"
$shortcut.WindowStyle = 7
$shortcut.Description = "D520 Label Print Service"
$shortcut.Save()
Write-Host "Created startup shortcut: $startup\LabelPrintService.lnk"
