@echo off
REM Launcher for Channeled dev servers.
REM Opens the app in your default browser once the client is ready, then runs npm run dev.

cd /d "%~dp0.."

REM Open http://localhost:47821 after a short delay (client should be up by then).
start "" cmd /c "timeout /t 6 /nobreak >nul && start http://localhost:47821"

REM Run the dev servers (client + server) in this window.
call npm run dev

REM Pause on exit so any errors stay visible.
echo.
echo [channeled] dev servers stopped.
pause
