#!/bin/bash
# init-ec2.sh
# Run this script directly ON the fresh Ubuntu EC2 instance after git cloning.
# Usage: sudo bash init-ec2.sh OR bash init-ec2.sh (it will prompt for sudo when needed)

set -e

echo "🚀 Starting ARGUS EC2 Initialization..."

# 1. Update and install basic dependencies
echo "📦 Installing system dependencies (nginx, curl, git, build-essential)..."
sudo apt-get update -y
sudo apt-get install -y nginx curl git build-essential

# 2. Setup Node.js (Using NodeSource for global installation)
echo "🟢 Installing Node.js 20.x..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Install Global NPM Packages (PM2)
echo "🛠 Installing PM2..."
sudo npm install -g pm2
pm2 startup ubuntu -u $USER --hp $HOME || true

# 4. Generate Self-Signed Certificates
echo "🔐 Generating Self-Signed SSL Certificates..."
sudo mkdir -p /var/www/argus/dist
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /var/www/argus/key.pem \
    -out /var/www/argus/cert.pem \
    -subj "/C=US/ST=State/L=City/O=Organization/CN=argus-server"

# 5. Configure NGINX
echo "🌐 Configuring NGINX..."
cat << 'NGINX_CONF' | sudo tee /etc/nginx/sites-available/argus
server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name _;

    ssl_certificate /var/www/argus/cert.pem;
    ssl_certificate_key /var/www/argus/key.pem;

    root /var/www/argus/dist;
    index index.html;

    # Proxy calls to the server datasets and models
    location /models/ {
        proxy_pass https://localhost:3000/models/;
        proxy_ssl_verify off;
    }

    location /dataset/ {
        proxy_pass https://localhost:3000/dataset/;
        proxy_ssl_verify off;
    }

    # Video proxy
    location /stream-video {
        proxy_pass https://localhost:3000/stream-video;
        proxy_ssl_verify off;
    }

    location /view-stream {
        proxy_pass https://localhost:3000/view-stream;
        proxy_ssl_verify off;
    }

    # WebSockets Proxy
    location /ws-stream {
        proxy_pass https://localhost:3000/ws-stream;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_ssl_verify off;
    }

    location /ws-view {
        proxy_pass https://localhost:3000/ws-view;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_ssl_verify off;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX_CONF

# Enable NGINX config
sudo ln -sf /etc/nginx/sites-available/argus /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo systemctl restart nginx

# 6. Build the Application
echo "🏗 Building ARGUS Application..."

# Go to frontend, install and build
echo "Building Frontend..."
cd frontend
npm install
npm run build
sudo cp -r dist/* /var/www/argus/dist/
sudo chown -R www-data:www-data /var/www/argus/dist
cd ..

# Go to backend, install and start PM2
echo "Starting Backend..."
cd backend
npm install
pm2 stop argus-server || true
pm2 start server.js --name "argus-server"
pm2 save

echo "✅ Setup Complete! ARGUS is now ready and running."
echo "You can access it at https://<ec2-ip-address>"
