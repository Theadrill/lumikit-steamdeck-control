# 🔒 REGRA DE OURO IRREVOGÁVEL (IMPORTANTE / OBRIGATÓRIO)
> **ATENÇÃO AO MODELO / ASSISTENTE DE IA:**
> **É EXPRESSAMENTE E IRREVOGAVELMENTE PROIBIDO REALIZAR QUALQUER COMMIT OU PUSH AUTOMATICAMENTE.**
> O modelo **NUNCA** deve executar `git commit` ou `git push` por iniciativa própria.
> O modelo deve realizar as alterações solicitadas, executar os testes locais e **AGUARDAR** a validação humana.
> **SOMENTE** quando o usuário disser expressamente para commitar/fazer push, o modelo executará o comando **UMA ÚNICA VEZ** e voltará a aguardar novas instruções.

---

# 📋 Plano de Refatoração da UI/UX — Lumikit Steam Deck Control

## 🎯 Objetivo
Migrar a interface gráfica legada (`index.html`, `styles.css`, `renderer.js`) para a nova experiência otimizada para o **Steam Deck (Gaming Mode 1280x800)** validada no `mock/index.html`, **MANTENDO 100% DAS REGRAS DE NEGÓCIO, IPCs, CONFIGURAÇÕES E DISPAROS REST EXISTENTES**.

---

## 🏗️ Princípios de Engenharia e Compatibilidade
1. **Preservação Total da Lógica**:
   - Manutenção de todos os canais IPC (`get-config`, `save-config`, `connect-host`, `disconnect-host`, `get-status`, `test-connection`, `simulate-f-key`, `run-command`, `get-os`).
   - Manutenção do fallback DNS, cache de IP e chamadas REST `/services/edmx_change_scene/{page}/{scene}`.
   - Manutenção da execução de scripts externos (`.bat` / `.sh`) configurados para as teclas (F10–F12).
   - Manutenção do indexador humano (UI: 1-based, Config/REST: 0-based).
2. **Ergonomia e Navegação Gamepad-First**:
   - D-Pad físico do Steam Deck (F1=Left, F2=Up, F3=Right, F4=Down) interceptado no modo de edição para navegar entre cards/telas sem disparar DMX.
   - Botões de Ação: `A` (Confirmar/Abrir), `B` (Voltar/Cancelar), `X` (Editar Host/IP), `Y` (Salvar Alterações).
   - Steppers (`‹` e `›`) operáveis por toque, mouse e gatilhos `L2 / R2`.
3. **Validação Contínua**: O desenvolvimento será feito em etapas isoladas com paradas críticas para teste direto no Steam Deck.

---

## 🚦 Fases de Execução e Paradas Críticas

### 📦 FASE 1: Estrutura HTML & Design Tokens CSS (Sem quebrar lógica)
* **Objetivo**: Integrar a nova estrutura visual de 3 telas (`#view-home`, `#view-choose-host`, `#view-edit-grid`) e 2 modais (`#host-address-modal-overlay`, `#card-modal-overlay`) no `index.html` e `styles.css`.
* **Ações**:
  1. Atualizar `styles.css` com as variáveis `:root` Dark/Neon, grids responsivos e animações.
  2. Atualizar `index.html` com a hierarquia semântica do mock e rodapé de atalhos contextuais.
* **🛑 PARADA CRÍTICA 1 (Validação Visual)**:
  - Abrir o app no Steam Deck (`./start_lumikit.sh`).
  - Verificar se a tela inicial carrega limpa em 1280x800 sem barras de rolagem ou quebras visuais.

---

### 🎮 FASE 2: Máquina de Estados de Navegação e Gamepad no `renderer.js`
* **Objetivo**: Implementar a máquina de estados que alterna entre:
  - `home` (Modo Live Operation)
  - `choose-host` (Seleção de Host para Edição)
  - `grid` (Grid de 12 Cards F1–F12)
  - `modal-card` (Edição de Página/Cena com Steppers)
  - `modal-host` (Edição de IP/Porta do Host)
* **Ações**:
  1. Criar o interceptor de teclas locais para D-Pad (`F1`–`F4`), Gatilhos (`L2`/`R2`) e botões (`A`/`Enter`, `B`/`Escape`, `X`, `Y`).
  2. Garantir que no modo `home` as teclas acionem a simulação de disparo live e nos outros modos sejam consumidas para navegação.
* **🛑 PARADA CRÍTICA 2 (Validação de Navegação)**:
  - Navegar entre telas usando teclado, mouse e controles do Steam Deck.
  - Testar a abertura e fechamento de modais com `A` e `B`.

---

### 🔌 FASE 3: Conexão com IPCs, REST e Sincronização de Configurações
* **Objetivo**: Conectar a nova UI aos métodos IPC reais do Electron.
* **Ações**:
  1. Carregar configuração real do `config.json` via `getConfig()` e preencher cards e dados dos hosts (`favela` e `maria`).
  2. Implementar `connectHost()` na tela inicial com indicador visual de status em tempo real (`connection-status-update`).
  3. Implementar salvamento de alterações (`saveConfig()`) com toast de feedback.
  4. Implementar teste de conexão (`testConnection()`) no modal de endereço de host.
  5. Sincronizar scripts associados (`.bat`/`.sh`) nos cards F10–F12.
* **🛑 PARADA CRÍTICA 3 (Validação Funcional End-to-End)**:
  - Alterar página/cena de um card e salvar com `Y` ou botão Salvar.
  - Reiniciar o app e verificar se os valores persistiram no `config.json`.
  - Testar a troca de host ativo (`PC Favela` vs `PC Maria`) e o teste de conectividade.

---

### 🚀 FASE 4: Ajustes Finos de GameScope e Produção
* **Objetivo**: Polimento final da experiência no SteamOS Game Mode.
* **Ações**:
  1. Validar foco automático e teclado virtual do SteamOS (`Steam + X`) nos campos de texto.
  2. Verificar comportamento do System Tray e atalhos globais em segundo plano.
* **🛑 PARADA CRÍTICA 4 (Aprovação Final do Usuário)**:
  - Usuário realiza o teste geral no Steam Deck e autoriza a finalização.

---

# 🔒 REGRA DE OURO IRREVOGÁVEL (IMPORTANTE / OBRIGATÓRIO)
> **ATENÇÃO AO MODELO / ASSISTENTE DE IA:**
> **É EXPRESSAMENTE E IRREVOGAVELMENTE PROIBIDO REALIZAR QUALQUER COMMIT OU PUSH AUTOMATICAMENTE.**
> O modelo **NUNCA** deve executar `git commit` ou `git push` por iniciativa própria.
> O modelo deve realizar as alterações solicitadas, executar os testes locais e **AGUARDAR** a validação humana.
> **SOMENTE** quando o usuário disser expressamente para commitar/fazer push, o modelo executará o comando **UMA ÚNICA VEZ** e voltará a aguardar novas instruções.
