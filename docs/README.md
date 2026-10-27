---
titre: Documentation K'FIT
public: coach, administrateur, exploitation, développeur, juriste
statut: à jour
vérifié-sur: d2fc5df
couvre: [DOC-01a]
---

# Documentation K'FIT

`docs/` est la source unique de la documentation, versionnée avec le code. Les guides destinés au coach seront aussi publiés en documents partageables pour la recette.

| Document                                                                                | Public                    | Statut    | Vérifié sur |
| --------------------------------------------------------------------------------------- | ------------------------- | --------- | ----------- |
| [Guide du coach](guides/guide-coach.md)                                                 | coach                     | brouillon | e0d6158     |
| [Guide de l'administrateur](guides/guide-administrateur.md)                             | administrateur            | brouillon | e0d6158     |
| [Runbooks (index)](runbooks/README.md)                                                  | exploitation              | à jour    | d2fc5df     |
| [Démarrage en production](runbooks/demarrage-production.md)                             | exploitation              | à jour    | 4db73be     |
| [Premier compte administrateur](runbooks/premier-compte-administrateur.md)              | exploitation              | brouillon | e0d6158     |
| [Sauvegarde et restauration](runbooks/sauvegarde-restauration.md)                       | exploitation              | à jour    | 7b1d467     |
| [Plancher de sécurité](runbooks/plancher-securite.md)                                   | exploitation, développeur | à jour    | d2fc5df     |
| [Incident](runbooks/incident.md)                                                        | exploitation              | brouillon | d2fc5df     |
| [Rotation des secrets](runbooks/rotation-secrets.md)                                    | exploitation              | brouillon | d2fc5df     |
| [Panne de dépendance](runbooks/panne-dependances.md)                                    | exploitation              | brouillon | d2fc5df     |
| [Échec de job](runbooks/echec-job.md)                                                   | exploitation              | brouillon | bb2e993     |
| [Manuel de maintenance](maintenance/manuel-maintenance.md)                              | développeur, exploitation | brouillon | d2fc5df     |
| [Architecture (EN)](architecture/README.md)                                             | développeur               | à jour    | d2fc5df     |
| [Codes d'erreur](reference/codes-erreur.md)                                             | développeur               | à jour    | généré      |
| [Variables d'environnement](reference/variables-environnement.md)                       | exploitation              | à jour    | généré      |
| [Scripts npm](reference/scripts-npm.md)                                                 | développeur               | à jour    | généré      |
| [Jobs planifiés et scripts d'exploitation](reference/jobs.md)                           | exploitation, développeur | à jour    | bb2e993     |
| [Conformité (dossier)](conformite/README.md)                                            | juriste                   | brouillon | d2fc5df     |
| [Registre des traitements](conformite/registre-traitements.md)                          | juriste                   | brouillon | d2fc5df     |
| [Politique de conservation](conformite/politique-conservation.md)                       | juriste                   | brouillon | d2fc5df     |
| [Mesures de sécurité](conformite/mesures-securite.md)                                   | juriste                   | brouillon | d2fc5df     |
| [Sous-traitants](conformite/sous-traitants.md)                                          | juriste                   | brouillon | d2fc5df     |
| [Notice de confidentialité (brouillon)](conformite/notice-confidentialite-brouillon.md) | juriste                   | brouillon | d2fc5df     |
| [Recette](recette/README.md)                                                            | coach, développeur        | brouillon | d2fc5df     |
| [Notes de version](notes-de-version/README.md)                                          | coach, administrateur     | brouillon | d2fc5df     |
| [Archive](archive/)                                                                     | développeur               | à revoir  | d2fc5df     |

## Comment maintenir cette documentation

1. **Même changement que le code.** Toute modification qui change un comportement décrit ici met à jour la documentation concernée dans le même lot de modifications (WORKFLOW.md, § Documentation (DOC-01)).
2. **En-tête.** Chaque page commence par un bloc `titre`, `public`, `statut`, `vérifié-sur`, `couvre`. Mettre `vérifié-sur` au commit court sur lequel la page a été relue, et ajouter la slice dans `couvre`.
3. **Statuts.** `brouillon` (incomplet), `à jour` (relu sur le code), `à revoir` (le code a changé depuis).
4. **Ne rien inventer.** Écrire uniquement ce que le code, les scripts ou les tests montrent. Sinon : « À vérifier ». Une section vide porte « À rédiger - <slice> ».
5. **Références générées.** `codes-erreur.md`, `variables-environnement.md` et `scripts-npm.md` ne se modifient pas à la main : lancer `npm run docs:generate`.
6. **Contrôle.** `npm run docs:check` (aussi en CI) vérifie que les références générées sont à jour, que chaque lien relatif mène à un fichier existant et que chaque page a son en-tête.
7. **Langue.** Français pour tout document destiné à des personnes (tutoiement dans le guide du coach, ton neutre ailleurs) ; anglais pour `architecture/`.
8. **Exemples.** Jamais de secret, de valeur réelle d'un `.env`, de donnée client ni d'identifiant tiré de `kfit_dev` : utiliser des exemples manifestement fictifs.
