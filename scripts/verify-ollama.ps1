# ==============================================================================
# CodeMentor - Verify Local Ollama & Model Script
# ==============================================================================

$ErrorActionPreference = "Continue"

Write-Host "`n[1/3] Checking Ollama Service Connectivity..." -ForegroundColor Cyan

$ollamaUrl = "http://127.0.0.1:11434"
$targetModel = "qwen2.5-coder:7b"

# Read model and URL from .env if present
if (Test-Path ".env") {
    Get-Content ".env" | ForEach-Object {
        if ($_ -match "^\s*OLLAMA_BASE_URL\s*=\s*(.+)$") {
            $ollamaUrl = $matches[1].Trim().Trim('"').Trim("'")
        }
        if ($_ -match "^\s*OLLAMA_MODEL\s*=\s*(.+)$") {
            $targetModel = $matches[1].Trim().Trim('"').Trim("'")
        }
    }
}

try {
    $tagsResponse = Invoke-RestMethod -Uri "$ollamaUrl/api/tags" -Method Get -TimeoutSec 5 -ErrorAction Stop
    Write-Host "   [OK] Ollama is active and listening at $ollamaUrl" -ForegroundColor Green
} catch {
    Write-Host "   [FAIL] Could not connect to Ollama at $ollamaUrl" -ForegroundColor Red
    Write-Host "   Solution: Start the Ollama application on Windows or run 'ollama serve' in a terminal." -ForegroundColor Yellow
    exit 1
}

Write-Host "`n[2/3] Checking for Model '$targetModel'..." -ForegroundColor Cyan
$modelNames = @($tagsResponse.models | ForEach-Object { $_.name; $_.model })
$found = $false
foreach ($m in $modelNames) {
    if ($m -eq $targetModel -or $m -like "$targetModel*") {
        $found = $true
        break
    }
}

if ($found) {
    Write-Host "   [OK] Model '$targetModel' is downloaded and ready." -ForegroundColor Green
} else {
    Write-Host "   [FAIL] Model '$targetModel' was not found in Ollama." -ForegroundColor Red
    Write-Host "   Available models in Ollama: $($modelNames -join ', ')" -ForegroundColor Yellow
    Write-Host "   Solution: Run this command in terminal to download it:" -ForegroundColor Yellow
    Write-Host "   ollama pull $targetModel" -ForegroundColor White
    exit 1
}

Write-Host "`n[3/3] Testing AI Inference with a Quick Prompt..." -ForegroundColor Cyan
$testPayload = @{
    model = $targetModel
    messages = @(
        @{ role = "system"; content = "You are a concise C++ mentor." }
        @{ role = "user"; content = "What is std::vector in C++ in 1 sentence?" }
    )
    stream = $false
} | ConvertTo-Json -Depth 5

try {
    $chatRes = Invoke-RestMethod -Uri "$ollamaUrl/api/chat" -Method Post -ContentType "application/json" -Body $testPayload -TimeoutSec 45
    $reply = $chatRes.message.content.Trim()
    Write-Host "   [OK] Response received from $($targetModel):" -ForegroundColor Green
    Write-Host "   `"$reply`"" -ForegroundColor Gray
    Write-Host "`nAll Ollama checks passed successfully! CodeMentor is ready to use local AI.`n" -ForegroundColor Green
} catch {
    Write-Host "   [FAIL] Inference test failed: $_" -ForegroundColor Red
    exit 1
}
