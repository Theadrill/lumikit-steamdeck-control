// renderer.js

const { ipcRenderer } = require('electron'); 

// Funções de comunicação IPC
const electronAPI = {
    // 📌 API para buscar a configuração atual do processo principal (main.js)
    getConfig: () => ipcRenderer.invoke("get-config"),
    // 📌 API para salvar a nova configuração
    saveConfig: (config) => ipcRenderer.invoke("save-config", config),
    // 📌 API para iniciar a conexão com o host
    connectHost: (hostKey) => ipcRenderer.invoke("connect-host", hostKey),
    // 📌 API para desconectar o host atual
    disconnectHost: () => ipcRenderer.invoke("disconnect-host"),
    // 📌 API para buscar o status de conexão atual
    getStatus: () => ipcRenderer.invoke("get-status"),
    // 📌 API para simular o envio de um comando Fx (API e Comando Externo)
    simulateFKey: (fKey) => ipcRenderer.invoke("simulate-f-key", fKey),
    // 📌 API para buscar o tipo de Sistema Operacional (Windows/Linux)
    getOS: () => ipcRenderer.invoke("get-os"),
    // 📌 API para testar a conexão com um host específico
    testConnection: (hostKey) => ipcRenderer.invoke("test-connection", hostKey),
    // 📌 API para executar um comando externo (usado no teste manual de Fx)
    runCommand: (command) => ipcRenderer.invoke("run-command", command),
};

let currentConfig = null;
let currentHost = null;
let connectionStatus = "disconnected";
let osType = "windows"; 
const configMessage = document.getElementById("config-message");

// 📌 Executa após o carregamento completo do HTML
document.addEventListener("DOMContentLoaded", async () => {
    osType = await electronAPI.getOS();
    await loadConfigAndStatus();
    setupEventListeners();
});

// 📌 Listener que recebe eventos de mudança de status de conexão do processo principal
ipcRenderer.on("connection-status-update", (event, data) => {
    currentConfig = data.config;
    connectionStatus = data.status;
    currentHost = data.host;
    updateStatusDisplay(data.status, data.hostName);
    renderFxButtons();
    renderHostConfig();
    renderKeyMappings();
});

// 📌 Carrega a configuração e o status inicial ao iniciar o app
async function loadConfigAndStatus() {
    currentConfig = await electronAPI.getConfig();
    const statusData = await electronAPI.getStatus();
    
    currentHost = statusData.currentHost;
    connectionStatus = statusData.connectionStatus;
    
    updateStatusDisplay(statusData.connectionStatus, statusData.hostName);
    updateOSInfo();
    renderHostConfig();
    renderKeyMappings();
    renderFxButtons(); // Renderiza os botões com os dados de Page/Scene
}

// 📌 Atualiza o texto do SO na barra de status
function updateOSInfo() {
    const osInfo = document.getElementById("os-info");
    if (osInfo) {
        osInfo.textContent = `OS: ${osType.toUpperCase()}`;
    }
}

// 📌 FUNÇÃO: Gerencia a barra de status e o visual dos botões de conexão
function updateStatusDisplay(status, hostName) {
    const statusElement = document.getElementById("status-bar");
    const textElement = document.getElementById("connection-status-text");
    
    let text = "Desconectado";
    let className = "status-disconnected status-bar";

    if (status === "connected") {
        text = `Conectado a: ${hostName}`;
        className = "status-connected status-bar";
    } else if (status === "connecting") {
        text = `Conectando a: ${hostName}...`;
        className = "status-connecting status-bar";
    } else if (status === "error" || status === "timeout") {
        text = `Erro de Conexão com ${hostName}.`;
        className = "status-error status-bar";
    }

    // Aplica a classe de cor de status
    statusElement.className = className; 
    textElement.textContent = text;

    // Desativa/Ativa e muda o visual dos botões de conexão na aba "Controle"
    document.querySelectorAll(".host-btn").forEach(btn => {
        btn.disabled = status === 'connecting';
        if (btn.dataset.host === currentHost && status === 'connected') {
            btn.classList.add('connected'); // Classe customizada para cor verde
        } else {
            btn.classList.remove('connected');
        }
    });
}

