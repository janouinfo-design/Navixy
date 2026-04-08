# Navixy Fleet Dashboard - Frontend

Frontend React pour le dashboard Navixy.

## Déploiement sur Vercel

### 1. Variables d'environnement requises

Dans les settings Vercel, ajoutez :
```
REACT_APP_BACKEND_URL=https://votre-backend.railway.app
```

### 2. Build Command
```
yarn build
```

### 3. Output Directory
```
build
```

## Fonctionnalités

- Dashboard avec statistiques de flotte
- Rapport d'efficacité de flotte
- Rapport conducteurs inversé
- Carte temps réel avec positions GPS
- Graphiques de tendances
- Éditeur de flux IoT (drag & drop)
