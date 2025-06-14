#!/bin/bash

# Pegasus Plugin Generator - Simple Docker Deployment Script
# This script will delete existing Docker containers/images and rebuild with latest changes

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CONTAINER_NAME="pegasus-app"
IMAGE_NAME="pegasus-plugin-generator"
PORT="3000"

echo -e "${BLUE}🚀 Pegasus Plugin Generator - Docker Deployment${NC}"
echo -e "${BLUE}=================================================${NC}"
echo ""

# Function to print colored messages
print_step() {
    echo -e "${BLUE}📋 $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if Docker is running
print_step "Checking Docker status..."
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi
print_success "Docker is running"

# Stop and remove existing container if it exists
print_step "Stopping existing container..."
if docker ps -q -f name=$CONTAINER_NAME | grep -q .; then
    docker stop $CONTAINER_NAME
    print_success "Container stopped"
else
    print_warning "No running container found"
fi

print_step "Removing existing container..."
if docker ps -aq -f name=$CONTAINER_NAME | grep -q .; then
    docker rm $CONTAINER_NAME
    print_success "Container removed"
else
    print_warning "No container to remove"
fi

# Remove existing image if it exists
print_step "Removing existing image..."
if docker images -q $IMAGE_NAME | grep -q .; then
    docker rmi $IMAGE_NAME
    print_success "Image removed"
else
    print_warning "No image to remove"
fi

# Clean up Docker system (optional - removes unused images, containers, networks)
print_step "Cleaning up Docker system..."
docker system prune -f
print_success "Docker system cleaned"

# Build new image
print_step "Building new Docker image with Java 17..."
docker build -t $IMAGE_NAME .
print_success "Image built successfully"

# Run new container
print_step "Starting new container..."
docker run -d \
    --name $CONTAINER_NAME \
    -p $PORT:$PORT \
    --restart unless-stopped \
    -v pegasus_generated:/app/generated \
    $IMAGE_NAME

print_success "Container started successfully"

# Wait a moment for the container to start
sleep 3

# Check if container is running
print_step "Verifying container status..."
if docker ps -q -f name=$CONTAINER_NAME | grep -q .; then
    print_success "Container is running"
    
    # Show container logs
    echo ""
    print_step "Container logs (last 20 lines):"
    docker logs --tail 20 $CONTAINER_NAME
    
    echo ""
    print_success "🎉 Deployment completed successfully!"
    echo -e "${GREEN}🌐 Application is available at: http://localhost:$PORT${NC}"
    echo -e "${GREEN}🎮 Web UI is available at: http://localhost:$PORT/app${NC}"
    echo -e "${GREEN}☕ Running with Java 17 and Maven${NC}"
    
    # Show useful commands
    echo ""
    echo -e "${BLUE}📚 Useful commands:${NC}"
    echo -e "  View logs:     ${YELLOW}docker logs -f $CONTAINER_NAME${NC}"
    echo -e "  Stop app:      ${YELLOW}docker stop $CONTAINER_NAME${NC}"
    echo -e "  Start app:     ${YELLOW}docker start $CONTAINER_NAME${NC}"
    echo -e "  Remove app:    ${YELLOW}docker rm -f $CONTAINER_NAME${NC}"
    echo -e "  Access shell:  ${YELLOW}docker exec -it $CONTAINER_NAME sh${NC}"
    echo -e "  Check Java:    ${YELLOW}docker exec $CONTAINER_NAME java -version${NC}"
    
else
    print_error "Container failed to start"
    echo ""
    print_step "Container logs:"
    docker logs $CONTAINER_NAME
    exit 1
fi

echo ""
echo -e "${BLUE}🎯 Deployment completed at $(date)${NC}"
