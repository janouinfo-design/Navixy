# LOGITRAK Dashboard - PRD

## Navigation
Vue generale | Analyse flotte | Conducteurs | Vehicules | Couts | IoT | (Audit via ?admin=true)

## Architecture Backend (Analytics Engine v1.0.0)
- `navixy_client.py` / `cache_manager.py` / `analytics_engine.py` / `server.py`
- ZERO fake data. Tous endpoints: from_date + to_date uniformes.

## Vue Generale
- 6 KPI operationnels cliquables (Utilisation, Actifs, Distance, Moteur, Mouvement, Hors ligne)
- Drawers contextuels riches (duree humaine, gravite, barres contribution)
- Insights operationnels (cartes entieres cliquables, pas de lien separe)
- **REMPLACEE par la refonte v2 ci-dessous (iter 11)**

## Vue Generale — REFONTE v2 (iter 11, maquette modulaire sans heatmap)
- Rangee 1 (6 KPI): resume flotte (active/sans activite % + sparkline + alerte hors ligne),
  4 cartes categories avec donut SVG (clic → Analyse flotte), Km moy/utilise + mini barres
- Rangee 2: Repartition (barre empilee + legende), Statut & impact financier (donut + carburant L/CHF
  si taux configure sinon "indisponible + lien Couts"), Activite quotidienne (barres empilees par
  categorie + ligne total km/jour, jours FR)
- Rangee 3: Anomalies & alertes (regles deterministes cliquables), Conducteurs & score eco
  (top 5 notations natives Navixy plugin 46, fetch lazy), Actions recommandees + Vehicule snapshot (top 5 km)
- Header: "X en ligne" (connexion instantanee) ≠ "Flotte active" (utilisation periode)
- Comparaison periode precedente (iter 11b): badges Delta reels sur les 6 KPI
  (flotte active, 4 categories, km moy/utilise + km total) via /fleet/efficiency sur la
  periode precedente de meme duree; tooltip = valeur precedente + dates; couleur bonne/mauvaise
  seulement quand univoque (active up=vert, sous-utilise up=rouge), sinon neutre; footer mentionne les dates
- AUCUNE metrique inventee (pas de TCO/satisfaction/usure) — couts uniquement via config carburant CHF
- Anciens drawers Vue generale remplaces par navigation croisee vers les onglets detailles
- Tests: iteration_11.json — 100% frontend + regression tous onglets

## Analyse Flotte — REFONTE v2 "Analyse d'utilisation" (iter 12)
- En-tete: titre + sous-titre arbitrage + filtre GROUPES NAVIXY reels (/api/groups nouveau, group_id
  ajoute aux vehicules efficiency) — tout le contenu se recalcule sur le scope groupe (reset auto si groupe absent)
- Zone 1 (6 KPI): Flotte active vs dormante (% + badge immobiles), 4 categories (compte+%+seuil, disabled a 0),
  Intensite km moy./actif + volume total
- Zone 2: Structure d'utilisation (barre empilee + legende interactive = filtre table),
  Activite du parc (barres actifs/jour, couleur=intensite, ligne moyenne pointillee, clic=filtre jour)
  — chart calcule cote client depuis daily_breakdown du scope
- Zone 3: Recommandations deterministes (Equilibrage/Reduction/Concentration/Charge/Donnees,
  AUCUN montant ou % invente) + rappel Score eco moyen du parc (moyenne notations Navixy plugin 46,
  fetch lazy) + Synthese carburant (km/L/CHF depuis config uniquement, pas de pertes ralenti)
- CONSERVE (iter 9): 5 categories aux seuils valides, table triable + 7 filtres + recherche,
  drawer vehicule (calendrier, vs flotte), banniere filtre jour, footer seuils
- Tests: iteration_12.json — 100% backend (7/7) + 100% frontend

## Analyse Flotte (Fusion Performance + Efficacite) — v1 (iter 9, remplacee par v2 ci-dessus)
- **Performance SUPPRIME** (100% doublons)
- **Efficacite REMPLACE** par page fusionnee
- Hierarchie: Total → Utilises / Sans activite → 4 sous-categories
- 4 categories utilisees (source unique CATEGORIES):
  - Sous-utilise: <30% (rouge)
  - Modere: 30-59% (ambre)
  - Bonne utilisation: 60-84% (emeraude)
  - Forte utilisation: >=85% (bleu)
- Sans activite: 0% (gris) — label unifie partout (KPI, barre, legende, filtres, badges)
- KPI: Vehicules utilises, Sans activite, 4 categories, Km moy/vehicule utilise (tooltip formule)
- Barre categories interactive (clic = filtre table) + legende
- Graphique barres quotidiennes compact (260px):
  - Jours en francais (Sam, Dim, Lun...)
  - Tooltip date complete + vehicules actifs/total + % + km
  - Ligne moyenne periode
  - Clic barre = filtre table vehicules actifs ce jour
  - Banniere filtre jour: "Filtre actif : Lundi 2 fevrier — X vehicules" + Reinitialiser
- Table triable 8 colonnes + filtres complets (tous visibles, 0-count desactives) + recherche
- Moteur (total): compteur cumulatif, tooltip header, "h" suffixe, "—" si indisponible
- Drawer vehicule: stats, comparaison flotte, calendrier activite, graphique distance
- "A retenir": 3-4 insights deterministes, cliquables, en francais
- Filtre unique: KPI/barre/legende/filtres/jour = meme etat synchronise
- Definitions avec tooltips (Tip component: span role=button, pas button imbrique)
- Footer: seuils documentes + source Navixy

