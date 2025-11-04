#!/bin/bash

# SSL Certificate Setup Script for Let's Encrypt
# Run this script on your VPS after setting up the domain

set -e

# Configuration
DOMAIN="octate.qzz.io"
EMAIL="your-email@example.com"
WEBROOT="/opt/octate-backend/ssl-webroot"

echo "🔒 Setting up SSL certificates for $DOMAIN"

# Create webroot directory for challenges
mkdir -p $WEBROOT

# Install certbot if not installed
if ! command -v certbot &> /dev/null; then
    echo "📦 Installing certbot..."
    if command -v apt &> /dev/null; then
        # Ubuntu/Debian
        apt update
        apt install -y certbot python3-certbot-nginx
    elif command -v yum &> /dev/null; then
        # CentOS/RHEL
        yum install -y epel-release
        yum install -y certbot python3-certbot-nginx
    else
        echo "❌ Unsupported package manager. Please install certbot manually."
        exit 1
    fi
fi

# Create temporary nginx config for certificate challenge
cat > /tmp/ssl-challenge.conf << EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    location /.well-known/acme-challenge/ {
        root $WEBROOT;
    }

    location / {
        return 301 https://\$server_name\$request_uri;
    }
}
EOF

# Copy challenge config to nginx
cp /tmp/ssl-challenge.conf /opt/octate-backend/nginx/conf.d/ssl-challenge.conf

# Restart nginx to pick up challenge config
docker-compose -f /opt/octate-backend/docker-compose.prod.yml restart nginx

echo "🌐 Obtaining SSL certificate..."

# Obtain certificate
certbot certonly \
    --webroot \
    --webroot-path=$WEBROOT \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    --domains $DOMAIN,www.$DOMAIN

# Copy certificates to nginx ssl directory
mkdir -p /opt/octate-backend/ssl
cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem /opt/octate-backend/ssl/$DOMAIN.crt
cp /etc/letsencrypt/live/$DOMAIN/privkey.pem /opt/octate-backend/ssl/$DOMAIN.key

# Set proper permissions
chmod 644 /opt/octate-backend/ssl/$DOMAIN.crt
chmod 600 /opt/octate-backend/ssl/$DOMAIN.key

# Remove challenge config
rm /opt/octate-backend/nginx/conf.d/ssl-challenge.conf

# Update octate.conf with correct domain
sed -i "s/your-domain.com/$DOMAIN/g" /opt/octate-backend/nginx/conf.d/octate.conf

# Restart services
docker-compose -f /opt/octate-backend/docker-compose.prod.yml restart

echo "✅ SSL certificate installed successfully!"
echo "🔄 Setting up automatic renewal..."

# Create renewal script
cat > /opt/octate-backend/scripts/renew-ssl.sh << 'EOF'
#!/bin/bash

DOMAIN="octate.qzz.io"
LOG_FILE="/var/log/certbot-renewal.log"

echo "$(date): Starting certificate renewal check" >> $LOG_FILE

# Renew certificates
if certbot renew --quiet --webroot --webroot-path=/opt/octate-backend/ssl-webroot; then
    echo "$(date): Certificate renewal successful" >> $LOG_FILE

    # Copy renewed certificates
    cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem /opt/octate-backend/ssl/$DOMAIN.crt
    cp /etc/letsencrypt/live/$DOMAIN/privkey.pem /opt/octate-backend/ssl/$DOMAIN.key

    # Restart nginx
    docker-compose -f /opt/octate-backend/docker-compose.prod.yml restart nginx

    echo "$(date): Nginx restarted with new certificates" >> $LOG_FILE
else
    echo "$(date): Certificate renewal failed" >> $LOG_FILE
fi
EOF

# Make renewal script executable
chmod +x /opt/octate-backend/scripts/renew-ssl.sh

# Update domain in renewal script
sed -i "s/octate.qzz.io/$DOMAIN/g" /opt/octate-backend/scripts/renew-ssl.sh

# Add cron job for automatic renewal (twice daily)
(crontab -l 2>/dev/null; echo "0 2,14 * * * /opt/octate-backend/scripts/renew-ssl.sh") | crontab -

echo "✅ SSL setup complete!"
echo "📋 Certificate details:"
echo "   Domain: $DOMAIN"
echo "   Certificate: /opt/octate-backend/ssl/$DOMAIN.crt"
echo "   Private Key: /opt/octate-backend/ssl/$DOMAIN.key"
echo "   Automatic renewal: Configured (runs twice daily)"
echo ""
echo "🚀 Your Octate backend is now ready with SSL!"
