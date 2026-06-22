# SYS.MONITOR Setup Script
# Run this from the project root folder after downloading

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host ""
Write-Host "  SYS.MONITOR" -ForegroundColor Green
Write-Host "  ───────────────────────────────" -ForegroundColor DarkGreen
Write-Host ""

# Check Node is installed
try {
    $nodeVersion = node -v
    Write-Host "  [OK] Node.js $nodeVersion found" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Node.js not found. Install it from https://nodejs.org then run this script again." -ForegroundColor Red
    exit 1
}

# Install backend deps
Write-Host ""
Write-Host "  Installing backend dependencies..." -ForegroundColor DarkGreen
Set-Location "$root\backend"
npm install --silent
Write-Host "  [OK] Backend ready" -ForegroundColor Green

# Install frontend deps
Write-Host ""
Write-Host "  Installing frontend dependencies..." -ForegroundColor DarkGreen
Set-Location "$root\frontend"
npm install --silent
Write-Host "  [OK] Frontend ready" -ForegroundColor Green

Set-Location $root

Write-Host ""
Write-Host "  ───────────────────────────────" -ForegroundColor DarkGreen
Write-Host "  Setup complete." -ForegroundColor Green
Write-Host ""
Write-Host "  BEFORE YOU START:" -ForegroundColor Yellow
Write-Host "  Edit backend\src\config.ts to set your city and coordinates." -ForegroundColor White
Write-Host "  Find your lat/lon at https://latlong.net" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  TO START THE DASHBOARD:" -ForegroundColor Yellow
Write-Host "  Terminal 1:  cd backend  then  npx ts-node-dev --respawn src/index.ts" -ForegroundColor White
Write-Host "  Terminal 2:  cd frontend  then  npm run dev" -ForegroundColor White
Write-Host ""
Write-Host "  Then open http://127.0.0.1:3002 in your browser." -ForegroundColor Green
Write-Host ""