## Conducteurs / Eco-conduite — FINALISE (2026 iter 10)
- Score eco = notation NATIVE Navixy plugin 46 "Qualite de conduite" (0-100 + etoiles), affichee telle quelle
- AUCUNE categorisation/conversion LOGITRAK (pas de seuils 80/60/40) — couleur derivee des etoiles Navixy
- Backend: /api/drivers/ecodriving (ecodriving.py) — generate/status/retrieve/delete rapport plugin 46 + track/list
- Attribution STRICTE: donnees conducteur uniquement via employee.tracker_id Navixy
- Vehicules avec activite SANS conducteur assigne (AUDI, 5-Alliance, camion NEDIR): evenements NON attribues, section dediee
- Statuts distincts: "Aucun vehicule assigne" / "Aucune donnee sur la periode" / "Donnees disponibles"
- KPI: Avec vehicule X/Y, Score eco moyen, Penalites /100km, Distance attribuee, Trajets, Temps de conduite
- Table triable (nom/score/distance/penalites100km) + filtres Tous|Avec vehicule|Sans vehicule|Avec activite + recherche
- Drawer: score natif + "Pourquoi ce score ?" (freinages/accel/virages/ralenti/exces vitesse en /100km + brut),
  penalites par jour (stacked chart couleurs Navixy), evenements recents geolocalises avec lien Google Maps
- Radar artificiel SUPPRIME; footer "Source de verite" (donnee → endpoint → methode → attribution)
- Periode = selecteur global du dashboard (from/to identiques partout)
- Indicateurs /100km = count ÷ km × 100 (idling en min/100km)
- Cache tenant 300s (1ere generation 5-45s)
- Tests: iteration_10.json — 100% backend (9/9) + 100% frontend

## Logo LOGITRAK (iter 14d)
- Logo genere (badge noir arrondi, camion blanc + pin GPS emeraude), fond blanc converti en transparent
- Fichiers: /app/frontend/public/logo-logitrak.png + /app/backend/assets/logo-logitrak.png (copies separees
  car containers frontend/backend distincts au deploiement)
- Header dashboard: logo 36px a gauche du titre (header-logo); Sidebar.jsx aussi equipe (composant non utilise)
- PDF: logo 14mm a gauche du titre via Table (fallback sans logo si fichier absent)
- LEÇON image gen: le mode transparent peut incruster un damier en pixels — demander fond blanc opaque puis detourer

## Export PDF enrichi (iter 14c)
- /api/export/pdf enrichi: photos garage embarquees (avatars, telechargement parallele, echecs ignores),
  plaque sous le nom du vehicule, section "Echeances administratives" (leasing Mongo, assurance garage
  fallback Mongo, prochain controle non effectue — texte colore rouge/orange/vert), section
  "Eco-conduite — notation native" (score moyen, table conducteurs: score /100 + etoiles n/5 + penalites/100km)
- Generation ~19s hors cache (rapport plugin 46), <2s en cache; timeout frontend export porte a 120s
- Verifie par extraction texte pypdf: toutes les sections presentes avec donnees reelles

## Liaison garage depuis LOGITRAK (iter 14b)
- POST /api/vehicles/admin/navixy-garage/{vehicle_id}/link {tracker_id|null} — lie/delie (vehicle/update)
- UI: fiche vehicule non lie → panneau ambre avec selecteur des vehicules garage non lies + "Lier ce vehicule";
  vehicule lie → bouton "Delier" sous la section garage
- Cycle link/unlink teste par curl (Mini ONE ↔ Tab Samsung, restaure)
- AUCUNE association auto: les 5 vehicules garage (Mini ONE, PM-5 Citroen, smart R, Mercedes, FR 75)
  ne matchent aucun traceur libre par nom/plaque — paires a faire par l'utilisateur via l'UI

