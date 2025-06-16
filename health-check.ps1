# Health Check Utility for Pegasus API
# This script checks if the Pegasus API server is running and healthy

param(
    [switch]$Simple,
    [switch]$Detailed,
    [switch]$Endpoints,
    [switch]$Help
)

$API_URL = "http://localhost:3000"
$HEALTH_ENDPOINT = "$API_URL/health/simple"
$DETAILED_ENDPOINT = "$API_URL/health"

function Show-Help {
    Write-Host "Health Check Utility for Pegasus API" -ForegroundColor Yellow
    Write-Host "====================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Usage: .\health-check.ps1 [OPTIONS]" -ForegroundColor White
    Write-Host ""
    Write-Host "Options:" -ForegroundColor Cyan
    Write-Host "  -Simple      Only check basic health status" -ForegroundColor White
    Write-Host "  -Detailed    Only show detailed health information" -ForegroundColor White
    Write-Host "  -Endpoints   Only test endpoint availability" -ForegroundColor White
    Write-Host "  -Help        Show this help message" -ForegroundColor White
    Write-Host ""
    Write-Host "With no options, performs a comprehensive health check." -ForegroundColor Gray
}

function Test-SimpleHealth {
    Write-Host "🔍 Checking basic health status..." -ForegroundColor Blue
    
    try {
        $response = Invoke-RestMethod -Uri $HEALTH_ENDPOINT -Method GET -TimeoutSec 10
        
        if ($response.status -eq "ok") {
            Write-Host "✅ API is healthy and responding" -ForegroundColor Green
            return $true
        } else {
            Write-Host "⚠️ API responded but status is: $($response.status)" -ForegroundColor Yellow
            return $false
        }
    } catch {
        Write-Host "❌ Connection failed - Server appears to be down" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

function Get-DetailedHealth {
    Write-Host ""
    Write-Host "📊 Getting detailed health information..." -ForegroundColor Blue
    
    try {
        $response = Invoke-RestMethod -Uri $DETAILED_ENDPOINT -Method GET -TimeoutSec 10
        
        Write-Host "Status: $($response.status)" -ForegroundColor Green
        Write-Host "Timestamp: $($response.timestamp)" -ForegroundColor White
        Write-Host "Uptime: $($response.uptime.human) ($($response.uptime.seconds)s)" -ForegroundColor White
        Write-Host "Memory Usage: $($response.memory.used)MB / $($response.memory.total)MB" -ForegroundColor White
        Write-Host "Node Version: $($response.version)" -ForegroundColor White
        Write-Host "Platform: $($response.platform)" -ForegroundColor White
        Write-Host "Process ID: $($response.pid)" -ForegroundColor White
        
        return $true
    } catch {
        Write-Host "❌ Failed to get detailed health information" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

function Test-Endpoints {
    Write-Host ""
    Write-Host "🧪 Testing key endpoints..." -ForegroundColor Blue
    
    # Test plugin files endpoint
    Write-Host "  📁 Plugin files endpoint: " -NoNewline
    try {
        $null = Invoke-RestMethod -Uri "$API_URL/plugin/files" -Method POST `
            -Body '{"userId":"test","pluginName":"test"}' `
            -ContentType "application/json" -TimeoutSec 5
        Write-Host "✅ Responding" -ForegroundColor Green
    } catch {
        if ($_.Exception.Response.StatusCode -eq 400) {
            Write-Host "✅ Responding (Expected validation error)" -ForegroundColor Green
        } else {
            Write-Host "❌ Error ($($_.Exception.Response.StatusCode))" -ForegroundColor Red
        }
    }
    
    # Test cache stats endpoint
    Write-Host "  📊 Cache stats endpoint: " -NoNewline
    try {
        $null = Invoke-RestMethod -Uri "$API_URL/plugin/cache-stats" -Method GET -TimeoutSec 5
        Write-Host "✅ Responding" -ForegroundColor Green
    } catch {
        Write-Host "❌ Error ($($_.Exception.Response.StatusCode))" -ForegroundColor Red
    }
    
    # Test chat endpoint
    Write-Host "  💬 Chat endpoint: " -NoNewline
    try {
        $null = Invoke-RestMethod -Uri "$API_URL/chat/message" -Method POST `
            -Body '{"message":"test","username":"test"}' `
            -ContentType "application/json" -TimeoutSec 5
        Write-Host "✅ Responding" -ForegroundColor Green
    } catch {
        if ($_.Exception.Response.StatusCode -eq 400) {
            Write-Host "✅ Responding (Expected validation error)" -ForegroundColor Green
        } else {
            Write-Host "❌ Error ($($_.Exception.Response.StatusCode))" -ForegroundColor Red
        }
    }
    
    # Test health endpoints
    Write-Host "  🏥 Health endpoints: " -NoNewline
    try {
        $null = Invoke-RestMethod -Uri $HEALTH_ENDPOINT -Method GET -TimeoutSec 5
        $null = Invoke-RestMethod -Uri $DETAILED_ENDPOINT -Method GET -TimeoutSec 5
        Write-Host "✅ Both responding" -ForegroundColor Green
    } catch {
        Write-Host "❌ Error ($($_.Exception.Response.StatusCode))" -ForegroundColor Red
    }
}

function Start-Main {
    Write-Host "🏥 Pegasus API Health Check" -ForegroundColor Yellow
    Write-Host "==========================" -ForegroundColor Yellow
    Write-Host "📡 API URL: $API_URL" -ForegroundColor Cyan
    Write-Host ""
    
    # Perform health checks
    $isHealthy = Test-SimpleHealth
    
    if ($isHealthy) {
        Get-DetailedHealth | Out-Null
        Test-Endpoints
        Write-Host ""
        Write-Host "🎉 Health check completed successfully!" -ForegroundColor Green
        Write-Host "🌐 You can access the API at: $API_URL" -ForegroundColor Cyan
        Write-Host "📝 Try the Monaco Editor at: $API_URL/editor.html" -ForegroundColor Cyan
    } else {
        Write-Host ""
        Write-Host "💡 Troubleshooting tips:" -ForegroundColor Yellow
        Write-Host "  1. Make sure the server is running: npm start" -ForegroundColor White
        Write-Host "  2. Check if port 3000 is available" -ForegroundColor White
        Write-Host "  3. Verify no firewall is blocking the connection" -ForegroundColor White
        Write-Host "  4. Check server logs for errors" -ForegroundColor White
        exit 1
    }
}

# Handle script parameters
if ($Help) {
    Show-Help
    exit 0
}

if ($Simple) {
    $result = Test-SimpleHealth
    exit ($result ? 0 : 1)
}

if ($Detailed) {
    Get-DetailedHealth | Out-Null
    exit 0
}

if ($Endpoints) {
    Test-Endpoints
    exit 0
}

# Default: run comprehensive check
Start-Main
