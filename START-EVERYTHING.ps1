# ============================================================
# WA META AUTO - Full Setup Script
# Double-click to run. Right-click > Run with PowerShell.
# ============================================================

$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ProjectRoot

Write-Host ""
Write-Host "================================================" -ForegroundColor Cyan
Write-Host "  WA META AUTO - Auto Setup Starting..." -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan
Write-Host ""

# ---- Step 1: Database Migration ----
Write-Host "[1/4] Running database migration..." -ForegroundColor Yellow
Set-Location "$ProjectRoot\database"
try {
    $result = & npx prisma db push --accept-data-loss 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "      Migration OK" -ForegroundColor Green
    } else {
        Write-Host "      Migration output: $result" -ForegroundColor Yellow
        # Try alternate approach
        Write-Host "      Trying prisma migrate deploy..." -ForegroundColor Yellow
        & npx prisma migrate deploy 2>&1
    }
} catch {
    Write-Host "      Warning: $($_.Exception.Message)" -ForegroundColor Yellow
}
Set-Location $ProjectRoot

# ---- Step 2: Check/Install ngrok ----
Write-Host ""
Write-Host "[2/4] Checking ngrok..." -ForegroundColor Yellow
$ngrokCmd = Get-Command ngrok -ErrorAction SilentlyContinue
if (-not $ngrokCmd) {
    Write-Host "      ngrok not found. Downloading..." -ForegroundColor Yellow
    $ngrokZip = "$env:TEMP\ngrok.zip"
    try {
        Invoke-WebRequest -Uri "https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip" -OutFile $ngrokZip -UseBasicParsing
        Expand-Archive -Path $ngrokZip -DestinationPath "$env:TEMP\ngrok" -Force
        $env:PATH = "$env:TEMP\ngrok;$env:PATH"
        Write-Host "      ngrok downloaded OK" -ForegroundColor Green
    } catch {
        Write-Host "      Failed to download ngrok: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "      Please install ngrok from https://ngrok.com/download" -ForegroundColor Red
    }
} else {
    Write-Host "      ngrok found at: $($ngrokCmd.Source)" -ForegroundColor Green
}

# ---- Step 3: Start the App ----
Write-Host ""
Write-Host "[3/4] Starting the app (pnpm dev)..." -ForegroundColor Yellow
$appWindow = Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-Command",
    "Set-Location '$ProjectRoot'; Write-Host 'Starting WA META AUTO app...' -ForegroundColor Cyan; pnpm dev"
) -PassThru
Write-Host "      App starting in new window (PID: $($appWindow.Id))" -ForegroundColor Green

# Wait for API to be ready
Write-Host "      Waiting for API to be ready on port 3001..." -ForegroundColor Yellow
$maxWait = 60
$waited = 0
do {
    Start-Sleep -Seconds 2
    $waited += 2
    try {
        $resp = Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
        if ($resp.StatusCode -eq 200) { break }
    } catch {}
    Write-Host "      Still waiting... ($waited/$maxWait sec)" -ForegroundColor Gray
} while ($waited -lt $maxWait)

if ($waited -ge $maxWait) {
    Write-Host "      Warning: API did not respond in time. Continuing anyway..." -ForegroundColor Yellow
} else {
    Write-Host "      API is up!" -ForegroundColor Green
}

# ---- Step 4: Start ngrok ----
Write-Host ""
Write-Host "[4/4] Starting ngrok tunnel on port 3001..." -ForegroundColor Yellow

# Start ngrok in background, capture output
$ngrokLogFile = "$ProjectRoot\ngrok-log.txt"
$ngrokUrlFile = "$ProjectRoot\ngrok-url.txt"
Remove-Item -Path $ngrokUrlFile -ErrorAction SilentlyContinue

$ngrokProcess = Start-Process ngrok -ArgumentList "http 3001 --log=stdout" -RedirectStandardOutput $ngrokLogFile -PassThru -WindowStyle Hidden

# Wait for ngrok URL
Write-Host "      Waiting for ngrok URL..." -ForegroundColor Yellow
$ngrokUrl = $null
for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (Test-Path $ngrokLogFile) {
        $logContent = Get-Content $ngrokLogFile -Raw -ErrorAction SilentlyContinue
        if ($logContent -match 'url=(https://[^\s]+)') {
            $ngrokUrl = $Matches[1]
            break
        }
        # Also try the ngrok API
        try {
            $tunnels = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -ErrorAction SilentlyContinue
            $https = $tunnels.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1
            if ($https) {
                $ngrokUrl = $https.public_url
                break
            }
        } catch {}
    }
}

if (-not $ngrokUrl) {
    # Final attempt: query ngrok API
    try {
        $tunnels = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels"
        $https = $tunnels.tunnels | Where-Object { $_.proto -eq "https" } | Select-Object -First 1
        if ($https) { $ngrokUrl = $https.public_url }
    } catch {
        Write-Host "      Could not get ngrok URL automatically." -ForegroundColor Red
    }
}

if ($ngrokUrl) {
    $ngrokUrl | Out-File -FilePath $ngrokUrlFile -Encoding UTF8 -NoNewline
    Write-Host ""
    Write-Host "================================================" -ForegroundColor Green
    Write-Host "  SUCCESS! ngrok URL:" -ForegroundColor Green
    Write-Host "  $ngrokUrl" -ForegroundColor White
    Write-Host "  Webhook URL for Meta: $ngrokUrl/webhook" -ForegroundColor White
    Write-Host "================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "  ngrok URL saved to: ngrok-url.txt" -ForegroundColor Cyan
    Write-Host "  Claude will now configure the Meta webhook!" -ForegroundColor Cyan
} else {
    Write-Host ""
    Write-Host "  Could not detect ngrok URL automatically." -ForegroundColor Red
    Write-Host "  Open http://localhost:4040 in your browser" -ForegroundColor Yellow
    Write-Host "  and paste the HTTPS URL into the Meta Console webhook field." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Press any key to exit..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
