---
titre: Guide de l'administrateur
public: administrateur
statut: brouillon
vérifié-sur: e0d6158
couvre: [DOC-01a, DOC-01b, SEC-02a, SEC-02b]
---

# Guide de l'administrateur

Ce guide couvre la configuration de K'FIT : réglages, catalogue, textes de consentement, questionnaires, comptes, confidentialité et sauvegardes. Le travail quotidien avec les clientes est décrit dans le [guide du coach](guide-coach.md). Les heures sont celles de Libreville.

## 1. Rôles et accès

- K'FIT a aujourd'hui un seul rôle : administrateur, affiché « Coach · administratrice » dans « Mon compte ». Ce rôle donne accès à tout l'espace coach et à la configuration.
- Le premier compte se crée sur l'écran « Initialisation », affiché tant qu'aucun compte n'existe. Aucun identifiant par défaut n'est fourni. En production, l'écran demande aussi un « Jeton d'initialisation » fourni par l'exploitation. Procédure : [premier compte administrateur](../runbooks/premier-compte-administrateur.md).
- Aucun écran ne permet aujourd'hui d'ajouter ou de retirer un compte. **À vérifier** : procédure pour un second compte.
- Les clientes n'ont pas de compte. Elles utilisent uniquement les liens personnels que tu leur envoies.

## 2. Réglages

Menu « Réglages » (section « Configuration »). Les modifications s'appliquent après « Enregistrer ».

| Réglage | Effet | Défaut | Plage |
| --- | --- | --- | --- |
| « Notifications dans l'application » | La cloche affiche ce qui demande une action. | Toujours activées | — |
| « Recevoir des e-mails » | Envoie des e-mails aux comptes administrateurs actifs. | Activé | oui / non |
| « Résumé quotidien » | Un seul e-mail par jour avec le nombre d'actions à traiter. | Activé | oui / non |
| Heure du résumé (Libreville) | Heure d'envoi du résumé quotidien. | 08:00 | 00:00 à 23:00 |
| « Suivis en retard » | Un e-mail par suivi en retard, puis une relance. | Désactivé | oui / non |
| Relance des suivis en retard (jours) | Rythme de la relance. | 3 | 1 à 30 |
| « Demandes à contacter » | Un e-mail par nouvelle demande. | Désactivé | oui / non |
| « Échéances en retard » | Un e-mail par échéance en retard, puis une relance. | Désactivé | oui / non |
| Relance des échéances en retard (jours) | Rythme de la relance. | 7 | 1 à 30 |
| « Justificatifs à vérifier » | Un e-mail par justificatif déposé. | Désactivé | oui / non |
| « Modifications de devis » | Un e-mail quand une cliente demande un changement de devis. | Désactivé | oui / non |
| « Préparations bloquées » | Un e-mail par préparation bloquée. | Désactivé | oui / non |
| « Revues de fin » | Un e-mail par revue de fin à effectuer. | Désactivé | oui / non |
| « Délai avant suppression des fichiers (jours) » | Les fichiers d'une cliente anonymisée sont supprimés définitivement après ce délai. | 30 | 1 à 365 |

Règles :
- Les e-mails par type ne sont modifiables que si « Recevoir des e-mails » est activé.
- Les e-mails ne contiennent ni montant ni donnée de santé : seulement le type d'action, le nom de la cliente et un lien vers K'FIT.

## 3. Catalogue

Menu « Catalogue ». Onglets : « Publiées », « Brouillons », « Archivées ».

