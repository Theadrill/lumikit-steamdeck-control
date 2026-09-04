// renderer.js
// Lumikit Steam Deck Control - UI & Navigation Engine

const { ipcRenderer } = require('electron');

// ============================================================
// 📌 IPC Communication API
// ============================================================
const electronAPI = {
    getConfig: () => ipcRenderer.invoke('get-config'),
    saveConfig: (config) => ipcRenderer.invoke('save-config', config),
    connectHost: (hostKey) => ipcRenderer.invoke('connect-host', hostKey),
    disconnectHost: () => ipcRenderer.invoke('disconnect-host'),
    getStatus: () => ipcRenderer.invoke('get-status'),
    simulateFKey: (fKey) => ipcRenderer.invoke('simulate-f-key', fKey),
    runCommand: (command) => ipcRenderer.invoke('run-command', command),
    getOS: () => ipcRenderer.invoke('get-os'),
    testConnection: (hostKey) => ipcRenderer.invoke('test-connection', hostKey),
    setEditMode: (editMode) => ipcRenderer.invoke('set-edit-mode', editMode),
};

// ============================================================
// 📌 Application State
// ============================================================
let currentConfig = {
    hosts: {
        favela: { name: 'PC Favela Rodrigo', address: 'pcrodrigoxeon', port: 5000 },
        maria: { name: 'PC Maria Rodrigo', address: 'pcmariarodrigo', port: 5000 },
    },
    keyMappings: { favela: {}, maria: {} },
};
let currentHost = 'favela';
let connectionStatus = 'disconnected';
let osType = 'linux';

// Screen states: 'home' | 'choose-host' | 'grid' | 'modal-card' | 'modal-host'
let currentScreen = 'home';
let homeSelectedIndex = 0; // 0 = favela, 1 = maria, 2 = btn-goto-choose-host (quando desconectado)
let editingHostKey = 'favela';
let chooseHostSelected = 0; // 0 = favela, 1 = maria
let selectedCardIndex = 0; // 0 to 11
let editingCardIndex = 0; // Index of card currently being edited
let modalActiveRow = 'page'; // 'page' | 'scene' | 'command'
let hostModalActiveField = 'name'; // 'name' | 'ip' | 'port' | 'test' | 'confirm' | 'cancel'
let toastTimeout = null;

// Gamepad polling state
let gamepadLoopId = null;
let lastButtonStates = {};
let lastAxesTime = 0;

// ============================================================
// 📌 DOM Initialization
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    try {
        osType = await electronAPI.getOS();
    } catch (e) {
        console.warn('Não foi possível obter OS via IPC:', e);
    }
    await loadInitialData();
    setupEventListeners();
    setupGamepadLoop();
    setScreen('home');
});

// ============================================================
// 📌 IPC Status Updates Listener
// ============================================================
ipcRenderer.on('connection-status-update', (event, data) => {
    if (data.config) currentConfig = data.config;
    connectionStatus = data.status || 'disconnected';
    currentHost = data.host || null;
    updateTopBar();
    updateHomeHosts();
    updateFooterHints();
    if (currentScreen === 'grid') {
        renderEditGrid();
    }
});

// ============================================================
// 📌 Load Configuration & Status from Main Process
// ============================================================
async function loadInitialData() {
    try {
        const fetchedConfig = await electronAPI.getConfig();
        if (fetchedConfig) {
            currentConfig = fetchedConfig;
        }
        const statusData = await electronAPI.getStatus();
        if (statusData) {
            currentHost = statusData.currentHost || Object.keys(currentConfig.hosts)[0] || 'favela';
            connectionStatus = statusData.connectionStatus || 'disconnected';
        }
    } catch (err) {
        console.error('Erro ao carregar dados iniciais:', err);
    }

    ensureKeyMappingsStructure();
}

function ensureKeyMappingsStructure() {
    if (!currentConfig.hosts) {
        currentConfig.hosts = {
            favela: { name: 'PC Favela Rodrigo', address: 'pcrodrigoxeon', port: 5000 },
            maria: { name: 'PC Maria Rodrigo', address: 'pcmariarodrigo', port: 5000 },
        };
    }
    if (!currentConfig.keyMappings) currentConfig.keyMappings = {};

    for (const hostKey of ['favela', 'maria']) {
        if (!currentConfig.keyMappings[hostKey]) {
            currentConfig.keyMappings[hostKey] = {};
        }
        for (let i = 1; i <= 12; i++) {
            const k = `F${i}`;
            if (!currentConfig.keyMappings[hostKey][k]) {
                const defaultPage = hostKey === 'favela' ? 0 : 1;
                currentConfig.keyMappings[hostKey][k] = { page: defaultPage, scene: i - 1 };
            }
        }
    }
}

// ============================================================
// 📌 Screen Management & Edit Mode Synchronizer
// ============================================================
function setScreen(newScreen) {
    currentScreen = newScreen;
    // O modo de edição do ponto de vista do OS é: telas de edição OU tela home enquanto desconectado
    const isEditMode = (newScreen !== 'home') || (connectionStatus !== 'connected');

    // Inform main process to mute OS-level global shortcuts from firing DMX
    try {
        electronAPI.setEditMode(isEditMode);
    } catch (e) {
        console.warn('Erro ao atualizar edit mode no main:', e);
    }

    const screens = {
        'home': document.getElementById('view-home'),
        'choose-host': document.getElementById('view-choose-host'),
        'grid': document.getElementById('view-edit-grid'),
    };

    // Remove active class from base views
    Object.values(screens).forEach(screenEl => {
        if (screenEl) screenEl.classList.remove('active');
    });

    // Modals
    const hostModalOverlay = document.getElementById('host-address-modal-overlay');
    const cardModalOverlay = document.getElementById('card-modal-overlay');

    if (hostModalOverlay) {
        if (newScreen === 'modal-host') {
            hostModalOverlay.classList.add('active');
        } else {
            hostModalOverlay.classList.remove('active');
        }
    }

    if (cardModalOverlay) {
        if (newScreen === 'modal-card') {
            cardModalOverlay.classList.add('active');
        } else {
            cardModalOverlay.classList.remove('active');
        }
    }

    // Activate corresponding base view
    if (newScreen === 'home' && screens['home']) {
        screens['home'].classList.add('active');
        updateHomeHosts();
    } else if (newScreen === 'choose-host' && screens['choose-host']) {
        screens['choose-host'].classList.add('active');
        updateChooseHostCards();
    } else if ((newScreen === 'grid' || newScreen === 'modal-card' || newScreen === 'modal-host') && screens['grid']) {
        screens['grid'].classList.add('active');
        renderEditGrid();
    }

    updateTopBar();
    updateFooterHints();
}

