#!/bin/bash

# Carrega o Node / NVM para garantir que 'node' seja encontrado mesmo fora do terminal
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
export PATH="$HOME/.nvm/versions/node/$(ls $HOME/.nvm/versions/node 2>/dev/null | tail -n 1)/bin:$PATH"

# Define o diretório raiz do seu projeto Lumikit
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"

# 🛑 CORREÇÃO CRÍTICA: Define o backend gráfico para Wayland
# Isso garante que o Electron saiba como se conectar ao GameScope.
export GDK_BACKEND=wayland,x11

# 🛑 CORREÇÃO CRÍTICA 2: Configuração do Display
export DISPLAY=:0

cd "$PROJECT_DIR" || exit 1

# Inicia o Electron com --no-sandbox (necessário no SteamOS)
./node_modules/.bin/electron . --no-sandbox
