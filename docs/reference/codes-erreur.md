---
titre: Codes d'erreur
public: développeur
statut: à jour
vérifié-sur: généré (npm run docs:check en CI)
couvre: [DOC-01a]
---

# Codes d'erreur

> Fichier généré - ne pas modifier à la main (npm run docs:generate).

Sources : tableaux `…ErrorCodes` de `packages/shared/src`, codes serveur listés dans `scripts/docs/generate-references.mjs`. Message affiché : texte des tables de messages du client (`packages/client/src`), « - » quand le client n'en a pas (code non affiché tel quel ou message générique).

332 codes, 25 modules.

## appointments

Source : `packages/shared/src/appointments/contracts.ts · appointmentErrorCodes`

| Code | Message affiché |
| --- | --- |
| `APPOINTMENT_NOT_FOUND` | Ce rendez-vous ou cet abonnement est introuvable. |
| `APPOINTMENT_INVALID_INPUT` | Vérifie les dates, le motif et les informations saisies. |
| `APPOINTMENT_TRANSITION_INVALID` | Cette action n’est plus disponible dans l’état actuel. Actualise les rendez-vous. |
| `APPOINTMENT_SUBSCRIPTION_NOT_ACTIVE` | L’abonnement doit être actif pour planifier ou reporter un rendez-vous. |
| `APPOINTMENT_COMPONENT_INVALID` | La prestation sélectionnée n’appartient pas à cet abonnement. |
| `APPOINTMENT_COMPONENT_EXHAUSTED` | Le nombre de séances convenues est épuisé. Aucune séance supplémentaire n’a été consommée. |
| `APPOINTMENT_DUPLICATE_SLOT` | Ce créneau existe déjà pour cet abonnement et cette prestation. |
| `APPOINTMENT_TOO_EARLY` | Le rendez-vous n’a pas encore atteint l’heure requise. Une fin anticipée nécessite une dérogation motivée. |
| `APPOINTMENT_REPLACEMENT_EXISTS` | Ce rendez-vous possède déjà un remplacement. |
| `APPOINTMENT_COMPONENT_NOT_CONSUMED` | Aucune séance consommée ne peut être restaurée pour ce rendez-vous. |
| `APPOINTMENT_COMPONENT_ALREADY_RESTORED` | La séance a déjà été restaurée. |
| `APPOINTMENT_TOKEN_INVALID` | Ce lien est invalide. Demande un nouveau lien au coach. |
| `APPOINTMENT_TOKEN_EXPIRED` | Ce lien a expiré. Demande un nouveau lien au coach. |
| `APPOINTMENT_TOKEN_REVOKED` | Ce lien a été remplacé ou révoqué. Utilise le dernier lien fourni par le coach. |
| `APPOINTMENT_TOKEN_CONSUMED` | Une réponse a déjà été enregistrée avec ce lien. Contacte le coach pour un nouveau changement. |
| `APPOINTMENT_POLICY_INVALID` | La politique d’annulation du service est incohérente. Vérifie sa configuration. |
| `APPOINTMENT_ADMIN_FORBIDDEN` | Cet espace est réservé à l’administrateur. |
| `APPOINTMENT_RATE_LIMITED` | Trop de tentatives. Patiente une minute avant de réessayer. |
| `APPOINTMENT_ROUTE_UNEXPECTED_FAILURE` | L’action n’a pas pu être confirmée. Actualise avant de réessayer. |

## auth

Source : `packages/shared/src/auth/contracts.ts · authErrorCodes`

| Code | Message affiché |
| --- | --- |
| `BOOTSTRAP_ALREADY_COMPLETED` | - |
| `AUTH_BOOTSTRAP_INVALID_FORMAT` | - |
| `AUTH_PASSWORD_POLICY_FAILED` | - |
| `AUTH_INVALID_CREDENTIALS` | - |
| `AUTH_ACCOUNT_UNAVAILABLE` | - |
| `AUTH_LOGIN_INVALID_FORMAT` | - |
| `AUTH_REFRESH_INVALID` | - |
| `AUTH_SESSION_REQUIRED` | Ta session a expiré. Reconnecte-toi. |
| `AUTH_CSRF_INVALID` | La vérification de sécurité a échoué. Recharge la page. |
| `AUTH_FRESH_OTP_REQUIRED` | Confirme d’abord ton identité avec le code envoyé par e-mail. |
| `AUTH_OTP_CODE_INVALID_FORMAT` | - |
| `AUTH_OTP_REJECTED` | - |
| `AUTH_RECOVERY_INVALID_FORMAT` | - |
| `AUTH_RECOVERY_CODE_INVALID` | - |
| `AUTH_RECOVERY_GRANT_INVALID` | - |
| `AUTH_RATE_LIMITED` | - |
| `AUTH_ORIGIN_INVALID` | La vérification de sécurité a échoué. Recharge la page. |
| `AUTH_OTP_DELIVERY_FAILED` | - |
| `AUTH_DEVICE_NOT_FOUND` | - |
| `BOOTSTRAP_DISABLED` | - |
| `BOOTSTRAP_TOKEN_INVALID` | - |

## catalogue

Source : `packages/shared/src/catalogue/contracts.ts · catalogueErrorCodes`

