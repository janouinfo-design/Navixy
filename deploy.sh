#!/bin/bash

#############################################
# Script de déploiement Navixy Dashboard
# Pour Ubuntu/Debian avec Docker
#############################################

set -e

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN} Déploiement Navixy Dashboard${NC}"
echo -e "${GREEN}=========================================${NC}"

# Vérifier si le script est exécuté en root
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}Veuillez exécuter ce script en tant que root (sudo)${NC}"
    exit 1
fi

# Demander le nom de domaine
read -p "Entrez votre nom de domaine (ex: dashboard.monsite.com): " DOMAIN_NAME
if [ -z "$DOMAIN_NAME" ]; then
    echo -e "${RED}Le nom de domaine est requis!${NC}"
    exit 1
fi

# Demander l'email pour Let's Encrypt
read -p "Entrez votre email (pour Let's Encrypt SSL): " EMAIL
if [ -z "$EMAIL" ]; then
    echo -e "${RED}L'email est requis pour SSL!${NC}"
    exit 1
fi

echo -e "${YELLOW}Installation des dépendances...${NC}"

# Mettre à jour le système
apt-get update
apt-get upgrade -y

# Installer Docker si non présent
if ! command -v docker &> /dev/null; then
    echo -e "${YELLOW}Installation de Docker...${NC}"
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    systemctl enable docker
    systemctl start docker
fi

# Installer Docker Compose si non présent
if ! command -v docker-compose &> /dev/null; then
    echo -e "${YELLOW}Installation de Docker Compose...${NC}"
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# Créer le répertoire de l'application
APP_DIR="/opt/navixy-dashboard"
mkdir -p $APP_DIR
cd $APP_DIR

echo -e "${YELLOW}Configuration du domaine: $DOMAIN_NAME${NC}"

# Remplacer le domaine dans la config nginx
sed -i "s/VOTRE_DOMAINE/$DOMAIN_NAME/g" nginx-proxy.conf

# Créer le fichier .env
cat > .env << EOF
DOMAIN_NAME=$DOMAIN_NAME
EOF

# Créer les répertoires pour Certbot
mkdir -p certbot/conf certbot/www

echo -e "${YELLOW}Obtention du certificat SSL...${NC}"

# Arrêter nginx temporairement si en cours d'exécution
docker-compose down 2>/dev/null || true

# Créer une config nginx temporaire pour le challenge SSL
cat > nginx-proxy-temp.conf << EOF
server {
    listen 80;
    server_name $DOMAIN_NAME;
    
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }
    
    location / {
        return 200 'OK';
    }
}
EOF

# Démarrer nginx temporaire
docker run -d --name nginx-temp \
    -p 80:80 \
    -v $(pwd)/nginx-proxy-temp.conf:/etc/nginx/conf.d/default.conf \
    -v $(pwd)/certbot/www:/var/www/certbot \
    nginx:alpine

# Obtenir le certificat SSL
docker run --rm \
    -v $(pwd)/certbot/conf:/etc/letsencrypt \
    -v $(pwd)/certbot/www:/var/www/certbot \
    certbot/certbot certonly \
    --webroot \
    --webroot-path=/var/www/certbot \
    --email $EMAIL \
    --agree-tos \
    --no-eff-email \
    -d $DOMAIN_NAME

# Arrêter nginx temporaire
docker stop nginx-temp
docker rm nginx-temp
rm nginx-proxy-temp.conf

echo -e "${YELLOW}Construction et démarrage des conteneurs...${NC}"

# Construire et démarrer tous les services
docker-compose up -d --build

echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN} Déploiement terminé !${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
echo -e "Votre dashboard est accessible sur:"
echo -e "${GREEN}  https://$DOMAIN_NAME${NC}"
echo ""
echo -e "Pour voir les logs:"
echo -e "  docker-compose logs -f"
echo ""
echo -e "Pour redémarrer:"
echo -e "  docker-compose restart"
echo ""
echo -e "Pour arrêter:"
echo -e "  docker-compose down"
echo ""
