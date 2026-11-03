---
titre: S9 - Régression finale Sprint 8
public: développeur
statut: validé
vérifié-sur: e5880e7
couvre: [Sprint 8, UAT review]
---

# S9 - Régression finale Sprint 8

## But

Rejouer les frontières critiques après résolution de tous les P0/P1.

## Précondition

- S0-S8 exécutés.
- Aucun finding non trié.
- Aucun P0/P1 encore OPEN/IN_FIX/RETEST.

## Parcours critique

- [x] Public catalogue -> demande.
- [x] Qualification -> conversion exactement une fois.
- [x] Onboarding -> consentements/questionnaire -> activation.
- [x] RDV -> consommation composant.
- [x] Suivi -> cadence.
- [x] Progression -> objectif consultatif.
- [x] Paiement -> allocation -> reçu.
- [x] Document/version/lien sécurisé.
- [x] Completion ou renouvellement.
- [x] Privacy spot-check sur sujet secondaire.

## Sécurité / confidentialité

- [x] Admin sans session refusé.
- [x] CSRF mutation protégé.
- [x] Trusted-device/OTP spot-check.
- [x] Public bearer replay ne duplique pas d'effet.
- [x] Health consent boundary.
- [x] Données sensibles absentes des audits génériques spot-checkés.
- [x] Supervision inaccessible à non-superadmin.

## Responsive / clavier

- [x] Landing mobile.
- [x] Demande mobile.
- [x] Dashboard mobile.
- [x] Fiche client mobile.
- [x] Navigation admin clavier.
- [x] Notification panel/sheet clavier + Escape/focus.

## Suite automatisée finale

```bash
npm run typecheck
npm test
npm run build
npm run db:check
npm run test:integration
```

- [x] Typecheck vert.
- [x] Tests verts et nombre de tests non nul.
- [x] Build vert.
- [x] DB check vert.
- [x] Integration verts.
- [x] Toute flake connue est identifiée explicitement avant un retry accepté.

## Gate de sortie

- [x] P0 = 0 ouvert.
- [x] P1 = 0 ouvert.
- [x] Aucun finding non trié.
- [x] P2/P3 restants explicitement différés avec responsable + cible.
- [x] Fred valide la recette technique/fonctionnelle finale.
- [x] Sprint 8 prêt à fermer.
- [x] Prochaine étape = reprise ARCH avant Sprint 9.


## Clôture Sprint 8

Fred confirme la recette locale V1 Core finale verte le 2026-11-03.

- UAT-001 : RESOLVED.
- UAT-002 : RESOLVED.
- Privacy journal durable : preuve vérifiée dans DBeaver.
- Privacy sync/replay : idempotence métier validée.
- Aucun P0/P1 ouvert.
- Prochaine étape : reprise des migrations ARCH restantes avant Sprint 9.