// 📌 FUNÇÃO: Renderiza o Page/Scene dentro dos botões Fx na aba Controle
function renderFxButtons() {
    document.querySelectorAll(".f-key-btn").forEach(button => {
        const key = button.dataset.key;
        const keyMap = currentConfig.keyMappings[currentHost];
        const mapping = keyMap ? keyMap[key] : null;

        let page = 0;
        let scene = 0;

        if (mapping) {
            page = mapping.page;
            scene = mapping.scene;
        }

        // Adiciona 1 para exibir ao usuário (lógica 1-based para a interface)
        const pageDisplay = page + 1;
        const sceneDisplay = scene + 1;

        // Atualiza o conteúdo HTML do botão Fx
        button.innerHTML = `
            <div>${key}</div>
            <small>P: ${pageDisplay}</small> 
            <small>S: ${sceneDisplay}</small>
        `;

        // Adiciona o brilho visual se o host estiver conectado
        if (currentHost && connectionStatus === 'connected') {
             button.classList.add('active-host');
        } else {
             button.classList.remove('active-host');
        }
    });
}

// 📌 FUNÇÃO: Preenche os campos de Nome, Endereço e Porta na aba Configuração e atualiza o seletor de host
function renderHostConfig() {
    for (const hostKey in currentConfig.hosts) {
        const host = currentConfig.hosts[hostKey];
        // Popula os campos de Nome, Endereço e Porta
        const nameInput = document.getElementById(`${hostKey}-name`);
        const addressInput = document.getElementById(`${hostKey}-address`);
        const portInput = document.getElementById(`${hostKey}-port`);

        if (nameInput) nameInput.value = host.name;
        if (addressInput) addressInput.value = host.address;
        if (portInput) portInput.value = host.port;
    }
    
    // Atualiza o seletor de host de mapeamento
    const keyHostSelect = document.getElementById("key-host-select");
    if (!keyHostSelect) return;
    
    // Limpa e repopula o seletor
    keyHostSelect.innerHTML = '';
    for (const hostKey in currentConfig.hosts) {
        const option = document.createElement("option");
        option.value = hostKey;
        option.textContent = currentConfig.hosts[hostKey].name;
        keyHostSelect.appendChild(option);
    }
    // Garante que o seletor esteja na primeira opção ou no host conectado
    if (currentHost) {
        keyHostSelect.value = currentHost;
    } else if (Object.keys(currentConfig.hosts).length > 0) {
        keyHostSelect.value = Object.keys(currentConfig.hosts)[0];
    }
}

// 📌 FUNÇÃO MODIFICADA: Renderiza a grade de mapeamento Fx na aba Configuração
// ✅ CORREÇÃO: Usando apenas as classes CSS customizadas ('form-label', 'form-input', 'custom-select')
function renderKeyMappings() {
    const container = document.getElementById("key-mappings-container");
    const hostSelect = document.getElementById("key-host-select");
    if (!hostSelect || !container) return;
    
    const hostKey = hostSelect.value || Object.keys(currentConfig.hosts)[0];
    if (!hostKey) {
        container.innerHTML = `<p style="color: #999;">Nenhum host disponível para mapeamento.</p>`;
        return;
    }

    // Insere o container de grid
    container.innerHTML = `<div class="key-grid"></div>`; 
    const grid = container.querySelector(".key-grid");
    const keyMap = currentConfig.keyMappings[hostKey];
    
    for (let i = 1; i <= 12; i++) {
        const key = `F${i}`;
        const mapping = keyMap[key]; 
        
        // As páginas e cenas no Lumikit são base 0, mas para o usuário são base 1.
        const defaultIndex = parseInt(key.replace('F', ''));
        // Usando o valor de configuração padrão se não existir (para exibição base 1)
        const defaultPage = hostKey === 'favela' ? 1 : 2; 

        const pageValue = mapping ? mapping.page + 1 : defaultPage;
        const sceneValue = mapping ? mapping.scene + 1 : defaultIndex;
        const commandValue = mapping ? mapping.command || '' : '';

        const keyItem = document.createElement('div');
        keyItem.className = 'key-mapping-item';
        keyItem.dataset.key = key;
        
        // Usando classes customizadas: 'form-label' e 'form-input'
        keyItem.innerHTML = `
            <h3>${key}</h3>
            
            <div class="input-group">
                <label for="${key}-page" class="form-label">Página:</label>
                <input type="number" id="${key}-page" value="${pageValue}" min="1" max="99" data-field="page" data-key="${key}" class="form-input">
            </div>
            
            <div class="input-group">
                <label for="${key}-scene" class="form-label">Cena:</label>
                <input type="number" id="${key}-scene" value="${sceneValue}" min="1" max="99" data-field="scene" data-key="${key}" class="form-input">
            </div>
            
            <div class="input-group full-width command-field" data-key="${key}">
                <label for="${key}-command" class="form-label command-label">Comando Externo (.bat/.sh):</label>
                <input type="text" id="${key}-command" value="${commandValue}" placeholder="Opcional. Ex: 'desliga.bat'" data-field="command" data-key="${key}" class="form-input">
            </div>
        `;
        
        // Lógica de visibilidade do campo de comando (apenas F10, F11, F12)
        const fNum = parseInt(key.replace('F', ''));
        const commandGroup = keyItem.querySelector(`.command-field[data-key="${key}"]`);
        if (commandGroup) {
            if (fNum < 10) {
                commandGroup.style.display = 'none'; 
            } else {
                commandGroup.style.display = 'block'; 
                commandGroup.querySelector(".command-label").textContent = `Comando para ${key} (${osType === 'windows' ? '.bat' : '.sh'}):`;
            }
        }

        grid.appendChild(keyItem);
    }
}

