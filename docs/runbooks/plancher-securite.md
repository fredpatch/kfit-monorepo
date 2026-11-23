---
titre: Plancher de sécurité du runtime
public: exploitation, développeur
statut: à jour
vérifié-sur: d2fc5df
couvre: [SEC-01, S7.4a, S9A.2]
---

# Plancher de sécurité du runtime

Sources : `packages/server/src/security/security-floor.ts`, `runtime-floor.startup.ts`, `packages/server/scripts/security/check-runtime-floor.mjs`.

## 1. Ce que c'est

Le plancher de sécurité est la liste des failles connues de **Node.js lui-même**, avec, pour chaque ligne majeure prise en charge, la première version corrigée. Les failles des paquets npm relèvent de `npm audit`, pas du plancher.

Entrées actuelles, dans l'ordre de publication :

| Faille                                          | Publication | Versions minimales              | Rôle                                                          |
| ----------------------------------------------- | ----------- | ------------------------------- | ------------------------------------------------------------- |
| `CVE-2026-111497` (Node2Shell, décodeur Brotli) | 2026-10-22  | `22.23.4`, `24.22.1`, `26.12.1` | corrigée par la publication de sécurité d'octobre 2026        |
| `CVE-2026-123863`                               | 2026-11-11  | `22.23.5`, `24.22.3`, `26.13.1` | publication de sécurité de novembre 2026 : relève le plancher |

Plancher effectif de K'FIT (la version minimale la plus haute de chaque ligne) : **`22.23.5`, `24.22.3`, `26.13.1`**. Chaque faille garde ses propres versions corrigées : la publication de novembre ne modifie pas l'entrée Node2Shell, elle ajoute une entrée. K'FIT (`.nvmrc`, images Docker) est épinglé sur `22.23.5`.

Une machine sous ce plancher (par exemple un poste resté en Node `24.22.1`) est volontairement refusée par `npm run security:check` : mettre Node à jour (§ 4), ne jamais abaisser le plancher pour la faire passer.

Règles :

- Une ligne majeure absente d'une entrée (Node 20, Node 23…) est **non prise en charge** : refusée.
- Une version illisible (préversion, suffixe de build) est refusée.

Trois endroits lisent cette même table :

| Où                                                                      | Effet sous le plancher                                                                                                   |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `npm run security:check` (et la CI, juste après l'installation de Node) | `✖ security:check - Node <version> is below the runtime security floor:` puis une ligne par faille ; code de sortie `1`. |
| Démarrage en production                                                 | Refus avec le code `SECURITY_FLOOR` ([démarrage production](demarrage-production.md)).                                   |
| Démarrage en développement                                              | Un avertissement `SECURITY_FLOOR_NOT_MET {…}` ; l'API démarre quand même.                                                |

## 2. Vérifier

```bash
npm run security:check
```

Attendu : `✔ security:check - Node v22.23.5 meets the runtime security floor` (avec la version installée), code `0`.

## 3. Ajouter la prochaine faille

1. Ajouter **une entrée** à `SECURITY_FLOOR` dans `packages/server/src/security/security-floor.ts` :

   ```ts
   { id: "CVE-AAAA-NNNNN", component: "node", minimumByLine: { 22: "22.x.y", 24: "24.x.y", 26: "26.x.y" }, publishedAt: "AAAA-MM-JJ", note: "résumé court" },
   ```

   Lister **chaque** ligne majeure encore prise en charge. Une ligne oubliée devient « non prise en charge » et sera refusée partout.

2. Ajouter un test dans `packages/server/src/security/security-floor.test.ts` : une version juste sous le minimum échoue, et la version minimale passe, pour chaque ligne.
3. Mettre à jour Node (§ 4) si la version actuelle passe sous le nouveau plancher.
4. Lancer `npm run security:check`, `npm test`, puis `npm run docs:check`.
5. Mettre à jour ce document (`vérifié-sur`, entrée actuelle).

Aucun autre fichier à modifier : le script de CI et le contrôle de démarrage lisent la même table.

## 4. Mettre à jour Node

1. `.nvmrc` : nouvelle version exacte (ex. `22.23.5`).
2. `package.json` (racine) : `engines.node` à `>=<nouvelle version>`.
3. CI : rien à changer. `.github/workflows/ci.yml` lit `.nvmrc` (`node-version-file`), puis lance le contrôle du plancher.
4. Images Docker : étiquette exacte et corrigée, jamais une étiquette flottante (ex. `node:22.23.5-bookworm-slim`, jamais `node:22`). Fichiers : `packages/server/Dockerfile` (étapes `deps` et `runtime`) et `packages/client/Dockerfile` (étape `build`), alignés sur `.nvmrc`.
5. Localement : installer la version (`nvm install` / `nvm use`), puis `npm ci`, `npm run security:check`, `npm test`.

## 5. Revue mensuelle

Chaque mois :

- `npm audit` à la racine (failles des paquets) ;
- relire les avis de sécurité de Node.js et ajouter une entrée au plancher si une faille touche une ligne prise en charge (§ 3).
