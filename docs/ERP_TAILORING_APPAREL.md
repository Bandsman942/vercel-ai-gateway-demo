# ERP Tailoring Apparel — Couture, confection & habillement

Statut : contrat produit et technique de l’itération #607 du programme #604.

## 1. Classification

`TAILORING_APPAREL` est un sous-secteur `ACTIVE` de `MANUFACTURING`.

```text
ERP commun
  ↓
MANUFACTURING
  ↓
TAILORING_APPAREL
```

Les modes **sur mesure**, **prêt-à-porter** et **mixte** sont des paramètres d’exploitation de l’atelier. Ils ne créent aucun niveau de classification supplémentaire.

Une entreprise Manufacturing sans sous-secteur conserve Manufacturing Core. Une entreprise `MANUFACTURING + TAILORING_APPAREL` reçoit les modules ERP communs, Manufacturing Core puis les modules Couture.

## 2. Source de vérité par domaine

| Besoin Couture | Source canonique | Extension Couture |
| --- | --- | --- |
| Client | CRM / `EnterpriseBusinessParty` | profils de mensurations versionnés |
| Article / produit | Catalog / `EnterpriseCatalogItem` | style, patron, profil tissu/fourniture |
| Stock | Inventory | aucune table de stock Couture |
| Nomenclature | Manufacturing / BOM | rattachement optionnel du style |
| Gamme | Manufacturing / Routing | rattachement optionnel du style |
| Ordre de production | Manufacturing | plans de coupe, essayages, bundles, finition |
| Besoin matière | Manufacturing | rattachement du plan de coupe |
| Rebut physique | Manufacturing + Inventory | observation Couture uniquement ; le mouvement physique passe par le rebut Manufacturing |
| Qualité | Manufacturing Quality Control | finition reliée au contrôle `PASS` |
| Collaborateur | Human Resources | responsable de mesure, essayage, retouche ou finition |
| Centre de travail | Manufacturing | position courante d’un bundle |
| Vente / commande client | domaine commercial commun | aucune vente Couture parallèle |
| Achat / fournisseur | Procurement commun | aucune source parallèle |
| Finance / paiement | Finance commun | aucune source parallèle |

Cette matrice est opposable : Couture ne doit jamais recréer un master client, article, stock, fournisseur, employé, vente, achat, facture ou paiement.

## 3. Modules Couture

Les modules actifs sont :

1. `TAILORING_OVERVIEW` — vue d’ensemble atelier ;
2. `TAILORING_MEASUREMENTS` — mensurations historisées ;
3. `TAILORING_STYLES_PATTERNS` — styles et patrons ;
4. `TAILORING_SIZE_GRADING` — tailles et gradation ;
5. `TAILORING_MATERIAL_PROFILES` — profils techniques tissus/fournitures ;
6. `TAILORING_CUTTING_PLANS` — plans de coupe ;
7. `TAILORING_FITTINGS` — essayages ;
8. `TAILORING_ALTERATIONS` — retouches ;
9. `TAILORING_GARMENT_TRACKING` — lots/pièces de vêtements ;
10. `TAILORING_FINISHING` — finition et préparation à la livraison.

Tous exigent `MANUFACTURING` et le sous-secteur `TAILORING_APPAREL`. Le runtime, les entitlements et la navigation appliquent ce contrôle côté serveur.

## 4. Parcours sur mesure

Parcours de référence :

```text
Client CRM
→ profil de mensurations versionné
→ style/patron Catalogue
→ BOM + gamme Manufacturing
→ ordre de production
→ plan de coupe
→ bundle vêtement
→ essayage
→ retouche si ajustements requis
→ contrôle qualité Manufacturing
→ finition
→ READY_FOR_DELIVERY
→ livraison commerciale commune
```

Un essayage terminé ne peut générer une retouche que lorsque son résultat est `ADJUSTMENTS_REQUIRED`. Une finition `READY` exige la checklist de finition et un contrôle qualité Manufacturing `PASS`.

`READY_FOR_DELIVERY` signifie que le vêtement est prêt à être remis au client. Ce statut ne remplace jamais l’exécution de livraison, la facture ou le paiement des domaines ERP communs.

## 5. Parcours prêt-à-porter

Le prêt-à-porter s’appuie sur les styles/patrons, tailles/gradation, BOM, gammes et ordres Manufacturing. Les profils de mensurations client ne sont pas requis pour une production standard par taille.

Les tailles sont des données métier du style. Elles ne deviennent ni des sous-secteurs ni des articles de stock parallèles : le produit fini demeure un article du Catalogue commun et le stock reste Inventory.

## 6. Plans de coupe et matières

Un plan de coupe est toujours lié à un ordre Manufacturing et à un tissu provenant du Catalogue commun avec suivi Inventory actif.

La quantité coupée, la perte observée et l’efficacité du placement servent à suivre le processus atelier. Lorsqu’une perte physique doit diminuer le stock, elle doit être enregistrée via le mécanisme de rebut Manufacturing afin de produire le mouvement Inventory canonique `PRODUCTION_SCRAP`.

Cette séparation évite une deuxième vérité de stock dans Couture.

## 7. Mensurations et confidentialité métier