// 📌 FUNÇÃO: Define todos os Event Listeners (permanece funcionalmente inalterada)
function setupEventListeners() {
    // 1. Lógica de Abas
    document.querySelectorAll(".tab-button").forEach(button => {
        button.addEventListener("click", (e) => {
            document.querySelectorAll(".tab-button").forEach(b => b.classList.remove("active"));
            document.querySelectorAll(".tab-page").forEach(p => p.classList.remove("active"));
            
            e.target.classList.add("active");
            document.getElementById(e.target.dataset.tab).classList.add("active");
        });
    });

    // 2. Lógica de Conexão/Host
    document.querySelectorAll(".host-btn").forEach(button => {
        button.addEventListener("click", async (e) => {
            const hostKey = e.target.dataset.host;
            if (currentHost === hostKey && connectionStatus === 'connected') {
                await electronAPI.disconnectHost();
                return;
            }
            if (connectionStatus === 'connecting') return; 

            if (currentHost) {
                await electronAPI.disconnectHost();
            }
            
            const result = await electronAPI.connectHost(hostKey);
            if (result.success) {
                currentHost = hostKey;
                showMessage(`Conectado a ${currentConfig.hosts[hostKey].name}.`, 'success');
            } else {
                showMessage(`Falha ao conectar a ${currentConfig.hosts[hostKey].name}. Verifique a rede.`, 'error');
                e.target.classList.remove('connected');
            }
            renderFxButtons();
        });
    });

    // 3. Simulação das Teclas Fx (Aba Controle)
    document.querySelectorAll(".f-key-btn").forEach(button => {
        button.addEventListener("click", async (e) => {
            const key = button.dataset.key;
            if (currentHost && connectionStatus === 'connected') {
                await electronAPI.simulateFKey(key); 
                showMessage(`Comando ${key} enviado!`, 'info');
            } else {
                showMessage("Por favor, conecte-se a um Host primeiro.", 'error');
            }
        });
    });

    // 4. Seletor de Host para Mapeamento
    document.getElementById("key-host-select").addEventListener("change", renderKeyMappings);


    // 5. Testar Conexão (Aba Configuração)
    document.querySelectorAll(".test-connection-btn").forEach(button => {
        button.addEventListener("click", async (e) => {
            const hostKey = e.target.dataset.host;
            const statusSpan = document.getElementById(`${hostKey}-test-status`);
            statusSpan.textContent = "Testando...";
            statusSpan.className = 'test-status status-connecting';

            const success = await electronAPI.testConnection(hostKey);
            if (success) {
                statusSpan.textContent = "Sucesso!";
                statusSpan.className = 'test-status status-connected';
            } else {
                statusSpan.textContent = "Falha!";
                statusSpan.className = 'test-status status-error';
            }
        });
    });

    // 6. Salvar Configuração (Geral)
    document.getElementById("save-config-btn").addEventListener("click", async () => {
        const newConfig = JSON.parse(JSON.stringify(currentConfig));
        
        // Lógica de leitura e validação dos campos de Host
        for (const hostKey in newConfig.hosts) {
            const nameInput = document.getElementById(`${hostKey}-name`);
            const addressInput = document.getElementById(`${hostKey}-address`);
            const portInput = document.getElementById(`${hostKey}-port`);

            newConfig.hosts[hostKey].name = nameInput ? nameInput.value.trim() : newConfig.hosts[hostKey].name;
            newConfig.hosts[hostKey].address = addressInput ? addressInput.value.trim() : newConfig.hosts[hostKey].address;
            newConfig.hosts[hostKey].port = portInput ? parseInt(portInput.value) : newConfig.hosts[hostKey].port;

            if (!newConfig.hosts[hostKey].name || !newConfig.hosts[hostKey].address || isNaN(newConfig.hosts[hostKey].port)) {
                showMessage("Por favor, preencha Nome, Endereço e Porta válidos para todos os Hosts.", 'error');
                return;
            }
        }
        
        // Lógica de leitura e validação do Mapeamento de Teclas
        const hostKeyForMapping = document.getElementById("key-host-select").value;
        
        for (let i = 1; i <= 12; i++) {
            const key = `F${i}`;
            
            const pageInput = document.getElementById(`${key}-page`);
            const sceneInput = document.getElementById(`${key}-scene`);
            const commandInput = document.getElementById(`${key}-command`);

            if (!pageInput || !sceneInput) continue; 
            
            const pageValue = parseInt(pageInput.value);
            const sceneValue = parseInt(sceneInput.value);
            const commandValue = commandInput ? commandInput.value.trim() : undefined;
            
            if (isNaN(pageValue) || isNaN(sceneValue) || pageValue < 1 || sceneValue < 1) {
                showMessage(`Página e Cena para ${key} devem ser números inteiros maiores ou iguais a 1.`, 'error');
                return;
            }

            // Conversão de 1-based (UI) para 0-based (Backend)
            newConfig.keyMappings[hostKeyForMapping][key] = {
                page: pageValue - 1, 
                scene: sceneValue - 1,
                command: commandValue || undefined 
            };
        }

        // Chamada para salvar a configuração no main.js
        const success = await electronAPI.saveConfig(newConfig);
        if (success) {
            currentConfig = newConfig;
            renderHostConfig();
            renderKeyMappings();
            renderFxButtons();
            showMessage("Configuração salva com sucesso!", 'success');
        } else {
            showMessage("Erro ao salvar configuração. Verifique permissões.", 'error');
        }
    });

    // 7. Resetar Configuração para Padrão
    document.getElementById("reset-config-btn").addEventListener("click", async () => {
        if (confirm("Tem certeza que deseja resetar TODAS as configurações (Hosts e Mapeamentos) para o padrão de fábrica?")) {
            // Recarrega defaults e salva
            const freshConfig = await electronAPI.getConfig(); 
            const success = await electronAPI.saveConfig(freshConfig);
            
            if (success) {
                currentConfig = freshConfig;
                await electronAPI.disconnectHost(); 
                currentHost = null;
                
                renderHostConfig();
                renderKeyMappings();
                renderFxButtons();
                showMessage("Configuração resetada para o padrão com sucesso. Por favor, conecte-se novamente.", 'success');
            } else {
                showMessage("Erro ao resetar configuração.", 'error');
            }
        }
    });
}


// 📌 FUNÇÃO: Exibe mensagens de feedback na interface
function showMessage(text, type) {
    if (configMessage) {
        configMessage.textContent = text;
        configMessage.className = `message-area message-${type}`;
        
        // Limpa a mensagem após 5 segundos
        setTimeout(() => {
            configMessage.textContent = '';
            configMessage.className = 'message-area'; // Volta à classe base
        }, 5000);
    } else {
        console.log(`Mensagem: ${text}`);
    }
}