| Code | Message affiché |
| --- | --- |
| `CATALOGUE_ROUTE_UNEXPECTED_FAILURE` | - |
| `CATALOGUE_ADMIN_FORBIDDEN` | Cet espace est réservé à l'administrateur. |
| `CATALOGUE_SERVICE_NOT_FOUND` | Cette offre est introuvable. Actualise la liste. |
| `CATALOGUE_SERVICE_INVALID_INPUT` | Vérifie les champs saisis. |
| `CATALOGUE_SERVICE_SLUG_CONFLICT` | Cette adresse (slug) est déjà utilisée par une autre offre. |
| `CATALOGUE_SERVICE_ARCHIVED` | Cette offre est archivée et ne peut plus être modifiée. |
| `CATALOGUE_SERVICE_PUBLISH_INVALID` | L'offre ne peut pas être publiée : vérifie le nom, l'adresse et la capacité (si limitée). |
| `CATALOGUE_SERVICE_NOT_DELIVERABLE` | L'offre n'est pas prête à être vendue : complète les points de « Avant publication ». |
| `CATALOGUE_VARIANT_NOT_FOUND` | Cette variante est introuvable. Actualise la liste. |
| `CATALOGUE_VARIANT_SLUG_CONFLICT` | Une autre variante de cette offre utilise déjà cette adresse. |
| `CATALOGUE_VARIANT_ARCHIVED` | Cette variante est archivée et ne peut plus être modifiée. |
| `CATALOGUE_COMPONENT_NOT_FOUND` | Cette prestation est introuvable. Actualise la liste. |
| `CATALOGUE_COMPONENT_ARCHIVED` | Cette prestation est retirée et ne peut plus être modifiée. |
| `CATALOGUE_RULES_OVERRIDE_NOT_FOUND` | Cette variante suit déjà les règles de l'offre. |
| `CATALOGUE_RULES_OVERRIDE_HAS_QUESTIONNAIRE` | Cette variante a son propre questionnaire : retire d'abord l'affectation dans Questionnaires. |

## consents

Source : `packages/shared/src/consents/contracts.ts · consentErrorCodes`

| Code | Message affiché |
| --- | --- |
| `CONSENT_INVALID_INPUT` | Vérifie les choix et la date d’expiration. |
| `CONSENT_NOT_FOUND` | Abonnement ou lien introuvable. |
| `CONSENT_ADMIN_FORBIDDEN` | - |
| `CONSENT_INVALID_STATE` | Ce recueil n’est plus disponible dans l’état actuel de l’abonnement. |
| `CONSENT_DEFINITIONS_MISSING` | Chaque texte demandé doit être publié avant tout recueil (Configuration › Textes de consentement). |
| `CONSENT_DEFINITION_IMMUTABLE` | Ce texte est publié : il ne peut plus être modifié ni supprimé. Crée une nouvelle version. |
| `CONSENT_VERSION_CONFLICT` | Une version plus récente de ce texte a déjà été publiée. Actualise la page. |
| `CONSENT_DEFINITIONS_CHANGED` | Les documents ont changé. Relis les nouvelles versions avec le client avant de recueillir ses décisions. |
| `CONSENT_HISTORY_INVALID` | - |
| `CONSENT_LINK_INVALID` | Ce lien est invalide. Demande un nouveau lien au coach. |
| `CONSENT_LINK_EXPIRED` | Ce lien a expiré. Demande un nouveau lien au coach. |
| `CONSENT_LINK_REVOKED` | Ce lien a été révoqué. Demande un nouveau lien au coach. |
| `CONSENT_LINK_CONSUMED` | Ce lien a déjà été utilisé. Tes choix ne peuvent pas être renvoyés avec ce lien. |
| `CONSENT_LINK_STALE` | Les documents de ce lien ont changé. Demande un nouveau lien au coach. |
| `CONSENT_REVOCATION_FORBIDDEN` | Ce type d’acceptation ne peut pas être révoqué ici. |
| `CONSENT_DECISION_MISSING` | Aucun accord actuel ne peut être retiré pour ce consentement. |
| `CONSENT_TYPE_NOT_REQUESTED` | Ce lien ne concerne pas ce consentement. Demande un nouveau lien au coach. |
| `CONSENT_RATE_LIMITED` | Trop de tentatives. Réessaie dans une minute. |
| `CONSENT_ROUTE_UNEXPECTED_FAILURE` | - |

## customers

Source : `packages/shared/src/customers/contracts.ts · customerErrorCodes`

| Code | Message affiché |
| --- | --- |
| `CUSTOMER_INVALID_INPUT` | - |
| `CUSTOMER_DUPLICATE_WHATSAPP` | - |
| `CUSTOMER_ADMIN_FORBIDDEN` | - |
| `CUSTOMER_NOT_FOUND` | - |
| `CUSTOMER_ROUTE_UNEXPECTED_FAILURE` | - |

## dashboard

Source : `packages/shared/src/dashboard/contracts.ts · dashboardErrorCodes`

| Code | Message affiché |
| --- | --- |
| `DASHBOARD_INVALID_INPUT` | - |
| `DASHBOARD_ADMIN_FORBIDDEN` | - |
| `DASHBOARD_ROUTE_UNEXPECTED_FAILURE` | - |

## dev

Source : `packages/shared/src/dev/test-data.ts · devToolsErrorCodes`

| Code | Message affiché |
| --- | --- |
| `DEV_TOOLS_UNAVAILABLE` | Outil disponible seulement en développement, sur la base locale kfit_dev. |
| `DEV_TEST_DATA_CHANGED` | Les données ont changé depuis l'analyse. Relance « Analyser ». |
| `DEV_TOOLS_INVALID_INPUT` | Analyse invalide. Relance « Analyser ». |
| `DEV_TOOLS_ADMIN_FORBIDDEN` | Réservé aux administrateurs. |
| `DEV_TOOLS_ROUTE_UNEXPECTED_FAILURE` | Échec inattendu. Réessaie dans un instant. |

