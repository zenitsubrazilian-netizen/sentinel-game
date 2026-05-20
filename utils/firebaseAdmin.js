'use strict';
const admin = require('firebase-admin');
const path  = require('path');

// Baixe em: Console Firebase → ⚙️ Configurações → Contas de serviço → Gerar nova chave
const SA = path.join(__dirname, '..', 'serviceAccountKey.json');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert(SA) });
}

module.exports = { db: admin.firestore() };
