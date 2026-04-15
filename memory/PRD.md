# Navixy Fleet Dashboard - PRD

## Original Problem Statement
Create a statistical dashboard for fleet efficiency and an inverted driver report based on Navixy IoT logic. Build a visual IoT flow editor, integrate with Navixy API, and implement multi-client support via subdomains (`*.logitrak.ch`). Deploy the application onto a dedicated VPS alongside the user's existing infrastructure.

## Architecture
- **Frontend**: React + Tailwind CSS + Recharts + Shadcn UI
- **Backend**: FastAPI + Motor (MongoDB) + httpx (Navixy API)
- **Database**: MongoDB (Docker container)
- **Deployment**: Docker Compose + Nginx + Let's Encrypt SSL
- **VPS**: Infomaniak VPS (83.228.207.198) - dedicated to this app

## Component Structure (Post-Redesign)
```
frontend/src/
├── App.js (Main layout + routing)
├── App.css (Design system CSS variables)
├── lib/api.js (API helper)
├── components/
│   ├── layout/
│   │   ├── Sidebar.jsx (Collapsible sidebar, Swiss design)
│   │   └── Header.jsx (Glassmorphism sticky header)
│   ├── dashboard/
│   │   └── DashboardView.jsx (Premium KPI cards, AI Insights, Fleet Table, Charts)
│   ├── fleet/
│   │   └── FleetEfficiencyView.jsx (Efficiency timeline)
│   ├── drivers/
│   │   └── DriverReportView.jsx (Driver report with expandable cards)
│   ├── trends/
│   │   └── TrendsView.jsx (Analytics charts + comparisons)
│   ├── iot/
│   │   └── IoTFlowView.jsx (Drag-and-drop flow editor)
│   └── shared/
│       └── PeriodSelector.jsx (Reusable period picker)
```

## Design System
- **Theme**: Swiss & High-Contrast (light only, no dark mode)
- **Fonts**: Outfit (headings), Inter (body)
- **Colors**: #111 primary, #10B981 success, #F59E0B warning, #EF4444 danger
- **Cards**: Rounded-xl, 1px border, hover shadow

## Completed Features
- [x] Navixy API integration (trackers, employees, states)
- [x] Multi-client architecture (MongoDB subdomain routing)
- [x] Premium Dashboard with 8 KPI cards + sparklines
- [x] AI Insights (automated recommendations)
- [x] Fleet utilization donut chart
- [x] Distance bar chart (7 days)
- [x] Advanced fleet table (search, filter, sort)
- [x] Fleet efficiency timeline view
- [x] Driver report (inverted: driver -> vehicles)
- [x] Trends & Analytics (area/bar/pie charts)
- [x] IoT Logic Flow Editor (drag-and-drop)
- [x] Period selector (Today/7d/30d/Custom)
- [x] CSV/JSON export
- [x] Docker Compose deployment
- [x] Nginx + SSL (Let's Encrypt) on VPS
- [x] DNS: dashboard.logitrak.ch -> 83.228.207.198

## Deployment Info
- **VPS IP**: 83.228.207.198 (Infomaniak, dedicated for Navixy)
- **Domain**: https://dashboard.logitrak.ch
- **Ports**: Backend 8005, Frontend 8006 (internal Docker)
- **SSL**: Let's Encrypt, auto-renewal configured
- **Docker Hub**: Account `navixy`

## API Endpoints
- GET /api/fleet/stats
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

## Backlog (P1)
- [ ] Add initial client configurations via admin API
- [ ] Phase 3: Real-time improvements (auto-refresh, live counters)
- [ ] Phase 4: Enhanced secondary pages (fleet, drivers, trends)

## Backlog (P2)
- [ ] Geofencing notifications
- [ ] Export PDF reports
- [ ] Mobile-optimized responsive views
- [ ] Notification push system

## Known Issues
- Navixy API returns errors for `tracker/counter/read` (missing `type` param) - non-blocking
- Navixy API `driver/journal` endpoint returns 400 - using fallback tracker assignments
