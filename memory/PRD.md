# Navixy Fleet Dashboard - PRD

## Problème Original
Dashboard multi-clients pour gestion de flotte IoT avec intégration Navixy pour www.logitrak.ch

## Architecture Multi-Client
```
*.logitrak.ch → Nginx (SSL Wildcard) → Backend/Frontend → MongoDB
                                            ↓
                              Client identifié par sous-domaine
                                            ↓
                              Hash Navixy spécifique au client
```

## Fonctionnalités Implémentées

### Système Multi-Client
- [x] Sous-domaines dynamiques (hermus.logitrak.ch, techlift.logitrak.ch)
- [x] Configuration par client (nom, logo, couleur, hash Navixy)
- [x] API Admin pour gérer les clients
- [x] Certificat SSL wildcard

### Sélecteur de Période
- [x] Aujourd'hui
- [x] Semaine
- [x] Mois
- [x] Personnalisé (avec calendrier)

### Vues
- [x] Dashboard (17 véhicules, stats)
- [x] Efficacité Flotte (timeline)
- [x] Rapport Conducteurs (inversé : conducteur → véhicules)
- [x] Tendances (graphiques)
- [x] Logique IoT (éditeur drag & drop)

### Export
- [x] CSV
- [x] JSON

## Credentials
- **Navixy API Hash**: `a25480874b7492bd01ff1d926061e491`
- **Domaine**: `logitrak.ch`

## Commandes Admin

### Ajouter un client
```bash
curl -X POST https://www.logitrak.ch/api/admin/clients \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hermus SA",
    "subdomain": "hermus",
    "navixy_hash": "HASH_NAVIXY_CLIENT",
    "primary_color": "#1e88e5"
  }'
```

### Lister les clients
```bash
curl https://www.logitrak.ch/api/admin/clients
```

## Déploiement VPS
1. Cloner le repo
2. Configurer DNS (A record pour *.logitrak.ch)
3. Exécuter `sudo ./deploy.sh`
4. Le script configure Docker, SSL wildcard, et démarre les services

## Next Tasks
- [ ] Déployer sur VPS logitrak.ch
- [ ] Ajouter authentification admin
- [ ] Dashboard de gestion des clients
