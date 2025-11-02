#!/bin/bash

# VPS Monitoring and Backup Setup Script
# Run this script to set up comprehensive monitoring and backup systems

set -e

echo "🔧 Setting up VPS monitoring and backup systems..."

# Create directories
mkdir -p /opt/octate-backend/{logs,backups,monitoring,scripts}
mkdir -p /var/log/octate

# Install monitoring tools
if command -v apt &> /dev/null; then
    # Ubuntu/Debian
    apt update
    apt install -y htop iotop nethogs fail2ban logrotate rsync awscli
elif command -v yum &> /dev/null; then
    # CentOS/RHEL
    yum install -y epel-release
    yum install -y htop iotop nethogs fail2ban logrotate rsync awscli
fi

echo "📊 Setting up system monitoring..."

# Create system monitoring script
cat > /opt/octate-backend/scripts/system-monitor.sh << 'EOF'
#!/bin/bash

# System monitoring script
LOG_FILE="/var/log/octate/system-monitor.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Create log directory if not exists
mkdir -p /var/log/octate

# Function to log with timestamp
log() {
    echo "[$TIMESTAMP] $1" >> $LOG_FILE
}

# Check disk space
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
if [ $DISK_USAGE -gt 85 ]; then
    log "WARNING: Disk usage is ${DISK_USAGE}%"
    # Send alert (configure with your preferred method)
fi

# Check memory usage
MEMORY_USAGE=$(free | awk 'NR==2{printf "%.2f%%", $3*100/$2}' | sed 's/%//')
if (( $(echo "$MEMORY_USAGE > 85.0" | bc -l) )); then
    log "WARNING: Memory usage is ${MEMORY_USAGE}%"
fi

# Check if Docker containers are running
if ! docker ps | grep -q "octate-collaboration-backend"; then
    log "ERROR: Octate backend container is not running"
    # Attempt to restart
    cd /opt/octate-backend
    docker-compose -f docker-compose.prod.yml up -d
    log "INFO: Attempted to restart backend services"
fi

# Check if Nginx is responding
if ! curl -f http://localhost/health > /dev/null 2>&1; then
    log "ERROR: Nginx health check failed"
fi

# Check SSL certificate expiry
CERT_EXPIRY=$(openssl x509 -in /opt/octate-backend/ssl/*.crt -noout -enddate 2>/dev/null | cut -d= -f2)
if [ ! -z "$CERT_EXPIRY" ]; then
    EXPIRY_TIMESTAMP=$(date -d "$CERT_EXPIRY" +%s)
    CURRENT_TIMESTAMP=$(date +%s)
    DAYS_UNTIL_EXPIRY=$(( (EXPIRY_TIMESTAMP - CURRENT_TIMESTAMP) / 86400 ))
    
    if [ $DAYS_UNTIL_EXPIRY -lt 30 ]; then
        log "WARNING: SSL certificate expires in $DAYS_UNTIL_EXPIRY days"
    fi
fi

# Log system stats
log "System Status - CPU: $(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1"%"}'), Memory: ${MEMORY_USAGE}%, Disk: ${DISK_USAGE}%"
EOF

chmod +x /opt/octate-backend/scripts/system-monitor.sh

echo "💾 Setting up backup system..."

# Create backup script
cat > /opt/octate-backend/scripts/backup.sh << 'EOF'
#!/bin/bash

# Backup script for Octate backend
BACKUP_DIR="/opt/octate-backend/backups"
TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
LOG_FILE="/var/log/octate/backup.log"

# Create backup directory
mkdir -p $BACKUP_DIR

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> $LOG_FILE
}

log "Starting backup process..."

# Backup Docker volumes
log "Backing up Docker volumes..."
docker run --rm -v octate-backend_redis-data:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/redis_$TIMESTAMP.tar.gz -C /data .
docker run --rm -v octate-backend_prometheus-data:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/prometheus_$TIMESTAMP.tar.gz -C /data .
docker run --rm -v octate-backend_grafana-data:/data -v $BACKUP_DIR:/backup alpine tar czf /backup/grafana_$TIMESTAMP.tar.gz -C /data .

# Backup configuration files
log "Backing up configuration files..."
tar czf $BACKUP_DIR/config_$TIMESTAMP.tar.gz \
    /opt/octate-backend/docker-compose.prod.yml \
    /opt/octate-backend/nginx/ \
    /opt/octate-backend/ssl/ \
    /opt/octate-backend/.env.production 2>/dev/null || true

# Backup logs
log "Backing up logs..."
tar czf $BACKUP_DIR/logs_$TIMESTAMP.tar.gz /opt/octate-backend/logs/ /var/log/octate/ 2>/dev/null || true

# Remove backups older than 30 days
log "Cleaning up old backups..."
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete

# Optional: Upload to cloud storage (configure your preferred service)
# aws s3 sync $BACKUP_DIR s3://your-backup-bucket/octate-backend/
# rclone sync $BACKUP_DIR remote:octate-backups

log "Backup process completed successfully"

# Show backup size
BACKUP_SIZE=$(du -sh $BACKUP_DIR | cut -f1)
log "Total backup size: $BACKUP_SIZE"
EOF

chmod +x /opt/octate-backend/scripts/backup.sh

echo "🔒 Setting up security monitoring with Fail2Ban..."

# Configure Fail2Ban for Nginx
cat > /etc/fail2ban/jail.local << 'EOF'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[nginx-http-auth]
enabled = true
port = http,https
logpath = /opt/octate-backend/logs/nginx/error.log

[nginx-limit-req]
enabled = true
port = http,https
logpath = /opt/octate-backend/logs/nginx/error.log
maxretry = 10

[nginx-botsearch]
enabled = true
port = http,https
logpath = /opt/octate-backend/logs/nginx/access.log
maxretry = 2
EOF

# Start and enable Fail2Ban
systemctl enable fail2ban
systemctl start fail2ban

echo "📋 Setting up log rotation..."

# Configure logrotate for application logs
cat > /etc/logrotate.d/octate-backend << 'EOF'
/opt/octate-backend/logs/nginx/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 root root
    postrotate
        docker kill -s USR1 octate-nginx 2>/dev/null || true
    endscript
}

/var/log/octate/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 root root
}
EOF

echo "⏰ Setting up cron jobs..."

# Add cron jobs
(crontab -l 2>/dev/null; cat << 'EOF'
# System monitoring every 5 minutes
*/5 * * * * /opt/octate-backend/scripts/system-monitor.sh

# Daily backup at 3 AM
0 3 * * * /opt/octate-backend/scripts/backup.sh

# Weekly system update check (Sundays at 2 AM)
0 2 * * 0 apt update && apt list --upgradable >> /var/log/octate/updates.log 2>&1

# Clean Docker system weekly (Sundays at 4 AM)
0 4 * * 0 docker system prune -f >> /var/log/octate/docker-cleanup.log 2>&1
EOF
) | crontab -

