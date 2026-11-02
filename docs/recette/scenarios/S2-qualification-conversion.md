# S2 - Contact, qualification et conversion

## But

Valider la transformation d'une demande en client + abonnement onboarding exactement une fois.

## Précondition

S1 vert avec Client UAT Alpha.

## Contact

- [ ] Enregistrer une tentative de contact.
- [ ] Vérifier l'historique.
- [ ] Passer la demande dans le flow de qualification autorisé.
- [ ] Vérifier qu'une transition invalide est refusée.

## Qualification

- [ ] Qualifier la demande ou la qualifier avec conditions.
- [ ] Vérifier service final.
- [ ] Vérifier variante finale si applicable.
- [ ] Vérifier prix convenu.
- [ ] Vérifier qu'une offre sans variante peut aussi être qualifiée si le scénario choisi est sans variante.

## Conversion

- [ ] Lancer la conversion.
- [ ] Vérifier création/résolution du client.
- [ ] Vérifier abonnement en `onboarding`.
- [ ] Vérifier snapshots prix/devise/durée/composants.
- [ ] Vérifier liens réciproques demande ↔ abonnement.
- [ ] Tenter une seconde conversion.
- [ ] Confirmer qu'aucun deuxième abonnement n'est créé.

## DBeaver spot-check

- [ ] Une seule ligne abonnement issue de la demande.
- [ ] Historique initial append-only présent.
- [ ] Audit structurel sans PII/free-text sensible.

## Sortie

Client UAT Alpha possède exactement un abonnement onboarding provenant de la demande.