// ============================================================
// 📌 TopBar Updates
// ============================================================
function updateTopBar() {
    const topModePill = document.getElementById('top-mode-pill');
    const topStatusDot = document.getElementById('top-status-dot');
    const topHostName = document.getElementById('top-host-name');

    if (topModePill) {
        topModePill.classList.remove('live', 'select-host', 'edit', 'subedit');
        if (currentScreen === 'home') {
            topModePill.classList.add('live');
            topModePill.textContent = 'MODO OPERAÇÃO (LIVE)';
        } else if (currentScreen === 'choose-host') {
            topModePill.classList.add('select-host');
            topModePill.textContent = 'SELECIONE O HOST PARA EDITAR';
        } else if (currentScreen === 'grid') {
            topModePill.classList.add('edit');
            const h = currentConfig.hosts[editingHostKey];
            const name = h ? h.name.toUpperCase() : editingHostKey.toUpperCase();
            topModePill.textContent = `EDITANDO: ${name}`;
        } else if (currentScreen === 'modal-card') {
            topModePill.classList.add('subedit');
            topModePill.textContent = 'EDITANDO CENA / PÁGINA';
        } else if (currentScreen === 'modal-host') {
            topModePill.classList.add('edit');
            topModePill.textContent = 'EDITANDO REDE / ENDEREÇO IP';
        }
    }

    if (topStatusDot) {
        topStatusDot.classList.remove('connected', 'connecting', 'disconnected', 'error');
        topStatusDot.classList.add(connectionStatus);
    }

    if (topHostName) {
        const h = currentConfig.hosts && currentHost ? currentConfig.hosts[currentHost] : null;
        const name = h ? h.name : 'Nenhum';
        if (connectionStatus === 'connected') {
            topHostName.innerHTML = `Conectado: <strong>${name}</strong>`;
        } else if (connectionStatus === 'connecting') {
            topHostName.innerHTML = `Conectando: <strong>${name}</strong>`;
        } else {
            topHostName.innerHTML = `Desconectado (Último: <strong>${name}</strong>)`;
        }
    }
}

// ============================================================
// 📌 Home Host Cards & Focus Management
// ============================================================
function updateHomeHosts() {
    const favelaCard = document.getElementById('home-host-favela');
    const mariaCard = document.getElementById('home-host-maria');
    const btnGotoChoose = document.getElementById('btn-goto-choose-host');
    const favelaStatus = document.getElementById('home-host-status-favela');
    const mariaStatus = document.getElementById('home-host-status-maria');
    const favelaAddr = document.getElementById('live-host-addr-favela');
    const mariaAddr = document.getElementById('live-host-addr-maria');

    if (currentConfig.hosts.favela && favelaAddr) {
        favelaAddr.textContent = `${currentConfig.hosts.favela.address} : ${currentConfig.hosts.favela.port}`;
    }
    if (currentConfig.hosts.maria && mariaAddr) {
        mariaAddr.textContent = `${currentConfig.hosts.maria.address} : ${currentConfig.hosts.maria.port}`;
    }

    const isFavelaActive = currentHost === 'favela' && connectionStatus === 'connected';
    const isMariaActive = currentHost === 'maria' && connectionStatus === 'connected';

    if (favelaCard) favelaCard.classList.toggle('active-host', isFavelaActive);
    if (mariaCard) mariaCard.classList.toggle('active-host', isMariaActive);

    if (favelaStatus) {
        favelaStatus.classList.remove('connected', 'disconnected');
        favelaStatus.classList.add(isFavelaActive ? 'connected' : 'disconnected');
        favelaStatus.textContent = isFavelaActive ? 'ATIVO' : 'CONECTAR';
    }

    if (mariaStatus) {
        mariaStatus.classList.remove('connected', 'disconnected');
        mariaStatus.classList.add(isMariaActive ? 'connected' : 'disconnected');
        mariaStatus.textContent = isMariaActive ? 'ATIVO' : 'CONECTAR';
    }

    // Gerenciamento visual do foco no Home (quando desconectado)
    const isDisconnected = connectionStatus !== 'connected';
    if (favelaCard) favelaCard.classList.toggle('focused', isDisconnected && homeSelectedIndex === 0);
    if (mariaCard) mariaCard.classList.toggle('focused', isDisconnected && homeSelectedIndex === 1);
    if (btnGotoChoose) btnGotoChoose.classList.toggle('focused', isDisconnected && homeSelectedIndex === 2);
}

// ============================================================
// 📌 Choose Host Screen
// ============================================================
function updateChooseHostCards() {
    const favelaCard = document.getElementById('host-opt-favela');
    const mariaCard = document.getElementById('host-opt-maria');
    const subFavela = document.getElementById('choose-sub-favela');
    const subMaria = document.getElementById('choose-sub-maria');

    if (currentConfig.hosts.favela && subFavela) {
        subFavela.textContent = `${currentConfig.hosts.favela.address} : ${currentConfig.hosts.favela.port} (12 Teclas)`;
    }
    if (currentConfig.hosts.maria && subMaria) {
        subMaria.textContent = `${currentConfig.hosts.maria.address} : ${currentConfig.hosts.maria.port} (12 Teclas)`;
    }

    if (favelaCard) favelaCard.classList.toggle('focused', chooseHostSelected === 0);
    if (mariaCard) mariaCard.classList.toggle('focused', chooseHostSelected === 1);
}

function confirmChooseHost() {
    editingHostKey = chooseHostSelected === 0 ? 'favela' : 'maria';
    selectedCardIndex = 0;
    setScreen('grid');
}

// ============================================================
// 📌 Edit Grid (12 Cards F1-F12)
// ============================================================
function renderEditGrid() {
    const host = currentConfig.hosts[editingHostKey];
    const hostTitle = document.getElementById('editing-host-title');
    const hostBadge = document.getElementById('editing-host-badge');

    if (host && hostTitle) hostTitle.textContent = host.name;
    if (host && hostBadge) hostBadge.textContent = `${host.address}:${host.port}`;

    const container = document.getElementById('edit-cards-container');
    if (!container) return;

    container.innerHTML = '';
    const keyMap = (currentConfig.keyMappings && currentConfig.keyMappings[editingHostKey]) || {};

    for (let i = 1; i <= 12; i++) {
        const key = `F${i}`;
        const mapping = keyMap[key] || { page: 0, scene: i - 1 };
        const idx = i - 1;

        // Coordinate normalization: UI display is 1-based (Page 1..99, Scene 1..99)
        const displayPage = (mapping.page || 0) + 1;
        const displayScene = (mapping.scene || 0) + 1;

        const card = document.createElement('div');
        card.className = 'key-card';
        if (idx === selectedCardIndex) {
            card.classList.add('focused');
        }
        card.dataset.index = idx;

        const commandText = mapping.command ? `CMD: ${mapping.command}` : 'Lumikit REST Direct';

        card.innerHTML = `
            <div class="card-head">
                <span class="f-key-badge">${key}</span>
                <span class="card-number-label">CARD #${i}</span>
            </div>
            <div class="card-summary">
                <div class="summary-item">
                    <span class="summary-label">Pág</span>
                    <span class="summary-val">${displayPage}</span>
                </div>
                <div class="summary-item">
                    <span class="summary-label">Cena</span>
                    <span class="summary-val">${displayScene}</span>
                </div>
            </div>
            <div class="card-extra">${commandText}</div>
        `;

        card.addEventListener('click', () => {
            selectedCardIndex = idx;
            renderEditGrid();
            openCardModal(idx);
        });

        container.appendChild(card);
    }
}

