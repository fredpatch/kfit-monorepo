---
titre: Mesures de sécurité (brouillon technique)
public: juriste
statut: brouillon
vérifié-sur: d2fc5df
couvre: [S7.3, S7.4a, S7.4b, SEC-01, ARCH-01, DOC-01a]
---

> **Brouillon technique — à faire valider par un juriste avant toute mise en production. Ne constitue pas un avis juridique.**

# Mesures de sécurité (brouillon technique)

Mesures **implémentées dans le code** à la date de vérification. Le détail technique est dans l'[architecture](../architecture/README.md).

## Accès et authentification

- Accès d'administration par compte individuel ; mots de passe hachés.
- Codes à usage unique pour les actions sensibles (anonymisation notamment), stockés hachés avec un secret (« pepper »).
- Sessions par cookies `HttpOnly`, `Secure` en production, avec expiration d'inactivité et durée maximale.
- Protection contre la falsification de requêtes : double jeton CSRF et contrôle de l'origine.

## Liens publics

- Les liens envoyés aux clients (documents, devis, reçus, justificatifs, consentements, questionnaires, rendez-vous) reposent sur un jeton dont seule l'empreinte est stockée.
- Chaque jeton est limité à une ressource et une action, expire, peut être révoqué et peut être limité en nombre d'utilisations.
- Les jetons sont masqués dans les journaux, et les routes publiques sont limitées en débit par adresse IP.

## Fichiers

- Taille maximale, contrôle de la signature du fichier par rapport à son type, analyse antivirus (ClamAV) avant enregistrement.
- Fichiers stockés hors du dossier public.

## Journalisation et audit

- Les actions sont tracées dans `audit_events` avec un identifiant de requête ; l'IP et le navigateur ne sont conservés que sous forme d'empreinte.
- Règle de code : aucun mot de passe, jeton, code ou donnée personnelle dans les journaux.
- Les refus 415 et 429 sont comptés par jour, sans IP.

## Cycle de vie des données

- Gel des personnes archivées : aucune modification, liens publics révoqués.
- Anonymisation irréversible selon un plan unique, journal de confidentialité hors base et replay automatique après restauration.
- Suppression différée des fichiers et blocages de conservation ([politique de conservation](politique-conservation.md)).

## Sauvegardes

- Sauvegardes chiffrées (AES-256-GCM), manifeste signé, copie secondaire vérifiée, contrôle de restauration automatisable.
- Clé conservée hors du serveur ([runbook](../runbooks/sauvegarde-restauration.md)).

## Plateforme

- Plancher de sécurité du runtime Node.js : refus de démarrer en production sous une version corrigée.
- Refus de démarrer en production si un secret manque ou est faible, si l'URL publique n'est pas en https, si la base visée est une base de développement, ou si un texte de consentement de démonstration est publié.
- PostgreSQL non exposé à Internet en staging et en production.
- Corps de requêtes compressés refusés (protection contre une faille du décodeur).

## À compléter

- Hébergement, chiffrement des disques, TLS, pare-feu, accès physique : **Sprint 9**.
- Procédure de notification en cas de violation de données : **à compléter par le juriste**.
