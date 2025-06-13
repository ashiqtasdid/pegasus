#!/bin/bash

# Pegasus Plugin Generator - Docker Rebuild and Deploy Script
# This script will stop, remove, rebuild and redeploy the Docker containers with Java 17

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Default options
CLEAN_IMAGES=false
FORCE=false
QUICK_MODE=false
BUILD_ONLY=false

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_header() {
    echo -e "${PURPLE}[PEGASUS]${NC} $1"
}

# Function to show help
show_help() {
    echo "Pegasus Plugin Generator - Docker Deployment Script"
    echo ""
    echo "Usage: $0 [options]"
    echo ""
    echo "Options:"
    echo "  --quick           Quick mode: skip confirmations and detailed output"
    echo "  --clean-images    Also remove Docker images (more thorough cleanup)"
    echo "  --force          Skip confirmation prompts"
    echo "  --build-only     Only build the image, don't deploy"
    echo "  -h, --help       Show this help message"
    echo ""
    echo "Features:"
    echo "  • Uses Java 17 (OpenJDK)"
    echo "  • Includes Maven and build tools"
    echo "  • Automatically fixes compilation errors with AI"
    echo "  • Web UI available at http://localhost:3000/app"
    echo ""
    echo "This script will:"
    echo "  1. Stop and remove existing Docker containers"
    echo "  2. Optionally clean up Docker images"
    echo "  3. Rebuild the application with latest changes (Java 17)"
    echo "  4. Deploy and start the services"
    echo "  5. Show application URLs and status"
}

# Function to check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    if [ "$QUICK_MODE" != true ]; then
        print_success "Docker is running"
    fi
}

# Function to check if docker-compose is available
check_docker_compose() {
    if command -v docker-compose >/dev/null 2>&1; then
        COMPOSE_CMD="docker-compose"
    elif docker compose version >/dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
    else
        print_error "Neither 'docker-compose' nor 'docker compose' is available"
        print_status "Falling back to direct Docker commands"
        COMPOSE_CMD=""
        return
    fi
    if [ "$QUICK_MODE" != true ]; then
        print_success "Using: $COMPOSE_CMD"
    fi
}

# Function to verify Java 17 in container
verify_java_version() {
    if [ "$BUILD_ONLY" = true ]; then
        return
    fi
    
    print_status "Verifying Java 17 installation in container..."
    
    # Wait for container to be ready
    sleep 3
    
    if [ -n "$COMPOSE_CMD" ]; then
        JAVA_VERSION=$(docker exec -it pegasus-pegasus-1 java -version 2>&1 | head -n 1 || echo "Failed")
    else
        CONTAINER_ID=$(docker ps --filter "ancestor=pegasus" --format "{{.ID}}" | head -n 1)
        if [ -n "$CONTAINER_ID" ]; then
            JAVA_VERSION=$(docker exec -it $CONTAINER_ID java -version 2>&1 | head -n 1 || echo "Failed")
        else
            JAVA_VERSION="Container not found"
        fi
    fi
    
    if echo "$JAVA_VERSION" | grep -q "17\." ; then
        print_success "Java 17 verified: $JAVA_VERSION"
    else
        print_warning "Java version check: $JAVA_VERSION"
    fi
}

# Function to stop and remove existing containers
cleanup_containers() {
    print_status "Stopping and removing existing containers..."
    
    # Stop containers if they're running
    if $COMPOSE_CMD ps -q | grep -q .; then
        print_status "Stopping running containers..."
        $COMPOSE_CMD down --remove-orphans
        print_success "Containers stopped"
    else
        print_warning "No running containers found"
    fi
    
    # Remove any dangling containers related to pegasus
    if docker ps -a --filter "name=pegasus" -q | grep -q .; then
        print_status "Removing pegasus containers..."
        docker ps -a --filter "name=pegasus" -q | xargs docker rm -f
        print_success "Pegasus containers removed"
    fi
}