Les mensurations sont versionnées. Une nouvelle prise ne réécrit pas silencieusement l’historique précédent.

Chaque profil appartient à un `EnterpriseBusinessParty` du même `organizationId`. Le serveur revalide le client et, lorsqu’il est indiqué, le collaborateur qui a effectué la prise.

Les outils IA et les écrans n’obtiennent ces informations que si l’utilisateur possède également les droits du module CRM requis. Un accès à Couture ne sert jamais de pont vers les clients d’un utilisateur non autorisé.

## 8. Permissions et rôles atelier

Le provisioning Couture fournit des postes atelier orientés métier : responsable atelier, coupe, couture, essayage et contrôle qualité habillement.

Les permissions restent résolues via le moteur Enterprise normal. Les modules Couture utilisent les préfixes `enterprise.tailoring.*`; les actions liées à un autre domaine exigent en plus le droit correspondant sur ce domaine.

Exemples :

- prendre une mensuration : Couture + CRM ;
- associer un tissu : Couture + Catalog + Inventory ;
- créer un plan de coupe : Couture + Production Orders + Material Requirements + Inventory ;
- affecter une retouche : Couture + Fittings + HR si un collaborateur est renseigné ;
- valider une finition : Couture + Quality Control.

## 9. Sécurité et isolation multi-tenant

Toutes les données Couture portent `organizationId` ou une relation tenant-scoped équivalente. Les références reçues du client sont revalidées côté serveur dans le même tenant.

Une requête mutante exige le contexte organisation actif, same-origin, rate limit, validation Zod, permission de module et transaction lorsque le workflow le nécessite. Les erreurs exposées aux utilisateurs restent métier ; les détails Prisma/stack ne sont pas rendus au client.

Le filtre `applicableBusinessSubtypes` est appliqué par le registre, le runtime d’accès et l’entitlement. Une simple ligne `EnterpriseModule.isEnabled=true` ne rend donc pas Couture accessible à une entreprise Manufacturing générale.

## 10. IA entreprise

L’IA Entreprise reçoit dix outils Couture, tous en mode `READ` : overview, mensurations, styles, gradation, matières, coupe, essayages, retouches, vêtements et finition.

Chaque outil :

- exige le contexte `ORGANIZATION` actif ;
- exige `MANUFACTURING + TAILORING_APPAREL` ;
- exige le module Couture concerné et ses modules sources nécessaires ;
- exige `ENTERPRISE_AI.TOOLS.READ` ;
- est borné à un maximum de 25 éléments par exécution ;
- ne crée, ne modifie et ne supprime aucune donnée.

Aucun outil Couture de mutation n’est livré dans #607.

## 11. UX, i18n et formulaires

Le workspace est accessible via `/enterprise-tailoring/[moduleCode]`. Il réutilise les primitives `ModuleWorkspace`, `ModuleMetrics`, `ProfessionalTabs`, `Field`, `NativeSelect` et le toast global.

Les références métier existantes sont proposées comme sélections depuis leurs sources canoniques ; aucun identifiant technique n’est demandé à l’utilisateur. Les enums métier disposent de choix contrôlés localisés FR/EN.

Les formulaires restent ouverts avec leurs valeurs lorsqu’une mutation échoue. Les contrôles doivent être validés en mobile 320/360/375/390/414 px, tablette 768 px, desktop 1024 px et plus, clair/sombre et navigation clavier.

## 12. Migration

La migration `20260910001000_tailoring_apparel` est additive. Elle crée uniquement les extensions Couture et leurs relations internes tenant-aware.

Elle ne supprime ni ne réécrit aucune migration historique et ne transforme aucune donnée métier existante.

## 13. Rollback

Le **rollback applicatif** consiste à désactiver les modules Couture, revenir au registre/runtime précédent via une PR/hotfix traçable et laisser les tables additives présentes sans nouvelles écritures.

Il ne faut pas :

- réécrire la migration `20260910001000_tailoring_apparel` ;
- supprimer les tables en urgence ;
- effacer les mensurations, plans de coupe, essayages ou historiques de retouches déjà créés ;
- modifier les données CRM, Catalog, Inventory ou Manufacturing pour simuler un retour arrière.

Une éventuelle suppression physique future nécessiterait une release distincte, sauvegarde/export, preuve de non-utilisation et migration explicite.

## 14. E2E propriétaire attendu

Le scénario principal doit couvrir :

```text
création entreprise Couture
→ ERP commun + Manufacturing + Couture
→ client CRM
→ mensurations
→ style/patron + BOM/gamme
→ ordre de production
→ plan de coupe
→ bundle
→ essayage
→ retouche
→ qualité PASS
→ finition READY
→ READY_FOR_DELIVERY
```

Il faut également vérifier qu’une entreprise `MANUFACTURING` sans `TAILORING_APPAREL` ne voit ni n’ouvre les modules Couture, et qu’aucune donnée d’un second tenant n’est accessible.

## 15. Dette de contribution

Dette créée attendue : **Aucune**.

Les modes sur mesure, prêt-à-porter et mixte restent une configuration métier. Les champs de processus Couture ne deviennent jamais une seconde source de vérité pour les domaines ERP communs.
