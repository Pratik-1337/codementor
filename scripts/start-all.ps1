# ==============================================================================
# CodeMentor - Unified Startup (Server + Cloudflare Quick Tunnel)
# ==============================================================================

$ErrorActionPreference = "Continue"

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host " CodeMentor - Full Stack Local AI + Tunnel Startup" -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

# Step 1: Verify Ollama & Model
Write-Host "Step 1: Checking Ollama & qwen2.5-coder:7b..." -ForegroundColor Cyan
& powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\verify-ollama.ps1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nOllama verification failed. Please fix the issue before launching the server." -ForegroundColor Red
    exit 1
}

# Step 2: Start Node.js Server in a new window
Write-Host "`nStep 2: Starting CodeMentor Node.js Server..." -ForegroundColor Cyan
$serverScript = "cd '$PSScriptRoot\..'; node server/server.js"
Start-Process powershell -ArgumentList "-NoExit", "-Command", $serverScript

Write-Host "Waiting 3 seconds for server to initialize..." -ForegroundColor Gray
Start-Sleep -Seconds 3

# Step 3: Start Cloudflare Tunnel in current window
Write-Host "`nStep 3: Launching Cloudflare Quick Tunnel..." -ForegroundColor Cyan
& powershell -ExecutionPolicy Bypass -File "$PSScriptRoot\start-tunnel.ps1"
