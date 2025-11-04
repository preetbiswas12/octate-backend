#!/bin/bash

# Complete VPS Deployment Script for Octate Collaboration Backend
# Run this script on your fresh VPS to deploy everything

set -e

# Configuration (UPDATE THESE VALUES)
DOMAIN="octate.qzz.io"
EMAIL="your-email@example.com"
GITHUB_REPO="https://github.com/yourusername/octate-backend.git"
BRANCH="main"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_step() {
    echo -e "${BLUE}🚀 $1${NC}"
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

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    print_error "Please run this script as root (use sudo)"
    exit 1
fi

print_step "Starting Octate Backend VPS Deployment"

# Update system
print_step "Updating system packages..."
if command -v apt &> /dev/null; then
    apt update && apt upgrade -y
    apt install -y curl wget git nano htop fail2ban ufw
elif command -v yum &> /dev/null; then
    yum update -y
    yum install -y curl wget git nano htop fail2ban firewalld
fi

# Install Docker
print_step "Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    usermod -aG docker $USER
    print_success "Docker installed"
else
    print_success "Docker already installed"
fi

# Install Docker Compose
print_step "Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    print_success "Docker Compose installed"
else
    print_success "Docker Compose already installed"
fi

# Setup firewall
print_step "Configuring firewall..."
if command -v ufw &> /dev/null; then
    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow ssh
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw --force enable
elif command -v firewall-cmd &> /dev/null; then
    systemctl enable firewalld
    systemctl start firewalld
    firewall-cmd --permanent --add-service=ssh
    firewall-cmd --permanent --add-service=http
    firewall-cmd --permanent --add-service=https
    firewall-cmd --reload
fi
print_success "Firewall configured"

# Create application directory
print_step "Setting up application directory..."
mkdir -p /opt/octate-backend
cd /opt/octate-backend

# Clone repository
print_step "Cloning repository..."
git clone $GITHUB_REPO .
git checkout $BRANCH
print_success "Repository cloned"

# Create environment file
print_step "Creating environment configuration..."
cat > .env.production << EOF
# Production Environment Variables
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://$DOMAIN

# Supabase Configuration
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# JWT Secret (generate a strong secret)
JWT_SECRET=$(openssl rand -base64 32)

# OAuth Configuration
GITHUB_CLIENT_ID=your_github_client_id
GITHUB_CLIENT_SECRET=your_github_client_secret
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
OAUTH_REDIRECT_URI=https://your_supabase_url/auth/v1/callback

# Security
CORS_ORIGIN=https://$DOMAIN,https://www.$DOMAIN
MAX_REQUEST_SIZE=10mb

# Redis Password
REDIS_PASSWORD=$(openssl rand -base64 16)

# Monitoring
GRAFANA_PASSWORD=$(openssl rand -base64 16)
EOF

print_warning "Environment file created at /opt/octate-backend/.env.production"
print_warning "Please update the Supabase and OAuth credentials!"

# Build and start services
print_step "Building and starting services..."
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d
print_success "Services started"

# Setup systemd service
print_step "Setting up systemd service..."
cp deployment/octate-backend.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable octate-backend
print_success "Systemd service configured"

# Setup SSL certificates
print_step "Setting up SSL certificates..."
chmod +x deployment/setup-ssl.sh
sed -i "s/your-domain.com/$DOMAIN/g" deployment/setup-ssl.sh
sed -i "s/your-email@example.com/$EMAIL/g" deployment/setup-ssl.sh
./deployment/setup-ssl.sh
print_success "SSL certificates configured"

# Setup monitoring and backups
print_step "Setting up monitoring and backups..."
chmod +x deployment/setup-monitoring.sh
./deployment/setup-monitoring.sh
print_success "Monitoring and backups configured"

# Create deployment webhook (for CI/CD)
print_step "Setting up deployment webhook..."
cat > /opt/octate-backend/scripts/deploy.sh << 'EOF'
#!/bin/bash

# Deployment script for CI/CD
cd /opt/octate-backend

# Pull latest changes
git pull origin main

# Build and restart services
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# Run health check
sleep 10
if curl -f http://localhost/health > /dev/null 2>&1; then
    echo "Deployment successful!"
    /opt/octate-backend/scripts/send-alert.sh "DEPLOYMENT" "Successful deployment completed"
else
    echo "Deployment failed - health check failed"
    /opt/octate-backend/scripts/send-alert.sh "DEPLOYMENT" "Deployment failed - health check failed"
    exit 1
fi
EOF

chmod +x /opt/octate-backend/scripts/deploy.sh

# Create simple webhook server for GitHub
cat > /opt/octate-backend/scripts/webhook-server.py << 'EOF'
#!/usr/bin/env python3
import hashlib
import hmac
import json
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
import os

# Webhook secret (set this in your GitHub webhook settings)
WEBHOOK_SECRET = os.environ.get('WEBHOOK_SECRET', 'your-webhook-secret-here')

class WebhookHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/webhook':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)

            # Verify signature
            signature = self.headers.get('X-Hub-Signature-256', '')
            expected_signature = 'sha256=' + hmac.new(
                WEBHOOK_SECRET.encode(), post_data, hashlib.sha256
            ).hexdigest()

            if hmac.compare_digest(signature, expected_signature):
                payload = json.loads(post_data.decode())

                # Only deploy on push to main branch
                if payload.get('ref') == 'refs/heads/main':
                    try:
                        result = subprocess.run(
                            ['/opt/octate-backend/scripts/deploy.sh'],
                            capture_output=True, text=True, timeout=300
                        )
                        if result.returncode == 0:
                            self.send_response(200)
                            self.end_headers()
                            self.wfile.write(b'Deployment successful')
                        else:
                            self.send_response(500)
                            self.end_headers()
                            self.wfile.write(b'Deployment failed')
                    except subprocess.TimeoutExpired:
                        self.send_response(500)
                        self.end_headers()
                        self.wfile.write(b'Deployment timeout')
                else:
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(b'Ignored - not main branch')
            else:
                self.send_response(401)
                self.end_headers()
                self.wfile.write(b'Unauthorized')
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == '__main__':
    server = HTTPServer(('localhost', 8000), WebhookHandler)
    print('Webhook server running on port 8000')
    server.serve_forever()
EOF

chmod +x /opt/octate-backend/scripts/webhook-server.py

# Create systemd service for webhook
cat > /etc/systemd/system/octate-webhook.service << 'EOF'
[Unit]
Description=Octate Deployment Webhook Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/octate-backend
Environment=WEBHOOK_SECRET=your-webhook-secret-here
ExecStart=/usr/bin/python3 /opt/octate-backend/scripts/webhook-server.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable octate-webhook
systemctl start octate-webhook

print_success "Deployment webhook configured"

# Final setup and information
print_step "Finalizing setup..."

# Set proper permissions
chown -R root:docker /opt/octate-backend
chmod -R 755 /opt/octate-backend

# Start all services
systemctl start octate-backend

print_success "🎉 Octate Backend VPS Deployment Complete!"

echo ""
echo "📋 Deployment Summary:"
echo "   Domain: $DOMAIN"
echo "   SSL: Configured with Let's Encrypt"
echo "   Services: Docker Compose"
echo "   Monitoring: Prometheus + Grafana"
echo "   Backups: Daily automated backups"
echo "   Security: Fail2Ban + Firewall"
echo ""
echo "🌐 Access URLs:"
echo "   Main Site: https://$DOMAIN"
echo "   Health Check: https://$DOMAIN/health"
echo "   Grafana (local): http://localhost:3001"
echo "   Prometheus (local): http://localhost:9090"
echo ""
echo "📁 Important Files:"
echo "   Environment: /opt/octate-backend/.env.production"
echo "   Logs: /var/log/octate/"
echo "   Backups: /opt/octate-backend/backups/"
echo "   SSL Certs: /opt/octate-backend/ssl/"
echo ""
echo "⚠️  Next Steps:"
echo "   1. Update Supabase credentials in .env.production"
echo "   2. Update OAuth provider credentials"
echo "   3. Configure webhook secret for CI/CD"
echo "   4. Set up external monitoring (UptimeRobot, etc.)"
echo "   5. Configure alert notifications"
echo "   6. Test backup restoration"
echo ""
echo "🔧 Useful Commands:"
echo "   Check services: docker-compose -f docker-compose.prod.yml ps"
echo "   View logs: docker-compose -f docker-compose.prod.yml logs -f"
echo "   Restart services: systemctl restart octate-backend"
echo "   Manual backup: /opt/octate-backend/scripts/backup.sh"
echo "   Deploy update: /opt/octate-backend/scripts/deploy.sh"
echo ""
print_success "Happy coding! 🚀"
