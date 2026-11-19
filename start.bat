@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js is required: https://nodejs.org/ & pause & exit /b)
start "" http://localhost:5183/
node serve.mjs
