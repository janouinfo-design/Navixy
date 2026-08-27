# AUDIT CROISÉ — DASHBOARD / DOCUMENTS / VÉHICULES / NAVIXY
Date : juin 2026 · Lecture seule stricte (code + Mongo lecture + GET API + impersonation flex ouverte/fermée). AUCUN code modifié, AUCUNE donnée modifiée.

## Constats structurants
1. **Pas de module Documents autonome** : Documents = onglet fiche véhicule, fichiers dans `vehicle_admin.documents[]` par `tracker_id`. Pas de page centrale, ni échéance documentaire, ni conformité, ni OCR.
2. **3 moteurs d'échéance** : OverviewTab.jsx:351-387 (JS) · VehiclesTab.jsx:10-17 (JS) · server.py:808-821 `_echeance` (PDF). **Incohérence avérée C1**.
3. **Pas de véhicule canonique** : identité éclatée tracker label / garage Navixy / cache capabilities (6 h) / vehicle_admin.general (fallback).

## C1 — BUG SILENCIEUX PROD (priorité)
- Overview (maint, l.367) : échéance assurance = `rec.assurance.date_fin` SEUL (vehicle_admin).
- Fiche (l.652,843) + PDF (server.py:927) : `garage.liability_insurance_valid_till || rec.assurance.date_fin`.
- → une RC saisie uniquement dans le garage est INVISIBLE des alertes critiques/priorités/watch de la Vue générale. Fix cible : moteur d'échéances backend unique avec `garage || interne`.

## Doublons
- C2 : moteur d'échéance ×3 (déjà divergé).
- C3 : police/validité RC en 2 endroits (garage autoritaire + vehicle_admin.assurance fallback ; résidus legacy possibles après liaison garage — vu sur demo-ev 900002/900005).
- C4 : identités contradictoires réelles chez Techlift (default) : tid 2842571 label «2-Toyota Proace_Réserve monteur_VS 600 739» vs garage «Martins Tiago/Renault Kangoo/VS 475 676» ; tid 2880036 idem ; plaque VS 475 676 dupliquée (lié 2842571 + non lié 222732). Dashboard affiche le label TRACKER, fiche affiche le GARAGE.
- C5 : VIN ×3 (garage/OBD/general.vin) — conflit détecté par capabilities (`vin.conflict`), bon mécanisme.
- C6 : plaque copiée dans cache capabilities (TTL 6 h) → stale possible sur Dashboard.
- C7 : fichier catégorisé (ex. «Assurance») sans AUCUN lien avec la section structurée ni l'échéance — le vrai chantier Documents V2.

## Comptages réels (mesurés preview, juin 2026)
- default/Techlift : 37 trackers · 27 garage liés · 2 garage non liés · 10 trackers sans garage · 1 fiche vehicle_admin ORPHELINE (tid 781479 absent du parc) · VIN et valid_till garage vides.
- flex/FlexMobil : 52 trackers · 38 garage liés · 0 non liés · 14 trackers sans garage · labels cohérents · VIN partiels.
- vehicle_admin total : 7 docs (1 default orpheline, 1 flex avec 1 doc «Carte grise» jpg, 5 demo-ev SIMULATION).
- tenant_config : uniquement demo-ev (fuel 7.5 L/100, 2 CHF/L).

## Échéances (inventaire)
| Type | Source | Overview | Fiche | PDF |
|---|---|---|---|---|
| Assurance RC | garage‖interne | ⚠️ interne SEUL | ✅ | ✅ |
| Leasing | leasing.date_fin | ✅ | ✅ | ✅ |
| Contrôles | controles[].due_date | ✅ (critique si échu) | ✅ | ✅ |
| Maintenance | general.prochaine_maintenance | ✅ | ✅ | ❌ |
| Expertise | general.prochaine_expertise | ✅ | ✅ | ❌ |
| Carte grise | AUCUNE date d'expiration | — | — | — |
| Casco free_insurance_valid_till | garage — JAMAIS lu par l'UI | — | — | — |
| Permis chauffeurs | n'existe pas | — | — | — |
Seuils : échu=rouge, <30 j=orange ; critique (2b) = assurance/contrôle échu (codé frontend).

## Conformité
Pas de moteur : «conforme» = libellé quand 0 échéance <30 j. Pas de docs obligatoires ni profils véhicule. Cible : Documents V2 = source (profils documentaires par type véhicule, statut conforme/incomplet/non conforme calculé par le moteur unique). Note : décision 4a actuelle = docs manquants omis ; V2 permettra d'exprimer «manquant».

## Coûts
- Carburant estimé : analytics_engine taux×km×prix (tenant_config) — CostsTab + Overview. Chantier validé : taux PAR VÉHICULE + fallback client.
- leasing.loyer_mensuel + assurance.franchise : saisis fiche, JAMAIS agrégés. Risque futur double comptage TCO si Documents V2 porte aussi les montants — à arbitrer avant TCO. Coût maintenance/pièces : n'existe nulle part.

