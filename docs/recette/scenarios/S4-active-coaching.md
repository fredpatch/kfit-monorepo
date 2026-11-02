---
titre: S4 - Abonnement actif, rendez-vous, suivis et progression
public: développeur
statut: à jour
vérifié-sur: 79ebdf2
couvre: [Sprint 8, S4 UAT]
---

# S4 - Abonnement actif, rendez-vous, suivis et progression

> Validation locale : tous les contrôles confirmés verts par Fred le 2026-11-02.

## But

Valider le coeur opérationnel du coaching après onboarding.

## Activation

- [x] Activer l'abonnement ready_to_start.
- [x] Vérifier actualStartDate et plannedEndDate.
- [x] Vérifier les compteurs de prestations.

## Rendez-vous

- [x] Planifier un rendez-vous lié à une prestation.
- [x] Ouvrir le lien public de réponse.
- [x] Confirmer le rendez-vous.
- [x] Vérifier qu'un replay du lien ne produit pas un second effet.
- [x] Terminer le rendez-vous.
- [x] Vérifier consommation exactement une unité.
- [x] Tester un reschedule sur un second RDV si pratique : original conservé + remplacement lié.

## Suivis

- [x] Enregistrer un suivi structuré.
- [x] Ajouter une prochaine action.
- [x] Vérifier file /admin/suivis.
- [x] Compléter/annuler une action selon le flow prévu.
- [x] Vérifier que la cadence est recalculée depuis une activité significative.
- [x] Pause abonnement -> exclusion de la file cadence.
- [x] Reprise avec nouvelle date de fin explicite.

## Progression

Avec consentement health_data actuel :

- [x] Ajouter une mesure.
- [x] Ajouter une seconde mesure et vérifier delta.
- [x] Vérifier ordre chronologique avec mesure backdatée valide si pratique.
- [x] Créer un objectif qualitatif ou numérique.
- [x] Vérifier que la suggestion est consultative.
- [x] Confirmer explicitement un outcome.
- [x] Vérifier historique append-only.
- [x] Révoquer/refuser health_data bloque une nouvelle mesure sans effacer l'historique existant.

## Sortie

Le coaching actif modifie uniquement les compteurs/historiques attendus et respecte consentement + cadence.
