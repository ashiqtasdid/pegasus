#!/bin/bash

# Health Check Utility for Pegasus API
# This script checks if the Pegasus API server is running and healthy

API_URL="http://localhost:3000"
HEALTH_ENDPOINT="$API_URL/health/simple"
DETAILED_ENDPOINT="$API_URL/health"

echo "🏥 Pegasus API Health Check"
echo "=========================="
echo "📡 API URL: $API_URL"
echo ""

# Function to check simple health
check_simple_health() {
    echo "🔍 Checking basic health status..."
    
    response=$(curl -s -w "HTTPSTATUS:%{http_code}" "$HEALTH_ENDPOINT" 2>/dev/null)
    
    if [ $? -ne 0 ]; then
        echo "❌ Connection failed - Server appears to be down"
        return 1
    fi
    
    body=$(echo "$response" | sed -E 's/HTTPSTATUS\:[0-9]{3}$//')
    status_code=$(echo "$response" | tr -d '\n' | sed -E 's/.*HTTPSTATUS:([0-9]{3})$/\1/')
    
    if [ "$status_code" -eq 200 ]; then
        api_status=$(echo "$body" | jq -r '.status' 2>/dev/null)
        if [ "$api_status" = "ok" ]; then
            echo "✅ API is healthy and responding"
            return 0
        else
            echo "⚠️ API responded but status is: $api_status"
            return 1
        fi
    else
        echo "❌ HTTP Error: $status_code"
        return 1
    fi
}

# Function to get detailed health info
get_detailed_health() {
    echo ""
    echo "📊 Getting detailed health information..."
    
    response=$(curl -s "$DETAILED_ENDPOINT" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
    else
        echo "❌ Failed to get detailed health information"
    fi
}

# Function to test specific endpoints
test_endpoints() {
    echo ""
    echo "🧪 Testing key endpoints..."
    
    # Test plugin files endpoint
    echo -n "  📁 Plugin files endpoint: "
    files_status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/plugin/files" \
        -H "Content-Type: application/json" \
        -d '{"userId":"test","pluginName":"test"}' 2>/dev/null)
    
    if [ "$files_status" -eq 200 ] || [ "$files_status" -eq 400 ]; then
        echo "✅ Responding (HTTP $files_status)"
    else
        echo "❌ Error (HTTP $files_status)"
    fi
    
    # Test cache stats endpoint
    echo -n "  📊 Cache stats endpoint: "
    cache_status=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/plugin/cache-stats" 2>/dev/null)
    
    if [ "$cache_status" -eq 200 ]; then
        echo "✅ Responding (HTTP $cache_status)"
    else
        echo "❌ Error (HTTP $cache_status)"
    fi
    
    # Test chat endpoint
    echo -n "  💬 Chat endpoint: "
    chat_status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/chat/message" \
        -H "Content-Type: application/json" \
        -d '{"message":"test","username":"test"}' 2>/dev/null)
    
    if [ "$chat_status" -eq 200 ] || [ "$chat_status" -eq 400 ]; then
        echo "✅ Responding (HTTP $chat_status)"
    else
        echo "❌ Error (HTTP $chat_status)"
    fi
}

# Main execution
main() {
    # Check if required tools are available
    if ! command -v curl &> /dev/null; then
        echo "❌ curl is required but not installed"
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        echo "⚠️ jq is not installed - JSON output will not be formatted"
    fi
    
    # Perform health checks
    if check_simple_health; then
        get_detailed_health
        test_endpoints
        echo ""
        echo "🎉 Health check completed successfully!"
        echo "🌐 You can access the API at: $API_URL"
        echo "📝 Try the Monaco Editor at: $API_URL/editor.html"
        exit 0
    else
        echo ""
        echo "💡 Troubleshooting tips:"
        echo "  1. Make sure the server is running: npm start"
        echo "  2. Check if port 3000 is available"
        echo "  3. Verify no firewall is blocking the connection"
        echo "  4. Check server logs for errors"
        exit 1
    fi
}

# Handle script arguments
case "${1:-}" in
    --simple|-s)
        check_simple_health
        exit $?
        ;;
    --detailed|-d)
        get_detailed_health
        exit 0
        ;;
    --endpoints|-e)
        test_endpoints
        exit 0
        ;;
    --help|-h)
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --simple, -s      Only check basic health status"
        echo "  --detailed, -d    Only show detailed health information"
        echo "  --endpoints, -e   Only test endpoint availability"
        echo "  --help, -h        Show this help message"
        echo ""
        echo "With no options, performs a comprehensive health check."
        exit 0
        ;;
    *)
        main
        ;;
esac
