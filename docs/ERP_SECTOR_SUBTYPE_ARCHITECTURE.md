# Architecture sectorielle générique — Secteur → Sous-secteur

Statut : contrat du programme #604. Le socle générique provient de #605 ; `TAILORING_APPAREL` est activé par #607 après livraison de Manufacturing Core #606.

## 1. Objectif

DTSC Platform représente les spécialisations métier selon une hiérarchie stable :

```text
ERP commun
  ↓
Secteur
  ↓
Sous-secteur métier optionnel
```

Le sous-secteur ne remplace jamais le secteur et ne crée jamais une deuxième source de vérité pour les domaines ERP communs.

## 2. Classifications actives

### Commerce Retail

```text
COMMERCE_RETAIL
├── aucun sous-secteur → Commerce retail général
└── SHOP                → Retail général + modules Shop
```

`SHOP` reste actif et rétrocompatible avec les entreprises Retail historiques.

### Manufacturing

```text
MANUFACTURING
├── aucun sous-secteur  → Manufacturing Core général
└── TAILORING_APPAREL   → Manufacturing Core + Couture, confection & habillement
```

`TAILORING_APPAREL` est `ACTIVE` depuis l’itération #607. Son activation n’a eu lieu qu’après livraison des modèles, services, routes, workspaces, permissions, entitlements, migration et QA réels de Manufacturing Core et Couture.

Une entreprise Manufacturing générale ne doit ni voir ni ouvrir les modules Couture. Le couple `MANUFACTURING + TAILORING_APPAREL` est revalidé côté serveur par le runtime d’accès et l’entitlement.

## 3. Sources de vérité

### Registre de classification

`lib/enterprise/business-subtype-registry.ts` est l’autorité inter-secteurs des sous-secteurs disponibles.

Il contient :

- le `sectorCode` propriétaire ;
- le code de sous-secteur ;
- les labels FR/EN ;
- les descriptions FR/EN ;
- le statut d’implémentation `ACTIVE|PLANNED`.

Le registre ne possède pas les règles métier du secteur. Le scope de modules, le provisioning et le runtime restent dans l’implémentation sectorielle concernée.

### Choix d’une organisation

`EnterpriseBusinessSubtypeSelection` persiste uniquement la classification d’une organisation :

- `organizationId` unique ;
- `sectorCode` ;
- `businessSubtypeCode` nullable ;
- version du contrat ;
- origine de la sélection et acteur éventuel.

Cette table n’est pas un second registre : une valeur persistée n’est utilisable que si le registre confirme encore que le sous-secteur est actif et appartient au secteur courant.

## 4. Compatibilité Retail

`lib/enterprise/retail/subtype-registry.ts` reste un adaptateur de compatibilité Retail :

- `RetailBusinessSubtypeCode = "SHOP"` ;
- `RETAIL_MODULE_CODES` garde le scope Shop ;
- les labels/descriptions viennent du registre générique ;
- la lecture historique des configurations Retail est préservée ;
- `TAILORING_APPAREL` n’est jamais interprété comme un sous-type Retail.

`EnterpriseRetailConfiguration.settingsJson` reste le miroir historique du runtime Shop. Il ne devient pas l’autorité inter-secteurs.

## 5. Backfill #605

La migration additive `20260909002000_generic_business_subtype_selection` a créé la table de sélection sans réécrire aucune migration historique.

Règles de backfill :

1. organisation sans `sectorCode` : aucune ligne créée ;
2. secteur non Retail : sous-secteur `null` ;
3. Retail avec marqueur #512 explicite et `businessSubtypeCode = SHOP` : `SHOP` ;
4. Retail avec marqueur #512 explicite sans `SHOP` : `null` ;
5. Retail historique sans marqueur #512 : `SHOP` afin de préserver le comportement antérieur.

Le backfill est idempotent via l’unicité `organizationId` et `ON CONFLICT DO NOTHING`.

L’activation #607 ne transforme pas automatiquement les entreprises Manufacturing historiques en Couture. Elles restent `businessSubtypeCode = null` tant qu’une sélection explicite n’est pas appliquée.

## 6. Règles permanentes

