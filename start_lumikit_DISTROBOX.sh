#!/bin/bash

# Nome do seu contêiner Distrobox
CONTAINER_NAME="toolbox"

# Define o diretório raiz do seu projeto Lumikit
PROJECT_DIR="/home/bazzite/PROJETOS/lumikit-steamdeck-control/"

# 🛑 CORREÇÃO CRÍTICA: Define o backend gráfico para Wayland
# Isso garante que o Electron saiba como se conectar ao GameScope.
# Se o Wayland não funcionar, ele deve tentar fallback para XWayland.
export GDK_BACKEND=wayland,x11

# Executa o comando dentro do Distrobox
# O `cd` e a execução do Electron são combinados em uma única chamada.
distrobox enter -- bash -c "cd '$PROJECT_DIR' && ./node_modules/.bin/electron . --no-sandbox"