**Une offre** a cinq sections :
- « Disponibilité » : état commercial (« Demandes directes », « Liste d'attente », « Fermée »), « Capacité limitée » avec un « Nombre de places », « Autoriser la liste d'attente », « Visible sur la page publique ».
- « Contenu » : nom, « Adresse (slug) », « Prix fixe » ou « Sur devis », « Prix de base (XAF) », type de prestation et « Durée par défaut », « Prestations incluses dans l'offre ».
- « Variantes » : les formules de l'offre. Chacune peut avoir son prix, sa capacité, sa durée et ses règles ; sinon, elle suit l'offre.
- « Règles » : « Cadence de suivi (jours) », « Annulation tardive (heures avant) », « Une annulation tardive consomme la séance », « Une absence consomme la séance », « Avis médical » (« Non requis », « Requis en cas de risque », « Toujours requis »).
- « Avant publication » : la liste de ce qui manque pour vendre l'offre.

**Étapes pour publier une offre.**
1. Crée l'offre (brouillon), puis complète « Contenu », « Variantes » et « Règles ».
2. Ouvre « Avant publication » : chaque point doit être validé (« Chaque formule contient au moins une prestation », « Règles de l'offre et avis médical définis », « Prix connu pour chaque formule », « Durée connue pour chaque formule »).
3. Publie l'offre : elle devient visible sur la page publique avec sa disponibilité actuelle.
4. Ordonne les offres de la page publique par glisser-déposer (ou avec les flèches).

**Règles métier.**
- L'adresse (slug) est modifiable tant que l'offre n'est pas publiée, puis fixée pour ne pas casser les liens partagés.
- Une modification du contenu vaut pour les nouvelles ventes : les abonnements déjà vendus gardent leur contenu. Une prestation retirée n'est plus incluse dans les nouvelles ventes.
- Cadence de suivi : de 1 à 90 jours. Annulation tardive : de 1 à 168 heures.
- L'avis médical s'applique tout de suite aux clientes en préparation.
- Une offre publiée mais incomplète reste en ligne ; complète les points manquants.
- Une offre archivée disparaît de la page publique et passe en lecture seule. Les abonnements en cours ne changent pas.

## 4. Textes de consentement

Menu « Textes de consentement ». Les textes que les clientes lisent avant d'accepter ou de refuser.

| Texte | Statut |
| --- | --- |
| « Conditions de service » | Obligatoire pour démarrer un accompagnement |
| « Notice de confidentialité » | Obligatoire pour démarrer un accompagnement |
| « Données de santé » | Accord facultatif, demandé par le coach |
| « Conservation des photos de suivi » | Accord facultatif, demandé par le coach |
| « Communication commerciale » | Accord facultatif, demandé par le coach |

**Étapes.**
1. « Préparer une nouvelle version » (ou « Rédiger le texte »), saisis le titre et le « Texte complet », puis « Enregistrer le brouillon ». Le brouillon reste invisible pour les clientes.
2. Publie la version : K'FIT affiche l'impact (nombre d'abonnements en cours dont l'accord devra être renouvelé).
3. Confirme ton identité avec le code à 6 chiffres reçu par e-mail, puis « Vérifier et publier ».

**Règles métier.**
- Une version publiée ne se modifie plus et ne se supprime plus : crée une nouvelle version. La précédente reste dans l'historique.
- Le texte publié est conservé tel quel, avec son empreinte.
- Les abonnements déjà démarrés ne sont pas bloqués par une nouvelle version. Un accord donné sur l'ancienne version peut devoir être renouvelé.
- **« DÉMONSTRATION » bloque la production.** Un texte publié dont le titre contient « Démonstration » (avec ou sans accents ni majuscules) empêche le démarrage de K'FIT en production. Ces textes servent uniquement aux essais. Remplace-les par les textes validés avant la mise en service ([démarrage en production](../runbooks/demarrage-production.md)).

## 5. Questionnaires

Menu « Questionnaires ».

**Étapes.**
1. « Nouveau modèle » : crée le questionnaire et ses questions. « Aperçu client » montre ce que verra la cliente.
2. Publie la version : elle devient figée et peut être affectée.
3. « Affecter un questionnaire » : choisis l'offre ou la variante.
4. Pour une nouvelle version : « Préparer une nouvelle version », publie-la, puis passe les affectations à cette version si tu le souhaites.

**Règles métier.**
- Les versions publiées sont figées : toute modification prépare une nouvelle version.
- Une variante sans affectation propre hérite du questionnaire de son offre.
- Publier une version ne change pas automatiquement les affectations existantes.
- Les réponses déjà reçues restent liées à leur version.

## 6. Comptes et sessions

| Paramètre | Valeur par défaut |
| --- | --- |
| Mot de passe | 12 caractères minimum, au moins une lettre et un chiffre |
| Inactivité avant déconnexion | 30 minutes |
| Durée maximale d'une session | 12 heures |
| Validité d'un code de vérification (OTP) | 5 minutes, 5 essais |
| Appareil de confiance | 30 jours |
| Fenêtre « vérification récente » pour les actions sensibles | 10 minutes |
| Délai pour choisir un nouveau mot de passe après le code de récupération | 10 minutes |

Ces valeurs sont réglées par l'exploitation ([variables d'environnement](../reference/variables-environnement.md)).

Actions qui demandent une vérification récente par code : anonymiser une personne, publier un texte de consentement.

