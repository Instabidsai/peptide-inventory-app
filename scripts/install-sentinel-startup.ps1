$WshShell = New-Object -ComObject WScript.Shell
$StartupPath = [System.IO.Path]::Combine($env:APPDATA, "Microsoft\Windows\Start Menu\Programs\Startup\PeptideAutoHealSentinel.lnk")
$Shortcut = $WshShell.CreateShortcut($StartupPath)
$Shortcut.TargetPath = "cmd.exe"
$Shortcut.Arguments = "/c `"C:\Users\Not John Or Justin\Peptide Inv App\scripts\sentinel-service.cmd`""
$Shortcut.WorkingDirectory = "C:\Users\Not John Or Justin\Peptide Inv App"
$Shortcut.WindowStyle = 7  # Minimized
$Shortcut.Save()
Write-Host "Sentinel startup shortcut created at: $StartupPath"
Write-Host "The sentinel will now auto-start (minimized) every time you log in."
