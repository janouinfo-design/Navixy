#!/bin/bash

#############################################
# Script de déploiement Navixy Dashboard
# Pour dashboard.logitrak.ch
#############################################

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

DOMAIN="dashboard.logitrak.ch"
BASE_DOMAIN="logitrak.ch"

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN} Déploiement Navixy Dashboard${NC}"
echo -e "${GREEN} URL: https://${DOMAIN}${NC}"
echo -e "${GREEN}=========================================${NC}"

# Vérifier root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Exécutez avec sudo: sudo ./deploy.sh${NC}"
    exit 1
fi

# Demander l'email
read -p "Votre email (pour SSL Let's Encrypt): " EMAIL
if [ -z "$EMAIL" ]; then
    echo -e "${RED}Email requis!${NC}"
    exit 1
fi

echo -e "${YELLOW}[1/6] Mise à jour du système...${NC}"
apt-get update -qq
apt-get install -y curl git

echo -e "${YELLOW}[2/6] Installation de Docker...${NC}"
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

if ! command -v docker-compose &> /dev/null; then
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

echo -e "${YELLOW}[3/6] Préparation SSL...${NC}"
mkdir -p certbot/conf certbot/www

# Arrêter les conteneurs existants
docker-compose down 2>/dev/null || true
docker stop nginx-temp 2>/dev/null || true
docker rm nginx-temp 2>/dev/null || true

# Config nginx temporaire pour SSL
cat > /tmp/nginx-temp.conf << EOF
server {
    listen 80;
    server_name ${DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 'OK'; }
}
EOF

echo -e "${YELLOW}[4/6] Obtention du certificat SSL...${NC}"
docker run -d --name nginx-temp \
    -p 80:80 \
    -v /tmp/nginx-temp.conf:/etc/nginx/conf.d/default.conf \
    -v $(pwd)/certbot/www:/var/www/certbot \
    nginx:alpine

sleep 3

# Obtenir le certificat pour dashboard.logitrak.ch
docker run --rm \
    -v $(pwd)/certbot/conf:/etc/letsencrypt \
    -v $(pwd)/certbot/www:/var/www/certbot \
    certbot/certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    -d ${DOMAIN}

docker stop nginx-temp
docker rm nginx-temp

# Créer un lien symbolique pour la config nginx
mkdir -p certbot/conf/live/${BASE_DOMAIN}
if [ ! -f "certbot/conf/live/${BASE_DOMAIN}/fullchain.pem" ]; then
    ln -sf /etc/letsencrypt/live/${DOMAIN}/fullchain.pem certbot/conf/live/${BASE_DOMAIN}/fullchain.pem 2>/dev/null || true
    ln -sf /etc/letsencrypt/live/${DOMAIN}/privkey.pem certbot/conf/live/${BASE_DOMAIN}/privkey.pem 2>/dev/null || true
fi

# Mettre à jour nginx config avec le bon chemin SSL
sed -i "s|/etc/letsencrypt/live/${BASE_DOMAIN}|/etc/letsencrypt/live/${DOMAIN}|g" nginx-proxy.conf

echo -e "${YELLOW}[5/6] Construction des conteneurs...${NC}"
docker-compose build --no-cache

echo -e "${YELLOW}[6/6] Démarrage des services...${NC}"
docker-compose up -d

sleep 10

# Créer le client dashboard par défaut
echo -e "${YELLOW}Configuration du client par défaut...${NC}"
curl -s -X POST "http://localhost:8001/api/admin/clients" \
-H "Content-Type: application/json" \
-d '{
  "name": "Dashboard Principal",
  "subdomain": "dashboard",
  "navixy_hash": "a25480874b7492bd01ff1d926061e491",
  "primary_color": "#e53935"
}' || true

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN} ✅ DÉPLOIEMENT TERMINÉ !${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "Votre dashboard est accessible sur:"
echo -e "${GREEN}  🌐 https://dashboard.logitrak.ch${NC}"
echo ""
echo -e "Pour ajouter un client (ex: Hermus):"
echo -e "  ${YELLOW}curl -X POST https://dashboard.logitrak.ch/api/admin/clients \\${NC}"
echo -e "  ${YELLOW}  -H 'Content-Type: application/json' \\${NC}"
echo -e "  ${YELLOW}  -d '{\"name\":\"Hermus\",\"subdomain\":\"hermus\",\"navixy_hash\":\"HASH_CLIENT\"}'${NC}"
echo ""
echo -e "Le client sera sur: ${GREEN}https://hermus.logitrak.ch${NC}"
echo ""
echo -e "Commandes utiles:"
echo -e "  📋 Logs:    ${YELLOW}docker-compose logs -f${NC}"
echo -e "  🔄 Restart: ${YELLOW}docker-compose restart${NC}"
echo -e "  ⏹️  Stop:    ${YELLOW}docker-compose down${NC}"
echo ""
