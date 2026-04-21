#!/bin/bash

#####################################
# Logitrak - Ajout automatique client
# Usage: sudo ./add-client.sh
#####################################

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN} Logitrak - Ajout nouveau client${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""

# Collecte des informations
read -p "Nom du client (ex: Membrez): " CLIENT_NAME
read -p "Subdomain (ex: membrez): " SUBDOMAIN
read -p "Hash Navixy (cle API): " NAVIXY_HASH
read -p "Couleur hex (defaut #1565c0): " COLOR
COLOR=${COLOR:-#1565c0}

DOMAIN="${SUBDOMAIN}.logitrak.ch"
VPS_IP="83.228.207.198"
EMAIL="contact@logitrak.ch"

echo ""
echo -e "${YELLOW}Configuration:${NC}"
echo "  Client:    $CLIENT_NAME"
echo "  Domain:    $DOMAIN"
echo "  Hash:      ${NAVIXY_HASH:0:10}..."
echo "  Couleur:   $COLOR"
echo ""

# Verifier le DNS
echo -e "${YELLOW}[1/5] Verification DNS...${NC}"
DNS_IP=$(dig +short $DOMAIN 2>/dev/null || echo "")
if [ "$DNS_IP" != "$VPS_IP" ]; then
    echo -e "${RED}ERREUR: $DOMAIN ne pointe pas vers $VPS_IP${NC}"
    echo -e "${RED}DNS actuel: ${DNS_IP:-non configure}${NC}"
    echo ""
    echo "Ajoutez d'abord l'enregistrement DNS:"
    echo "  Type: A"
    echo "  Nom: $SUBDOMAIN"
    echo "  Valeur: $VPS_IP"
    echo ""
    read -p "Le DNS est configure ? (o/n): " DNS_OK
    if [ "$DNS_OK" != "o" ]; then
        echo "Abandonné. Configurez le DNS et relancez le script."
        exit 1
    fi
fi
echo -e "${GREEN}  DNS OK${NC}"

# Verifier la cle API Navixy
echo -e "${YELLOW}[2/5] Verification cle API Navixy...${NC}"
API_CHECK=$(curl -s -X POST "https://api.navixy.com/v2/tracker/list" -H "Content-Type: application/json" -d "{\"hash\":\"$NAVIXY_HASH\"}")
API_SUCCESS=$(echo "$API_CHECK" | python3 -c "import sys,json;print(json.load(sys.stdin).get('success',False))" 2>/dev/null || echo "False")

if [ "$API_SUCCESS" != "True" ]; then
    echo -e "${RED}ERREUR: Cle API Navixy invalide${NC}"
    exit 1
fi

VEHICLE_COUNT=$(echo "$API_CHECK" | python3 -c "import sys,json;print(len(json.load(sys.stdin).get('list',[])))" 2>/dev/null || echo "0")
echo -e "${GREEN}  API OK - $VEHICLE_COUNT vehicules detectes${NC}"

# Config Nginx HTTP + Certbot SSL
echo -e "${YELLOW}[3/5] Configuration Nginx + SSL...${NC}"

# Etape 1: HTTP pour Certbot
cat > /etc/nginx/sites-available/$DOMAIN << NGINXEOF
server {
    listen 80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:8006/;
        proxy_set_header Host \$host;
    }
}
NGINXEOF

ln -sf /etc/nginx/sites-available/$DOMAIN /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Etape 2: Certificat SSL
certbot certonly --webroot --webroot-path=/var/www/certbot \
    --email $EMAIL --agree-tos --no-eff-email \
    -d $DOMAIN --non-interactive

# Etape 3: HTTPS complet
cat > /etc/nginx/sites-available/$DOMAIN << NGINXEOF
server {
    listen 80;
    server_name $DOMAIN;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name $DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    add_header Content-Security-Policy "frame-ancestors 'self' https://login.logitrak.fr https://*.navixy.com https://*.logitrak.fr https://*.logitrak.ch" always;

    location /api/ {
        proxy_pass http://127.0.0.1:8005/api/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
    }

    location / {
        proxy_pass http://127.0.0.1:8006/;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_cache_bypass \$http_upgrade;
        proxy_hide_header X-Frame-Options;
    }
}
NGINXEOF

nginx -t && systemctl reload nginx
echo -e "${GREEN}  Nginx + SSL OK${NC}"

# Creer le client dans le dashboard
echo -e "${YELLOW}[4/5] Creation du client dans le dashboard...${NC}"
CLIENT_RESULT=$(curl -s -X POST "http://127.0.0.1:8005/api/admin/clients" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$CLIENT_NAME\",\"subdomain\":\"$SUBDOMAIN\",\"navixy_hash\":\"$NAVIXY_HASH\",\"primary_color\":\"$COLOR\"}")

CLIENT_SUCCESS=$(echo "$CLIENT_RESULT" | python3 -c "import sys,json;print(json.load(sys.stdin).get('success',False))" 2>/dev/null || echo "False")

if [ "$CLIENT_SUCCESS" != "True" ]; then
    echo -e "${RED}ERREUR: $CLIENT_RESULT${NC}"
    exit 1
fi
echo -e "${GREEN}  Client cree${NC}"

# Verification finale
echo -e "${YELLOW}[5/5] Verification finale...${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://$DOMAIN)
if [ "$HTTP_CODE" == "200" ]; then
    echo -e "${GREEN}  HTTPS OK (200)${NC}"
else
    echo -e "${RED}  HTTPS code: $HTTP_CODE${NC}"
fi

echo ""
echo -e "${GREEN}==========================================${NC}"
echo -e "${GREEN} Client $CLIENT_NAME ajoute avec succes !${NC}"
echo -e "${GREEN}==========================================${NC}"
echo ""
echo -e "  URL:        ${GREEN}https://$DOMAIN${NC}"
echo -e "  Vehicules:  ${GREEN}$VEHICLE_COUNT${NC}"
echo -e "  Nom:        $CLIENT_NAME"
echo -e "  Hash:       ${NAVIXY_HASH:0:10}..."
echo ""
