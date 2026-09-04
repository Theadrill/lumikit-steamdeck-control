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

## 🎮 REGRA DE NEGÓCIO CENTRAL: Steam Input D-Pad (F1–F4) & Modos de Operação

O layout do **Steam Input** no Steam Deck mapeia o direcional físico (D-Pad) para as teclas de função `F1` a `F4`:
- ⬅️ **D-Pad Left:** `F1`
- ⬆️ **D-Pad Up:** `F2`
- ➡️ **D-Pad Right:** `F3`
- ⬇️ **D-Pad Down:** `F4`

### 🔄 Modos de Operação:
1. **Modo Live (Tela Principal `#view-home`):**
   - As teclas `F1` a `F12` atuam como **disparadores de cenas DMX no Lumikit** via REST API (e executam scripts de automação `.bat`/`.sh` vinculados).
   - O usuário pode controlar a iluminação ao vivo livremente.
2. **Modo Edição (Ao entrar em `#view-choose-host`, `#view-edit-grid` ou Modais):**
   - O app **intercepta e consome `F1` a `F4` localmente**, desativando os disparos REST de iluminação.
   - As teclas passam a funcionar exclusivamente para **navegação direcional na interface**:
     - `F1` (Left): Navega para o card à esquerda / Decrementa valor no modal (`‹`).
     - `F2` (Up): Navega para o card de cima / Alterna para campo superior (Página / Nome).
     - `F3` (Right): Navega para o card à direita / Incrementa valor no modal (`›`).
     - `F4` (Down): Navega para o card de baixo / Alterna para campo inferior (Cena / IP).
   - Botões de suporte:
     - `A` (Enter): Abre card / Confirma modal.
     - `B` (Escape): Volta para a tela anterior / Fecha modal (descartando).
     - `X`: Atalho rápido para editar endereço/IP do host.
     - `Y`: Salva as alterações na configuração (`save-config`).
     - `L2 / R2`: Incremento/Decremento rápido nos steppers (`-1` / `+1`).
3. **Retorno ao Modo Live (Ao pressionar `B` ou botão Voltar):**
   - Ao retornar para `#view-home`, as teclas `F1`–`F12` são liberadas novamente para disparos REST imediatos.

---

## 🏗️ Princípios de Engenharia e Compatibilidade
1. **Preservação Total da Lógica**:
   - Manutenção de todos os canais IPC (`get-config`, `save-config`, `connect-host`, `disconnect-host`, `get-status`, `test-connection`, `simulate-f-key`, `run-command`, `get-os`).
   - Manutenção do fallback DNS, cache de IP e chamadas REST `/services/edmx_change_scene/{page}/{scene}`.
   - Manutenção da execução de scripts externos (`.bat` / `.sh`) configurados para as teclas (F10–F12).
   - Manutenção do indexador humano (UI: 1-based, Config/REST: 0-based).
2. **Proibição de CSS Inline (Separação Limpa)**:
   - **É PROIBIDO O USO DE CSS INLINE** nas tags HTML ou scripts JS (`style="..."` ou `.style.x = ...` dispersos).
   - Toda e qualquer estilização visual deve residir no arquivo de estilos correspondente (`styles.css`), utilizando classes CSS semânticas e variáveis de tema (`:root`).
3. **Ergonomia e Navegação Gamepad-First (com suporte a Mouse/Teclado)**:
   - D-Pad e botões de ação mapeados e responsivos com anéis de foco visual claros.
   - Compatibilidade total mantida para cliques de mouse e toques na tela.
4. **Validação Contínua**: O desenvolvimento será feito em etapas isoladas com paradas críticas para teste direto no Steam Deck.

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
* **Objetivo**: Implementar a máquina de estados e o interceptor D-Pad F1–F4 vs Modo Live.
* **Ações**:
  1. Criar o interceptor de teclas locais para D-Pad (`F1`–`F4`), Gatilhos (`L2`/`R2`) e botões (`A`/`Enter`, `B`/`Escape`, `X`, `Y`).
  2. Implementar a regra de negócio: No modo `home`, `F1`–`F12` disparam cenas REST; nos modos de edição, `F1`–`F4` realizam a navegação no grid/modais sem acionar a API de DMX.
  3. Gerenciar o foco visual ativo (`.selected-card`, `.focused-row`, etc.).
* **🛑 PARADA CRÍTICA 2 (Validação de Navegação)**:
  - Navegar entre telas usando D-pad (F1–F4), teclado, mouse e touch.
  - Testar a abertura e fechamento de modais com `A` e `B` sem disparar cenas acidentalmente.

---

### 🔌 FASE 3: Conexão com IPCs, REST e Sincronização de Configurações
* **Objetivo**: Conectar a nova UI aos métodos IPC reais do Electron.
* **Ações**:
  1. Carregar configuração real do `config.json` via `getConfig()` e preencher cards e dados dos hosts (`favela` e `maria`).
  2. Implementar `connectHost()` na tela inicial com indicador visual de status em tempo real (`connection-status-update`).
  3. Implementar salvamento de alterações (`saveConfig()`) via botão `Y` ou clique, com toast de feedback.
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