## documents

Source : `packages/shared/src/documents/contracts.ts · documentErrorCodes`

| Code | Message affiché |
| --- | --- |
| `DOCUMENT_NOT_FOUND` | - |
| `DOCUMENT_VERSION_NOT_FOUND` | - |
| `DOCUMENT_INVALID_INPUT` | - |
| `DOCUMENT_TYPE_INVALID` | - |
| `DOCUMENT_STATUS_INVALID` | Cette action n'est plus disponible pour ce document. |
| `DOCUMENT_FILE_TOO_LARGE` | Le fichier dépasse la limite de 10 Mo. |
| `DOCUMENT_FILE_TYPE_UNSUPPORTED` | Format non pris en charge. Utilise PDF, JPG, PNG ou WebP. |
| `DOCUMENT_FILE_SIGNATURE_INVALID` | Le contenu du fichier ne correspond pas à son format. |
| `DOCUMENT_FILE_INFECTED` | Le fichier a été bloqué par l'analyse antivirus. |
| `DOCUMENT_FILE_SCAN_FAILED` | L'analyse antivirus est indisponible. Le fichier n'a pas été enregistré. |
| `DOCUMENT_DUPLICATE_UPLOAD` | Ce fichier est déjà enregistré pour ce document. |
| `DOCUMENT_STORAGE_FAILURE` | - |
| `DOCUMENT_HEALTH_CONSENT_REQUIRED` | Le consentement aux données de santé est requis pour générer un bilan. |
| `DOCUMENT_PHOTO_CONSENT_REQUIRED` | Le consentement au stockage des photos de progression est requis. |
| `DOCUMENT_MEASUREMENT_INVALID` | - |
| `DOCUMENT_LINK_INVALID` | - |
| `DOCUMENT_LINK_EXPIRED` | Ce lien a expiré. |
| `DOCUMENT_LINK_REVOKED` | Ce lien a été révoqué. |
| `DOCUMENT_LINK_EXHAUSTED` | Ce lien a atteint son nombre maximal de téléchargements. |
| `DOCUMENT_VERIFICATION_REQUIRED` | Saisis le code de vérification communiqué par le coach. |
| `DOCUMENT_VERIFICATION_INVALID` | Code incorrect. |
| `DOCUMENT_VERIFICATION_LOCKED` | Trop de tentatives incorrectes. Demande un nouveau lien au coach. |
| `DOCUMENT_ADMIN_FORBIDDEN` | - |
| `DOCUMENT_ROUTE_UNEXPECTED_FAILURE` | - |

## finance

Source : `packages/shared/src/finance/contracts.ts · financeErrorCodes`

| Code | Message affiché |
| --- | --- |
| `FINANCE_NOT_FOUND` | Cet abonnement, échéancier ou paiement est introuvable. |
| `FINANCE_INVALID_INPUT` | Vérifie les montants entiers en XAF, les dates et les champs saisis. |
| `FINANCE_PLAN_ALREADY_ACTIVE` | Un échéancier est déjà actif. Révise cet échéancier pour le remplacer. |
| `FINANCE_PLAN_TOTAL_MISMATCH` | L’échéancier ne couvre plus le reste à payer. Actualise puis révise les montants et dates. |
| `FINANCE_INSTALLMENTS_TOTAL_MISMATCH` | La somme des échéances doit correspondre exactement au reste à payer indiqué par le serveur. |
| `FINANCE_INVALID_STATE` | Cette action n’est pas disponible dans l’état actuel. Actualise la finance et vérifie l’échéancier. |
| `FINANCE_PAYMENT_EXCEEDS_OUTSTANDING` | Le paiement dépasse le reste à payer. Aucun trop-perçu n’est enregistré. |
| `FINANCE_DUPLICATE_PAYMENT` | Cette demande de paiement a déjà été utilisée. Vérifie l’historique avant une nouvelle saisie. |
| `FINANCE_CORRECTION_INVALID` | La correction doit viser un paiement confirmé et ne peut pas dépasser son montant encore corrigeable. |
| `FINANCE_CONCURRENCY_CONFLICT` | Une autre opération a modifié la finance. Actualise les informations puis réessaie. |
| `FINANCE_ADMIN_FORBIDDEN` | Cet espace est réservé à l’administrateur. |
| `FINANCE_ROUTE_UNEXPECTED_FAILURE` | L’opération n’a pas pu être confirmée. Vérifie l’historique avant une nouvelle saisie. |

## follow-ups

Source : `packages/shared/src/follow-ups/contracts.ts · followUpErrorCodes`

