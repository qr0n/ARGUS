#!/bin/bash

# ==========================================
# ARGUS Deployment Script
# ==========================================
# Make sure to run this script from the repository root

# Configuration
PEM_KEY="~/.ssh/login-test.pem"
EC2_USER="ubuntu"
EC2_HOST="ec2-98-82-120-108.compute-1.amazonaws.com"
REMOTE_DIR="/home/ubuntu/ARGUS-deploy"

# Optional: Ensure absolute paths work correctly
eval PEM_KEY=$PEM_KEY

echo "🚀 Starting ARGUS Deployment to $EC2_HOST..."

# 1. Build frontend locally
echo "📦 Building React frontend..."
cd frontend
npm install
npm run build
cd ..

# 2. Transfer files to EC2
echo "📂 Transferring backend and frontend files to EC2..."
ssh -i "$PEM_KEY" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_HOST" "mkdir -p $REMOTE_DIR/frontend $REMOTE_DIR/backend"

# Sync frontend build
echo "Uploading Frontend..."
rsync -avz -e "ssh -i $PEM_KEY -o StrictHostKeyChecking=no" frontend/dist/ "$EC2_USER@$EC2_HOST:$REMOTE_DIR/frontend/dist/"

# Sync backend (excluding node_modules to save time/bandwidth)
echo "Uploading Backend..."
rsync -avz -e "ssh -i $PEM_KEY -o StrictHostKeyChecking=no" --exclude 'node_modules' --exclude 'log.txt' backend/ "$EC2_USER@$EC2_HOST:$REMOTE_DIR/backend/"

# 3. Setup and restart services on EC2
echo "⚙️ Configuring and restarting server on EC2..."
ssh -i "$PEM_KEY" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_HOST" << 'REMOTE_SCRIPT'
  # --- Frontend NGINX Update ---
  # Assuming NGINX is pointing to /var/www/argus or similar setup from earlier.
  sudo mkdir -p /var/www/argus
  sudo cp -r ~/ARGUS-deploy/frontend/dist /var/www/argus/
  sudo chown -R www-data:www-data /var/www/argus/dist
  sudo systemctl restart nginx

  # --- Backend Node.js Update ---
  # Load NVM
  export NVM_DIR="$HOME/.nvm"
  [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

  cd ~/ARGUS-deploy/backend
  
  # Install PM2 globally if not already installed
  if ! command -v pm2 &> /dev/null; then
      echo "Installing PM2 globally..."
      sudo npm install -g pm2
  fi
  
  # Install backend dependencies
  echo "Installing backend dependencies..."
  npm install
  
  # Restart the server using PM2
  echo "Restarting backend via PM2..."
  pm2 stop argus-server || true
  pm2 start server.js --name "argus-server"
  pm2 save
REMOTE_SCRIPT

echo "✅ Deployment complete! ARGUS is updated and running on AWS."