## Carte grise IA
RIEN n'existe (grep OCR/vision/extract vide) : ni caméra, ni OCR, ni extraction, ni validation, ni écriture véhicule, ni historique. Seule la saisie manuelle carte_grise (numero, titulaire, date_emission, canton, notes) + fichier catégorisé sans lien. Propriétaire futur : Documents V2.

## Documents (modèle actuel)
`documents[] = {id, filename, category, size, content_type, uploaded_at}` — catégories UI figées : Carte grise, Leasing, Assurance, Contrôle, Facture, Autre. Manquent : expiry_date, statut, lien section, montant, historique, page centrale, filtres/recherche, docs chauffeurs, audit trail.

## Navixy (mapping)
- Writable utilisés (vehicle/update, read-modify-write complet) : label, model, reg_number, vin, manufacture_year, color, liability_insurance_policy_number/valid_till, free_insurance_policy_number/valid_till, additional_info, tracker_id (link/unlink), avatar upload.
- Read-only exploités : type, subtype, garage_organization_name, fuel_type, fuel_grade, avatar_file_name.
- Inutilisé UI : free_insurance_* (casco).
- Sync : AUCUN worker — lecture à chaque chargement, écriture immédiate. Conflit = dernière écriture gagne (fenêtre read→update). Modif côté Navixy visible au prochain chargement SAUF plaque Dashboard (cache caps 6 h).

## Dette legacy (NE PAS SUPPRIMER)
assurance.date_fin/police_no · leasing.date_fin · controles[] · general.prochaine_maintenance/expertise · general.marque/modele/annee/vin (fallback non-garage) · carte_grise.* — lecteurs : Overview/fiche/PDF ; endpoints /vehicles/admin* + /export/pdf. Tests : test_vehicle_admin.py fixtures auth CASSÉES (39×401 préexistants) → filet troué, à réparer AVANT Documents V2. Fiche orpheline 781479 (default) : nettoyage manuel futur.

## Sources de vérité cibles
Plaque/marque/modèle/photo=garage Navixy↔canonique · VIN=canonique (contrôle OBD conservé) · Motorisation=override>garage (inchangé) · Carte grise/Assurance/Leasing (PDF+champs+expirations)=Documents V2 (RC propagée vers garage via sync existante) · Contrôles/maintenance=Maintenance (futur) · Permis=Conducteurs (futur) · KPI=Dashboard CONSOMME le moteur d'échéances.

## Dashboard : verdicts
GARDER tout L1/L2/L3 + drawers + éco-line. GARDER MAIS CHANGER DE SOURCE : panel Maintenance & conformité + alertes critiques + priorités + watch (→ moteur backend unique). SUPPRIMER À TERME : calcul d'échéances frontend OverviewTab l.351-387. Rien à déplacer vers Documents (Dashboard sain, synthèse pure).

## Architecture cible
VÉHICULE CANONIQUE (identité + liaisons navixy_vehicle_id/tracker_id nullable) ← NAVIXY (télématique+garage) · DOCUMENTS V2 (fichiers+OCR+conformité) · MAINTENANCE · CONDUCTEURS → MOTEUR D'ÉCHÉANCES UNIQUE (backend) → DASHBOARD (synthèse/KPI/drill-down) ; futur TCO consomme montants Documents + carburant analytics sans double comptage.

## Plan de migration
1. Moteur d'échéances backend unique (corrige C1/C2 immédiatement, sans toucher aux données) — Overview/fiche/PDF le consomment.
2. Document V2 générique (expiry_date, issue_date, type structuré, statut, montant optionnel) — compatible documents[] existants (7 fichiers), migration lazy.
3. Dual-read DANS LE MOTEUR UNIQUEMENT : doc_V2.expiry_date ‖ legacy, réponse annotée source: document|legacy.
4. Page centrale Documents ensuite (Dashboard déjà migré de fait).
5. Couverture mesurée par tenant (n_document/n_legacy/n_absent par type) visible super-admin ; sortie = 100 % sur N semaines.
6. Décommission legacy progressif : gel saisie → suppression champ/champ, tenant/tenant, validation user. Durée dual-read : plusieurs mois (dépend ressaisie clients).

## Risques de régression
Échéances touchent 4 surfaces (Overview/fiche/PDF/alertes) · fixtures pytest cassées = pas de filet · sync RC garage doit rester à écriture unique · données sales réelles (C4) → JAMAIS de rapprochement auto par plaque, écran de rapprochement manuel · cache caps 6 h · tout endpoint V2 via get_tenant_context.

## À NE JAMAIS DÉVELOPPER DEUX FOIS (module propriétaire)
moteur d'échéance=backend unique · moteur de conformité=Documents V2 · stockage assurance/leasing/carte grise=Documents V2 · import carte grise+OCR+classification=Documents V2 · calcul maintenance=Maintenance · TCO=module futur unique · identité véhicule=véhicule canonique (sync garage).

## BLOQUANTS avant Documents V2
1. Réparer fixtures pytest auth (39×401) — filet vehicle_admin inopérant.
2. Corriger C1 via l'étape 1 (moteur unique) — bug silencieux de prod.
3. Décider l'identité canonique : Documents V2 ne doit PAS se rattacher au seul tracker_id (véhicules garage non liés + véhicules sans tracker resteraient sans documents).
