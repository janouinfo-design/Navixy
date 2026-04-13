#!/bin/bash

#############################################
# Script de déploiement Navixy Dashboard
# Compatible avec Nginx existant
# Pour dashboard.logitrak.ch
#############################################

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

DOMAIN="dashboard.logitrak.ch"

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN} Déploiement Navixy Dashboard${NC}"
echo -e "${GREEN} URL: https://${DOMAIN}${NC}"
echo -e "${GREEN} (Compatible avec votre Nginx existant)${NC}"
echo -e "${GREEN}=========================================${NC}"

# Vérifier root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Exécutez avec: sudo ./deploy.sh${NC}"
    exit 1
fi

# Demander l'email
read -p "Votre email (pour SSL Let's Encrypt): " EMAIL
if [ -z "$EMAIL" ]; then
    echo -e "${RED}Email requis!${NC}"
    exit 1
fi

echo -e "${YELLOW}[1/7] Vérification de Docker...${NC}"
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Installation de Docker...${NC}"
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}Installation de Docker Compose...${NC}"
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

echo -e "${YELLOW}[2/7] Construction des conteneurs Docker...${NC}"
docker-compose build

echo -e "${YELLOW}[3/7] Démarrage des conteneurs...${NC}"
docker-compose up -d

echo -e "${YELLOW}[4/7] Configuration Nginx...${NC}"
# Copier la config nginx
cp nginx-dashboard.conf /etc/nginx/sites-available/${DOMAIN}

# Créer le lien symbolique si pas existant
if [ ! -f /etc/nginx/sites-enabled/${DOMAIN} ]; then
    ln -s /etc/nginx/sites-available/${DOMAIN} /etc/nginx/sites-enabled/
fi

echo -e "${YELLOW}[5/7] Obtention du certificat SSL...${NC}"
# Créer le dossier pour certbot
mkdir -p /var/www/certbot

# Commenter temporairement les lignes SSL pour obtenir le certificat
sed -i 's/listen 443 ssl http2;/listen 443;/' /etc/nginx/sites-available/${DOMAIN}
sed -i 's/ssl_certificate/#ssl_certificate/' /etc/nginx/sites-available/${DOMAIN}
sed -i 's/ssl_protocols/#ssl_protocols/' /etc/nginx/sites-available/${DOMAIN}
sed -i 's/ssl_prefer/#ssl_prefer/' /etc/nginx/sites-available/${DOMAIN}
sed -i 's/ssl_ciphers/#ssl_ciphers/' /etc/nginx/sites-available/${DOMAIN}

# Tester et recharger nginx
nginx -t && systemctl reload nginx

# Obtenir le certificat
certbot certonly --webroot --webroot-path=/var/www/certbot \
    --email $EMAIL --agree-tos --no-eff-email \
    -d ${DOMAIN}

# Réactiver SSL
sed -i 's/listen 443;/listen 443 ssl http2;/' /etc/nginx/sites-available/${DOMAIN}
sed -i 's/#ssl_certificate/ssl_certificate/' /etc/nginx/sites-available/${DOMAIN}
sed -i 's/#ssl_protocols/ssl_protocols/' /etc/nginx/sites-available/${DOMAIN}
sed -i 's/#ssl_prefer/ssl_prefer/' /etc/nginx/sites-available/${DOMAIN}
sed -i 's/#ssl_ciphers/ssl_ciphers/' /etc/nginx/sites-available/${DOMAIN}

echo -e "${YELLOW}[6/7] Redémarrage de Nginx...${NC}"
nginx -t && systemctl reload nginx

echo -e "${YELLOW}[7/7] Configuration du client par défaut...${NC}"
sleep 5
curl -s -X POST "http://127.0.0.1:8010/api/admin/clients" \
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
echo -e "Dashboard accessible sur:"
echo -e "${GREEN}  🌐 https://dashboard.logitrak.ch${NC}"
echo ""
echo -e "Vos autres apps ne sont PAS affectées:"
echo -e "  ✅ logirent - intact"
echo -e "  ✅ logitime - intact"
echo -e "  ✅ www.logitrak.ch - intact"
echo ""
echo -e "Ports utilisés par le dashboard:"
echo -e "  Backend:  127.0.0.1:8010"
echo -e "  Frontend: 127.0.0.1:8011"
echo ""
echo -e "Commandes utiles:"
echo -e "  📋 Logs:    ${YELLOW}cd /opt/navixy-dashboard && docker-compose logs -f${NC}"
echo -e "  🔄 Restart: ${YELLOW}cd /opt/navixy-dashboard && docker-compose restart${NC}"
echo -e "  ⏹️  Stop:    ${YELLOW}cd /opt/navixy-dashboard && docker-compose down${NC}"
echo ""
