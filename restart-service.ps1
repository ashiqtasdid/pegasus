# PowerShell script to restart the Pegasus service
Write-Host "🔄 Restarting Pegasus service..." -ForegroundColor Yellow

# Stop the current Docker containers
Write-Host "⏹️ Stopping Docker containers..." -ForegroundColor Blue
docker-compose down

# Rebuild and start the service
Write-Host "🚀 Starting service..." -ForegroundColor Green
docker-compose up --build -d

Write-Host "✅ Service restarted successfully!" -ForegroundColor Green
Write-Host "📋 To view logs, run: docker-compose logs -f" -ForegroundColor Cyan
