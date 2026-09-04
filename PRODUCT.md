# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Operadores de iluminação (Light Designers / LDs), DJs, e técnicos de palco que utilizam o Steam Deck (SteamOS Gaming Mode a 1280x800) para controlar setups de iluminação ao vivo com o software Lumikit instalado em estações de trabalho dedicadas (ex: PC Favela, PC Maria).

## Product Purpose

Fornecer uma interface ultra-rápida, tátil e ergonômica via gamepad para disparos instantâneos de cenas DMX no Lumikit com zero latência perceptível, alternando de forma transparente entre o **Modo Live** (onde as teclas disparam a iluminação no palco) e o **Modo Edição** (onde o direcional D-Pad navega e configura o mapeamento de cenas, páginas, IPs e scripts locais).

## Positioning

Diferente de controladores MIDI convencionais ou softwares pesados de mesa DMX, o Lumikit Deck Control transforma o Steam Deck em um console portátil dedicado para shows ao vivo, integrando Steam Input (D-Pad F1–F4 e botões de ação), chamadas REST diretas e execução de scripts de automação sem depender de navegadores externos ou cabos adicionais.

## Operating Context

- **Ambiente:** Cabines de DJ, palcos, mesas de som/luz e coxias com iluminação ambiente escura ou estroboscópica (exigindo alto contraste e legibilidade imediata).
- **Dispositivo Primário:** Steam Deck (1280x800, 60Hz/90Hz, SteamOS Gaming Mode).
- **Controles:** Gamepad físico / Steam Input, tela sensível ao toque (touchscreen) e suporte auxiliar a teclado/mouse.
- **Rede Local:** Comunicação HTTP REST com endpoints Lumikit (`GET /services/edmx_change_scene/{page}/{scene}`) em hosts locais com resolução DNS e cache inteligente.

## Capabilities and Constraints

- **Mapeamento de Teclas:** F1 a F12 configuráveis por host com Page (1..99 na UI / 0..98 na API), Scene (1..99 na UI / 0..98 na API) e comandos de script opcionais (`.sh`/`.bat`).
- **Navegação D-Pad em Edição:** No Modo Edição, as teclas `F1–F4` são interceptadas no nível da aplicação para mover o foco e ajustar steppers sem disparar comandos DMX.
- **Prevenção de Falso Positivo:** Botão `A` foca campos para abertura de teclado virtual no SteamOS (`Steam + X`), sem disparar submissões acidentais.
- **Arquitetura CSS:** 100% livre de CSS inline (`styles.css` centralizado com tokens e temas semânticos).
- **Multi-Host:** Alternância rápida e configuração de rede para múltiplos computadores na mesma rede local.

## Brand Commitments

- **Identidade Visual:** Tema *Cyber Slate & Sky Blue* (`#080c14`, `#1e293b`, `#38bdf8`) com indicadores de status vibrantes (Verde `#34d399` para conectado, Vermelho `#f87171` para erro, Âmbar `#fbbf24` para aviso).
- **Tipografia:** `Chakra Petch` (títulos e botões técnicos) e `Inter` (corpo e labels informativos).

## Evidence on Hand

- Implementação Electron + Chromium validada com resolução 1280x800.
- Layout de 3 telas (`#view-home`, `#view-choose-host`, `#view-edit-grid`) e 2 modais de configuração ativos.
- Plano de refatoração aprovado em `docs/plano_de_refatoração_da_UI.md`.

## Product Principles

1. **Zero-Latency Stage Triggering:** Durante o show ao vivo, qualquer toque ou botão deve disparar a cena no Lumikit imediatamente sem intermediários pesados.
2. **Gamepad & SteamOS Ergonomics First:** Todas as ações devem ser 100% operáveis com D-Pad, botões físicos e touchscreen sem exigir teclado físico.
3. **High Contrast Dark Mode:** Interfaces desenhadas para ambientes de show escuros, com foco nítido e estado visual inequívoco.
4. **Safety & Zero Disruption:** Prevenir disparos acidentais ao configurar cenas e garantir que desconexões de rede sejam visíveis instantaneamente.