| Code | Message affiché |
| --- | --- |
| `FOLLOW_UP_NOT_FOUND` | Ce suivi ou cet abonnement est introuvable. |
| `FOLLOW_UP_INVALID_INPUT` | Vérifie le type de suivi, les dates et les informations saisies. |
| `FOLLOW_UP_SUBSCRIPTION_NOT_ACTIVE` | L’abonnement doit être actif pour enregistrer un suivi. |
| `FOLLOW_UP_TRANSITION_INVALID` | Cette action a déjà été traitée. Les suivis ont été actualisés. |
| `FOLLOW_UP_NEXT_ACTION_PAIR_REQUIRED` | Une prochaine action non vide et sa date doivent être renseignées ensemble. |
| `FOLLOW_UP_OCCURRED_AT_FUTURE` | La date du suivi ne peut pas être dans le futur. |
| `FOLLOW_UP_NEXT_ACTION_DATE_INVALID` | La date de la prochaine action doit être valide et postérieure à celle du suivi. |
| `FOLLOW_UP_CADENCE_INVALID` | La cadence doit être un nombre entier positif de jours, avec une échéance calculable. Vérifie aussi la configuration du service. |
| `FOLLOW_UP_CADENCE_NOT_APPLICABLE` | La cadence personnalisée peut être modifiée uniquement pour un abonnement actif ou en pause. |
| `FOLLOW_UP_ADMIN_FORBIDDEN` | Cet espace est réservé à l’administrateur. |
| `FOLLOW_UP_ROUTE_UNEXPECTED_FAILURE` | L’action n’a pas pu être confirmée. Actualise les suivis avant de réessayer. |

## notifications

Source : `packages/shared/src/notifications/contracts.ts · notificationErrorCodes`

| Code | Message affiché |
| --- | --- |
| `NOTIFICATION_INVALID_INPUT` | La demande est invalide. Actualise la page. |
| `NOTIFICATION_NOT_FOUND` | Cette notification est introuvable. La liste a été actualisée. |
| `NOTIFICATION_ADMIN_FORBIDDEN` | Cet espace est réservé à l'administrateur. |
| `NOTIFICATION_SETTINGS_INVALID` | Un réglage est invalide. Vérifie les valeurs saisies. |
| `NOTIFICATION_ROUTE_UNEXPECTED_FAILURE` | L'action n'a pas pu être confirmée. Réessaie dans un instant. |

## onboarding

Source : `packages/shared/src/onboarding/contracts.ts · onboardingErrorCodes`

| Code | Message affiché |
| --- | --- |
| `ONBOARDING_INVALID_INPUT` | Vérifie les informations saisies et la date de réservation. |
| `ONBOARDING_NOT_FOUND` | Cet abonnement est introuvable. |
| `ONBOARDING_ADMIN_FORBIDDEN` | Cet espace est réservé à l’administrateur. |
| `ONBOARDING_INVALID_STATE` | Cette action n’est pas autorisée dans l’état actuel de l’abonnement. |
| `ONBOARDING_ITEM_NOT_FOUND` | Cette exigence est introuvable sur cet abonnement. |
| `ONBOARDING_ITEM_FORBIDDEN` | Cette exigence doit être validée par son parcours dédié. |
| `ONBOARDING_ITEM_RESOLVED` | Cette exigence a déjà été traitée. Actualise la checklist. |
| `ONBOARDING_REASON_REQUIRED` | Un motif de dispense non vide est obligatoire. |
| `ONBOARDING_BLOCKED` | Des exigences bloquantes restent à satisfaire. |
| `ONBOARDING_START_DATE_REQUIRED` | La date de début prévue doit être confirmée. |
| `ONBOARDING_POLICY_INVALID` | Les règles du service sont incohérentes. Vérifie sa configuration. |
| `ONBOARDING_CAPACITY_REQUIRED` | Définis ou prolonge la réservation avant de confirmer le démarrage. |
| `ONBOARDING_CAPACITY_EXHAUSTED` | La capacité disponible est épuisée. Aucune place supplémentaire n’a été réservée. |
| `ONBOARDING_CAPACITY_INVALID` | Vérifie la capacité du service et choisis une échéance future. |
| `ONBOARDING_ROUTE_UNEXPECTED_FAILURE` | Impossible d’effectuer cette action. Actualise la fiche avant de réessayer. |

## payment-proofs

Source : `packages/shared/src/payment-proofs/contracts.ts · paymentProofErrorCodes`

| Code | Message affiché |
| --- | --- |
| `PAYMENT_PROOF_NOT_FOUND` | Ce justificatif ou cet abonnement est introuvable. |
| `PAYMENT_PROOF_INVALID_INPUT` | Vérifie les champs saisis, les montants entiers et les dates. |
| `PAYMENT_PROOF_INVALID_STATE` | Ce justificatif a déjà été traité. Actualise son état. |
| `PAYMENT_PROOF_LINK_INVALID` | Ce lien est invalide. Demande un nouveau lien à ton coach. |
| `PAYMENT_PROOF_LINK_EXPIRED` | Ce lien a expiré. Demande un nouveau lien à ton coach. |
| `PAYMENT_PROOF_LINK_REVOKED` | Ce lien a été révoqué. Demande un nouveau lien à ton coach. |
| `PAYMENT_PROOF_LINK_CONSUMED` | Ce lien a déjà servi à envoyer un justificatif. Contacte ton coach avant un nouvel envoi. |
| `PAYMENT_PROOF_UPLOAD_INVALID` | Choisis un fichier PDF, JPEG, PNG ou WebP valide, non vide, de 10 Mo maximum. |
| `PAYMENT_PROOF_DUPLICATE_UPLOAD` | Ce fichier figure déjà dans cette demande de correction. Choisis le justificatif corrigé. |
| `PAYMENT_PROOF_MALWARE_DETECTED` | Ce fichier a été refusé par le contrôle antivirus. Choisis un autre fichier. |
| `PAYMENT_PROOF_REVIEW_CONFLICT` | Une autre opération a modifié ces informations. Actualise avant de réessayer. |
| `PAYMENT_PROOF_AMOUNT_INVALID` | La confirmation complète doit égaler le montant déclaré ; une confirmation partielle doit être positive et inférieure. |
| `PAYMENT_PROOF_FINANCE_CONFLICT` | Le paiement ne peut pas être enregistré. Vérifie le reste à payer et l’échéancier actif dans Paiements. |
| `PAYMENT_PROOF_ADMIN_FORBIDDEN` | Cet espace est réservé à l’administrateur. |
| `PAYMENT_PROOF_RATE_LIMITED` | Trop de tentatives. Patiente une minute avant de réessayer. |
| `PAYMENT_PROOF_ROUTE_UNEXPECTED_FAILURE` | L’opération n’a pas pu être confirmée. Vérifie son état avant de réessayer. |

