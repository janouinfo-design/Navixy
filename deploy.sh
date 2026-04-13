#!/bin/bash

#############################################
# Script de déploiement Navixy Dashboard
# Pour www.logitrak.ch
#############################################

set -e

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

DOMAIN="www.logitrak.ch"
EMAIL="admin@logitrak.ch"  # Changez si nécessaire

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN} Déploiement Navixy Dashboard${NC}"
echo -e "${GREEN} Domaine: $DOMAIN${NC}"
echo -e "${GREEN}=========================================${NC}"

# Vérifier root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Exécutez avec sudo: sudo ./deploy.sh${NC}"
    exit 1
fi

# Demander l'email si différent
read -p "Email pour SSL (appuyez Entrée pour $EMAIL): " INPUT_EMAIL
if [ ! -z "$INPUT_EMAIL" ]; then
    EMAIL=$INPUT_EMAIL
fi

echo -e "${YELLOW}[1/6] Mise à jour du système...${NC}"
apt-get update -qq

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

echo -e "${YELLOW}[3/6] Préparation des certificats SSL...${NC}"
mkdir -p certbot/conf certbot/www

# Arrêter les conteneurs existants
docker-compose down 2>/dev/null || true
docker stop nginx-temp 2>/dev/null || true
docker rm nginx-temp 2>/dev/null || true

# Config nginx temporaire pour SSL
cat > /tmp/nginx-temp.conf << 'EOF'
server {
    listen 80;
    server_name www.logitrak.ch logitrak.ch;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 200 'OK'; }
}
EOF

echo -e "${YELLOW}[4/6] Obtention du certificat SSL Let's Encrypt...${NC}"
docker run -d --name nginx-temp \
    -p 80:80 \
    -v /tmp/nginx-temp.conf:/etc/nginx/conf.d/default.conf \
    -v $(pwd)/certbot/www:/var/www/certbot \
    nginx:alpine

sleep 3

docker run --rm \
    -v $(pwd)/certbot/conf:/etc/letsencrypt \
    -v $(pwd)/certbot/www:/var/www/certbot \
    certbot/certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    -d www.logitrak.ch \
    -d logitrak.ch

docker stop nginx-temp
docker rm nginx-temp

echo -e "${YELLOW}[5/6] Construction des conteneurs Docker...${NC}"
docker-compose build --no-cache

echo -e "${YELLOW}[6/6] Démarrage des services...${NC}"
docker-compose up -d

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN} ✅ DÉPLOIEMENT TERMINÉ !${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "Votre dashboard est accessible sur:"
echo -e "${GREEN}  🌐 https://www.logitrak.ch${NC}"
echo ""
echo -e "Commandes utiles:"
echo -e "  📋 Voir les logs:     ${YELLOW}docker-compose logs -f${NC}"
echo -e "  🔄 Redémarrer:        ${YELLOW}docker-compose restart${NC}"
echo -e "  ⏹️  Arrêter:           ${YELLOW}docker-compose down${NC}"
echo -e "  📊 Statut:            ${YELLOW}docker-compose ps${NC}"
echo ""