// ============================================================
// 📌 Card Modal (Page, Scene, External Command)
// ============================================================
function openCardModal(index) {
    editingCardIndex = index;
    const key = `F${index + 1}`;
    const keyMap = (currentConfig.keyMappings && currentConfig.keyMappings[editingHostKey]) || {};
    const mapping = keyMap[key] || { page: 0, scene: index };

    const hostName = currentConfig.hosts[editingHostKey] ? currentConfig.hosts[editingHostKey].name : editingHostKey;
    const modalTitle = document.getElementById('modal-card-title');
    if (modalTitle) modalTitle.textContent = `Configurar ${key} (${hostName})`;

    const pageVal = document.getElementById('modal-page-val');
    const sceneVal = document.getElementById('modal-scene-val');
    const cmdInput = document.getElementById('input-card-command');

    // 1-based in UI
    if (pageVal) pageVal.textContent = (mapping.page || 0) + 1;
    if (sceneVal) sceneVal.textContent = (mapping.scene || 0) + 1;
    if (cmdInput) cmdInput.value = mapping.command || '';

    modalActiveRow = 'page';
    updateModalRowFocus();
    setScreen('modal-card');
}

function updateModalRowFocus() {
    const pageRow = document.getElementById('row-modal-page');
    const sceneRow = document.getElementById('row-modal-scene');
    const cmdRow = document.getElementById('row-modal-command');
    const cmdInput = document.getElementById('input-card-command');

    if (pageRow) pageRow.classList.toggle('focused-row', modalActiveRow === 'page');
    if (sceneRow) sceneRow.classList.toggle('focused-row', modalActiveRow === 'scene');
    if (cmdRow) cmdRow.classList.toggle('focused-row', modalActiveRow === 'command');

    if (modalActiveRow === 'command' && cmdInput) {
        cmdInput.focus();
    } else if (cmdInput && document.activeElement === cmdInput) {
        cmdInput.blur();
    }
}

function adjustModalStepper(delta) {
    if (modalActiveRow === 'command') return;
    const targetId = modalActiveRow === 'page' ? 'modal-page-val' : 'modal-scene-val';
    const el = document.getElementById(targetId);
    if (!el) return;

    let val = parseInt(el.textContent, 10) + delta;
    if (val < 1) val = 1;
    if (val > 99) val = 99;
    el.textContent = val;
}

function confirmCardModal() {
    const pageVal = parseInt(document.getElementById('modal-page-val').textContent, 10);
    const sceneVal = parseInt(document.getElementById('modal-scene-val').textContent, 10);
    const cmdInput = document.getElementById('input-card-command');
    const commandText = cmdInput ? cmdInput.value.trim() : '';
    const key = `F${editingCardIndex + 1}`;

    if (!currentConfig.keyMappings[editingHostKey]) {
        currentConfig.keyMappings[editingHostKey] = {};
    }

    const updatedMapping = {
        // 0-based in config & REST
        page: Math.max(0, pageVal - 1),
        scene: Math.max(0, sceneVal - 1),
    };

    if (commandText) {
        updatedMapping.command = commandText;
    }

    currentConfig.keyMappings[editingHostKey][key] = updatedMapping;

    setScreen('grid');
    showToast(`Tecla ${key} ajustada: Pág ${pageVal}, Cena ${sceneVal}`, 'info');
}

function cancelCardModal() {
    setScreen('grid');
}