## privacy

Source : `packages/shared/src/privacy/contracts.ts · privacyErrorCodes`, `packages/shared/src/privacy/contracts.ts · subjectArchivedErrorCodes`

| Code | Message affiché |
| --- | --- |
| `PRIVACY_INVALID_INPUT` | La demande est invalide. Vérifie les champs puis réessaie. |
| `PRIVACY_ADMIN_FORBIDDEN` | Cet espace est réservé à l'administrateur. |
| `PRIVACY_SUBJECT_NOT_FOUND` | Cette fiche est introuvable. Actualise la page. |
| `PRIVACY_SUBJECT_NOT_ARCHIVED` | Cette fiche n'est plus archivée. Elle a été actualisée. |
| `PRIVACY_SUBJECT_ANONYMIZED` | Cette fiche est anonymisée : elle ne peut plus être désarchivée. |
| `PRIVACY_SUBJECT_HAS_ACTIVE_SUBSCRIPTION` | Tous les abonnements doivent être terminés ou annulés. |
| `PRIVACY_SUBJECT_HAS_OPEN_REQUEST` | Toutes les demandes du prospect doivent être clôturées avant de l'archiver. |
| `PRIVACY_CONFIRMATION_MISMATCH` | Le nom saisi ne correspond pas. |
| `PRIVACY_RETENTION_HOLD_ACTIVE` | Un blocage de conservation est actif sur ce client. Lève-le avant d'anonymiser. |
| `PRIVACY_HOLD_ALREADY_ACTIVE` | Un blocage de ce type est déjà actif sur ce client. |
| `PRIVACY_HOLD_NOT_FOUND` | Ce blocage est introuvable. La liste a été actualisée. |
| `PRIVACY_HOLD_ALREADY_RELEASED` | Ce blocage a déjà été levé. La liste a été actualisée. |
| `PRIVACY_ROUTE_UNEXPECTED_FAILURE` | L'action n'a pas pu être confirmée. Réessaie dans un instant. |
| `CUSTOMER_ARCHIVED` | Ce client est archivé : désarchive-le pour modifier sa fiche. |
| `PROSPECT_ARCHIVED` | Ce prospect est archivé : désarchive-le pour modifier sa demande. |

## progress

Source : `packages/shared/src/progress/contracts.ts · progressErrorCodes`

| Code | Message affiché |
| --- | --- |
| `PROGRESS_INVALID_INPUT` | Vérifie la date et les mesures : au moins une valeur positive, deux décimales au maximum, sans date future. |
| `PROGRESS_SUBSCRIPTION_NOT_ELIGIBLE` | L’abonnement doit être actif ou en pause pour enregistrer une mesure. |
| `PROGRESS_HEALTH_CONSENT_REQUIRED` | Le consentement actuel aux données de santé doit être accordé avant toute nouvelle mesure. |
| `PROGRESS_MEASUREMENT_DUPLICATE` | Cette mesure est déjà enregistrée. L’historique a été actualisé. |
| `PROGRESS_MEASUREMENT_NOT_FOUND` | Cet abonnement ou cette mesure est introuvable. |
| `GOAL_NOT_FOUND` | Cet abonnement ou cet objectif est introuvable. |
| `GOAL_INVALID_INPUT` | Vérifie les informations de l’objectif. |
| `GOAL_SUBSCRIPTION_NOT_ELIGIBLE` | Un objectif se crée uniquement pour un abonnement actif ou en pause. |
| `GOAL_METRIC_INVALID` | Choisis une mesure prise en charge. |
| `GOAL_NUMERIC_FIELDS_INCOMPLETE` | Renseigne ensemble la valeur de départ, la cible et l’unité. |
| `GOAL_TARGET_INVALID` | Vérifie les valeurs de départ et cible. Pour une mesure, elles doivent être positives et différentes. |
| `GOAL_TARGET_DATE_INVALID` | L’échéance de création doit être une date future valide. |
| `GOAL_TRANSITION_INVALID` | Cette décision n’est plus disponible. Les objectifs ont été actualisés. |
| `GOAL_OUTCOME_REASON_REQUIRED` | Un motif est obligatoire pour annuler ou confirmer un résultat différent de la suggestion, y compris sans suggestion. |
| `PROGRESS_ADMIN_FORBIDDEN` | Cet espace est réservé à l’administrateur. |
| `PROGRESS_ROUTE_UNEXPECTED_FAILURE` | L’action n’a pas pu être confirmée. Actualise la progression avant de réessayer. |

## questionnaires

Source : `packages/shared/src/questionnaires/contracts.ts · questionnaireErrorCodes`

