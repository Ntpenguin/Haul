@echo off
rem Local preview of the marketing site. Double-click me.
rem Serves landing/ at http://localhost:3000 with clean URLs (/intake -> intake.html),
rem matching how SiteGround serves the live site. Ctrl+C or close this window to stop.
cd /d "%~dp0"
start "" "http://localhost:3000"
npx serve landing -p 3000
