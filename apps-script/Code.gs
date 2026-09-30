/**
 * Karting Roussillon — Web App d'envoi des emails transactionnels (Gmail).
 *
 * Appelée uniquement par l'Edge Function Supabase `send-emails`.
 * Installation : voir apps-script/README.md.
 *
 * Propriété du script requise : SHARED_SECRET (même valeur que le secret
 * APPS_SCRIPT_SECRET de l'Edge Function).
 *
 * Corps attendu (JSON) :
 * {
 *   "secret": "…", "to": "client@exemple.fr", "subject": "…",
 *   "html": "<!doctype html>…", "text": "…", "name": "Karting Roussillon",
 *   "replyTo": "contact@…" (facultatif),
 *   "inlineImages": { "qr": { "base64": "…", "mimeType": "image/png", "name": "qr.png" } } (facultatif),
 *   "attachments": [{ "base64": "…", "mimeType": "application/pdf", "name": "bon-cadeau.pdf" }] (facultatif)
 * }
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');

    if (!secret || body.secret !== secret) return json_({ ok: false, error: 'unauthorized' });
    if (!body.to || !body.subject || !body.html) return json_({ ok: false, error: 'invalid payload' });

    var options = { htmlBody: body.html, name: body.name || 'Karting Roussillon' };
    if (body.replyTo) options.replyTo = body.replyTo;
    if (body.inlineImages) {
      options.inlineImages = {};
      Object.keys(body.inlineImages).forEach(function (cid) {
        var image = body.inlineImages[cid];
        options.inlineImages[cid] = Utilities.newBlob(
          Utilities.base64Decode(image.base64),
          image.mimeType || 'image/png',
          image.name || cid
        );
      });
    }
    if (body.attachments && body.attachments.length) {
      options.attachments = body.attachments.map(function (file) {
        return Utilities.newBlob(Utilities.base64Decode(file.base64), file.mimeType || 'application/pdf', file.name || 'piece-jointe.pdf');
      });
    }

    // MailApp : autorisation limitée à l'envoi (pas de lecture de la boîte mail)
    MailApp.sendEmail(body.to, body.subject, body.text || '', options);
    return json_({ ok: true, remainingDailyQuota: MailApp.getRemainingDailyQuota() });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

/** Test manuel depuis l'éditeur : envoie un email à l'adresse du compte. */
function testSend() {
  var me = Session.getActiveUser().getEmail();
  MailApp.sendEmail(me, 'Test Karting Roussillon', 'La Web App peut envoyer des emails.', {
    htmlBody: '<p>La Web App peut envoyer des emails.</p>',
    name: 'Karting Roussillon',
  });
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