## Synchronisation Garage (iter 14) — BIDIRECTIONNELLE
- Source commune = garage plateforme GPS (vehicle/list|read|update|avatar/upload) — UI dit "garage LOGITRAK"
- Correspondance par tracker_id (3 lies: 781479 Audi/164367, 3076994 Skoda, 3131157 Toyota; 5 non lies)
- Champs 2 sens: nom, modele, plaque, VIN, annee, couleur, assurance RC (n° police + valide jusqu'au), PHOTO
- Pull auto a chaque chargement page Vehicules + bouton Synchroniser (banniere noire, pastille verte)
- Push: edition fiche → PUT /api/vehicles/admin/navixy-garage/{vehicle_id} (read-merge-update complet)
- Photo: upload via fiche (hover camera) → vehicle/avatar/upload → URL statique publique {api}/static/vehicle/avatars/{fn}
- Champs internes Mongo NON synchronises: leasing, responsable, base, controles, etat des lieux, documents
- Badge assurance liste/fiche: date garage prioritaire, fallback Mongo
- White-label: cleanDeviceLabel() masque 'navixy' dans les modeles traceurs (VehiclesTab + AnalyseFlotteTab)
- ATTENTION: pas d'endpoint delete avatar — la photo test (carre bleu) sur l'Audi doit etre remplacee par l'utilisateur
- LEÇON: verifier les fins de fichier apres gros search_replace (2 fois du code residuel a casse la compilation)
- Tests: iteration_14.json — backend 100% (6/6, restaurations donnees reelles OK); 3 bugs ligne corriges
  post-rapport et verifies par screenshot cible (photo, sous-ligne plaque, badge garage, leak white-label)

## Onglet Vehicules — MODULE ADMINISTRATIF (iter 13)
- Liste type "Documents": plaque + marque/modele, km GPS reels (total_odometer), responsable,
  badges echeances Leasing/Assurance/Controle (rouge=echu, orange<30j, vert sinon, gris si vide)
- Fiche vehicule (drawer 7 onglets): General (marque/modele/annee/VIN/base/responsable/maintenances
  + readonly km GPS/groupe/tracker), Leasing, Assurance, Carte grise, Etat des lieux (entrees datees),
  Controles (echeances + marquer effectue), Documents (upload fichiers max 25 Mo)
- Backend: /app/backend/vehicle_admin.py — routeur /api/vehicles/admin, collection Mongo vehicle_admin
  (tenant + tracker_id), uploads disque /app/backend/uploads/{tenant}/{tracker_id}/
- Donnees admin = saisie utilisateur (affichees comme telles); km/tracker = GPS reel
- Cles vides omises a l'upsert; data-testid complets (etat-del-* ajoute post-test)
- Tests: iteration_13.json — 100% backend (9/9) + 100% frontend, donnees de test nettoyees

## Onglets supprimes (iter 12c)
- Onglets "Couts" et "IoT" RETIRES de la navigation (demande utilisateur)
- Fichiers CostsTab.jsx / IoTTab.jsx conserves sur disque mais non importes (retour facile si besoin)
- Endpoints backend carburant/config conserves — le taux configure continue d'alimenter les calculs CHF
- References "onglet Couts" nettoyees dans OverviewTab (lien navigation retire) et AnalyseFlotteTab
- Onglets restants: Vue generale, Analyse flotte, Conducteurs, Vehicules (+ Audit en ?admin=true)

## White-label (iter 12b)
- "Navixy" remplace par "LOGITRAK" dans TOUS les textes visibles (frontend, sources API, PDF, titre API)
- Identifiants techniques conserves: navixy_client.py, NavixyClient, NAVIXY_API_URL/NAVIXY_HASH, cles JSON navixy_*
- Regle pour la suite: ne plus ecrire "Navixy" dans les nouveaux textes UI — utiliser "LOGITRAK"

## Regles
- `ACTIVE_DAY_THRESHOLD_KM = 1.0`
- Categories: sans_activite(0%) | sous-utilise(<30%) | modere(30-59%) | bonne(60-84%) | forte(>=85%)
- Heures moteur = compteur cumulatif total
- Invariants verifies: used+inactive=total, sum(cats)=total, KPI=filtres

## Completed
- [x] Analytics Engine v1.0.0, Audit, Debug, Carburant UI, PDF
- [x] Refonte Vue Generale (drawers UX riches)
- [x] Fusion Performance + Efficacite → Analyse Flotte
- [x] **Finalisation Analyse Flotte** (2026-02-07):
  - Labels coherents "Sans activite" partout (remplace "Inactif")
  - Jours francais dans graphique et insights
  - Filtres table complets (7 boutons, 0-count visible desactive)
  - Moteur (total) avec suffixe "h", tooltip header cumulatif, "—" pour indisponible
  - Tip component: span role=button (HTML valide, pas button imbrique)
  - Banniere filtre jour: date complete francaise
  - Tri par nom en asc par defaut
  - Tests: 100% backend (invariants 1/7/31 jours) + 100% frontend (iteration_9)
  - Regression: tous onglets fonctionnels, pas de tabs fantomes
- [x] **Refonte Conducteurs / Eco-conduite** (iter 10): score natif Navixy plugin 46, attribution stricte, drawer explicatif, 100% teste
- [x] **Audit multi-tenant Phase 1** (2026-06): rapport complet /app/memory/AUDIT_MULTITENANT.md, valide par utilisateur
- [x] **Phase 1 securite multi-tenant** (2026-06, iteration_15 — 23/23 backend + frontend 100%):
  - Auth JWT (cookies httpOnly access 8h + refresh 7j, fallback Bearer), bcrypt, /api/auth/{login,logout,me,refresh}
  - TOUS les endpoints /api/* verrouilles (sauf /api/, /api/client/info publics — branding login)
  - Fuites corrigees: /admin/clients SUPER_ADMIN only + navixy_hash jamais renvoye; flows filtres par tenant; debug/cache-stats + audit/compare SUPER_ADMIN
  - navixy_hash chiffre au repos (Fernet, prefixe enc:, cle ENCRYPTION_KEY .env)
  - Sous-domaines *.logitrak.ch inconnus → 403; tenant = identite du token (jamais le frontend); SUPER_ADMIN: X-Act-As-Tenant valide + journalise (impersonation_logs)
  - Brute force: 5 echecs → 429 verrou 15 min; index Mongo (users.email unique, clients.subdomain unique, flows.tenant)
  - Seed SUPER_ADMIN idempotent depuis .env (SUPER_ADMIN_EMAIL/PASSWORD) — identifiants dans /app/memory/test_credentials.md
  - Frontend: LoginPage, AuthContext, interceptor 401→refresh, logout header, onglet Audit reserve SUPER_ADMIN (plus de ?admin=true)
  - Fichiers: backend/auth.py (nouveau), server.py, frontend/src/lib/{api.js,AuthContext.jsx}, components/auth/LoginPage.jsx, App.js, Header.jsx, DashboardLayout.jsx
  - Tests regression: /app/backend/tests/test_auth_phase1.py
- [x] **Phase 2 Super Admin** (2026-06, iteration_16 — 29/29 backend + frontend 100%):
  - Routes frontend: /super-admin (dashboard KPI reels), /super-admin/clients (table/recherche/filtres/tri/pagination/actions), /super-admin/clients/:id (fiche: Vue generale/Utilisateurs/Navixy/Modules/Activite) — react-router 7
  - Wizard 5 etapes: Entreprise (slug auto modifiable) → Admin (mdp temporaire affiche 1x) → Navixy (test connexion backend reel) → Modules (6 reels) → Validation ; creation atomique POST /api/admin/clients/full avec rollback
  - Backend super_admin.py: /api/admin/{overview,modules,navixy/test,clients/full,clients/{id}/detail|activity|users|suspend|reactivate|modules|purge,users/{uid},users/{uid}/reset-password,impersonation/start|end}
  - Impersonation: header X-Act-As-Tenant (SUPER_ADMIN only, ignore sinon), bandeau orange constant, journal impersonation_logs (super_admin_id, tenant, ip, started/ended_at)
  - RBAC durci: READ_ONLY/DRIVER → 403 sur ecritures ; client suspendu → 403 login + requetes ; modules non actives → 403 endpoints (conducteurs/vehicules/carburant/rapports) + onglets caches ; SUPER_ADMIN jamais attribuable cote client (400)
  - Migration: clients.tenant (Hermus=default, hash conserve), clients.modules, tenant_sync, audit_log ; index tenant_sync.tenant unique, audit_log(tenant,at)
  - 2 tenants TEST conserves (test-alpha modules partiels, test-beta complet, hash factices → Navixy 'En erreur' = etat reel) — purgeables via fiche client
  - Fichiers: backend/{super_admin.py(nouveau),auth.py,server.py}, frontend/src/components/superadmin/* (7 fichiers), shared/ImpersonationBanner.jsx, App.js, AuthContext.jsx, api.js, DashboardLayout.jsx
  - Tests: /app/backend/tests/test_super_admin_phase2.py (regression reutilisable)

## Backlog
- [ ] **P3 restant**: correlation stricte is_impersonating avec log ouvert (suggestion test agent, non bloquant) ; changement de mot de passe par l'utilisateur (must_change_password est stocke mais non force au login)
- [ ] **P4 Durcissement**: revue finale securite
- [ ] Alertes email echeances (explicitement hors perimetre Phase 2)
- [x] **Phase 2.1 Durcissement auth & impersonation** (2026-06, iteration_17 — 20/20 backend + frontend 100%):
  - Changement mdp obligatoire: must_change_password → 403 PASSWORD_CHANGE_REQUIRED partout sauf /api/auth/* ; page /change-password (redirect force, contournement URL impossible) ; POST /api/auth/change-password (verif mdp actuel, min 8, bcrypt, invalidation sessions, nouvelles cookies)
  - Rotation refresh tokens: collection sessions (jti, sha256 hash — jamais en clair, TTL index) ; chaque refresh consomme l'ancien et emet un nouveau ; reutilisation → revocation globale + audit REFRESH_REUSE_DETECTED ; logout revoque
  - Impersonation stricte: header X-Act-As-Tenant exige session impersonation_logs OUVERTE du super admin pour CE tenant (403 IMPERSONATION_INVALID sinon) ; 1 seule session ouverte par super admin ; expiration 60 min (IMPERSONATION_EXPIRED, log expired=true) ; frontend auto-nettoie sur 403 (interceptor)
  - Audit: LOGIN_SUCCESS, LOGIN_FAILED_LOCKOUT, PASSWORD_CHANGED, PASSWORD_RESET_BY_ADMIN, USER_DISABLED, USER_REACTIVATED, IMPERSONATION_STARTED/ENDED/EXPIRED, REFRESH_REUSE_DETECTED — aucun secret stocke (teste)
  - Comptes TEST passes par le flux change-password reel — nouveaux mdp dans test_credentials.md
  - Fichiers: backend/{auth.py,server.py,super_admin.py}, frontend/{components/auth/ChangePasswordPage.jsx(nouveau),App.js,lib/api.js,lib/AuthContext.jsx}
  - Tests: /app/backend/tests/test_auth_phase2_1.py (20 tests)

## Ordre valide par utilisateur pour la suite
1. Carte temps reel (module 'carte' a ajouter au registre MODULES)
2. Alertes echeances email
3. Logo/branding par client

- [x] **Phase 2.2 Correction architecture — acces client sans login** (2026-06, iteration_18 — backend 28/28 pytest + frontend 100%):
  - Lien d'acces tenant signe: token 256 bits urlsafe, stocke HACHE sha256 (tenant_access_tokens), sans expiration, revocable, regeneration revoque l'ancien
  - GET /api/access/{token} (public): valide token + client actif + host (si sous-domaine prod), pose les cookies httpOnly (session refresh rotative), audit ACCESS_LINK_USED avec IP
  - Utilisateur virtuel 'link:<id>': access_mode 'edit' → role MANAGER, 'read' → READ_ONLY — tout le RBAC/modules/suspension/isolation existant s'applique ; change-password interdit ; revocation = 401 immediat (verif du lien a chaque requete + au refresh)
  - Super Admin: fiche client onglet 'Lien d'acces' (generer/copier une fois/revoquer/mode) ; endpoints POST|DELETE /api/admin/clients/{id}/access-link ; audit ACCESS_LINK_CREATED/REVOKED
  - ADMIN_HOST (env, optionnel — production): tous les endpoints SUPER_ADMIN → 403 hors de ce host ; inactif en preview ; ajoute au docker-compose (${ADMIN_HOST:-})
  - Frontend: route publique /access/:token (AccessPage), header sans logout/email pour via_link
  - Usage prod: le lien remplace l'URL nue dans le panneau Navixy white-label (login.logitrak.fr) — le client entre sans login, cle Navixy jamais exposee
  - Clarification auditee: Techlift n'a jamais eu de privileges — le Super Admin est global (/super-admin), le login vu sur techlift.logitrak.ch etait le formulaire generique brande
  - Fichiers: backend/{auth.py,server.py,super_admin.py,docker-compose.yml}, frontend/{components/auth/AccessPage.jsx(nouveau),App.js,superadmin/ClientDetail.jsx,layout/Header.jsx}
  - Tests regression: /app/backend/tests/test_access_link.py (28 tests)
  - Bug corrige post-test: refresh des sessions lien (branche 'link:' dans /auth/refresh) — re-teste 28/28
- [x] **Phase 2.2 Validation reelle du parcours sans login + fix confidentialite token** (2026-06, iteration_20 — 30/30, backend 28/28 pytest + frontend 100%):
  - Faille corrigee (iteration_19 29/30): le token vivait dans la route SPA /access/<token> → visible par PostHog/analytics
  - GET /api/access/{token} = echange 100% backend: 302 Location:'/' + cookies HttpOnly + Cache-Control:no-store + Referrer-Policy:no-referrer — le SPA/navigateur ne voit JAMAIS le token
  - Erreurs = 302 vers /lien-invalide (invalide/revoque), ?motif=suspendu, ?motif=domaine — sans cookies ; page neutre FR sans jargon (AccessPage.jsx reecrite)
  - Route SPA /access/:token SUPPRIMEE (App.js) ; PostHog ENTIEREMENT SUPPRIME de public/index.html
  - Logs: filtre _AccessTokenLogFilter (server.py) → '/api/access/[REDACTED]' dans uvicorn ; anciens logs purges ; nginx-dashboard.conf: location /api/access/ avec access_log off (a deployer VPS)
  - URL generee Super Admin: https://<sub>.logitrak.ch/api/access/<token>
  - Durcissement minor: /auth/me des sessions lien verifie aussi client.is_active (401 si suspendu)
  - Valide 30/30: URL finale sans token, zero requete posthog, F5/onglets/refresh, edit/read 403, revocation, suspension+reactivation, isolation X-Act-As ignore, Mongo hash-only, non-regression logins
  - IMPORTANT DEPLOIEMENT VPS: regenerer le lien Techlift apres deploiement (ancien format /access/<token> obsolete) + git pull de nginx-dashboard.conf
- [x] **Support iframe Navixy white-label** (2026-06, self-test — pytest 79/79 + E2E iframe Playwright):
  - Besoin: le lien d'acces est place dans le panneau Navixy en mode 'Integre' (iframe cross-site) → cookies SameSite=Lax bloques → login affiche
  - Fix: sessions LIEN uniquement → cookies SameSite=None; Secure; Partitioned (CHIPS) poses par /api/access/{token} ET par /auth/refresh (branche link:) — header Set-Cookie manuel (starlette 0.37 sans param partitioned)
  - Garde anti-CSRF: pour les sessions via_link, toute methode d'ecriture exige que l'Origin corresponde au host servi (Host OU X-Forwarded-Host, proxy preview reecrit Origin) → 403 'Origine non autorisee' sinon
  - Logins normaux (super admin, comptes clients) restent SameSite=Lax — inchanges
  - E2E valide: page externe locale iframant /api/access/<token> → dashboard test-beta rendu SANS login dans l'iframe
  - Compat navigateurs: Chrome/Edge/Firefox OK, Safari >= 18.4 (CHIPS) — anciens Safari peuvent bloquer, fallback = mode 'Nouvel onglet' dans Navixy
  - Tests obsoletes repares: test_auth_phase2_1.py + test_super_admin_phase2.py utilisaient les anciens mdp temporaires → mis a jour avec test_credentials.md (79/79)
  - Token Techlift expose dans une capture utilisateur → lien a REGENERER apres deploiement
- [x] **Fix flottes >128 vehicules (Membrez 204 vehicules → 0 km partout)** (2026-06, self-test reel):
  - Cause: Navixy limite tracker/stats/mileage/read a 128 traceurs/requete → appel unique avec 204 IDs echoue en silence → mileage/odometre/heures moteur a 0 (Techlift 37 OK)
  - Fix navixy_client.py: _chunked_stats() — decoupe en lots de 100, fusionne les resultats (result_key 'result' pour mileage, 'value' pour counters), flag 'partial' + warning si un lot echoue
  - Valide sur donnees reelles Techlift preview: chunk=10 == appel unique (17219.6 km, 37 cles identiques) ; odometer 33 cles, engine_hours 27 cles ; endpoint /api/fleet/stats e2e OK (37 veh, 17224 km)
  - Non couvert: report/tracker/generate (eco-conduite plugin 46) envoie aussi tous les IDs — limite Navixy inconnue, a surveiller sur Membrez onglet Conducteurs
- [x] **Phase 2 Multi-energie — Capability Map par vehicule** (2026-06, iteration_21 — 48/48 pytest + frontend 100%):
  - /app/backend/capabilities.py (nouveau): detection PAR VEHICULE via tracker/sensor/list + readings (batch 10), whitelist KNOWN_INPUTS (obd_fuel %, obd_consumption unite NON verifiee, obd_mileage km), EV_KEYS (7) toujours UNAVAILABLE (aucun input EV verifie — liste EV_VERIFIED_INPUTS vide volontairement), sensors ambigus (avl_io_*, obd_absolute_load_value) → unverified_sensors
  - Fraicheur: AVAILABLE si update_time < 48h sinon STALE (jamais presente comme temps reel) ; jamais 0 pour absence
  - Cache: memoire tenant 300s + Mongo vehicle_capabilities TTL 6h, ?refresh=true force le re-scan
  - Endpoints: GET /api/vehicles/capabilities (+ /{tid}/capabilities, 404 si inconnu), module 'vehicules', isolation testee (test-beta + header X-Act-As ignore)
  - navixy_client.py: get_sensors, get_sensor_history (tracker/sensor/data/read VALIDE — l'ancien dead-end venait de mauvais params), get_readings_and_sensors_batch
  - analytics_engine: fleet_stats a fuel_type par vehicule (vehicle/list), EV → fuel_used_liters null (jamais litres estimes), odometer/engine_hours null si absents, data_status {ok|partial|error} sur stats+efficiency ; FORMULE UTILISATION INTOUCHEE
  - Frontend VehiclesTab: MotorBadge (badge seulement si motorisation connue — Zoe sans badge), colonne Carburant (93% frais / 'ancien' ambre / '—'), CapabilitiesPanel (fiche: capacites, EV 'Non detectee', DTC avec anciennete, VIN conflit, sensors ignores), select 'Motorisation (correction LOGITRAK)' → vehicle_admin.general.motorisation (override Mongo, PAS d'ecriture Navixy — enum Navixy non confirme)
  - DashboardLayout: banniere partial-data-banner si data_status != ok
  - Valide reel: Techlift 37 (fuel_level 3, vin 4), FlexMobil 52 (Zoe=zero EV fictif, Prius DTC P0A80 STALE, Porto 93% AVAILABLE, Tigizirt avl_io_49 unverified), exports PDF/CSV ok, config fuel restauree
  - Tests: /app/backend/tests/test_capabilities.py (18) + non-regression access_link (30)
  - Decisions assumees: tracker 'just_registered' avec odometer 0.0 renvoye tel quel par Navixy (valeur reelle API) ; obd_consumption jamais affiche en L/100 ni utilise en couts
- [x] **Vue generale multi-energie (EnergySection)** (2026-06, iteration_22 — 100% backend+frontend):
  - EnergySection.jsx (nouveau, rendu en ROW 4 d'OverviewTab): bloc Energie flotte (thermique/electrique/hybride/inconnu via capabilities.motorisation), Alertes energie (carburant faible < FUEL_LOW_THRESHOLD_PCT=20 backend centralise vs 'sans donnee exploitable' — jamais confondus), 4 tuiles cliquables (hors ligne, sous-utilises, forte utilisation, echeances <=30j depuis vehicle_admin), Drawer drill-down → fiche vehicule (DashboardLayout vehicleToOpen → VehiclesTab initialSelected)
  - Compte drawer == KPI verifie sur 6 populations ; tuiles a 0 desactivees ; 0 appel Navixy supplementaire (GET capabilities cache 6h + /vehicles/admin Mongo) ; responsive 1920/1366/820 ok ; bloc Couts intouche (choix user 2c)
  - Correctif post-test: fuel_low_threshold_pct injecte aussi sur reponse cache
- [x] **Iteration 23 — Audit final Vue generale** (2026-06, iteration_23 : VALIDE APRES CORRECTIONS):
  - Audit testing agent: hierarchie A→E ok apres reorder (Energie avant Eco/Anomalies), 6/6 drill-downs stricts, plaques (reg_number ajoute aux capabilities + drawers), multi-energie conforme (Zoe dans 'inconnu' sans EV), 0 appel reseau a l'ouverture des drawers, responsive 1920/1366/1024 sans scroll horizontal, pytest 48/48
  - 2 reserves corrigees et re-verifiees E2E: (1) header/tabs passes z-[60] + sheets/drawers z-[70], backdrop z-40 → navigation toujours cliquable pendant fiche ouverte (changement d'onglet demonte l'overlay) ; (2) tuiles 'A surveiller' a 0 en opacity-50
  - Doublon assume (documente): cartes Anomalies (texte+recommandations) vs tuiles A surveiller (drill-down) — roles differents, non supprime
  - Echeances: documents echus restent visibles ('echu' rouge) dans le drawer
- [x] **Tenant DEMO EV — 5 vehicules simules** (2026-06, self-test complet + pytest 48/48):
  - Audit EV prealable (lecture seule): verdict EV DATA NOT AVAILABLE — aucun SoC/kWh/recharge dans les sources reelles (Zoe FlexMobil: OBD muet, seuls tension 12V/GPS/allumage remontent, historique 6min OK). Rapport A-P livre.
  - Sur demande user: donnees FICTIVES autorisees UNIQUEMENT via tenant demo isole. /app/backend/demo_simulator.py — 5 vehicules (3 BEV Tesla/Zoe/ID.4, 1 PHEV Volvo, 1 diesel Caddy), SoC deterministe (decharge jour/recharge nuit, Zoe demo 16% = batterie faible), km/jour, odometre, historiques 30min, garage complet
  - Hook UNIQUE: navixy_client.request → si hash dechiffre == 'SIMULATION' → demo_simulator.simulate(). Client Mongo 'demo-ev' (is_test, simulation:true, hash chiffre 'SIMULATION'). AUCUN chemin vers les clients reels
  - capabilities.py: EV_VERIFIED_INPUTS rempli avec les inputs du SIMULATEUR uniquement (ev_battery_level/ev_range/ev_charging_state — noms inexistants chez Navixy reel), source='simulation:...'
  - Frontend: colonne energie ⚡SoC (rouge <20%), bloc valeurs EV dans la fiche (Batterie traction/Autonomie/Recharge + etiquette SIMULATION violette), alerte 'Batterie faible (EV)' + drawer dans EnergySection, bandeau violet 'DONNEES DE DEMONSTRATION' (detecte model=='simulator')
  - EV reels: inchanges (UNAVAILABLE) — pytest 48/48 (1 assertion trop rigide corrigee: Porto fuel 93→76% donnee vivante)
  - ATTENTION connue: search_replace 'succes fantome' constate 3x dans la session (edits non appliques malgre succes) — TOUJOURS re-grep apres edit critique
  - COMPLEMENT (meme session): simulateur etendu — 9 donnees EV par vehicule (SoC, autonomie, etat recharge, kWh/100, energie consommee totale, capacite batterie, puissance charge, energie derniere recharge, temp batterie) ; EV_KEYS +ev_battery_capacity/+ev_battery_temp ; fiche = 9 tuiles EV etiquetees SIMULATION ; Vue generale = resume 'SoC moyen X% · conso Y kWh/100 · N EV avec telemetrie' (data-testid ev-summary) ; pytest 18/18
  - COMPLEMENT 2: colonne 'Energie' du tableau Vehicules affiche pour les EV: ⚡SoC% · autonomie km + indicateur '🔌 En charge' (animate-pulse) / 'Branché' (data-testid fuel-level-{tid}-charging) ; Tesla demo charge 11-16h (borne midi) pour toujours montrer le cas ; verifie E2E
- [x] **DASHBOARD V2 — refonte Vue generale decisionnelle** (2026-06, iterations 24+25 : VALIDE 100%):
  - Decisions user appliquees: 1a (fusion AFFICHAGE modere+bonne='Utilisation normale' 30-84%, seuils backend INCHANGES, harmonise Dashboard+Analyse flotte+drawers), 2b (CRITIQUE = assurance/controle echu + hors ligne >48h/jamais connecte ; EV<20%/offline recent/echeances proches/sous-forte utilisation = A SURVEILLER orange), 3a (conso ESTIMEE seule, libelle + couverture n/total, obd_consumption exclu), 4a (documents manquants OMIS), 5a (EV masque en prod sans telemetrie, chips affichees en demo, mention discrete si EV connu sans telemetrie)
  - OverviewTab.jsx REECRIT: L1=6 KPI (actifs, hors ligne 'instantane', sans activite, utilisation %, distance, alertes critiques rouge) avec Delta vs periode precedente ('…' loading, '—' si indisponible, jamais de valeur inventee) ; L2=barre 4 categories cliquables (somme=total) + activite quotidienne (barres actifs+courbe km, agregation hebdo >31j) ; L3=Energie & consommation (mix motorisation n+%, conso estimee+couverture, couverture telemetrie DEDUPLIQUEE 1 vehicule=1 entree, chips EV demo, note EV sans telemetrie) + Priorites du jour (rouge/orange regle 2b, max 7) + 3 actions deterministes ; L4=Maintenance & conformite (echues/<=30j/assurances/controles depuis vehicle_admin + 5 prochaines echeances) + Vehicules a surveiller (5 max, alerte principale, clic=fiche) ; eco-conduite ligne compacte ; footer sources+periode comparaison
  - EnergySection.jsx SUPPRIME (absorbe). AnalyseFlotteTab.jsx harmonise: CATEGORIES avec match:[], displayCat(), catCounts et filtre table via c.match.includes (BUG iteration_24 corrige: edits L168/L290 perdus/reappliques — re-grep obligatoire), filtre 'normale', grid xl:grid-cols-5, footer seuils
  - Backend INCHANGE (comparaison periode precedente = mecanisme frontend existant via 2e appel /fleet/efficiency)
  - Tests: iteration_24 (4 tenants, responsive 1920/1366/1024, 48/48 pytest suites reference) + iteration_25 (coherence Vue generale<->Analyse flotte VERIFIEE: FlexMobil 17/2/23/10=52 identiques dans les 2 onglets, filtre normale=23 rows, telemetrie demo 5/5). Captures desktop/laptop/tablette prises sur FlexMobil reel
  - Suites pytest test_analyse_flotte_invariants/test_drivers_ecodriving/test_vehicle_admin/test_groups en echec PREEXISTANT (401 infra test, sans rapport V2)
- [x] **Restyling L3/L4 selon maquette utilisateur** (2026-06, iteration_26: 100%):
  - Decisions user: 4e carte maintenance = 'Echues' (remplace Documents manquants, decision 4a maintenue) ; cartes instantanees (SoC/couverture/EV faible) SANS delta (pas d'historique) ; conso estimee inchangee (3a) ; 'Voir tout' sur Vehicules a surveiller → drawer complet
  - Energie: donut motorisation (thermique BLEU #3B82F6, hybride ORANGE #F59E0B, electrique VERT #10B981, inconnu gris) centre 'n vehicules', legende cliquable → drawer ; cartes EnergyCard style maquette (Conso thermique estimee, Conso electrique kWh/100, SOC moyen EV, EV batterie faible rouge, Couverture telemetrie en %) — EV masquees en prod, visibles demo
  - Maintenance: 4 cartes (Echeances<30j Wrench bleu / Assurances Shield orange 'dont n echue' / Controles CheckCircle2 vert / Echues AlertTriangle rouge) avec gros chiffre + DateDelta 'vs il y a 7 j' (calcul PAR DATES a fiches constantes, jamais invente) + bouton 'Voir les…' → drawer
  - Priorites: point colore + compteur rouge/orange + chevron (libelles maquette: 'Trackers hors ligne', 'Batteries faibles (EV)', 'Entretiens a planifier < 30 jours') ; Actions recommandees avec icones (AlertTriangle/Phone/Shuffle/CalendarClock/BatteryCharging), max 4
  - Vehicules a surveiller: tableau 'Nom – plaque | point severite + alerte' + 'Voir tout (n)' → drawer complet (watch.full)
  - SEED DEMO: 5 fiches vehicle_admin inserees en Mongo PREVIEW pour tenant 'demo-ev' (Zoe assurance echue J-5, Tesla controle J+12, ID.4 leasing J+25, XC60 maintenance J+8, Caddy assurance J+20) — PREVIEW UNIQUEMENT, n'existera pas sur le VPS sans saisie
  - Cartes energie = icones EXACTES du zoom maquette user (2026-06, 2e demande insistante): SVG Material FILLED copies a l'identique dans /app/frontend/src/components/dashboard/tabs/EnergyIcons.jsx (MatWaterDrop goutte pleine, MatPower prise a broches, MatBatteryFull batterie VERTICALE verte, MatBatteryCharging batterie verticale eclair rouge en pastille carree, MatWifi plein) — lucide ne suffisait PAS (pas de batterie verticale/filled), ne pas re-remplacer par des equivalents lucide. Icones nues sans cercle sauf EV faible (carre rouge clair). Verifie par capture zoom DEMO EV
  - Tests: iteration_26 frontend 100% (7/7 criteres, FlexMobil+DEMO EV+Techlift, responsive 1366/1024, drill-downs, non-regression L1/L2) + capture maintenance peuplee DEMO EV
- [x] **Harmonisation icones (demande user post-V2)** (2026-06, verifie par captures FlexMobil+DEMO EV+Analyse flotte):
  - Bibliotheque UNIQUE: lucide-react (outline, deja utilisee) — AUCUN emoji restant dans le dashboard (grep verifie)
  - Semantique fixe: Car=vehicule (KPI actifs, onglet Vehicules, placeholders, recos) · WifiOff=hors ligne · CalendarX=sans activite · Gauge=utilisation · Route=distance/intensite km · AlertTriangle=critique · Fuel=thermique · Droplets=conso estimee · Plug=electrique/kWh · Battery=SoC · BatteryCharging=EV batterie faible · PlugZap=en charge · Wifi=couverture telemetrie · Wrench=maintenance/echeances · Shield=assurance · CheckCircle2=controles · FileText=leasing/document · FlaskConical=bandeau demo
  - IconBadge (pastille circulaire coloree): vert=positif, bleu=info, orange=attention, rouge=critique, gris=neutre — appliquee sur KPI L1, tuiles energie/maintenance, header des drawers (prop icon/tone), eco-line
  - Priorites du jour: icone semantique par ligne (remplace le point) ; deadline rows avec icone par type ; emojis retires de VehiclesTab (colonne energie: Battery + PlugZap 'En charge' / Plug 'Branche') et DashboardLayout (bandeaux demo/partiel)
  - AnalyseFlotteTab: pastille Car verte (flotte active), pastille Route bleue (intensite km) — memes icones = meme information partout
  - PIEGE RECURRENT (4e occurrence): search_replace multi-lignes sur VehiclesTab.jsx a CORROMPU la fin du fichier sans appliquer le changement (succes fantome) — repare via script python atomique. TOUJOURS re-grep + verifier compilation apres edits multi-lignes sur ce fichier
- [x] Bloc COMPTES DEMO sur login (2026-06, verifie e2e capture): bouton pill 'Admin' → pre-remplit demo@logitrak.ch / DemoEV2026! (compte ADMIN tenant demo-ev cree via hash_password existant, must_change=false). Visible UNIQUEMENT si host preview/dashboard.logitrak.ch/localhost ET pas de clientInfo.name — jamais sur les sous-domaines clients reels. LoginPage.jsx
- [x] Conso fictive demo (2026-06, verifie capture + pytest 18/18): tenant demo-ev UNIQUEMENT — fuel_config demo-ev: default_consumption_rate=7.5 (Mongo tenant_config, via mecanisme REEL taux×km, pas de simulateur special). Caddy 900005: roulage utilitaire 35-125 km/j MAIS 0 km depuis 2 jours + reste hors ligne (cas demo preserve). Carte 'Conso thermique estimee' affiche 7,5 L/100 · 2/5 vehicules (Caddy+XC60 PHEV, BEV exclus par is_electric). Rappel: clients reels = chantier 'taux par vehicule' valide, jamais de fictif
- [x] Compteur Recharge + Apercu Documents (2026-06, verifies e2e par captures DEMO EV):
  - Carte 'En charge' (PlugZap vert) dans bloc Energie: visible seulement si capability ev_charging_state existe (demo; masquee en prod = regle 5a), compte vehicules value=='charging', clic → drawer chips batterie+autonomie. Sous-texte 'dernier scan telemetrie' (cache capabilities, pas temps reel strict)
  - Apercu documents fiche vehicule: miniatures images 12x12, icone PDF rouge, bouton Eye → modal z-[90] (image object-contain / PDF iframe blob + mention fallback), telechargement via bouton
  - BUG PREEXISTANT CORRIGE: <img>/<a href> directs ne portent PAS le header X-Act-As-Tenant → 404 en mode Apercu client. Fix: composant AuthedFile (axios blob → ObjectURL + revoke) et download() via api.get blob. NE JAMAIS remettre de <a href> direct vers /documents/
  - Backend: param inline=1 sur GET /vehicles/admin/{tid}/documents/{doc_id} (content_disposition_type inline/attachment) — seul changement backend
  - Seeds PREVIEW demo-ev: 1 PNG + 1 PDF sur la Zoe (900002) pour tests. Drawer SOC moyen EV cliquable (battItems) ajoute aussi

- [x] Icone recharge visible (2026-06): l'icone existait deja (PlugZap animee a cote du nom + 'En charge' colonne Energie, VehiclesTab L761+L63) mais le simulateur demo ne chargait la Tesla que 11h-16h UTC → invisible le matin. Fix demo_simulator._charging: Tesla 'charging' 6h-18h UTC (toujours 1 vehicule en charge visible en journee), ID.4 'plugged_not_charging' 8h-18h UTC. Cache capabilities demo-ev purge + restart backend. Verifie par capture (1 icone charging-icon-*)
- [x] **CLÔTURE Dashboard V2** (2026-06, iteration_27 = validation finale): frontend 7/7 (100%) — régression complète FlexMobil, DEMO EV avec seed maintenance (4 cartes + deltas + critique), fiche véhicule élargie lg:880/xl:980px (7 onglets visibles aux 3 résolutions, onglet Documents OK), cohérence Overview↔Analyse flotte exacte (18/1/22/11=52), test-beta dégradation propre, responsive 1920/1366/1024. Suites pytest de référence 120/120 après fix test fragile test_trackers_12 (attendait exactement 12 trackers sur parc Navixy live → assert >=1). Les 39 échecs 401 restants = infra fixtures d'auth PRÉEXISTANTE (test_analyse_flotte_invariants/test_drivers_ecodriving/test_vehicle_admin/test_groups/test_garage_sync) — hors périmètre V2, à réparer séparément. Rapport final A-H remis.
- [x] **AUDIT Auth SuperAdmin/Dashboard/Liens vs Documents** (2026-06, lecture seule, AUCUN code modifié): rapport complet dans /app/memory/AUDIT_AUTH_DOCUMENTS.md. Constat: chaîne unique cookies HttpOnly → require_user → get_tenant_context, Documents DÉJÀ dessus (pas de système parallèle, aucun credential en URL grâce à AuthedFile blob). Écarts identifiés: pas d'audit_event sur documents, DRIVER lit tous les docs du tenant, lien tenant sans expiration, persistance volume VPS uploads à vérifier. Reco si accès hors-session requis: tokens éphémères de document (TTL 2-5 min, hash SHA-256, scope doc unique) calqués sur tenant_access_tokens — jamais de credential permanent en URL
- [x] **AUDIT CROISÉ Dashboard/Documents/Véhicules/Navixy** (2026-06, lecture seule, AUCUN code/donnée modifié): rapport complet /app/memory/AUDIT_CROISE_DOCUMENTS.md. Constats clés: (1) pas de module Documents autonome (onglet fiche véhicule) ; (2) 3 moteurs d'échéance dupliqués avec BUG SILENCIEUX C1: Overview ignore garage.liability_insurance_valid_till (assurance saisie garage invisible des alertes critiques) alors que fiche+PDF l'utilisent ; (3) pas de véhicule canonique (identité éclatée tracker/garage/caps/vehicle_admin, incohérences réelles Techlift: labels contradictoires + plaque VS 475 676 dupliquée) ; (4) carte grise IA/OCR = RIEN n'existe ; (5) conformité = libellé, pas de moteur ; (6) comptages réels: default 37 trk/27 garage liés/2 non liés/10 sans garage/1 fiche orpheline 781479, flex 52/38/0/14. Plan migration 6 étapes validé dans rapport (1: moteur échéances backend unique corrige C1 ; 2: Document V2 générique ; 3: dual-read dans le moteur seul ; 5: couverture mesurée ; 6: décommission progressif). BLOQUANTS: fixtures pytest auth 39×401 à réparer avant V2, C1 à corriger, identité canonique à décider (pas tracker_id seul)
- [ ] BACKLOG PRIORISÉ VALIDÉ USER (chantiers séparés, ordre imposé): 1) Conducteurs & Éco-conduite (audit complet AVANT code) ; 2) Config conso estimée PAR VÉHICULE + fallback client ; 3) Aperçu Documents (dans chantier Documents) ; 4) Historique snapshots REPORTÉ (attendre besoin réel + EV réels en prod)
- [ ] P2 hors périmètre: réparer fixtures d'auth pytest (39 échecs 401 préexistants)
- [ ] Phase 3 (a valider): exploitation fuel_level dans Analyse/couts, historique sensor graphiques, EV quand vehicule reel compatible
- [ ] Integration Baubit (P2)
- [ ] Responsive mobile/tablette complet (P2)
- [ ] Auto-refresh (P2)
- [ ] Reverse geocoding positions (P3)
