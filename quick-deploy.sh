#!/bin/bash

# Quick Deploy Script - Fast rebuild and redeploy
# For quick iterations during development

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

CONTAINER_NAME="pegasus-app"
IMAGE_NAME="pegasus-plugin-generator"

echo -e "${BLUE}⚡ Quick Deploy - Pegasus Plugin Generator${NC}"

# Stop container
echo "🛑 Stopping container..."
docker stop $CONTAINER_NAME 2>/dev/null || true

# Remove container
echo "🗑️  Removing container..."
docker rm $CONTAINER_NAME 2>/dev/null || true

# Rebuild image
echo "🔨 Rebuilding image..."
docker build -t $IMAGE_NAME . --quiet

# Start container
echo "🚀 Starting container..."
docker run -d \
    --name $CONTAINER_NAME \
    -p 3000:3000 \
    --restart unless-stopped \
    -v pegasus_generated:/app/generated \
    $IMAGE_NAME

echo -e "${GREEN}✅ Quick deploy completed!${NC}"
echo -e "${GREEN}🌐 http://localhost:3000${NC}"
