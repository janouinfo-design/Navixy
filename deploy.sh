#!/bin/bash

#############################################
# Script de déploiement Multi-Client
# Pour *.logitrak.ch
#############################################

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

DOMAIN="logitrak.ch"
EMAIL=""

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN} Déploiement Navixy Multi-Client${NC}"
echo -e "${GREEN} Domaine: *.${DOMAIN}${NC}"
echo -e "${GREEN}=========================================${NC}"

# Vérifier root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Exécutez avec sudo: sudo ./deploy.sh${NC}"
    exit 1
fi

# Demander l'email
read -p "Email pour SSL Let's Encrypt: " EMAIL
if [ -z "$EMAIL" ]; then
    echo -e "${RED}Email requis!${NC}"
    exit 1
fi

echo -e "${YELLOW}[1/7] Mise à jour du système...${NC}"
apt-get update -qq
apt-get install -y curl git

echo -e "${YELLOW}[2/7] Installation de Docker...${NC}"
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
fi

if ! command -v docker-compose &> /dev/null; then
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

echo -e "${YELLOW}[3/7] Préparation des répertoires...${NC}"
mkdir -p certbot/conf certbot/www

# Arrêter les conteneurs existants
docker-compose down 2>/dev/null || true

echo -e "${YELLOW}[4/7] Obtention du certificat SSL Wildcard...${NC}"
echo ""
echo -e "${RED}IMPORTANT: Pour un certificat wildcard, vous devez utiliser la validation DNS${NC}"
echo -e "${YELLOW}Méthode 1 (Manuel): Certbot va vous demander d'ajouter un enregistrement TXT DNS${NC}"
echo -e "${YELLOW}Méthode 2 (Cloudflare): Si vous utilisez Cloudflare, je peux automatiser${NC}"
echo ""
read -p "Utilisez-vous Cloudflare pour le DNS ? (y/n): " USE_CLOUDFLARE

if [ "$USE_CLOUDFLARE" = "y" ]; then
    read -p "Cloudflare API Token (avec permission DNS): " CF_TOKEN
    
    # Créer le fichier de config Cloudflare
    mkdir -p certbot/cloudflare
    cat > certbot/cloudflare/credentials.ini << EOF
dns_cloudflare_api_token = $CF_TOKEN
EOF
    chmod 600 certbot/cloudflare/credentials.ini
    
    # Obtenir le certificat avec Cloudflare
    docker run --rm \
        -v $(pwd)/certbot/conf:/etc/letsencrypt \
        -v $(pwd)/certbot/cloudflare:/cloudflare \
        certbot/dns-cloudflare certonly \
        --dns-cloudflare \
        --dns-cloudflare-credentials /cloudflare/credentials.ini \
        --email $EMAIL \
        --agree-tos \
        --no-eff-email \
        -d "${DOMAIN}" \
        -d "*.${DOMAIN}"
else
    echo ""
    echo -e "${YELLOW}Validation DNS manuelle...${NC}"
    echo -e "${YELLOW}Certbot va vous demander d'ajouter un enregistrement TXT DNS${NC}"
    echo ""
    
    docker run -it --rm \
        -v $(pwd)/certbot/conf:/etc/letsencrypt \
        certbot/certbot certonly \
        --manual \
        --preferred-challenges dns \
        --email $EMAIL \
        --agree-tos \
        --no-eff-email \
        -d "${DOMAIN}" \
        -d "*.${DOMAIN}"
fi

echo -e "${YELLOW}[5/7] Construction des conteneurs Docker...${NC}"
docker-compose build --no-cache

echo -e "${YELLOW}[6/7] Démarrage des services...${NC}"
docker-compose up -d

echo -e "${YELLOW}[7/7] Création du client par défaut...${NC}"
sleep 10  # Attendre que le backend démarre

# Créer un client par défaut
curl -s -X POST "http://localhost:8001/api/admin/clients" \
-H "Content-Type: application/json" \
-d '{
  "name": "Default",
  "subdomain": "www",
  "navixy_hash": "a25480874b7492bd01ff1d926061e491",
  "primary_color": "#e53935"
}' || true

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN} ✅ DÉPLOIEMENT TERMINÉ !${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "Votre dashboard multi-clients est prêt!"
echo ""
echo -e "${GREEN}URL principale: https://www.logitrak.ch${NC}"
echo ""
echo -e "Pour ajouter un nouveau client:"
echo -e "  ${YELLOW}curl -X POST https://www.logitrak.ch/api/admin/clients \\${NC}"
echo -e "  ${YELLOW}  -H 'Content-Type: application/json' \\${NC}"
echo -e "  ${YELLOW}  -d '{\"name\":\"Hermus\",\"subdomain\":\"hermus\",\"navixy_hash\":\"HASH_DU_CLIENT\"}'${NC}"
echo ""
echo -e "Le client sera accessible sur: ${GREEN}https://hermus.logitrak.ch${NC}"
echo ""
echo -e "Commandes utiles:"
echo -e "  📋 Logs:      ${YELLOW}docker-compose logs -f${NC}"
echo -e "  🔄 Restart:   ${YELLOW}docker-compose restart${NC}"
echo -e "  ⏹️  Stop:      ${YELLOW}docker-compose down${NC}"
echo ""