# Function to clean up Docker images
cleanup_images() {
    print_status "Cleaning up Docker images..."
    
    # Remove pegasus images
    if docker images --filter "reference=pegasus*" -q | grep -q .; then
        print_status "Removing pegasus images..."
        docker images --filter "reference=pegasus*" -q | xargs docker rmi -f
        print_success "Pegasus images removed"
    fi
    
    # Remove dangling images
    if docker images -f "dangling=true" -q | grep -q .; then
        print_status "Removing dangling images..."
        docker image prune -f
        print_success "Dangling images removed"
    fi
}

# Function to build and deploy
build_and_deploy() {
    print_status "Building and deploying with latest changes..."
    
    # Build with no cache to ensure latest changes
    print_status "Building Docker image (no cache)..."
    $COMPOSE_CMD build --no-cache
    print_success "Docker image built successfully"
    
    # Start the services
    print_status "Starting services..."
    $COMPOSE_CMD up -d
    print_success "Services started"
    
    # Wait for services to be ready
    print_status "Waiting for services to be ready..."
    sleep 5
    
    # Check if services are running
    if $COMPOSE_CMD ps | grep -q "Up"; then
        print_success "Services are running"
        
        # Show running containers
        print_status "Running containers:"
        $COMPOSE_CMD ps
        
        # Show logs for a few seconds
        print_status "Recent logs:"
        timeout 10s $COMPOSE_CMD logs --tail=20 || true
        
    else
        print_error "Services failed to start properly"
        print_status "Container status:"
        $COMPOSE_CMD ps
        print_status "Logs:"
        $COMPOSE_CMD logs
        exit 1
    fi
}

# Function to show application URLs
show_urls() {
    if [ "$BUILD_ONLY" = true ]; then
        print_success "🎉 Build completed successfully!"
        return
    fi
    
    print_header "Application Ready!"
    echo ""
    echo -e "  ${GREEN}• Web UI:${NC}     http://localhost:3000/app"
    echo -e "  ${GREEN}• API:${NC}        http://localhost:3000"
    echo -e "  ${GREEN}• Health:${NC}     http://localhost:3000"
    echo -e "  ${GREEN}• Java:${NC}       OpenJDK 17"
    echo ""
    if [ -n "$COMPOSE_CMD" ]; then
        print_status "Use '$COMPOSE_CMD logs -f' to follow logs"
        print_status "Use '$COMPOSE_CMD down' to stop services"
    else
        print_status "Use 'docker logs -f <container_id>' to follow logs"
        print_status "Use 'docker stop <container_id>' to stop services"
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --clean-images)
            CLEAN_IMAGES=true
            shift
            ;;
        --force)
            FORCE=true
            shift
            ;;
        --quick)
            QUICK_MODE=true
            FORCE=true
            shift
            ;;
        --build-only)
            BUILD_ONLY=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Main execution
main() {
    if [ "$QUICK_MODE" != true ]; then
        print_header "🚀 Pegasus Plugin Generator - Docker Rebuild & Deploy (Java 17)"
        print_status "=============================================================="
        echo ""
    fi
    
    # Check prerequisites
    check_docker
    check_docker_compose
    if [ "$QUICK_MODE" != true ]; then
        echo ""
    fi
    
    # Cleanup existing deployment
    cleanup_containers
    if [ "$QUICK_MODE" != true ]; then
        echo ""
    fi
    
    # Clean up images if requested
    if [ "$CLEAN_IMAGES" = true ]; then
        cleanup_images
        if [ "$QUICK_MODE" != true ]; then
            echo ""
        fi
    fi
    
    # Build and deploy
    build_and_deploy
    if [ "$QUICK_MODE" != true ]; then
        echo ""
    fi
    
    # Verify Java version
    verify_java_version
    if [ "$QUICK_MODE" != true ]; then
        echo ""
    fi
    
    # Show application information
    show_urls
    
    if [ "$BUILD_ONLY" != true ]; then
        print_success "🎉 Deployment completed successfully!"
    fi
}

# Confirmation prompt (unless --force is used)
if [ "$FORCE" != true ]; then
    echo ""
    if [ "$BUILD_ONLY" = true ]; then
        print_warning "This will rebuild the Pegasus Plugin Generator Docker image"
    else
        print_warning "This will stop and rebuild the Pegasus Plugin Generator"
    fi
    read -p "Do you want to continue? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Operation cancelled"
        exit 0
    fi
    echo ""
fi

# Execute main function
main
