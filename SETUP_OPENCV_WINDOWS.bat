@echo off
setlocal
cd /d "%~dp0"
if not exist lib mkdir lib
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; Invoke-WebRequest -Uri 'https://docs.opencv.org/4.x/opencv.js' -OutFile 'lib/opencv.js'; if ((Get-Item 'lib/opencv.js').Length -lt 100000) { throw 'OpenCV.js download appears incomplete' }; Write-Host 'OpenCV.js downloaded successfully.'"
if errorlevel 1 (
 echo Download failed. Check internet connectivity, then retry.
 pause
 exit /b 1
)
echo Now run START_LOCAL_WINDOWS.bat to test the PWA.
pause
