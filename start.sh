#!/data/data/com.termux/files/usr/bin/bash

# ──────────────────────────────────────────
# Cria a flag que autoriza o envio da
# mensagem de online nesta inicialização.
# ──────────────────────────────────────────
mkdir -p data
echo "$(date +%s)" > data/.send_online

node index.js