1. Un sous-secteur appartient à un seul secteur canonique.
2. Un code inconnu ou associé au mauvais secteur est refusé côté serveur.
3. Un sous-secteur `PLANNED` n’est jamais proposé comme option active.
4. Un module lié à un sous-secteur actif reste refusé lorsque le tenant n’a pas ce sous-secteur.
5. La preview Administration DTSC et le provisioning utilisent le même résolveur générique.
6. Le Core ERP reste source de vérité pour CRM, Catalog, ventes, achats, Inventory, RH, Finance, projets, actifs, documents, workflows, reporting et IA.
7. Aucune migration historique n’est réécrite.
8. Le stockage de classification reste additif et cohérent avec le couple secteur/sous-secteur.
9. Toute surface visible respecte i18n, mobile, clair/sombre, accessibilité et `docs/FORM_UX_CONTRACT.md`.
10. Aucun module absent du registre, non implémenté, sector-incompatible ou subtype-incompatible ne peut devenir accessible.
11. Administration DTSC ne lit ni ne pré-remplit aucune donnée métier privée du tenant pour déterminer cette classification.

## 7. Flux Administration DTSC

Le formulaire de création ne contient aucune branche Shop ou Couture codée en dur.

1. DTSC sélectionne un secteur.
2. `GET /api/admin/sector-templates` retourne la preview et les sous-secteurs `ACTIVE` autorisés pour ce secteur.
3. La combobox apparaît uniquement lorsqu’au moins une option active existe.
4. La sélection est renvoyée comme `businessSubtypeCode`.
5. Le serveur revalide le couple secteur/sous-secteur.
6. Le wrapper canonique persiste la classification et normalise les modules fail-closed.
7. Pour `TAILORING_APPAREL`, #607 force l’application du template Manufacturing afin que le tenant obtienne bien `ERP commun + Manufacturing Core + Couture`.
8. Pour Retail, le miroir historique reste synchronisé pendant la compatibilité Shop.

Ainsi `COMMERCE_RETAIL → SHOP` et `MANUFACTURING → TAILORING_APPAREL` utilisent la même mécanique générique, mais chaque domaine conserve son provisioning métier propre.

## 8. Évolution du programme

### #605 — socle générique

- registre cross-sector ;
- persistance `EnterpriseBusinessSubtypeSelection` ;
- backfill Retail ;
- Administration DTSC pilotée par API ;
- `TAILORING_APPAREL` initialement `PLANNED`.

### #606 — Manufacturing Core

- BOM, gammes, centres de travail ;
- ordres et besoins matières ;
- exécution, qualité, rebuts ;
- intégration Catalog/Inventory/Procurement/RH/Temps/Actifs ;
- outils IA Manufacturing en lecture.

### #607 — Couture, confection & habillement

- `TAILORING_APPAREL` devient `ACTIVE` ;
- scope Couture réel et subtype-gated ;
- mensurations, styles/patrons, gradation, matières, coupe, essayages, retouches, vêtements et finition ;
- aucune source parallèle CRM/stock/ventes/achats/Finance/RH ;
- IA Couture uniquement `READ` ;
- architecture détaillée dans `docs/ERP_TAILORING_APPAREL.md`.

## 9. Rollback

Le rollback applicatif reste traçable par PR/hotfix. Pour #607, désactiver/revenir au code Couture ne nécessite pas de supprimer les données ERP communes ni de modifier la classification historique Retail.

Les tables `EnterpriseBusinessSubtypeSelection` et les tables Couture sont additives. Elles peuvent rester physiquement présentes lors d’un rollback applicatif, avec les modules Couture désactivés et les nouvelles écritures arrêtées. Toute suppression physique future nécessite une release distincte et une migration explicite.

Aucune donnée métier du tenant n’est supprimée ou transformée par #605. #607 n’autorise pas non plus un rollback destructif des données Couture déjà créées.

## 10. Dette de contribution

Dette créée attendue : **Aucune**.

Le miroir `EnterpriseRetailConfiguration.settingsJson` reste une compatibilité historique bornée au cutover Retail. L’autorité de classification inter-secteurs est le registre générique + la sélection d’organisation. Les spécialisations comme sur mesure, prêt-à-porter et mixte restent des paramètres métier, jamais un quatrième niveau de classification.
