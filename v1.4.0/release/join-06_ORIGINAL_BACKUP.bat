@echo off
cd /d "%~dp0"
copy /b 06_ORIGINAL_BACKUP.zip.001+06_ORIGINAL_BACKUP.zip.002 06_ORIGINAL_BACKUP.zip
echo Done: 06_ORIGINAL_BACKUP.zip
pause
