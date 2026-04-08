# Navixy Fleet Dashboard - PRD

## Problème Original
Créer un dashboard pour la gestion de flotte IoT avec intégration Navixy, incluant:
1. Dashboard statistique sur l'efficacité de la flotte
2. Rapport conducteur inversé (conducteur → véhicules utilisés)
3. Éditeur de flux IoT visuel (drag & drop)
4. Design blanc/rouge similaire à Navixy
5. Export CSV/JSON des rapports

## Architecture
- **Backend**: FastAPI (Python) avec intégration API Navixy
- **Frontend**: React avec Tailwind CSS
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

### Frontend Views
- [x] Dashboard principal avec statistiques
- [x] Vue Efficacité Flotte avec timeline
- [x] Vue Rapport Conducteurs avec expansion
- [x] Éditeur Logique IoT avec drag & drop
- [x] Navigation latérale responsive
- [x] Design blanc/rouge style Navixy

### Fonctionnalités
- [x] 17 véhicules affichés avec statut (Actif/Inactif)
- [x] 3 conducteurs avec détails et véhicules assignés
- [x] 6 types de nœuds IoT (Source, Sortie, Attribut, Logique, Device, Webhook)
- [x] Sauvegarde/chargement des flux IoT
- [x] Export flux en JSON
- [x] Export rapports en CSV/JSON

## Prioritized Backlog

### P0 - Critique
- Tous implémentés ✓

### P1 - Important
- [ ] Drag & drop complet des nœuds sur le canvas
- [ ] Connexions visuelles entre nœuds (création/suppression)
- [ ] Historique des trajets par véhicule
- [ ] Graphiques de tendances (semaine/mois)

### P2 - Nice to have
- [ ] Carte temps réel des véhicules
- [ ] Alertes géofencing
- [ ] Rapport PDF avec mise en page
- [ ] Multi-langue (FR/EN/DE)
- [ ] Mode sombre

## Credentials
- **Navixy API Hash**: `a25480874b7492bd01ff1d926061e491`
- **Navixy API URL**: `https://api.navixy.com/v2`

## Next Tasks
1. Améliorer le drag & drop des nœuds IoT
2. Ajouter carte temps réel avec positions GPS
3. Implémenter les graphiques de tendances