// ============================================================
// 📌 Host Address Modal (IP, Port, Name)
// ============================================================
function openHostAddressModal() {
    const host = currentConfig.hosts[editingHostKey] || { name: '', address: '', port: 5000 };
    const modalTitle = document.getElementById('host-modal-title');
    if (modalTitle) {
        modalTitle.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                <line x1="6" y1="6" x2="6.01" y2="6"></line>
                <line x1="6" y1="18" x2="6.01" y2="18"></line>
            </svg>
            Configurar Endereço: <strong>${host.name}</strong>
        `;
    }

    const inputName = document.getElementById('input-host-name');
    const inputIp = document.getElementById('input-host-ip');
    const inputPort = document.getElementById('input-host-port');

    if (inputName) inputName.value = host.name;
    if (inputIp) inputIp.value = host.address;
    if (inputPort) inputPort.value = host.port;

    hostModalActiveField = 'name';
    setScreen('modal-host');
    updateHostModalFocus();
}

function updateHostModalFocus() {
    const inputName = document.getElementById('input-host-name');
    const inputIp = document.getElementById('input-host-ip');
    const inputPort = document.getElementById('input-host-port');
    const btnTest = document.getElementById('btn-test-connection');
    const btnSave = document.getElementById('btn-save-host-address');
    const btnCancel = document.getElementById('btn-cancel-host-address');

    [inputName, inputIp, inputPort, btnTest, btnSave, btnCancel].forEach(el => {
        if (el) el.classList.remove('focused', 'selected-card');
    });

    if (hostModalActiveField === 'name' && inputName) {
        inputName.focus();
        inputName.classList.add('focused');
    } else if (hostModalActiveField === 'ip' && inputIp) {
        inputIp.focus();
        inputIp.classList.add('focused');
    } else if (hostModalActiveField === 'port' && inputPort) {
        inputPort.focus();
        inputPort.classList.add('focused');
    } else if (hostModalActiveField === 'test' && btnTest) {
        btnTest.focus();
        btnTest.classList.add('focused');
    } else if (hostModalActiveField === 'confirm' && btnSave) {
        btnSave.focus();
        btnSave.classList.add('focused');
    } else if (hostModalActiveField === 'cancel' && btnCancel) {
        btnCancel.focus();
        btnCancel.classList.add('focused');
    }
}

async function saveHostAddressModal() {
    const inputName = document.getElementById('input-host-name');
    const inputIp = document.getElementById('input-host-ip');
    const inputPort = document.getElementById('input-host-port');

    const name = inputName ? inputName.value.trim() : '';
    const address = inputIp ? inputIp.value.trim() : '';
    const port = inputPort ? parseInt(inputPort.value, 10) : 5000;

    if (!name || !address || isNaN(port)) {
        showToast('Preencha nome, endereço e porta válidos!', 'error');
        return;
    }

    currentConfig.hosts[editingHostKey] = { name, address, port };
    const saveOk = await electronAPI.saveConfig(currentConfig);

    updateHomeHosts();
    setScreen('grid');

    if (saveOk) {
        showToast(`Endereço de ${name} salvo com sucesso!`, 'info');
    } else {
        showToast('Erro ao salvar endereço no disco.', 'error');
    }
}

function cancelHostAddressModal() {
    setScreen('grid');
}

async function testHostModalConnection() {
    const inputIp = document.getElementById('input-host-ip');
    const inputPort = document.getElementById('input-host-port');
    const ip = inputIp ? inputIp.value.trim() : '';
    const port = inputPort ? inputPort.value.trim() : '';

    showToast(`Testando conexão com ${ip}:${port}...`, 'info');
    try {
        const success = await electronAPI.testConnection(editingHostKey);
        if (success) {
            showToast(`Conexão OK com Lumikit (${ip}:${port})!`, 'info');
        } else {
            showToast(`Falha ao conectar em ${ip}:${port}. Verifique a rede.`, 'error');
        }
    } catch (e) {
        showToast('Erro ao executar teste de conexão.', 'error');
    }
}

// ============================================================
// 📌 Save Full Configuration
// ============================================================
async function saveAllConfig() {
    const host = currentConfig.hosts[editingHostKey];
    const hostName = host ? host.name : editingHostKey;
    try {
        const success = await electronAPI.saveConfig(currentConfig);
        if (success) {
            showToast(`Mapeamento de ${hostName} salvo com sucesso!`, 'info');
        } else {
            showToast('Erro ao salvar configuração no disco.', 'error');
        }
    } catch (e) {
        showToast('Erro ao salvar configuração.', 'error');
    }
}

// ============================================================
// 📌 Home Screen Confirmation / Actions
// ============================================================
function handleHomeConfirm() {
    if (connectionStatus === 'connected') {
        setScreen('choose-host');
    } else {
        if (homeSelectedIndex === 0) {
            handleHostConnectionToggle('favela');
        } else if (homeSelectedIndex === 1) {
            handleHostConnectionToggle('maria');
        } else if (homeSelectedIndex === 2) {
            setScreen('choose-host');
        }
    }
}

// ============================================================
// 📌 Host Connection / Toggle in Live Mode
// ============================================================
async function handleHostConnectionToggle(targetHostKey) {
    const hostToConnect = targetHostKey || (currentHost === 'favela' ? 'maria' : 'favela');
    const host = currentConfig.hosts[hostToConnect];
    const hostName = host ? host.name : hostToConnect;

    if (currentHost === hostToConnect && connectionStatus === 'connected') {
        await electronAPI.disconnectHost();
        currentHost = null;
        connectionStatus = 'disconnected';
        updateTopBar();
        updateHomeHosts();
        updateFooterHints();
        showToast(`Desconectado de ${hostName}.`, 'info');
        return;
    }

    connectionStatus = 'connecting';
    currentHost = hostToConnect;
    updateTopBar();
    updateHomeHosts();
    updateFooterHints();
    showToast(`Conectando a ${hostName}...`, 'info');

    const result = await electronAPI.connectHost(hostToConnect);
    if (result && result.success) {
        currentHost = hostToConnect;
        connectionStatus = 'connected';
        // Sincroniza o modo de operação Live (desativa edit mode para ativar envio de teclas)
        try {
            await electronAPI.setEditMode(false);
        } catch (e) {
            console.warn('Erro ao sincronizar edit mode após conectar:', e);
        }
        showToast(`Conectado a ${hostName}!`, 'info');
    } else {
        connectionStatus = 'error';
        showToast(`Falha ao conectar com ${hostName}.`, 'error');
    }
    updateTopBar();
    updateHomeHosts();
    updateFooterHints();
}

// ============================================================
// 📌 Visual Toast Feedback
// ============================================================
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    if (toastTimeout) clearTimeout(toastTimeout);

    toast.textContent = message;
    toast.classList.remove('error', 'info');
    if (type === 'error') toast.classList.add('error');
    else if (type === 'info') toast.classList.add('info');

    toast.classList.add('active');
    toastTimeout = setTimeout(() => {
        toast.classList.remove('active');
    }, 2800);
}

// ============================================================
// 📌 Contextual Dynamic Footer Hints
// ============================================================
function updateFooterHints() {
    const hints = document.getElementById('footer-hints');
    if (!hints) return;

    if (currentScreen === 'home') {
        if (connectionStatus === 'connected') {
            hints.innerHTML = `
                <div class="hint-item" id="hint-home-edit">
                    <span class="btn-badge btn-a">A</span> <span>Editar Mapeamento</span>
                </div>
                <div class="hint-item" id="hint-home-switch">
                    <span class="btn-badge btn-y">Y</span> <span>Alternar Host Live</span>
                </div>
                <div class="hint-item hint-static">
                    <span class="btn-badge">F1–F12</span> <span>Disparar Cenas Live</span>
                </div>
            `;
            const btnEdit = document.getElementById('hint-home-edit');
            const btnSwitch = document.getElementById('hint-home-switch');
            if (btnEdit) btnEdit.addEventListener('click', () => setScreen('choose-host'));
            if (btnSwitch) btnSwitch.addEventListener('click', () => handleHostConnectionToggle());
        } else {
            hints.innerHTML = `
                <div class="hint-item hint-static">
                    <span class="btn-badge">D-PAD (F1–F4)</span> <span>Navegar Seleção</span>
                </div>
                <div class="hint-item" id="hint-home-confirm">
                    <span class="btn-badge btn-a">A</span> <span>Conectar / Editar</span>
                </div>
                <div class="hint-item" id="hint-home-switch">
                    <span class="btn-badge btn-y">Y</span> <span>Alternar Host</span>
                </div>
            `;
            const btnConfirm = document.getElementById('hint-home-confirm');
            const btnSwitch = document.getElementById('hint-home-switch');
            if (btnConfirm) btnConfirm.addEventListener('click', () => handleHomeConfirm());
            if (btnSwitch) btnSwitch.addEventListener('click', () => handleHostConnectionToggle());
        }
    } else if (currentScreen === 'choose-host') {
        hints.innerHTML = `
            <div class="hint-item hint-static">
                <span class="btn-badge">D-PAD (F1/F3)</span> <span>Alternar Host</span>
            </div>
            <div class="hint-item" id="hint-choose-confirm">
                <span class="btn-badge btn-a">A</span> <span>Confirmar e Abrir Cards</span>
            </div>
            <div class="hint-item" id="hint-choose-back">
                <span class="btn-badge btn-b">B</span> <span>Voltar ao Live</span>
            </div>
        `;
        const btnConfirm = document.getElementById('hint-choose-confirm');
        const btnBack = document.getElementById('hint-choose-back');
        if (btnConfirm) btnConfirm.addEventListener('click', confirmChooseHost);
        if (btnBack) btnBack.addEventListener('click', () => setScreen('home'));
    } else if (currentScreen === 'grid') {
        hints.innerHTML = `
            <div class="hint-item hint-static">
                <span class="btn-badge">D-PAD (F1–F4)</span> <span>Mover Seleção</span>
            </div>
            <div class="hint-item" id="hint-grid-edit">
                <span class="btn-badge btn-a">A</span> <span>Editar Card</span>
            </div>
            <div class="hint-item" id="hint-grid-ip">
                <span class="btn-badge btn-x">X</span> <span>Editar IP / Porta</span>
            </div>
            <div class="hint-item" id="hint-grid-save">
                <span class="btn-badge btn-y">Y</span> <span>Salvar Config</span>
            </div>
            <div class="hint-item" id="hint-grid-back">
                <span class="btn-badge btn-b">B</span> <span>Trocar Host / Voltar</span>
            </div>
        `;
        const btnEdit = document.getElementById('hint-grid-edit');
        const btnIp = document.getElementById('hint-grid-ip');
        const btnSave = document.getElementById('hint-grid-save');
        const btnBack = document.getElementById('hint-grid-back');

        if (btnEdit) btnEdit.addEventListener('click', () => openCardModal(selectedCardIndex));
        if (btnIp) btnIp.addEventListener('click', openHostAddressModal);
        if (btnSave) btnSave.addEventListener('click', saveAllConfig);
        if (btnBack) btnBack.addEventListener('click', () => setScreen('choose-host'));
    } else if (currentScreen === 'modal-card') {
        hints.innerHTML = `
            <div class="hint-item hint-static">
                <span class="btn-badge">F1 / F3 / L2 / R2</span> <span>Ajustar Valor &lt; &gt;</span>
            </div>
            <div class="hint-item hint-static">
                <span class="btn-badge">F2 / F4</span> <span>Alternar Pág / Cena / CMD</span>
            </div>
            <div class="hint-item" id="hint-modal-card-confirm">
                <span class="btn-badge btn-a">A</span> <span>Confirmar</span>
            </div>
            <div class="hint-item" id="hint-modal-card-cancel">
                <span class="btn-badge btn-b">B</span> <span>Cancelar</span>
            </div>
        `;
        const btnConfirm = document.getElementById('hint-modal-card-confirm');
        const btnCancel = document.getElementById('hint-modal-card-cancel');
        if (btnConfirm) btnConfirm.addEventListener('click', confirmCardModal);
        if (btnCancel) btnCancel.addEventListener('click', cancelCardModal);
    } else if (currentScreen === 'modal-host') {
        hints.innerHTML = `
            <div class="hint-item hint-static">
                <span class="btn-badge">D-PAD</span> <span>Navegar Campos</span>
            </div>
            <div class="hint-item hint-static">
                <span class="btn-badge">A / ENTER</span> <span>Editar Campo / Executar Botão</span>
            </div>
            <div class="hint-item hint-static">
                <span class="btn-badge">B / ESC</span> <span>Fechar / Voltar</span>
            </div>
        `;
    }
}

// ============================================================
// 📌 Event Listeners Setup (Touch & Mouse)
// ============================================================
function setupEventListeners() {
    // 1. Home - Button Go to Edit
    const btnGotoChoose = document.getElementById('btn-goto-choose-host');
    if (btnGotoChoose) {
        btnGotoChoose.addEventListener('click', () => setScreen('choose-host'));
    }

    // 2. Home - Host Cards
    const homeFavela = document.getElementById('home-host-favela');
    const homeMaria = document.getElementById('home-host-maria');
    if (homeFavela) homeFavela.addEventListener('click', () => handleHostConnectionToggle('favela'));
    if (homeMaria) homeMaria.addEventListener('click', () => handleHostConnectionToggle('maria'));

    // 3. Choose Host - Cards
    const chooseFavela = document.getElementById('host-opt-favela');
    const chooseMaria = document.getElementById('host-opt-maria');
    if (chooseFavela) {
        chooseFavela.addEventListener('click', () => {
            chooseHostSelected = 0;
            confirmChooseHost();
        });
    }
    if (chooseMaria) {
        chooseMaria.addEventListener('click', () => {
            chooseHostSelected = 1;
            confirmChooseHost();
        });
    }

    // 4. Grid Header - Action Buttons
    const btnOpenHostModal = document.getElementById('btn-open-host-modal');
    const btnSwitchHost = document.getElementById('btn-switch-host');
    if (btnOpenHostModal) btnOpenHostModal.addEventListener('click', openHostAddressModal);
    if (btnSwitchHost) btnSwitchHost.addEventListener('click', () => setScreen('choose-host'));

    // 5. Host Address Modal - Inputs and Buttons Focus Sync
    const inputHostName = document.getElementById('input-host-name');
    const inputHostIp = document.getElementById('input-host-ip');
    const inputHostPort = document.getElementById('input-host-port');
    const btnTestConn = document.getElementById('btn-test-connection');
    const btnSaveHost = document.getElementById('btn-save-host-address');
    const btnCancelHost = document.getElementById('btn-cancel-host-address');

    if (inputHostName) inputHostName.addEventListener('focus', () => { hostModalActiveField = 'name'; updateHostModalFocus(); });
    if (inputHostIp) inputHostIp.addEventListener('focus', () => { hostModalActiveField = 'ip'; updateHostModalFocus(); });
    if (inputHostPort) inputHostPort.addEventListener('focus', () => { hostModalActiveField = 'port'; updateHostModalFocus(); });

    if (btnTestConn) btnTestConn.addEventListener('click', testHostModalConnection);
    if (btnSaveHost) btnSaveHost.addEventListener('click', saveHostAddressModal);
    if (btnCancelHost) btnCancelHost.addEventListener('click', cancelHostAddressModal);

    // 6. Card Modal - Steppers and Actions
    const btnPageDec = document.getElementById('btn-page-dec');
    const btnPageInc = document.getElementById('btn-page-inc');
    const btnSceneDec = document.getElementById('btn-scene-dec');
    const btnSceneInc = document.getElementById('btn-scene-inc');
    const rowPage = document.getElementById('row-modal-page');
    const rowScene = document.getElementById('row-modal-scene');
    const rowCmd = document.getElementById('row-modal-command');
    const btnConfirmCard = document.getElementById('btn-confirm-card');
    const btnCancelCard = document.getElementById('btn-cancel-card');

    if (rowPage) {
        rowPage.addEventListener('click', () => {
            modalActiveRow = 'page';
            updateModalRowFocus();
        });
    }
    if (rowScene) {
        rowScene.addEventListener('click', () => {
            modalActiveRow = 'scene';
            updateModalRowFocus();
        });
    }
    if (rowCmd) {
        rowCmd.addEventListener('click', () => {
            modalActiveRow = 'command';
            updateModalRowFocus();
        });
    }
    if (btnPageDec) {
        btnPageDec.addEventListener('click', (e) => {
            e.stopPropagation();
            modalActiveRow = 'page';
            updateModalRowFocus();
            adjustModalStepper(-1);
        });
    }
    if (btnPageInc) {
        btnPageInc.addEventListener('click', (e) => {
            e.stopPropagation();
            modalActiveRow = 'page';
            updateModalRowFocus();
            adjustModalStepper(1);
        });
    }
    if (btnSceneDec) {
        btnSceneDec.addEventListener('click', (e) => {
            e.stopPropagation();
            modalActiveRow = 'scene';
            updateModalRowFocus();
            adjustModalStepper(-1);
        });
    }
    if (btnSceneInc) {
        btnSceneInc.addEventListener('click', (e) => {
            e.stopPropagation();
            modalActiveRow = 'scene';
            updateModalRowFocus();
            adjustModalStepper(1);
        });
    }
    if (btnConfirmCard) btnConfirmCard.addEventListener('click', confirmCardModal);
    if (btnCancelCard) btnCancelCard.addEventListener('click', cancelCardModal);

    // 7. Global Keyboard Navigation Engine
    window.addEventListener('keydown', handleGlobalKeydown);
}

// ============================================================
// 📌 Keyboard & Steam Input D-Pad Navigation Engine
// ============================================================
function handleGlobalKeydown(e) {
    const key = e.key;
    const code = e.code;
    const isEditMode = (currentScreen !== 'home');

    // Rule: In edit mode, intercept F1-F4 so they never trigger scenes
    if (isEditMode && ['F1', 'F2', 'F3', 'F4'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
    }

    const isTyping = document.activeElement && (
        document.activeElement.tagName === 'INPUT' ||
        document.activeElement.tagName === 'TEXTAREA'
    );

    // ==========================================
    // 1. SCREEN: HOME (LIVE OPERATION MODE)
    // ==========================================
    if (currentScreen === 'home') {
        const isConnected = (connectionStatus === 'connected');

        if (isConnected) {
            // Quando conectado: F1-F12 disparam cenas live via REST
            const fKeyMatch = key.match(/^F([1-9]|1[0-2])$/);
            if (fKeyMatch) {
                e.preventDefault();
                electronAPI.simulateFKey(key);
                const mapping = currentConfig.keyMappings[currentHost] && currentConfig.keyMappings[currentHost][key];
                const pDisp = mapping ? mapping.page + 1 : 1;
                const sDisp = mapping ? mapping.scene + 1 : 1;
                showToast(`${key} disparado -> Pág ${pDisp}, Cena ${sDisp}`, 'info');
                return;
            }

            if (key === 'Enter' || code === 'KeyA') {
                e.preventDefault();
                setScreen('choose-host');
                return;
            }

            if (code === 'KeyY') {
                e.preventDefault();
                handleHostConnectionToggle();
                return;
            }
        } else {
            // Quando desconectado: F1-F4 e Setas navegam na UI (0: Favela, 1: Maria, 2: Botão Editar)
            if (key === 'F1' || key === 'ArrowLeft') {
                e.preventDefault();
                if (homeSelectedIndex === 1) {
                    homeSelectedIndex = 0;
                    updateHomeHosts();
                }
                return;
            }

            if (key === 'F3' || key === 'ArrowRight') {
                e.preventDefault();
                if (homeSelectedIndex === 0) {
                    homeSelectedIndex = 1;
                    updateHomeHosts();
                }
                return;
            }

            if (key === 'F2' || key === 'ArrowUp') {
                e.preventDefault();
                if (homeSelectedIndex === 2) {
                    homeSelectedIndex = 0;
                    updateHomeHosts();
                }
                return;
            }

            if (key === 'F4' || key === 'ArrowDown') {
                e.preventDefault();
                if (homeSelectedIndex === 0 || homeSelectedIndex === 1) {
                    homeSelectedIndex = 2;
                    updateHomeHosts();
                }
                return;
            }

            if (key === 'Enter' || code === 'KeyA') {
                e.preventDefault();
                handleHomeConfirm();
                return;
            }

            if (code === 'KeyY') {
                e.preventDefault();
                handleHostConnectionToggle();
                return;
            }
        }
    }

    // ==========================================
    // 2. SCREEN: CHOOSE-HOST
    // ==========================================
    else if (currentScreen === 'choose-host') {
        if (key === 'F1' || key === 'ArrowLeft') {
            chooseHostSelected = 0;
            updateChooseHostCards();
            return;
        }

        if (key === 'F3' || key === 'ArrowRight') {
            chooseHostSelected = 1;
            updateChooseHostCards();
            return;
        }

        if (key === 'Enter' || code === 'KeyA') {
            e.preventDefault();
            confirmChooseHost();
            return;
        }

        if (key === 'Escape' || code === 'KeyB') {
            e.preventDefault();
            setScreen('home');
            return;
        }
    }

    // ==========================================
    // 3. SCREEN: GRID (4x3 CARDS)
    // ==========================================
    else if (currentScreen === 'grid') {
        if (key === 'F1' || key === 'ArrowLeft') {
            if (selectedCardIndex > 0) {
                selectedCardIndex--;
                renderEditGrid();
            }
            return;
        }

        if (key === 'F3' || key === 'ArrowRight') {
            if (selectedCardIndex < 11) {
                selectedCardIndex++;
                renderEditGrid();
            }
            return;
        }

        if (key === 'F2' || key === 'ArrowUp') {
            if (selectedCardIndex - 4 >= 0) {
                selectedCardIndex -= 4;
                renderEditGrid();
            }
            return;
        }

        if (key === 'F4' || key === 'ArrowDown') {
            if (selectedCardIndex + 4 < 12) {
                selectedCardIndex += 4;
                renderEditGrid();
            }
            return;
        }

        if (key === 'Enter' || code === 'KeyA') {
            e.preventDefault();
            openCardModal(selectedCardIndex);
            return;
        }

        if (key === 'Escape' || code === 'KeyB') {
            e.preventDefault();
            setScreen('choose-host');
            return;
        }

        if (code === 'KeyX') {
            e.preventDefault();
            openHostAddressModal();
            return;
        }

        if (code === 'KeyY') {
            e.preventDefault();
            saveAllConfig();
            return;
        }

        if (key === 'PageUp' || code === 'KeyL') {
            e.preventDefault();
            adjustCardDirectly(selectedCardIndex, 'page', -1);
            return;
        }

        if (key === 'PageDown' || code === 'KeyR') {
            e.preventDefault();
            adjustCardDirectly(selectedCardIndex, 'page', 1);
            return;
        }
    }

    // ==========================================
    // 4. MODAL: CARD ADJUSTMENT (modal-card)
    // ==========================================
    else if (currentScreen === 'modal-card') {
        const cmdInput = document.getElementById('input-card-command');

        if (key === 'F2' || key === 'ArrowUp') {
            e.preventDefault();
            if (cmdInput && document.activeElement === cmdInput) cmdInput.blur();
            if (modalActiveRow === 'command') modalActiveRow = 'scene';
            else if (modalActiveRow === 'scene') modalActiveRow = 'page';
            updateModalRowFocus();
            return;
        }

        if (key === 'F4' || key === 'ArrowDown') {
            e.preventDefault();
            if (modalActiveRow === 'page') modalActiveRow = 'scene';
            else if (modalActiveRow === 'scene') modalActiveRow = 'command';
            updateModalRowFocus();
            return;
        }

        if (key === 'F1' || key === 'ArrowLeft' || key === 'PageUp' || code === 'KeyL') {
            if (modalActiveRow !== 'command') {
                e.preventDefault();
                adjustModalStepper(-1);
                return;
            }
        }

        if (key === 'F3' || key === 'ArrowRight' || key === 'PageDown' || code === 'KeyR') {
            if (modalActiveRow !== 'command') {
                e.preventDefault();
                adjustModalStepper(1);
                return;
            }
        }

        if (key === 'Enter' || (!isTyping && code === 'KeyA')) {
            e.preventDefault();
            confirmCardModal();
            return;
        }

        if (key === 'Escape' || (!isTyping && code === 'KeyB')) {
            e.preventDefault();
            cancelCardModal();
            return;
        }
    }

    // ==========================================
    // 5. MODAL: HOST ADDRESS (modal-host)
    // ==========================================
    else if (currentScreen === 'modal-host') {
        // Navegação Direcional D-Pad no Modal de Host (F1-F4 / Arrows)
        if (key === 'F2' || key === 'ArrowUp') {
            e.preventDefault();
            if (hostModalActiveField === 'confirm' || hostModalActiveField === 'cancel') {
                hostModalActiveField = 'test';
            } else if (hostModalActiveField === 'test') {
                hostModalActiveField = 'ip';
            } else if (hostModalActiveField === 'ip' || hostModalActiveField === 'port') {
                hostModalActiveField = 'name';
            }
            updateHostModalFocus();
            return;
        }

        if (key === 'F4' || key === 'ArrowDown') {
            e.preventDefault();
            if (hostModalActiveField === 'name') {
                hostModalActiveField = 'ip';
            } else if (hostModalActiveField === 'ip' || hostModalActiveField === 'port') {
                hostModalActiveField = 'test';
            } else if (hostModalActiveField === 'test') {
                hostModalActiveField = 'confirm';
            }
            updateHostModalFocus();
            return;
        }

        if (key === 'F1' || key === 'ArrowLeft') {
            if (hostModalActiveField === 'port') {
                e.preventDefault();
                hostModalActiveField = 'ip';
                updateHostModalFocus();
                return;
            } else if (hostModalActiveField === 'cancel') {
                e.preventDefault();
                hostModalActiveField = 'confirm';
                updateHostModalFocus();
                return;
            }
        }

        if (key === 'F3' || key === 'ArrowRight') {
            if (hostModalActiveField === 'ip') {
                e.preventDefault();
                hostModalActiveField = 'port';
                updateHostModalFocus();
                return;
            } else if (hostModalActiveField === 'confirm') {
                e.preventDefault();
                hostModalActiveField = 'cancel';
                updateHostModalFocus();
                return;
            }
        }

        if (key === 'Escape' || (!isTyping && code === 'KeyB')) {
            e.preventDefault();
            cancelHostAddressModal();
            return;
        }

        // Ao pressionar Enter / A no campo de input: abre o teclado virtual ou foca o campo sem salvar
        if (key === 'Enter' || (!isTyping && code === 'KeyA')) {
            if (hostModalActiveField === 'name' || hostModalActiveField === 'ip' || hostModalActiveField === 'port') {
                const el = document.getElementById(`input-host-${hostModalActiveField}`);
                if (el) {
                    el.focus();
                    if (typeof el.select === 'function') el.select();
                }
                return;
            }

            e.preventDefault();
            if (hostModalActiveField === 'test') {
                testHostModalConnection();
            } else if (hostModalActiveField === 'cancel') {
                cancelHostAddressModal();
            } else if (hostModalActiveField === 'confirm') {
                saveHostAddressModal();
            }
            return;
        }
    }
}

// 📌 Direct step adjustment for card in grid via L / R
function adjustCardDirectly(cardIdx, field, delta) {
    const key = `F${cardIdx + 1}`;
    if (!currentConfig.keyMappings[editingHostKey]) {
        currentConfig.keyMappings[editingHostKey] = {};
    }
    const mapping = currentConfig.keyMappings[editingHostKey][key] || { page: 0, scene: cardIdx };
    let val = (mapping[field] || 0) + delta;
    if (val < 0) val = 0;
    if (val > 98) val = 98;
    mapping[field] = val;
    currentConfig.keyMappings[editingHostKey][key] = mapping;
    renderEditGrid();
}

// ============================================================
// 📌 Gamepad API Polling (Steam Deck Controller Support)
// ============================================================
function setupGamepadLoop() {
    function pollGamepad() {
        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        const gp = gamepads[0] || gamepads[1] || gamepads[2] || gamepads[3];

        if (gp) {
            handleGamepadInput(gp);
        }

        gamepadLoopId = requestAnimationFrame(pollGamepad);
    }

    window.addEventListener('gamepadconnected', () => {
        console.log('Gamepad conectado no Steam Deck.');
    });

    gamepadLoopId = requestAnimationFrame(pollGamepad);
}

function handleGamepadInput(gp) {
    const buttons = gp.buttons;
    const now = Date.now();

    function wasPressed(btnIndex) {
        const isDown = buttons[btnIndex] && buttons[btnIndex].pressed;
        const wasDown = !!lastButtonStates[btnIndex];
        lastButtonStates[btnIndex] = isDown;
        return isDown && !wasDown;
    }

    // Standard Steam Deck / Xbox Mapping:
    // 0: A, 1: B, 2: X, 3: Y
    // 4: L1 / LB, 5: R1 / RB, 6: L2 / LT, 7: R2 / RT
    // 12: D-Pad Up, 13: D-Pad Down, 14: D-Pad Left, 15: D-Pad Right
    const btnA = wasPressed(0);
    const btnB = wasPressed(1);
    const btnX = wasPressed(2);
    const btnY = wasPressed(3);
    const btnL = wasPressed(4) || wasPressed(6);
    const btnR = wasPressed(5) || wasPressed(7);
    const dpadUp = wasPressed(12);
    const dpadDown = wasPressed(13);
    const dpadLeft = wasPressed(14);
    const dpadRight = wasPressed(15);

    // Left analog stick debounce
    let stickLeft = false;
    let stickRight = false;
    let stickUp = false;
    let stickDown = false;

    if (now - lastAxesTime > 220) {
        const axisX = gp.axes[0] || 0;
        const axisY = gp.axes[1] || 0;
        const threshold = 0.55;

        if (axisX < -threshold) { stickLeft = true; lastAxesTime = now; }
        else if (axisX > threshold) { stickRight = true; lastAxesTime = now; }
        else if (axisY < -threshold) { stickUp = true; lastAxesTime = now; }
        else if (axisY > threshold) { stickDown = true; lastAxesTime = now; }
    }

    const navLeft = dpadLeft || stickLeft;
    const navRight = dpadRight || stickRight;
    const navUp = dpadUp || stickUp;
    const navDown = dpadDown || stickDown;

    if (currentScreen === 'home') {
        if (connectionStatus === 'connected') {
            if (btnA) setScreen('choose-host');
            else if (btnY) handleHostConnectionToggle();
        } else {
            if (navLeft) {
                if (homeSelectedIndex === 1) {
                    homeSelectedIndex = 0;
                    updateHomeHosts();
                }
            } else if (navRight) {
                if (homeSelectedIndex === 0) {
                    homeSelectedIndex = 1;
                    updateHomeHosts();
                }
            } else if (navUp) {
                if (homeSelectedIndex === 2) {
                    homeSelectedIndex = 0;
                    updateHomeHosts();
                }
            } else if (navDown) {
                if (homeSelectedIndex === 0 || homeSelectedIndex === 1) {
                    homeSelectedIndex = 2;
                    updateHomeHosts();
                }
            } else if (btnA) {
                handleHomeConfirm();
            } else if (btnY) {
                handleHostConnectionToggle();
            }
        }
    } else if (currentScreen === 'choose-host') {
        if (navLeft) {
            chooseHostSelected = 0;
            updateChooseHostCards();
        } else if (navRight) {
            chooseHostSelected = 1;
            updateChooseHostCards();
        } else if (btnA) {
            confirmChooseHost();
        } else if (btnB) {
            setScreen('home');
        }
    } else if (currentScreen === 'grid') {
        if (navLeft && selectedCardIndex > 0) {
            selectedCardIndex--;
            renderEditGrid();
        } else if (navRight && selectedCardIndex < 11) {
            selectedCardIndex++;
            renderEditGrid();
        } else if (navUp && selectedCardIndex - 4 >= 0) {
            selectedCardIndex -= 4;
            renderEditGrid();
        } else if (navDown && selectedCardIndex + 4 < 12) {
            selectedCardIndex += 4;
            renderEditGrid();
        } else if (btnA) {
            openCardModal(selectedCardIndex);
        } else if (btnB) {
            setScreen('choose-host');
        } else if (btnX) {
            openHostAddressModal();
        } else if (btnY) {
            saveAllConfig();
        } else if (btnL) {
            adjustCardDirectly(selectedCardIndex, 'page', -1);
        } else if (btnR) {
            adjustCardDirectly(selectedCardIndex, 'page', 1);
        }
    } else if (currentScreen === 'modal-card') {
        if (navUp) {
            if (modalActiveRow === 'command') modalActiveRow = 'scene';
            else if (modalActiveRow === 'scene') modalActiveRow = 'page';
            updateModalRowFocus();
        } else if (navDown) {
            if (modalActiveRow === 'page') modalActiveRow = 'scene';
            else if (modalActiveRow === 'scene') modalActiveRow = 'command';
            updateModalRowFocus();
        } else if (navLeft || btnL) {
            adjustModalStepper(-1);
        } else if (navRight || btnR) {
            adjustModalStepper(1);
        } else if (btnA) {
            confirmCardModal();
        } else if (btnB) {
            cancelCardModal();
        }
    } else if (currentScreen === 'modal-host') {
        if (navUp) {
            if (hostModalActiveField === 'confirm' || hostModalActiveField === 'cancel') {
                hostModalActiveField = 'test';
            } else if (hostModalActiveField === 'test') {
                hostModalActiveField = 'ip';
            } else if (hostModalActiveField === 'ip' || hostModalActiveField === 'port') {
                hostModalActiveField = 'name';
            }
            updateHostModalFocus();
        } else if (navDown) {
            if (hostModalActiveField === 'name') {
                hostModalActiveField = 'ip';
            } else if (hostModalActiveField === 'ip' || hostModalActiveField === 'port') {
                hostModalActiveField = 'test';
            } else if (hostModalActiveField === 'test') {
                hostModalActiveField = 'confirm';
            }
            updateHostModalFocus();
        } else if (navLeft) {
            if (hostModalActiveField === 'port') {
                hostModalActiveField = 'ip';
                updateHostModalFocus();
            } else if (hostModalActiveField === 'cancel') {
                hostModalActiveField = 'confirm';
                updateHostModalFocus();
            }
        } else if (navRight) {
            if (hostModalActiveField === 'ip') {
                hostModalActiveField = 'port';
                updateHostModalFocus();
            } else if (hostModalActiveField === 'confirm') {
                hostModalActiveField = 'cancel';
                updateHostModalFocus();
            }
        } else if (btnA) {
            if (hostModalActiveField === 'name' || hostModalActiveField === 'ip' || hostModalActiveField === 'port') {
                const el = document.getElementById(`input-host-${hostModalActiveField}`);
                if (el) {
                    el.focus();
                    if (typeof el.select === 'function') el.select();
                }
            } else if (hostModalActiveField === 'test') {
                testHostModalConnection();
            } else if (hostModalActiveField === 'cancel') {
                cancelHostAddressModal();
            } else if (hostModalActiveField === 'confirm') {
                saveHostAddressModal();
            }
        } else if (btnB) {
            cancelHostAddressModal();
        }
    }
}
