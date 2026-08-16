#!/bin/bash
echo "🚀 Starting deployment on EC2..."
sudo docker compose down
sudo docker compose up -d --build
echo "✅ Deployment complete! Visit http://$(curl -s ifconfig.me):8000/dashboard"
