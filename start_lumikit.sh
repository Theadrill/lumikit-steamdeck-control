#!/bin/bash

# Define o diretório raiz do seu projeto Lumikit
PROJECT_DIR="/home/deck/PROJETOS/lumikit-steamdeck-control/"

# 🛑 CORREÇÃO CRÍTICA: Define o backend gráfico para Wayland
# Isso garante que o Electron saiba como se conectar ao GameScope.
# Se o Wayland não funcionar, ele deve tentar fallback para XWayland.
export GDK_BACKEND=wayland,x11

# Navega para o diretório do projeto
cd "$PROJECT_DIR"

# Executa o aplicativo Electron a partir da node_modules
# Mantemos o gamemoderun, que é inofensivo no modo desktop e útil no modo gaming.
./node_modules/.bin/electron . --no-sandbox
