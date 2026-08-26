# AUDIT — Authentification SuperAdmin / Dashboard / Liens d'accès vs Documents
Date : juin 2026 · Lecture seule, aucun code modifié.

## Chaîne unique d'authentification
- `server.py:56-58` : `api_router` (`/api/*`) sous `Depends(require_user)` global ; `public_router` pour login, `/api/access/{token}`, `/api/client/info`.
- `get_current_user` (`auth.py:142-170`) : cookie `access_token` prioritaire, fallback `Authorization: Bearer`. JWT HS256 (`JWT_SECRET`), type `access` requis.
- Deux identités : utilisateur réel (`db.users`, vérif `is_active`) et utilisateur virtuel de lien (`sub=link:<id>` → re-lookup `tenant_access_tokens` non révoqué + client actif à CHAQUE requête → `_virtual_link_user`, rôle MANAGER (edit) ou READ_ONLY, `via_link: True`).

## Tokens : TTL / stockage
| Token | TTL | Client | Serveur |
|---|---|---|---|
| Access JWT | 480 min | Cookie HttpOnly Secure SameSite=Lax | stateless |
| Refresh JWT | 7 j, rotation | Cookie HttpOnly Secure SameSite=Lax | `db.sessions` hash SHA-256, index TTL, détection réutilisation → révocation globale |
| Lien tenant | **aucune expiration**, révocable, 1 actif/tenant | jamais stocké (affiché 1×) | `tenant_access_tokens` hash SHA-256 |
| Impersonation | 60 min serveur (`server.py:111-128`) | localStorage `{tenant,name,logId}` sans secret | `impersonation_logs`, session ouverte requise, auditée |
- Mode lien/iframe : cookies `SameSite=None; Partitioned` (CHIPS) via `_set_cookies(iframe=True)`.

## Résolution tenant (backend autoritaire)
- `get_tenant_context` (`server.py:131-153`) : tenant = JWT (`tenant_id`), jamais le navigateur. Sous-domaine ≠ tenant token → 403. SUPER_ADMIN : `X-Act-As-Tenant` seulement avec session d'impersonation ouverte et non expirée, sinon sous-domaine, sinon `default`. `navixy_hash` déchiffré (Fernet) côté serveur uniquement.

## RBAC (`make_require_user`, `auth.py:173-211`)
- Gate `must_change_password` ; écritures bloquées READ_ONLY/DRIVER ; garde anti-CSRF Origin↔Host pour `via_link` (nécessaire car SameSite=None) ; vérif client actif ; **gating modules par préfixe** (`MODULE_PATH_MAP`) — `/api/vehicles/admin` → module `vehicules` (Documents couvert).
- `/api/admin/*` : `require_role("SUPER_ADMIN")` + garde optionnelle `ADMIN_HOST` (non défini en preview).

## Flux /api/access/{token} (`server.py:260-280`)
- Lookup hash SHA-256 → client actif → vérif domaine → session + JWT `link:<id>` → **302 vers `/`** cookies iframe.
- Nettoyage URL : 302, `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, filtre logs uvicorn `[REDACTED]` (`server.py:67-82`). Aucune route SPA `/access/<token>`. Risque résiduel : historique navigateur.
- Révocation d'un lien = coupure immédiate (re-lookup à chaque requête + au refresh).

## Documents (`vehicle_admin.py:222-278`) — déjà sur la même chaîne
- ✅ Auth héritée api_router ; tenant via `get_tenant_context` ; scope `{tenant, tracker_id}` Mongo + disque `/app/backend/uploads/{tenant}/{tracker_id}/`.
- ✅ Aucun credential en URL : frontend `AuthedFile` (`VehiclesTab.jsx:328-338`) fetch blob axios (cookies + header impersonation) → `URL.createObjectURL`, révoqué au démontage. Download idem (`download()`).
- ✅ `_safe_name` anti-traversal, 25 Mo max chunks 1 Mo, `?inline=1` → Content-Disposition inline.
- ❌ Écarts : aucun `audit_event` upload/download/delete ; DRIVER lit les documents de tous les véhicules du tenant ; stockage disque local (persistance volume VPS à vérifier avant extension).

## Architecture unifiée recommandée (sans credential permanent)
1. Conserver la chaîne unique cookies → require_user → get_tenant_context (déjà le cas). Pattern `AuthedFile` pour tout aperçu.
2. Accès hors-session (nouvel onglet / partage) si besoin : `db.document_access_tokens` calqué sur `tenant_access_tokens` MAIS avec **TTL 2-5 min** (index TTL), hash SHA-256, scope `{tenant, tracker_id, doc_id}`, option usage unique. Émission authentifiée ; redemption publique `GET /api/vehicles/admin/documents/redeem/{token}` qui streame sans cookie ni session, `Cache-Control: no-store`, redaction logs.
3. Ajouter audit `DOC_UPLOADED/DOC_DOWNLOADED/DOC_DELETED/DOC_LINK_*` via `audit_event`.
4. Arbitrage utilisateur : restreindre DRIVER à son véhicule affecté ?
5. Extension majeure → vérifier volume VPS `/app/backend/uploads` ; object storage cible si le chantier grossit.