| Code | Message affiché |
| --- | --- |
| `QUESTIONNAIRE_INVALID_INPUT` | Vérifie les informations saisies et la date d’expiration. |
| `QUESTIONNAIRE_TEMPLATE_INVALID` | Vérifie les questions, les choix, les limites et les règles de signalement. |
| `QUESTIONNAIRE_ANSWERS_INVALID` | Vérifie les réponses obligatoires et les limites de chaque question. |
| `QUESTIONNAIRE_NOT_FOUND` | Modèle, abonnement ou lien introuvable. |
| `QUESTIONNAIRE_ADMIN_FORBIDDEN` | - |
| `QUESTIONNAIRE_INVALID_STATE` | Ce questionnaire ne peut pas être modifié dans l’état actuel de l’abonnement. |
| `QUESTIONNAIRE_TEMPLATE_IMMUTABLE` | Cette version est déjà publiée. Crée une nouvelle version pour la modifier. |
| `QUESTIONNAIRE_VERSION_CONFLICT` | Cette référence ou version existe déjà. Actualise la liste des modèles. |
| `QUESTIONNAIRE_ASSIGNMENT_INVALID` | La configuration doit désigner un modèle publié valide. |
| `QUESTIONNAIRE_NOT_ASSIGNED` | Aucun questionnaire n’est prévu pour cet abonnement. |
| `QUESTIONNAIRE_STALE_REVISION` | Une autre révision a été enregistrée. Actualise avant de corriger les réponses. |
| `QUESTIONNAIRE_STALE_SCHEMA` | Le questionnaire a changé. Actualise avant de saisir les réponses. |
| `QUESTIONNAIRE_HISTORY_INVALID` | - |
| `QUESTIONNAIRE_HEALTH_CONSENT_REQUIRED` | L’accord actuel au traitement des données de santé est nécessaire. Recueille-le avec le lien client. |
| `QUESTIONNAIRE_HEALTH_CONSENT_WITHDRAWN` | La cliente a retiré son accord au traitement des données de santé : ses réponses ne sont plus consultables. |
| `QUESTIONNAIRE_HEALTH_DEFINITION_MISSING` | Un document de consentement aux données de santé doit être publié avant ce recueil. |
| `QUESTIONNAIRE_LINK_INVALID` | Ce lien est invalide. Demande un nouveau lien au coach. |
| `QUESTIONNAIRE_LINK_EXPIRED` | Ce lien a expiré. Demande un nouveau lien au coach. |
| `QUESTIONNAIRE_LINK_REVOKED` | Ce lien a été révoqué. Demande un nouveau lien au coach. |
| `QUESTIONNAIRE_LINK_CONSUMED` | Ce lien a déjà été utilisé. Aucun nouvel envoi n’est possible avec ce lien. |
| `QUESTIONNAIRE_LINK_STALE` | Le questionnaire ou le consentement a changé, ou une réponse a déjà été enregistrée. Demande un nouveau lien au coach. |
| `QUESTIONNAIRE_RATE_LIMITED` | Trop de tentatives. Réessaie dans une minute. |
| `QUESTIONNAIRE_ROUTE_UNEXPECTED_FAILURE` | - |

## quotes

Source : `packages/shared/src/quotes/contracts.ts · quoteErrorCodes`

| Code | Message affiché |
| --- | --- |
| `QUOTE_NOT_FOUND` | Ce devis ou cet abonnement est introuvable. |
| `QUOTE_INVALID_INPUT` | Vérifie le montant entier, les conditions et les dates explicites en heure de Libreville. |
| `QUOTE_INVALID_STATE` | Cette action n’est plus disponible. Actualise le devis. |
| `QUOTE_VERSION_IMMUTABLE` | Cette version est émise et ne peut plus être modifiée. Crée une nouvelle version. |
| `QUOTE_NUMBER_CONFLICT` | Le numéro n’a pas pu être attribué. Actualise avant de réessayer. |
| `QUOTE_VERSION_CONFLICT` | Une autre opération a modifié les versions. Actualise le devis. |
| `QUOTE_LINK_INVALID` | Ce lien de devis est invalide. |
| `QUOTE_LINK_EXPIRED` | Le lien ou le devis a expiré. Contacte ton coach. |
| `QUOTE_LINK_REVOKED` | Ce lien a été révoqué. Contacte ton coach. |
| `QUOTE_LINK_CONSUMED` | Ce lien a déjà enregistré une réponse. Aucune autre décision ne peut être envoyée. |
| `QUOTE_RESPONSE_CONFLICT` | Une réponse est déjà enregistrée pour cette version. Actualise le devis. |
| `QUOTE_SYNC_REQUIRES_ACCEPTANCE` | La version courante doit être acceptée avant la synchronisation. |
| `QUOTE_SYNC_FINANCE_CONFLICT` | Le montant diffère et une activité financière existe déjà. La synchronisation est bloquée ; l’historique financier est conservé. |
| `QUOTE_RATE_LIMITED` | Trop de tentatives. Patiente avant de réessayer. |
| `QUOTE_ADMIN_FORBIDDEN` | Cet espace est réservé à l’administrateur. |
| `QUOTE_ROUTE_UNEXPECTED_FAILURE` | L’opération n’a pas pu être confirmée. Actualise le devis avant de réessayer. |

## receipts

Source : `packages/shared/src/receipts/contracts.ts · receiptErrorCodes`

