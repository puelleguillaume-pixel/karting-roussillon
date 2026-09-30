# Envoi des emails via Gmail (Google Apps Script)

Les emails transactionnels (confirmations avec QR code, rappels, annulations, reports, bons cadeaux, notifications au dirigeant) partent du compte Gmail ou Google Workspace du circuit. Ils passent par une petite Web App Apps Script appelée par l'Edge Function Supabase `send-emails`.

```
base (email_outbox) ──pg_cron + pg_net──▶ Edge Function send-emails ──HTTPS + secret──▶ Apps Script ──▶ Gmail
```

## Installation (une fois)

1. Connectez-vous à [script.google.com](https://script.google.com) avec le compte qui doit envoyer les emails, par exemple l'adresse du circuit.
2. Créez un projet nommé « Karting Roussillon — emails ».
3. Collez le contenu de `Code.gs`.
4. Dans *Paramètres du projet*, cochez « Afficher le fichier manifeste appsscript.json » et remplacez son contenu par celui de `appsscript.json`.
5. Toujours dans *Paramètres du projet* → *Propriétés du script*, ajoutez `SHARED_SECRET`. Mettez-y une longue valeur aléatoire (par exemple le résultat de `openssl rand -hex 32`) : c'est le `APPS_SCRIPT_SECRET` de l'Edge Function.
6. Lancez la fonction `testSend` depuis l'éditeur et acceptez l'autorisation. Elle ne demande que l'envoi d'emails, pas la lecture de la boîte. Un email de test arrive sur le compte.
7. Faites *Déployer* → *Nouveau déploiement* → type *Application Web* :
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde**. L'accès reste protégé par le secret partagé.
8. Copiez l'URL qui se termine par `/exec` : c'est `APPS_SCRIPT_URL`.

Si vous modifiez le script, redéployez via *Gérer les déploiements* → *Modifier* → *Nouvelle version* : l'URL reste la même.

## Quotas Google

| Compte | Destinataires par jour |
|---|---|
| Gmail gratuit | 100 |
| Google Workspace | 1 500 |

La réponse de la Web App indique le quota restant (`remainingDailyQuota`). Au-delà, les emails restent en file et sont retentés : 5 essais, espacés de 2, 4, 8 puis 16 minutes.

## Délivrabilité

- Avec Google Workspace sur le domaine du circuit, les emails sont signés (SPF / DKIM) au nom du domaine.
- Avec un compte Gmail gratuit, ils partent de l'adresse `@gmail.com`. Une adresse de réponse peut être fixée avec `EMAIL_REPLY_TO`.
