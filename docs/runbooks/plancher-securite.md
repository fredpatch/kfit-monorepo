---
titre: Plancher de sécurité du runtime
public: exploitation, développeur
statut: à jour
vérifié-sur: d2fc5df
couvre: [SEC-01, S7.4a]
---

# Plancher de sécurité du runtime

Sources : `packages/server/src/security/security-floor.ts`, `runtime-floor.startup.ts`, `packages/server/scripts/security/check-runtime-floor.mjs`.

## 1. Ce que c'est

Le plancher de sécurité est la liste des failles connues de **Node.js lui-même**, avec, pour chaque ligne majeure prise en charge, la première version corrigée. Les failles des paquets npm relèvent de `npm audit`, pas du plancher.

Entrée actuelle : `CVE-2026-111497` (décodeur Brotli), versions minimales `22.23.4`, `24.22.1`, `26.12.1`.

Règles :

- Une ligne majeure absente de l'entrée (Node 20, Node 23…) est **non prise en charge** : refusée.
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

Attendu : `✔ security:check - Node v22.23.4 meets the runtime security floor` (avec la version installée), code `0`.

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

1. `.nvmrc` : nouvelle version exacte (ex. `22.23.4`).
2. `package.json` (racine) : `engines.node` à `>=<nouvelle version>`.
3. CI : rien à changer. `.github/workflows/ci.yml` lit `.nvmrc` (`node-version-file`), puis lance le contrôle du plancher.
4. Image Docker : étiquette exacte et corrigée, jamais une étiquette flottante (ex. `node:22.23.4-alpine`, jamais `node:22`). **Sprint 9** : l'image n'existe pas encore.
5. Localement : installer la version (`nvm install` / `nvm use`), puis `npm ci`, `npm run security:check`, `npm test`.

## 5. Revue mensuelle

Chaque mois :

- `npm audit` à la racine (failles des paquets) ;
- relire les avis de sécurité de Node.js et ajouter une entrée au plancher si une faille touche une ligne prise en charge (§ 3).
