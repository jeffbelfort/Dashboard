$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host ""
Write-Host "  SYS.MONITOR" -ForegroundColor Green
Write-Host "  -------------------------------" -ForegroundColor DarkGreen
Write-Host ""
Write-Host "  What do you want to do?" -ForegroundColor Yellow
Write-Host "  [1] First time setup (install + build)" -ForegroundColor White
Write-Host "  [2] Start dashboard" -ForegroundColor White
Write-Host "  [3] Rebuild frontend" -ForegroundColor White
Write-Host "  [4] Start in dev mode" -ForegroundColor White
Write-Host ""
$mode = (Read-Host "  Enter 1, 2, 3 or 4").Trim()

try {
    $nodeVersion = node -v
    Write-Host "  [OK] Node.js $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Node.js not found. Install from https://nodejs.org" -ForegroundColor Red
    exit 1
}

if ($mode -eq "1") {
    Write-Host "  Installing backend dependencies..." -ForegroundColor DarkGreen
    Set-Location "$root\backend"
    npm install --silent
    Write-Host "  [OK] Backend deps installed" -ForegroundColor Green

    Write-Host "  Installing frontend dependencies..." -ForegroundColor DarkGreen
    Set-Location "$root\frontend"
    npm install --silent
    Write-Host "  [OK] Frontend deps installed" -ForegroundColor Green

    Write-Host "  Building frontend..." -ForegroundColor DarkGreen
    npm run build
    Write-Host "  [OK] Frontend built" -ForegroundColor Green

    Set-Location $root
    Write-Host ""
    Write-Host "  Setup complete! Run again and choose [2] to start." -ForegroundColor Green
    Write-Host "  Open http://127.0.0.1:3002 to configure." -ForegroundColor White
    Write-Host ""
}
elseif ($mode -eq "2") {
    Write-Host "  Starting SYS.MONITOR..." -ForegroundColor DarkGreen
    Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$root\backend'; npm run dev`""
    Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$root\frontend'; npm run start`""
    Start-Sleep -Seconds 3
    Start-Process "http://127.0.0.1:3002"
    Write-Host "  [OK] Dashboard running at http://127.0.0.1:3002" -ForegroundColor Green
    Write-Host "  Close the backend and frontend windows to stop." -ForegroundColor DarkGray
    Write-Host ""
}
elseif ($mode -eq "3") {
    Write-Host "  Rebuilding frontend..." -ForegroundColor DarkGreen
    Set-Location "$root\frontend"
    npm run build
    Set-Location $root
    Write-Host "  [OK] Rebuild complete. Run option [2] to start." -ForegroundColor Green
    Write-Host ""
}
elseif ($mode -eq "4") {
    Write-Host "  Starting in dev mode..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$root\backend'; npm run dev`""
    Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$root\frontend'; npm run dev`""
    Start-Sleep -Seconds 3
    Start-Process "http://127.0.0.1:3002"
    Write-Host "  [OK] Dev mode started" -ForegroundColor Green
    Write-Host ""
}
else {
    Write-Host "  Invalid option." -ForegroundColor Red
}
