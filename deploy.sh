#!/bin/bash

# Pegasus Plugin Generator - Docker Rebuild and Deploy Script
# This script will stop, remove, rebuild and redeploy the Docker containers

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Function to check if Docker is running
check_docker() {
    if ! docker info >/dev/null 2>&1; then
        print_error "Docker is not running. Please start Docker and try again."
        exit 1
    fi
    print_success "Docker is running"
}

# Function to check if docker-compose is available
check_docker_compose() {
    if command -v docker-compose >/dev/null 2>&1; then
        COMPOSE_CMD="docker-compose"
    elif docker compose version >/dev/null 2>&1; then
        COMPOSE_CMD="docker compose"
    else
        print_error "Neither 'docker-compose' nor 'docker compose' is available"
        exit 1
    fi
    print_success "Using: $COMPOSE_CMD"
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
    print_status "Application URLs:"
    echo -e "  ${GREEN}• Web UI:${NC}     http://localhost:3000/app"
    echo -e "  ${GREEN}• API:${NC}        http://localhost:3000"
    echo -e "  ${GREEN}• Health:${NC}     http://localhost:3000"
    echo ""
    print_status "Use 'docker-compose logs -f' to follow logs"
    print_status "Use 'docker-compose down' to stop services"
}

# Main execution
main() {
    print_status "🚀 Pegasus Plugin Generator - Docker Rebuild & Deploy"
    print_status "=================================================="
    echo ""
    
    # Check prerequisites
    check_docker
    check_docker_compose
    echo ""
    
    # Cleanup existing deployment
    cleanup_containers
    echo ""
    
    # Optional: Clean up images (uncomment if you want to remove old images)
    # cleanup_images
    # echo ""
    
    # Build and deploy
    build_and_deploy
    echo ""
    
    # Show application information
    show_urls
    
    print_success "🎉 Deployment completed successfully!"
}

# Parse command line arguments
CLEAN_IMAGES=false
FORCE=false

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
        -h|--help)
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --clean-images    Also remove Docker images (more thorough cleanup)"
            echo "  --force          Skip confirmation prompts"
            echo "  -h, --help       Show this help message"
            echo ""
            echo "This script will:"
            echo "  1. Stop and remove existing Docker containers"
            echo "  2. Optionally clean up Docker images"
            echo "  3. Rebuild the application with latest changes"
            echo "  4. Deploy and start the services"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

# Confirmation prompt (unless --force is used)
if [ "$FORCE" != true ]; then
    echo ""
    print_warning "This will stop and rebuild the Pegasus Plugin Generator"
    read -p "Do you want to continue? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Operation cancelled"
        exit 0
    fi
    echo ""
fi

# Run cleanup_images if requested
if [ "$CLEAN_IMAGES" = true ]; then
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
fi

# Execute main function
main