echo "📈 Setting up Prometheus monitoring..."

# Create Prometheus configuration
cat > /opt/octate-backend/monitoring/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  # - "first_rules.yml"
  # - "second_rules.yml"

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'nginx'
    static_configs:
      - targets: ['nginx:8080']
    metrics_path: '/nginx_status'

  - job_name: 'node-exporter'
    static_configs:
      - targets: ['node-exporter:9100']

  - job_name: 'octate-backend'
    static_configs:
      - targets: ['octate-backend:3000']
    metrics_path: '/health'
EOF

echo "📧 Setting up alert notifications..."

# Create alert script (customize with your notification service)
cat > /opt/octate-backend/scripts/send-alert.sh << 'EOF'
#!/bin/bash

# Alert notification script
# Customize this script to use your preferred notification method

ALERT_TYPE="$1"
MESSAGE="$2"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Log the alert
echo "[$TIMESTAMP] ALERT [$ALERT_TYPE]: $MESSAGE" >> /var/log/octate/alerts.log

# Send email (configure with your SMTP settings)
# echo "Subject: Octate Backend Alert - $ALERT_TYPE
# 
# Time: $TIMESTAMP
# Alert: $ALERT_TYPE
# Message: $MESSAGE
# 
# Server: $(hostname)
# " | sendmail your-email@example.com

# Send to Discord/Slack webhook (uncomment and configure)
# curl -X POST -H 'Content-type: application/json' \
#   --data "{\"text\":\"🚨 Octate Backend Alert\n**Type:** $ALERT_TYPE\n**Message:** $MESSAGE\n**Time:** $TIMESTAMP\"}" \
#   YOUR_WEBHOOK_URL

# Send to Telegram (uncomment and configure)
# curl -s -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
#   -d chat_id="$TELEGRAM_CHAT_ID" \
#   -d text="🚨 Octate Backend Alert: $ALERT_TYPE - $MESSAGE"
EOF

chmod +x /opt/octate-backend/scripts/send-alert.sh

echo "✅ Monitoring and backup setup complete!"
echo ""
echo "📋 Configuration Summary:"
echo "   ✅ System monitoring (every 5 minutes)"
echo "   ✅ Daily backups (3 AM)"
echo "   ✅ SSL certificate monitoring"
echo "   ✅ Fail2Ban security"
echo "   ✅ Log rotation"
echo "   ✅ Prometheus monitoring"
echo "   ✅ Docker cleanup (weekly)"
echo ""
echo "📁 Important paths:"
echo "   Logs: /var/log/octate/"
echo "   Backups: /opt/octate-backend/backups/"
echo "   Scripts: /opt/octate-backend/scripts/"
echo "   Monitoring: /opt/octate-backend/monitoring/"
echo ""
echo "🔧 Next steps:"
echo "   1. Configure alert notifications in /opt/octate-backend/scripts/send-alert.sh"
echo "   2. Set up cloud backup storage (AWS S3, Google Cloud, etc.)"
echo "   3. Configure external monitoring service (UptimeRobot, etc.)"
echo "   4. Review and test backup restoration procedures"