**Appareils de confiance (SEC-02).**
- Le mot de passe passe toujours en premier. Depuis un appareil inconnu, K'FIT envoie ensuite un code à 6 chiffres à l'e-mail du compte, valable 5 minutes et limité à 5 essais. Aucune session n'est ouverte avant ce code.
- Après le code, tu peux faire confiance à l'appareil. Pendant 30 jours, ce navigateur se connecte alors sans code. Les 30 jours ne sont pas prolongés à chaque connexion : au bout de 30 jours, un code est redemandé.
- Un appareil, c'est un navigateur sur un ordinateur ou un téléphone. Vider les cookies ou changer de navigateur crée un appareil inconnu.
- Un appareil de confiance ne vaut que pour ton compte : un autre compte connecté depuis le même navigateur reçoit un code.
- Un nouvel envoi du code invalide le précédent, 3 fois au plus par connexion.
- Limites (sur 15 minutes) : 10 tentatives de connexion par adresse réseau, 5 codes de connexion par compte, 10 vérifications de code par adresse, 3 renvois par compte. Au-delà : « Trop de tentatives. Réessaie dans quelques minutes. »
- Écran de connexion : « Nouvel appareil », avec la case « Faire confiance à cet appareil pendant 30 jours » (décochée par défaut) et « Renvoyer le code » (30 secondes entre deux envois). Détail dans le [guide du coach](guide-coach.md#1-se-connecter).
- « Réglages › Appareils de confiance » : chaque compte (administrateur ou coach) gère ses propres appareils. Pour chacun : le nom (« Navigateur · Système »), « Utilisé le … », « Confiance jusqu'au … », et le badge « Cet appareil » pour le navigateur en cours.
- Révocation : « Retirer » (un appareil) ou « Tout retirer », après confirmation. La session en cours reste ouverte ; l'appareil retiré redemandera un code à sa prochaine connexion. Retirer ne demande pas de code : seul l'ajout de confiance en demande un.
- Une réinitialisation du mot de passe (« Mot de passe oublié ») ferme toutes les sessions et retire tous les appareils de confiance du compte.
- Il n'existe pas de bouton « déconnecter partout ».

## 7. Confidentialité

**Archiver, désarchiver, anonymiser.** Le parcours est décrit dans le [guide du coach](guide-coach.md#14-archiver-désarchiver-anonymiser). À retenir :
- Une fiche archivée est en lecture seule, et ses liens publics sont désactivés.
- Désarchiver demande un motif : « Correction comptable », « Client de retour », « Archivé par erreur ».
- L'anonymisation est **irréversible**. Elle exige une fiche archivée, le nom exact de la personne et un code envoyé par e-mail. L'identité et les données de santé sont effacées ; les paiements, devis et reçus sont conservés.

**Blocages de conservation.**
1. Dans le menu « ⋯ » d'une fiche : « Ajouter un blocage de conservation ». Choisis le type (« Obligation légale », « Litige », « Comptabilité ») et un motif.
2. Les blocages actifs s'affichent sur la fiche. « Lever le blocage » les retire.

Règles :
- Tant qu'un blocage est actif, la cliente ne peut pas être anonymisée et ses fichiers ne sont pas supprimés.
- Un seul blocage actif par type et par cliente. Motif : de 3 à 500 caractères.
- Les blocages se posent sur les clientes depuis l'écran. Le serveur accepte aussi des blocages sur un prospect ou un document, mais sans écran à ce jour.

**Suppression des fichiers.** Chaque jour à 3 h, K'FIT supprime les fichiers des personnes anonymisées dont le délai est écoulé (réglage « Délai avant suppression des fichiers (jours) »).

**Journal de confidentialité.** Chaque anonymisation est aussi inscrite dans un journal tenu hors de la base de données. Après une restauration de sauvegarde, K'FIT réapplique toutes les anonymisations de ce journal : une personne anonymisée ne réapparaît jamais. Ce journal est géré par l'exploitation ([sauvegarde et restauration](../runbooks/sauvegarde-restauration.md)).

## 8. Supervision

**OPS-01, à venir** : un écran pour suivre les jobs, les sauvegardes, les contrôles de restauration, la confidentialité et les refus de sécurité.

## 9. Sauvegardes

Les sauvegardes sont chiffrées et se lancent par une commande sur le serveur, jamais depuis l'interface. Leur planification quotidienne par le serveur est mise en place au Sprint 9. Un contrôle de restauration hebdomadaire est recommandé.

Rôle de l'administrateur :
- Garder la clé de chiffrement des sauvegardes en lieu sûr, hors du serveur (gestionnaire de mots de passe, copie papier).
- Vérifier avec l'exploitation que les contrôles de restauration réussissent.
- Prévenir l'exploitation en cas de perte de données.

Procédure technique : [sauvegarde et restauration](../runbooks/sauvegarde-restauration.md).

## 10. Données de test (développement uniquement)

Dans « Réglages », la carte « Données de test » n'existe qu'en développement, sur la base locale `kfit_dev`. Elle n'apparaît jamais en production.

1. « Analyser » : liste les données de test (fiches nommées « [TEST] … ») restées dans la base.
2. « Supprimer les données de test » : les supprime définitivement.

Règles :
- Les données liées à de vraies données sont conservées et signalées.
- Les journaux d'audit et les comptes ne sont jamais supprimés.
