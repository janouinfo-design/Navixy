# Navixy Fleet Dashboard - Backend

Backend FastAPI pour le dashboard Navixy avec intégration API Navixy.

## Déploiement sur Railway

### 1. Variables d'environnement requises

```
MONGO_URL=mongodb://...  (fourni automatiquement si vous ajoutez MongoDB sur Railway)
DB_NAME=navixy_dashboard
NAVIXY_HASH=a25480874b7492bd01ff1d926061e491
NAVIXY_API_URL=https://api.navixy.com/v2
CORS_ORIGINS=https://votre-frontend.vercel.app
```

### 2. Commande de démarrage
```
uvicorn server:app --host 0.0.0.0 --port $PORT
```

## APIs disponibles

- `GET /api/trackers` - Liste des véhicules
- `GET /api/employees` - Liste des conducteurs
- `GET /api/fleet/stats` - Statistiques de flotte
- `GET /api/fleet/efficiency` - Efficacité de flotte
- `GET /api/reports/driver` - Rapport conducteurs
- `GET /api/map/positions` - Positions GPS temps réel
- `GET /api/analytics/trends` - Tendances semaine/mois
- `GET /api/flows` - Gestion des flux IoT
