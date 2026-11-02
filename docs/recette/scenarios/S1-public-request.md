# S1 - Catalogue public et demande

## But

Valider le point d'entrée visiteur jusqu'à la présence d'une demande exploitable côté admin.

## Précondition

S0 vert.

## Catalogue admin

- [ ] Ouvrir `/admin/offres`.
- [ ] Vérifier Publiées / Brouillons / Archivées.
- [ ] Ouvrir une offre publiée et contrôler variante, prestations, règles et capacité.
- [ ] Vérifier la photo de l'offre.
- [ ] Si un brouillon est disponible, ouvrir « Avant publication » et vérifier les bloqueurs/recommandations.
- [ ] Ne pas modifier les règles métier sauf si nécessaire pour préparer les données UAT.

## Catalogue public

- [ ] Ouvrir `/` en desktop.
- [ ] Les offres visibles/publiées seulement apparaissent.
- [ ] Les photos et textes attendus s'affichent.
- [ ] Filtrage/familles/CTA fonctionnent.
- [ ] Vérifier aussi largeur mobile.

## Demande

Créer **Client UAT Alpha**.

- [ ] Ouvrir `/demande/:offre` depuis une offre.
- [ ] Soumettre une demande valide sans compte.
- [ ] Vérifier message de succès.
- [ ] Vérifier qu'une seule demande apparaît dans `/admin/demandes`.
- [ ] Ouvrir le détail.
- [ ] Vérifier offre/variante/données de contact.
- [ ] Vérifier qu'une offre non publique/archivée n'est pas utilisable publiquement.
- [ ] Vérifier qu'une variante d'une autre offre ne peut pas être injectée.
- [ ] Vérifier qu'un replay ne crée pas un second état métier si le flow le permet.

## Preuve minimale

- référence/ID de la demande;
- capture ou note du résultat public;
- état de la demande côté admin.

## Sortie

Une demande unique, exploitable, liée à l'offre attendue.
