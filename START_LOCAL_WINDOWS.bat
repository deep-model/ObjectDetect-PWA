@echo off
cd /d "%~dp0"
if not exist lib\opencv.js (
 echo OpenCV.js is missing. Run SETUP_OPENCV_WINDOWS.bat first.
 pause
 exit /b 1
)
start "" "http://localhost:8000"
py -3 -m http.server 8000
if errorlevel 1 python -m http.server 8000
pause
