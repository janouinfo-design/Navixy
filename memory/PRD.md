# Navixy Fleet Dashboard - PRD

## Problème Original
Créer un dashboard pour la gestion de flotte IoT avec intégration Navixy, incluant:
1. Dashboard statistique sur l'efficacité de la flotte
2. Rapport conducteur inversé (conducteur → véhicules utilisés)
3. Éditeur de flux IoT visuel (drag & drop)
4. Design blanc/rouge similaire à Navixy
5. Export CSV/JSON des rapports
6. Carte temps réel avec positions GPS
7. Graphiques de tendances hebdomadaires/mensuelles

## Architecture
- **Backend**: FastAPI (Python) avec intégration API Navixy
- **Frontend**: React avec Tailwind CSS + Recharts pour graphiques
- **Base de données**: MongoDB (pour les flux IoT sauvegardés)
- **API externe**: Navixy API v2

## User Personas
1. **Gestionnaire de flotte**: Surveille l'efficacité des véhicules, génère des rapports
2. **Responsable RH**: Consulte les rapports par conducteur
3. **Technicien IoT**: Crée et gère les flux de données IoT

## Core Requirements (Statique)
- Authentification Navixy via hash API
- Affichage temps réel des véhicules
- Calcul d'efficacité de flotte
- Rapports conducteur inversés
- Éditeur visuel de flux IoT
- Export des données
- Carte GPS temps réel
- Graphiques de tendances

## Ce qui a été implémenté (Jan 2026)

### Backend APIs
- [x] `/api/trackers` - Liste des 17 véhicules Navixy
- [x] `/api/employees` - Liste des 3 conducteurs
- [x] `/api/fleet/stats` - Statistiques de flotte avec efficacité
- [x] `/api/fleet/efficiency` - Rapport d'efficacité journalier
- [x] `/api/reports/driver` - Rapport conducteur inversé
- [x] `/api/flows` - CRUD pour flux IoT
- [x] `/api/export/fleet-stats` - Export CSV/JSON stats flotte
- [x] `/api/export/driver-report` - Export CSV/JSON rapport conducteur
- [x] `/api/map/positions` - Positions GPS temps réel (15 véhicules)
- [x] `/api/analytics/trends` - Tendances semaine/mois
- [x] `/api/analytics/vehicle-comparison` - Comparaison véhicules

### Frontend Views (6 vues)
- [x] Dashboard principal avec statistiques
- [x] Vue Efficacité Flotte avec timeline
- [x] Vue Rapport Conducteurs avec expansion
- [x] **Vue Carte Temps Réel** avec positions GPS et légende
- [x] **Vue Tendances** avec graphiques (AreaChart, BarChart, PieChart)
- [x] Éditeur Logique IoT avec **drag & drop amélioré**
- [x] Navigation latérale responsive

### Fonctionnalités Drag & Drop IoT
- [x] Glisser-déposer des nœuds depuis le panneau latéral
- [x] Déplacement libre des nœuds sur le canvas
- [x] Connexions visuelles entre nœuds (courbes Bezier SVG)
- [x] Création de connexions en cliquant sur les connecteurs
- [x] Suppression des nœuds et connexions
- [x] Édition des labels des nœuds
- [x] 6 types de nœuds (Source, Sortie, Attribut, Logique, Device, Webhook)

### Carte Temps Réel
- [x] Affichage des positions GPS des véhicules
- [x] Indicateurs de statut (En mouvement, Stationnaire, Hors ligne)
- [x] Info-bulle au clic avec détails du véhicule
- [x] Liste des véhicules avec coordonnées
- [x] Auto-refresh toutes les 30 secondes

### Graphiques Tendances
- [x] AreaChart - Évolution de l'efficacité
- [x] BarChart - Distance parcourue par jour
- [x] PieChart - Répartition par efficacité
- [x] Top performers avec classement
- [x] Alertes véhicules nécessitant attention
- [x] Statistiques résumées (distance, carburant, violations)

## Tests Validés (100% Success)
- Backend: 100%
- Frontend: 100%
- Integration: 100%

## Credentials
- **Navixy API Hash**: `a25480874b7492bd01ff1d926061e491`
- **Navixy API URL**: `https://api.navixy.com/v2`

## Prioritized Backlog

### P0 - Critique
- Tous implémentés ✓

### P1 - Important (Complété)
- [x] Drag & drop complet des nœuds sur le canvas
- [x] Connexions visuelles entre nœuds
- [x] Carte temps réel des véhicules
- [x] Graphiques de tendances (semaine/mois)

### P2 - Nice to have
- [ ] Intégration Leaflet/Mapbox pour vraie carte
- [ ] Alertes géofencing
- [ ] Rapport PDF avec mise en page
- [ ] Multi-langue (FR/EN/DE)
- [ ] Mode sombre
- [ ] Notifications push temps réel

## Next Tasks
1. Intégrer une vraie bibliothèque de carte (Leaflet/Mapbox)
2. Ajouter des alertes géofencing
3. Implémenter l'export PDF des rapports
