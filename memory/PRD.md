# Navixy Fleet Dashboard - PRD

## Original Problem Statement
Create a premium SaaS fleet management dashboard based on Navixy IoT, with strategic decision-making capabilities, driver behavior analysis, financial risk assessment, and multi-client support.

## Architecture
- **Frontend**: React + Tailwind CSS + Recharts + Shadcn UI
- **Backend**: FastAPI + Motor (MongoDB) + httpx (Navixy API)
- **Database**: MongoDB (Docker container)
- **Deployment**: Docker Compose + Nginx + Let's Encrypt SSL
- **VPS**: Infomaniak (83.228.207.198) - dedicated

## Design System
- Theme: Swiss & High-Contrast (light only)
- Fonts: Outfit (headings), Inter (body)
- Fuel price: 2 CHF/L, Idle cost: 12 CHF/h

## Component Structure
```
frontend/src/
├── App.js
├── App.css (design tokens)
├── lib/api.js
├── components/
│   ├── layout/ (Sidebar, Header)
│   ├── dashboard/DashboardView.jsx (8 KPIs, Insights, Risk, Charts, Table)
│   ├── fleet/FleetEfficiencyView.jsx (7 KPIs, Top/Worst, Conso chart, Table)
│   ├── drivers/DriverReportView.jsx (6 KPIs, Comparison, Filters, Detail drawer)
│   ├── trends/TrendsView.jsx
│   ├── iot/IoTFlowView.jsx
│   └── shared/PeriodSelector.jsx
```

## Completed Features (All Phases)
### Phase A - Dashboard Premium
- [x] 8 KPI cards with sparklines (Score, Actifs, Distance, Conso, Cout CHF, Ralenti, Alertes, Heures)
- [x] AI Insights with CHF impact estimates
- [x] Financial Risk block (idle cost + overconsumption + monthly total)
- [x] 3 Charts (score evolution, distance+fuel, score donut)
- [x] Advanced fleet table (search, filter, sort, expandable 7-metric detail)

### Phase B - Fleet / Vehicules
- [x] 7 KPI cards (Total, Actifs, Offline, Sous-utilises, Distance, Moteur, Cout)
- [x] Top 3 / Worst 3 performers
- [x] Consumption bar chart by vehicle
- [x] 9-column sortable table with expandable detail (efficiency breakdown bar)
- [x] Real mileage data (tracker/stats/mileage/read API)

### Phase C - Conducteurs
- [x] 6 KPI cards (Total, Score moyen, Excellents, A risque, Ralenti, Violations)
- [x] Comparison bar chart
- [x] Filter buttons (Tous, Excellents, A risque, A former)
- [x] Driver cards with score badge + metrics
- [x] Detail drawer with radar chart + recommendations
- [x] Weighted score calculation (efficiency 40% + idle 25% + violations 20% + consumption 15%)

### Infrastructure
- [x] Multi-client subdomain routing (MongoDB)
- [x] Docker Compose deployment
- [x] Nginx + SSL (Let's Encrypt)
- [x] iframe embedding support for Navixy (CSP headers)

## API Endpoints (Backend)
- GET /api/fleet/stats (mileage/read + counter/value/list)
- GET /api/fleet/efficiency
- GET /api/reports/driver
- GET /api/analytics/trends
- GET /api/analytics/vehicle-comparison
- GET /api/trackers, /api/employees
- GET /api/map/positions
- CRUD /api/flows
- GET /api/export/fleet-stats, /api/export/driver-report
- CRUD /api/admin/clients
- GET /api/client/info

## Backlog (P1)
- [ ] Phase D: Responsive mobile optimization
- [ ] Sidebar: Zones, Maintenance, Reports sections
- [ ] Real-time auto-refresh (polling every 30s)

## Backlog (P2)
- [ ] Geofencing notifications
- [ ] Export PDF reports
- [ ] Driver training tracking
- [ ] Maintenance scheduling
- [ ] Route optimization suggestions