| Code | Message affiché |
| --- | --- |
| `RECEIPT_NOT_FOUND` | Ce reçu ou cet abonnement est introuvable. |
| `RECEIPT_INVALID_INPUT` | Vérifie les champs saisis, la date et le motif d’annulation. |
| `RECEIPT_INVALID_PAYMENT` | Ce paiement n’est pas éligible à un reçu. Il doit être confirmé et rattaché à cet abonnement. |
| `RECEIPT_ALREADY_EXISTS` | Un reçu existe déjà pour ce paiement. Actualise la liste. |
| `RECEIPT_NUMBER_CONFLICT` | Le numéro n’a pas pu être attribué. Aucun nouveau reçu n’a été émis ; actualise avant de réessayer. |
| `RECEIPT_ISSUE_CONFLICT` | L’historique ne permet pas d’établir ce reçu sans ambiguïté. Aucun reçu n’a été émis ; contacte l’administrateur. |
| `RECEIPT_PDF_FAILURE` | Le PDF est momentanément indisponible. Vérifie l’état du reçu avant de réessayer. |
| `RECEIPT_LINK_INVALID` | Ce lien est invalide. Demande un nouveau lien à ton coach. |
| `RECEIPT_LINK_EXPIRED` | Ce lien a expiré. Demande un nouveau lien à ton coach. |
| `RECEIPT_LINK_REVOKED` | Ce lien a été révoqué. Demande un nouveau lien à ton coach. |
| `RECEIPT_LINK_CONSUMED` | La limite de téléchargements est atteinte. Demande un nouveau lien à ton coach. |
| `RECEIPT_VOID_NOT_ALLOWED` | Le reçu ne peut être annulé que lorsque son paiement est entièrement corrigé. |
| `RECEIPT_ALREADY_VOIDED` | Ce reçu est déjà annulé. Son numéro et son PDF historique restent conservés. |
| `RECEIPT_CONCURRENCY_CONFLICT` | Une autre opération a modifié ces informations. Actualise avant de réessayer. |
| `RECEIPT_ADMIN_FORBIDDEN` | Cet espace est réservé à l’administrateur. |
| `RECEIPT_RATE_LIMITED` | Trop de tentatives. Patiente une minute avant de réessayer. |
| `RECEIPT_ROUTE_UNEXPECTED_FAILURE` | L’opération n’a pas pu être confirmée. Vérifie l’état du reçu avant de réessayer. |

## requests

Source : `packages/shared/src/requests/contracts.ts · requestErrorCodes`

| Code | Message affiché |
| --- | --- |
| `REQUEST_ROUTE_UNEXPECTED_FAILURE` | Une erreur est survenue. Réessaie dans un instant. |
| `REQUEST_INVALID_INPUT` | Vérifie les informations saisies (nom, WhatsApp) puis réessaie. |
| `REQUEST_SERVICE_NOT_FOUND` | Ce service n'est plus disponible pour une nouvelle demande. Actualise la page. |
| `REQUEST_SERVICE_NOT_PUBLIC` | Ce service n'est plus disponible pour une nouvelle demande. Actualise la page. |
| `REQUEST_SERVICE_UNAVAILABLE` | Ce service est temporairement fermé aux nouvelles demandes. |
| `REQUEST_SERVICE_ARCHIVED` | Ce service n'est plus disponible pour une nouvelle demande. Actualise la page. |
| `REQUEST_WAITLIST_REQUIRED` | Ce service accepte uniquement les inscriptions sur liste d'attente. |
| `REQUEST_VARIANT_INVALID` | L'option sélectionnée n'est plus disponible. Choisis une autre option. |
| `REQUEST_RATE_LIMITED` | Trop de tentatives. Réessaie dans quelques minutes. |
| `REQUEST_ADMIN_FORBIDDEN` | Accès réservé à l'administrateur. |
| `REQUEST_NOT_FOUND` | Cette demande est introuvable. Actualise la liste. |
| `REQUEST_INVALID_TRANSITION` | Ce changement de statut n'est pas autorisé depuis l'état actuel. |
| `REQUEST_CONTACT_ATTEMPT_INVALID_INPUT` | Vérifie les informations du contact (canal, sens, résultat) puis réessaie. |
| `REQUEST_STATUS_INVALID_INPUT` | Le statut demandé n'est pas valide. |
| `REQUEST_QUALIFICATION_REVIEW_INVALID_INPUT` | Vérifie la décision de qualification puis réessaie. |
| `REQUEST_FINAL_VARIANT_REQUIRED` | Choisis l'option retenue pour cette offre. |
| `REQUEST_FINAL_VARIANT_NOT_APPLICABLE` | Cette offre n'a pas d'option : laisse le champ vide. |
| `REQUEST_WAITLIST_INVALID_INPUT` | Vérifie les informations de liste d'attente puis réessaie. |
| `REQUEST_WAITLIST_NOT_ELIGIBLE` | Cette demande ne peut pas être ajoutée à la liste d'attente. |
| `REQUEST_WAITLIST_ALREADY_ACTIVE` | Cette demande est déjà active en liste d'attente. |
| `REQUEST_WAITLIST_ENTRY_NOT_FOUND` | Aucune entrée active en liste d'attente n'a été trouvée. |
| `REQUEST_ALREADY_CONVERTED` | Cette demande a déjà été convertie. Actualise sa fiche. |
| `REQUEST_CONVERSION_NOT_ELIGIBLE` | Cette demande doit être qualifiée avant de pouvoir être convertie. |
| `REQUEST_CONVERSION_QUALIFICATION_INVALID` | La qualification actuelle est incomplète ou incohérente. Vérifie la décision avant de convertir. |
| `REQUEST_CONVERSION_START_DATE_REQUIRED` | Renseigne une date de début prévue pour convertir cette demande. |
| `REQUEST_CONVERSION_DURATION_INVALID` | La durée du service est invalide. Vérifie le catalogue avant de convertir cette demande. |

