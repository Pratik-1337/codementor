# ==============================================================================
# CodeMentor - Cloudflare Quick Tunnel Launcher
# ==============================================================================
# Opens a free, temporary public HTTPS tunnel to your CodeMentor website
# running on your Windows laptop.
# ==============================================================================

$ErrorActionPreference = "Continue"

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host " CodeMentor - Cloudflare Quick Tunnel Launcher" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

# 1. Resolve Local Server Port from .env
$port = 3000
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^\s*PORT\s*=\s*(\d+)") {
            $port = [int]$matches[1]
        }
    }
}
Write-Host "Target Local URL: http://localhost:$port" -ForegroundColor Gray

# 2. Check if local server is listening
try {
    $probe = Invoke-WebRequest -Uri "http://localhost:$port/api/health" -Method Get -TimeoutSec 2 -ErrorAction Stop
    Write-Host "[OK] CodeMentor local server is active on port $port." -ForegroundColor Green
} catch {
    Write-Host "[NOTICE] CodeMentor server does not appear to be running on port $port yet." -ForegroundColor Yellow
    Write-Host "         Please make sure you run 'npm start' in another terminal window." -ForegroundColor Yellow
}

# 3. Locate cloudflared binary
$cloudflaredCmd = $null
$possiblePaths = @(
    "cloudflared",
    "C:\Program Files (x86)\cloudflared\cloudflared.exe",
    "C:\Program Files\cloudflared\cloudflared.exe",
    "$env:LOCALAPPDATA\Programs\cloudflared\cloudflared.exe",
    "$env:USERPROFILE\bin\cloudflared.exe"
)

foreach ($p in $possiblePaths) {
    if ($p -eq "cloudflared") {
        $found = Get-Command "cloudflared" -ErrorAction SilentlyContinue
        if ($found) {
            $cloudflaredCmd = "cloudflared"
            break
        }
    } elseif (Test-Path $p) {
        $cloudflaredCmd = $p
        break
    }
}

if (-not $cloudflaredCmd) {
    Write-Host "`n[ERROR] cloudflared is not installed or not in PATH." -ForegroundColor Red
    Write-Host "Installation instructions (Free & Official):" -ForegroundColor Yellow
    Write-Host "1. Install via winget (recommended):" -ForegroundColor White
    Write-Host "   winget install --id Cloudflare.cloudflared" -ForegroundColor Cyan
    Write-Host "2. Or download directly from Cloudflare:" -ForegroundColor White
    Write-Host "   https://github.com/cloudflare/cloudflared/releases/latest" -ForegroundColor Cyan
    exit 1
}

Write-Host "`nStarting Cloudflare Quick Tunnel using: $cloudflaredCmd" -ForegroundColor Cyan
Write-Host "Look for the public URL below (https://...trycloudflare.com):" -ForegroundColor Green
Write-Host "Press Ctrl+C to terminate the tunnel at any time.`n" -ForegroundColor Gray

& $cloudflaredCmd tunnel --url "http://localhost:$port"
