#!/bin/bash

# SSL Certificate Initialization Script for Let's Encrypt
# Run this script after initial deployment to obtain SSL certificates

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  SSL Certificate Initialization${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Please run as root (sudo ./init-ssl.sh)${NC}"
  exit 1
fi

# Check for required environment variables
if [ -z "$DOMAIN" ]; then
  echo -e "${YELLOW}DOMAIN environment variable not set${NC}"
  read -p "Enter your domain (e.g., example.com): " DOMAIN
fi

if [ -z "$EMAIL" ]; then
  echo -e "${YELLOW}EMAIL environment variable not set${NC}"
  read -p "Enter your email for Let's Encrypt: " EMAIL
fi

echo -e "\n${GREEN}Configuration:${NC}"
echo "  Domain: $DOMAIN"
echo "  Email: $EMAIL"
echo ""

# Create required directories
echo -e "${GREEN}Creating directories...${NC}"
mkdir -p ./certbot/conf
mkdir -p ./certbot/www

# Create initial nginx config for certificate acquisition
echo -e "${GREEN}Setting up initial Nginx configuration...${NC}"
cp ./nginx/conf.d/initial.conf.example ./nginx/conf.d/default.conf

# Replace domain placeholder
sed -i "s/YOUR_DOMAIN.com/$DOMAIN/g" ./nginx/conf.d/default.conf

# Start nginx for certificate acquisition
echo -e "${GREEN}Starting Nginx...${NC}"
docker-compose -f docker-compose.prod.yml up -d nginx

# Wait for nginx to start
sleep 5

# Check if nginx is running
if ! docker-compose -f docker-compose.prod.yml ps | grep -q "nginx.*Up"; then
  echo -e "${RED}Nginx failed to start. Check logs:${NC}"
  docker-compose -f docker-compose.prod.yml logs nginx
  exit 1
fi

echo -e "${GREEN}Obtaining SSL certificate...${NC}"

# Run certbot
docker-compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email $EMAIL \
  --agree-tos \
  --no-eff-email \
  -d $DOMAIN \
  -d www.$DOMAIN

# Check if certificate was obtained
if [ ! -f "./certbot/conf/live/$DOMAIN/fullchain.pem" ]; then
  echo -e "${RED}Failed to obtain certificate${NC}"
  exit 1
fi

echo -e "${GREEN}Certificate obtained successfully!${NC}"

# Now copy the full SSL configuration
echo -e "${GREEN}Setting up full SSL Nginx configuration...${NC}"

# Create the SSL config from template
cat > ./nginx/conf.d/default.conf << EOF
# HTTP to HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

# Main HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $DOMAIN www.$DOMAIN;

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;

    # SSL settings
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # Modern configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # HSTS
    add_header Strict-Transport-Security "max-age=63072000" always;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Gzip
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml;

    # Rate limiting
    limit_req zone=api burst=20 nodelay;

    # API routes
    location /api/ {
        limit_req zone=api burst=10 nodelay;
        proxy_pass http://nextjs;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
    }

    # Auth routes (stricter rate limiting)
    location /api/auth/ {
        limit_req zone=login burst=5 nodelay;
        proxy_pass http://nextjs;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # Static files with caching
    location /_next/static/ {
        proxy_pass http://nextjs;
        proxy_cache_valid 200 365d;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    # Main application
    location / {
        proxy_pass http://nextjs;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Health check
    location /health {
        access_log off;
        proxy_pass http://nextjs/api/health;
    }
}
EOF

# Restart nginx with new config
echo -e "${GREEN}Restarting Nginx with SSL configuration...${NC}"
docker-compose -f docker-compose.prod.yml restart nginx

# Set up auto-renewal cron job
echo -e "${GREEN}Setting up certificate auto-renewal...${NC}"
(crontab -l 2>/dev/null | grep -v "certbot renew"; echo "0 0 * * * cd $(pwd) && docker-compose -f docker-compose.prod.yml run --rm certbot renew --quiet && docker-compose -f docker-compose.prod.yml restart nginx") | crontab -

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}  SSL Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Your site is now available at: ${GREEN}https://$DOMAIN${NC}"
echo ""
echo -e "Certificate auto-renewal has been configured."
echo -e "Certificates will be renewed automatically before expiry."
echo ""
