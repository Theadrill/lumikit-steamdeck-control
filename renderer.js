const { ipcRenderer } = require('electron');

// Variáveis globais
let config = null;
let currentHost = null;
let connectionStatus = 'disconnected';
let hasUnsavedChanges = false;

// Variáveis do gamepad
let lastAxis9 = 3.28571; // valor "neutro" do seu controle
let gamepadActive = false;

// Elementos da interface
const statusElement = document.getElementById('status');
const hostButtons = document.querySelectorAll('.host-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const testConnectionBtn = document.getElementById('test-connection-btn');
const saveConfigBtn = document.getElementById('save-config');
const resetConfigBtn = document.getElementById('reset-config');
const connectionInfo = document.getElementById('connection-info');
const connectedHostElement = document.getElementById('connected-host');

// Inicialização
document.addEventListener('DOMContentLoaded', async () => {
  try {
    config = await ipcRenderer.invoke('get-config');
    const status = await ipcRenderer.invoke('get-status');
    currentHost = status.currentHost;
    connectionStatus = status.connectionStatus;
    
    renderHostConfig();
    renderKeyConfig();
    renderKeyStatus();
    updateUI();
    
    // Inicia gamepad que simula teclas F
    startGamepadToFKeySimulation();
    
    console.log('✅ Interface carregada com gamepad→F-key simulation');
  } catch (error) {
    console.error('❌ Erro ao carregar interface:', error);
  }
});

// ===== GAMEPAD QUE SIMULA TECLAS F =====
function startGamepadToFKeySimulation() {
  // Detecta conexão do gamepad
  window.addEventListener('gamepadconnected', (event) => {
    console.log(`🎮 Gamepad conectado: ${event.gamepad.id}`);
    gamepadActive = true;
    showGamepadFeedback('Gamepad Conectado', 0, 0);
  });

  window.addEventListener('gamepaddisconnected', (event) => {
    console.log(`🎮 Gamepad desconectado: ${event.gamepad.id}`);
    gamepadActive = false;
  });

  // Loop de monitoramento do gamepad
  function gamepadLoop() {
    if (gamepadActive && currentHost && connectionStatus === 'connected') {
      const gamepads = navigator.getGamepads();
      
      for (let i = 0; i < gamepads.length; i++) {
        const gamepad = gamepads[i];
        if (!gamepad || gamepad.axes.length < 10) continue;

        const axis9 = parseFloat(gamepad.axes[9].toFixed(5));

        // Detecta mudança de neutro para direção (mais responsivo)
        if (lastAxis9 === 3.28571 && axis9 !== 3.28571) {
          let fKey = null;
          
          if (axis9 === -1) {
            fKey = 'F1'; // Up
          } else if (axis9 === -0.42857) {
            fKey = 'F2'; // Right
          } else if (axis9 === 0.14286) {
            fKey = 'F3'; // Down
          } else if (axis9 === 0.71429) {
            fKey = 'F4'; // Left
          }
          
          if (fKey) {
            console.log(`🎮 Axis 9: ${axis9} → ${fKey}`);
            // Simula tecla F no main process
            ipcRenderer.invoke('simulate-f-key', fKey);
            showGamepadFeedback(fKey, 0, 0);
          }
        }
        
        lastAxis9 = axis9;
      }
    }
    
    requestAnimationFrame(gamepadLoop);
  }
  
  gamepadLoop();
  console.log('🎮 Gamepad→F-key simulation iniciado');
}

// Feedback visual
function showGamepadFeedback(text, page, scene) {
  const feedback = document.createElement('div');
  feedback.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: rgba(39, 174, 96, 0.9);
    color: white;
    padding: 10px 15px;
    border-radius: 5px;
    font-weight: bold;
    z-index: 10000;
    font-size: 14px;
  `;
  
  if (text.startsWith('F') && page === 0) {
    feedback.textContent = `🎮 ${text}`;
  } else if (text === 'Gamepad Conectado') {
    feedback.textContent = `🎮 ${text}`;
  } else {
    feedback.textContent = `🎮 ${text} → P${page} C${scene}`;
  }
  
  document.body.appendChild(feedback);
  setTimeout(() => {
    if (feedback.parentNode) {
      feedback.parentNode.removeChild(feedback);
    }
  }, 1500);
}

// ===== RESTO DO CÓDIGO ORIGINAL (sem alterações) =====

function updateUI() {
  updateStatusDisplay();
  updateHostButtons();
  updateConnectionInfo();
  updateActionButtons();
  updateHostAddresses();
}

function updateStatusDisplay() {
  statusElement.className = `status ${connectionStatus}`;
  const statusTexts = {
    'disconnected': 'Desconectado',
    'connecting': 'Conectando...',
    'connected': 'Conectado',
    'error': 'Erro de Conexão',
    'testing': 'Testando...'
  };
  statusElement.textContent = statusTexts[connectionStatus] || 'Desconhecido';
}

function updateHostButtons() {
  hostButtons.forEach(btn => {
    btn.className = 'host-btn';
    if (currentHost && btn.dataset.host === currentHost) {
      btn.classList.add(connectionStatus);
    }
  });
}

function updateConnectionInfo() {
  if (currentHost && connectionStatus === 'connected') {
    connectionInfo.classList.remove('hidden');
    connectedHostElement.textContent = config.hosts[currentHost].name;
  } else {
    connectionInfo.classList.add('hidden');
  }
}

function updateHostAddresses() {
  if (config && config.hosts) {
    document.getElementById('favela-address').textContent = 
      `${config.hosts.favela.address}:${config.hosts.favela.port}`;
    document.getElementById('maria-address').textContent = 
      `${config.hosts.maria.address}:${config.hosts.maria.port}`;
  }
}

function updateActionButtons() {
  disconnectBtn.disabled = !currentHost;
  testConnectionBtn.disabled = !currentHost || connectionStatus === 'testing';
  saveConfigBtn.disabled = !hasUnsavedChanges;
}

function renderHostConfig() {
  const container = document.getElementById('host-config');
  container.innerHTML = '';
  Object.entries(config.hosts).forEach(([hostKey, host]) => {
    const div = document.createElement('div');
    div.className = 'host-config-item';
    div.innerHTML = `
      <h4>${host.name}</h4>
      <div class="host-config-row">
        <label>Endereço:</label>
        <input type="text" value="${host.address}" data-host="${hostKey}" data-field="address" placeholder="IP ou hostname">
      </div>
      <div class="host-config-row">
        <label>Porta:</label>
        <input type="number" value="${host.port}" data-host="${hostKey}" data-field="port" min="1" max="65535">
      </div>
    `;
    container.appendChild(div);
  });
  container.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', () => {
      hasUnsavedChanges = true;
      updateActionButtons();
    });
  });
}

function renderKeyConfig() {
  const container = document.getElementById('key-config');
  container.innerHTML = '';
  Object.entries(config.keyMappings).forEach(([hostKey, mapping]) => {
    const hostDiv = document.createElement('div');
    hostDiv.className = 'key-mapping-host';
    hostDiv.innerHTML = `<h4>${config.hosts[hostKey].name}</h4>`;
    const grid = document.createElement('div');
    grid.className = 'key-config-grid';
    for (let i = 1; i <= 12; i++) {
      const key = `F${i}`;
      const keyConfig = mapping[key] || { page: 0, scene: 0 };
      const item = document.createElement('div');
      item.className = 'key-config-item';
      item.innerHTML = `
        <span class="key-label">${key}:</span>
        <div class="key-selects">
          <label>Pág:</label>
          <select data-host="${hostKey}" data-key="${key}" data-type="page">
            ${Array.from({length: 10}, (_, i) => 
              `<option value="${i}" ${i === keyConfig.page ? 'selected' : ''}>${i + 1}</option>`
            ).join('')}
          </select>
          <label>Cena:</label>
          <select data-host="${hostKey}" data-key="${key}" data-type="scene">
            ${Array.from({length: 16}, (_, i) => 
              `<option value="${i}" ${i === keyConfig.scene ? 'selected' : ''}>${i + 1}</option>`
            ).join('')}
          </select>
        </div>
      `;
      grid.appendChild(item);
    }
    hostDiv.appendChild(grid);
    container.appendChild(hostDiv);
  });
  container.querySelectorAll('select').forEach(select => {
    select.addEventListener('change', () => {
      hasUnsavedChanges = true;
      updateActionButtons();
    });
  });
}

function renderKeyStatus() {
  const container = document.getElementById('key-grid');
  container.innerHTML = '';
  for (let i = 1; i <= 12; i++) {
    const div = document.createElement('div');
    div.className = 'key-status-item';
    div.innerHTML = `
      <strong>F${i}</strong><br>
      <span id="key-status-${i}">-</span>
    `;
    container.appendChild(div);
  }
  updateKeyStatusDisplay();
}

function updateKeyStatusDisplay() {
  if (!currentHost || !config.keyMappings[currentHost]) {
    for (let i = 1; i <= 12; i++) {
      const element = document.getElementById(`key-status-${i}`);
      if (element) element.textContent = '-';
    }
    return;
  }
  const mapping = config.keyMappings[currentHost];
  for (let i = 1; i <= 12; i++) {
    const key = `F${i}`;
    const element = document.getElementById(`key-status-${i}`);
    if (element && mapping[key]) {
      element.textContent = `P${mapping[key].page + 1} C${mapping[key].scene + 1}`;
    }
  }
}

// Event Listeners
hostButtons.forEach(btn => {
  btn.addEventListener('click', async () => {
    const hostKey = btn.dataset.host;
    try {
      connectionStatus = 'connecting';
      updateUI();
      const result = await ipcRenderer.invoke('connect-host', hostKey);
      if (result.success) {
        currentHost = hostKey;
        connectionStatus = 'connected';
        console.log(`✅ Conectado - keyboard listener ativo globalmente`);
      } else {
        connectionStatus = 'error';
      }
      updateUI();
      updateKeyStatusDisplay();
    } catch (error) {
      connectionStatus = 'error';
      updateUI();
    }
  });
});

disconnectBtn.addEventListener('click', async () => {
  try {
    await ipcRenderer.invoke('disconnect-host');
    currentHost = null;
    connectionStatus = 'disconnected';
    updateUI();
    updateKeyStatusDisplay();
  } catch (error) {}
});

testConnectionBtn.addEventListener('click', async () => {
  if (!currentHost) return;
  try {
    connectionStatus = 'testing';
    updateUI();
    const result = await ipcRenderer.invoke('test-connection', currentHost);
    connectionStatus = result.success ? 'connected' : 'error';
    updateUI();
  } catch (error) {
    connectionStatus = 'error';
    updateUI();
  }
});

saveConfigBtn.addEventListener('click', async () => {
  try {
    document.querySelectorAll('#host-config input').forEach(input => {
      const hostKey = input.dataset.host;
      const field = input.dataset.field;
      const value = field === 'port' ? parseInt(input.value) : input.value;
      config.hosts[hostKey][field] = value;
    });
    document.querySelectorAll('#key-config select').forEach(select => {
      const hostKey = select.dataset.host;
      const key = select.dataset.key;
      const type = select.dataset.type;
      const value = parseInt(select.value);
      if (!config.keyMappings[hostKey][key]) {
        config.keyMappings[hostKey][key] = { page: 0, scene: 0 };
      }
      config.keyMappings[hostKey][key][type] = value;
    });
    const result = await ipcRenderer.invoke('save-config', config);
    if (result.success) {
      hasUnsavedChanges = false;
      updateActionButtons();
      updateHostAddresses();
      updateKeyStatusDisplay();
      const originalText = saveConfigBtn.textContent;
      saveConfigBtn.textContent = '✅ Salvo!';
      saveConfigBtn.style.background = '#27ae60';
      setTimeout(() => {
        saveConfigBtn.textContent = originalText;
        saveConfigBtn.style.background = '';
      }, 2000);
    } else {
      alert('Erro ao salvar configurações!');
    }
  } catch (error) {
    alert('Erro ao salvar configurações!');
  }
});

resetConfigBtn.addEventListener('click', async () => {
  if (confirm('Tem certeza que deseja restaurar as configurações padrão? Esta ação não pode ser desfeita.')) {
    try {
      config = await ipcRenderer.invoke('get-config');
      renderHostConfig();
      renderKeyConfig();
      updateKeyStatusDisplay();
      hasUnsavedChanges = false;
      updateActionButtons();
      updateHostAddresses();
    } catch (error) {}
  }
});

ipcRenderer.on('connection-status-update', (event, data) => {
  connectionStatus = data.status;
  currentHost = data.host;
  updateUI();
  updateKeyStatusDisplay();
});

console.log('📝 Renderer carregado com gamepad híbrido');
