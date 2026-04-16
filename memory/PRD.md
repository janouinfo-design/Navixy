# Navixy Fleet Dashboard - PRD

## Original Problem Statement
Create a statistical dashboard for fleet efficiency and an inverted driver report based on Navixy IoT logic. Build a visual IoT flow editor, integrate with Navixy API, and implement multi-client support via subdomains (`*.logitrak.ch`). Deploy the application onto a dedicated VPS.

## Architecture
- **Frontend**: React + Tailwind CSS + Recharts + Shadcn UI
- **Backend**: FastAPI + Motor (MongoDB) + httpx (Navixy API)
- **Database**: MongoDB (Docker container)
- **Deployment**: Docker Compose + Nginx + Let's Encrypt SSL
- **VPS**: Infomaniak VPS (83.228.207.198) - dedicated to this app

## Design System
- **Theme**: Swiss & High-Contrast (light only)
- **Fonts**: Outfit (headings), Inter (body)
- **Colors**: #111 primary, #10B981 success, #F59E0B warning, #EF4444 danger
- **Fuel price**: 2 CHF/L, Idle cost: 12 CHF/h

## Completed Features
- [x] Navixy API integration (trackers, employees, states, mileage stats)
- [x] Multi-client architecture (MongoDB subdomain routing)
- [x] **Premium Dashboard** with:
  - 8 KPI cards (Score, Actifs, Distance, Conso, Cout, Ralenti, Alertes, Heures)
  - AI Insights with CHF impact (surconsommation, ralenti, offline, violations)
  - Risk Financial block (perte ralenti, surconsommation, cout mensuel)
  - 3 charts (evolution score, distance+carburant, donut repartition)
  - Advanced fleet table (search, filter, sort, expandable details)
- [x] **Fleet Efficiency** page with expandable vehicle details
- [x] Driver report (inverted: driver -> vehicles)
- [x] Trends & Analytics
- [x] IoT Logic Flow Editor (drag-and-drop)
- [x] Period selector (Today/7d/30d/Custom)
- [x] Real mileage data via tracker/stats/mileage/read API
- [x] Batch odometer/engine hours via tracker/counter/value/list API
- [x] CSV/JSON export
- [x] Docker Compose deployment + SSL + iframe support for Navixy

## Deployment Info
- **VPS IP**: 83.228.207.198
- **Domain**: https://dashboard.logitrak.ch
- **Nginx**: X-Frame-Options configured for Navixy iframe embedding
- **SSL**: Let's Encrypt auto-renewal

## API Endpoints (Backend - DO NOT MODIFY)
- GET /api/fleet/stats (uses tracker/stats/mileage/read + counter/value/list)
- GET /api/fleet/efficiency
- GET /api/reports/driver
- GET /api/trackers
- GET /api/employees
- GET /api/map/positions
- GET /api/analytics/trends
- GET /api/analytics/vehicle-comparison
- CRUD /api/flows
- GET /api/export/fleet-stats
- GET /api/export/driver-report
- CRUD /api/admin/clients
- GET /api/client/info

## In Progress
- Phase B: Enhanced Fleet/Vehicles page
- Phase C: Enhanced Drivers page

## Backlog (P1)
- [ ] Phase B: Fleet page redesign (KPI vehicules, detail vehicule enrichi, top/worst)
- [ ] Phase C: Drivers page redesign (KPI chauffeurs, scoring, comparaison, fiche detail)
- [ ] Phase D: Polish (responsive mobile, composants reutilisables)

## Backlog (P2)
- [ ] Geofencing notifications
- [ ] Export PDF reports
- [ ] Sidebar: Zones, Maintenance, Reports sections
- [ ] Real-time auto-refresh (WebSocket or polling)
