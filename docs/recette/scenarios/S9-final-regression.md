# S9 - Régression finale Sprint 8

## But

Rejouer les frontières critiques après résolution de tous les P0/P1.

## Précondition

- S0-S8 exécutés.
- Aucun finding non trié.
- Aucun P0/P1 encore OPEN/IN_FIX/RETEST.

## Parcours critique

- [ ] Public catalogue -> demande.
- [ ] Qualification -> conversion exactement une fois.
- [ ] Onboarding -> consentements/questionnaire -> activation.
- [ ] RDV -> consommation composant.
- [ ] Suivi -> cadence.
- [ ] Progression -> objectif consultatif.
- [ ] Paiement -> allocation -> reçu.
- [ ] Document/version/lien sécurisé.
- [ ] Completion ou renouvellement.
- [ ] Privacy spot-check sur sujet secondaire.

## Sécurité / confidentialité

- [ ] Admin sans session refusé.
- [ ] CSRF mutation protégé.
- [ ] Trusted-device/OTP spot-check.
- [ ] Public bearer replay ne duplique pas d'effet.
- [ ] Health consent boundary.
- [ ] Données sensibles absentes des audits génériques spot-checkés.
- [ ] Supervision inaccessible à non-superadmin.

## Responsive / clavier

- [ ] Landing mobile.
- [ ] Demande mobile.
- [ ] Dashboard mobile.
- [ ] Fiche client mobile.
- [ ] Navigation admin clavier.
- [ ] Notification panel/sheet clavier + Escape/focus.

## Suite automatisée finale

```bash
npm run typecheck
npm test
npm run build
npm run db:check
npm run test:integration
```

- [ ] Typecheck vert.
- [ ] Tests verts et nombre de tests non nul.
- [ ] Build vert.
- [ ] DB check vert.
- [ ] Integration verts.
- [ ] Toute flake connue est identifiée explicitement avant un retry accepté.

## Gate de sortie

- [ ] P0 = 0 ouvert.
- [ ] P1 = 0 ouvert.
- [ ] Aucun finding non trié.
- [ ] P2/P3 restants explicitement différés avec responsable + cible.
- [ ] Fred valide la recette technique/fonctionnelle finale.
- [ ] Sprint 8 prêt à fermer.
- [ ] Prochaine étape = reprise ARCH avant Sprint 9.