## subscriptions

Source : `packages/shared/src/subscriptions/contracts.ts · subscriptionErrorCodes`

| Code | Message affiché |
| --- | --- |
| `SUBSCRIPTION_NOT_FOUND` | Cet abonnement est introuvable. |
| `SUBSCRIPTION_INVALID_INPUT` | Vérifie les informations saisies et renseigne le motif demandé. |
| `SUBSCRIPTION_TRANSITION_INVALID` | Cette action n’est plus disponible dans l’état actuel. La fiche a été actualisée. |
| `SUBSCRIPTION_BLOCKED` | Des exigences de préparation, d’acceptation ou de validation médicale restent bloquantes. Ouvre l’onboarding pour les vérifier. |
| `SUBSCRIPTION_ALREADY_STARTED` | Une date de démarrage existe déjà. Vérifie l’historique. |
| `SUBSCRIPTION_PAUSE_ALREADY_OPEN` | Une pause est déjà ouverte. |
| `SUBSCRIPTION_PAUSE_NOT_FOUND` | La pause ouverte est introuvable ou incohérente. Vérifie l’historique avant de poursuivre. |
| `SUBSCRIPTION_RESUME_DATE_INVALID` | Choisis une date de fin future, au moins égale à la fin initiale. Pour reprendre une pause avec fin prévue, cette date est obligatoire. |
| `SUBSCRIPTION_COMPLETION_REASON_REQUIRED` | Un motif non vide est obligatoire pour cette décision. |
| `SUBSCRIPTION_COMPONENTS_OUTSTANDING` | Des prestations restent dues par le coach. Résous ce solde ou confirme explicitement une dérogation motivée. |
| `SUBSCRIPTION_RENEWAL_ALREADY_EXISTS` | Un renouvellement existe déjà. Ouvre l’abonnement lié. |
| `SUBSCRIPTION_DURATION_INVALID` | La durée enregistrée est incohérente. Fais vérifier cet abonnement avant de poursuivre. |
| `SUBSCRIPTION_ADMIN_FORBIDDEN` | Cet espace est réservé à l’administrateur. |
| `SUBSCRIPTION_ROUTE_UNEXPECTED_FAILURE` | L’action n’a pas pu être confirmée. Actualise la fiche avant de réessayer. |

## supervision

Source : `packages/shared/src/supervision/contracts.ts · supervisionErrorCodes`

| Code | Message affiché |
| --- | --- |
| `SUPERVISION_SUPERADMIN_FORBIDDEN` | - |
| `SUPERVISION_INVALID_INPUT` | - |
| `SUPERVISION_JOB_NOT_RUNNABLE` | - |
| `SUPERVISION_JOB_BUSY` | - |
| `SUPERVISION_RATE_LIMITED` | - |
| `SUPERVISION_ROUTE_UNEXPECTED_FAILURE` | - |

## démarrage production (S7.4a)

Source : `packages/server/src/runtime/production-guards.ts · productionGuardCodes`

| Code | Message affiché |
| --- | --- |
| `SECURITY_FLOOR` | - |
| `ENV_MISSING` | - |
| `ENV_WEAK_SECRET` | - |
| `APP_BASE_URL_NOT_HTTPS` | - |
| `DATABASE_TARGET_FORBIDDEN` | - |
| `PRIVACY_JOURNAL_UNAVAILABLE` | - |
| `PATH_NOT_ABSOLUTE` | - |
| `PRIVACY_JOBS_DISABLED` | - |
| `DEMO_CONSENT_PUBLISHED` | - |

## sauvegarde / restauration (S7.4b)

Source : `packages/server/src/ops/ops-errors.ts · opsErrorCodes`

| Code | Message affiché |
| --- | --- |
| `BACKUP_KEY_INVALID` | - |
| `PG_CLIENT_TOO_OLD` | - |
| `DUMP_FAILED` | - |
| `ENCRYPT_FAILED` | - |
| `VERIFY_FAILED` | - |
| `SECONDARY_COPY_FAILED` | - |
| `ROTATION_FAILED` | - |
| `MANIFEST_INVALID` | - |
| `TARGET_FORBIDDEN` | - |
| `TARGET_NOT_EMPTY` | - |
| `RESTORE_FAILED` | - |
| `REPLAY_FAILED` | - |
| `DRILL_MISMATCH` | - |
| `ENV_INVALID` | - |
| `SUPERADMIN_ONLY_VIA_BOOTSTRAP` | - |
| `USER_EMAIL_TAKEN` | - |
| `USER_NOT_FOUND` | - |
| `USER_WRITE_FAILED` | - |

## plancher de sécurité (SEC-01)

Source : `packages/server/src/security/runtime-floor.startup.ts · SECURITY_FLOOR_NOT_MET`

| Code | Message affiché |
| --- | --- |
| `SECURITY_FLOOR_NOT_MET` | - |

## requêtes HTTP (SEC-01)

Source : `packages/server/src/security/reject-encoded-request-bodies.ts · REQUEST_ENCODING_UNSUPPORTED`

| Code | Message affiché |
| --- | --- |
| `REQUEST_ENCODING_UNSUPPORTED` | - |
