# Navixy Fleet Dashboard - PRD

## Architecture
- Frontend: React + Tailwind + Recharts
- Backend: FastAPI + MongoDB + Navixy API
- Deployment: Docker Compose + Nginx + SSL on Infomaniak VPS (83.228.207.198)

## Frontend Architecture (Modular)
```
lib/metrics.js     → Moteur calculs (score, fuel, idle, insights, risk)
lib/api.js         → API helper
components/shared/ → UIComponents (KPICard, InsightCard, ScoreBadge, StatusBadge, RiskCard, etc.)
components/dashboard/ → DashboardView (8 KPIs, Insights, Risk, Charts, Table)
components/fleet/     → FleetEfficiencyView (7 KPIs, Top/Worst, Conso chart, Table)
components/drivers/   → DriverReportView (6 KPIs, Comparison, Filters, Detail drawer)
components/trends/    → TrendsView
components/iot/       → IoTFlowView
components/layout/    → Sidebar, Header
```

## Calculs Frontend (metrics.js)
- calcIdleTime, calcIdleRate, calcIdleCost
- calcFuelConsumption, calcFuelUsed, calcFuelCost
- calcOverconsumption
- calcVehicleScore (weighted: efficiency 30% + idle 25% + violations 20% + conso 15% + activity 10%)
- calcDriverScore (weighted: efficiency 40% + idle 25% + violations 20% + conso 15%)
- generateInsights (auto-detect: low efficiency, offline, high idle, overconsumption, violations, underused)
- calcFinancialRisk (idle cost + fuel waste + monthly estimate)
- Constants: FUEL_PRICE=2 CHF/L, IDLE_COST=3 CHF/h, AVG_FUEL=8.5 L/100km

## All Completed Features
- [x] Premium Dashboard (8 KPI, Insights CHF, Risk, 3 Charts, Table)
- [x] Fleet page (7 KPI, Top/Worst, Conso chart, 9-col table, detail expand)
- [x] Drivers page (6 KPI, Comparison, Filters, Radar drawer, Recommendations)
- [x] Trends & Analytics
- [x] IoT Flow Editor
- [x] Real mileage (tracker/stats/mileage/read)
- [x] Batch counters (tracker/counter/value/list)
- [x] Multi-client subdomain routing
- [x] Docker + SSL + iframe Navixy support

## Backlog
- [ ] Baubit integration (waiting for API doc from Arc-Logiciels)
- [ ] Responsive mobile optimization
- [ ] Real-time auto-refresh
- [ ] PDF export
- [ ] Geofencing notifications
