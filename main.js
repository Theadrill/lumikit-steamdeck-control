const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron');
const { GlobalKeyboardListener } = require('node-global-key-listener');
const http = require('http');
const path = require('path');
const fs = require('fs').promises;

// Configuração salva na raiz do aplicativo
const configPath = path.join(__dirname, 'config.json');
let config = null;
let mainWindow = null;
let tray = null;
let currentHost = null;
let connectionStatus = 'disconnected';
let isQuitting = false;
let keyboardListener = null;

// Configuração padrão
const defaultConfig = {
  hosts: {
    favela: {
      name: "PC Favela Rodrigo",
      address: "pcfavelarodrigo",
      port: 5000
    },
    maria: {
      name: "PC Maria Rodrigo", 
      address: "pcmariarodrigo",
      port: 5000
    }
  },
  keyMappings: {
    favela: {},
    maria: {}
  }
};

// Gera mapeamento padrão de teclas
for (let i = 1; i <= 12; i++) {
  defaultConfig.keyMappings.favela[`F${i}`] = { page: 0, scene: i - 1 };
  defaultConfig.keyMappings.maria[`F${i}`] = { page: 1, scene: i - 1 };
}

// Carrega configuração do arquivo
async function loadConfig() {
  try {
    const data = await fs.readFile(configPath, 'utf-8');
    const loadedConfig = JSON.parse(data);
    console.log('✅ Configuração carregada:', configPath);
    return loadedConfig;
  } catch (error) {
    console.log('⚠️ Criando configuração padrão...');
    await saveConfig(defaultConfig);
    return defaultConfig;
  }
}

// Salva configuração no arquivo
async function saveConfig(newConfig) {
  try {
    await fs.writeFile(configPath, JSON.stringify(newConfig, null, 2));
    console.log('✅ Configuração salva:', configPath);
    return true;
  } catch (error) {
    console.error('❌ Erro ao salvar configuração:', error);
    return false;
  }
}

// Testa conexão com host
async function testConnection(hostKey) {
  if (!config.hosts[hostKey]) return false;
  
  const host = config.hosts[hostKey];
  return new Promise((resolve) => {
    const req = http.request({
      hostname: host.address,
      port: host.port,
      path: '/',
      method: 'HEAD',
      timeout: 3000
    }, (res) => {
      console.log(`✅ ${host.name} conectado - Status: ${res.statusCode}`);
      resolve(true);
    });

    req.on('error', (err) => {
      console.log(`❌ ${host.name} falhou: ${err.message}`);
      resolve(false);
    });

    req.on('timeout', () => {
      console.log(`⏱️ ${host.name} timeout`);
      req.destroy();
      resolve(false);
    });

    req.end();
  });
}

// Envia comando para trocar cena
function changeScene(page, scene) {
  if (!currentHost || !config.hosts[currentHost]) return;
  
  const host = config.hosts[currentHost];
  const options = {
    hostname: host.address,
    port: host.port,
    path: `/services/edmx_change_scene/${page}/${scene}`,
    method: 'GET',
    timeout: 2000
  };

  console.log(`🎮 Enviando: ${host.address}:${host.port}/services/edmx_change_scene/${page}/${scene}`);

  const req = http.request(options, (res) => {
    console.log(`✅ Página ${page + 1}, Cena ${scene + 1} ativada`);
    updateConnectionStatus('connected');
  });

  req.on('error', (err) => {
    console.error('❌ Erro na cena:', err.message);
    updateConnectionStatus('error');
  });

  req.on('timeout', () => {
    console.log('⏱️ Timeout na cena');
    req.destroy();
    updateConnectionStatus('timeout');
  });

  req.end();
}

// Atualiza status de conexão
function updateConnectionStatus(status) {
  connectionStatus = status;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('connection-status-update', {
      status: connectionStatus,
      host: currentHost,
      hostName: currentHost ? config.hosts[currentHost].name : null
    });
  }
  updateTrayMenu();
}

// ===== LISTENER GLOBAL DE TECLADO (NOVA ABORDAGEM) =====
function registerGlobalKeyboardListener() {
  if (keyboardListener) return;
  
  try {
    keyboardListener = new GlobalKeyboardListener({
      windows: {
        onError: (errorCode) => console.error("Keyboard Error: " + errorCode),
        onInfo: (info) => console.info("Keyboard Info: " + info)
      }
    });

    keyboardListener.addListener((e, down) => {
      // Só processa teclas F1-F12 quando pressionadas (DOWN)
      if (e.state === 'DOWN' && currentHost && config.keyMappings[currentHost]) {
        const keyMap = config.keyMappings[currentHost];
        
        // Verifica se é uma tecla F1-F12
        if (e.name.match(/^F(1[0-2]|[1-9])$/)) {
          const mapping = keyMap[e.name];
          if (mapping) {
            const { page, scene } = mapping;
            console.log(`⌨️ ${e.name} → Página ${page + 1}, Cena ${scene + 1}`);
            changeScene(page, scene);
            return true; // Suprime a tecla F (opcional)
          }
        }
      }
      return false; // Não suprime outras teclas
    });
    
    console.log('⌨️ Global keyboard listener registrado');
  } catch (error) {
    console.error('❌ Erro ao registrar keyboard listener:', error);
  }
}

// Para listener de teclado
function stopGlobalKeyboardListener() {
  if (keyboardListener) {
    try {
      keyboardListener.kill();
      keyboardListener = null;
      console.log('⌨️ Global keyboard listener parado');
    } catch (error) {
      console.error('❌ Erro ao parar keyboard listener:', error);
    }
  }
}

// Cria janela principal
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 700,
    show: false,
    skipTaskbar: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'icon.ico')
  });

  mainWindow.loadFile('index.html');
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('🚀 Interface carregada');
  });
}

// Cria tray
function createTray() {
  try {
    const iconPath = path.join(__dirname, 'icon.ico');
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.resize({ width: 16, height: 16 }));
    updateTrayMenu();
    
    tray.on('click', () => {
      if (mainWindow.isVisible()) {
        mainWindow.hide();
      } else {
        mainWindow.show();
        mainWindow.focus();
      }
    });
    
    console.log('📌 Tray criado');
  } catch (error) {
    console.error('❌ Erro ao criar tray:', error);
  }
}

// Atualiza menu do tray
function updateTrayMenu() {
  if (!tray) return;
  
  const statusText = currentHost ? 
    `${config.hosts[currentHost].name} (${connectionStatus})` : 
    'Não conectado';

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Lumikit Steam Deck Control',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Abrir Interface',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    {
      label: `Status: ${statusText}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Conectar Favela',
      click: () => connectToHost('favela')
    },
    {
      label: 'Conectar Maria',
      click: () => connectToHost('maria')
    },
    {
      label: 'Desconectar',
      enabled: currentHost !== null,
      click: () => {
        currentHost = null;
        updateConnectionStatus('disconnected');
      }
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        isQuitting = true;
        stopGlobalKeyboardListener();
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(`Lumikit Control - ${statusText}`);
}

// Conecta a um host
async function connectToHost(hostKey) {
  updateConnectionStatus('connecting');
  
  const success = await testConnection(hostKey);
  if (success) {
    currentHost = hostKey;
    updateConnectionStatus('connected');
    registerGlobalKeyboardListener(); // Registra listener global
  } else {
    updateConnectionStatus('error');
  }
}

// ===== IPC HANDLERS =====
ipcMain.handle('get-config', async () => {
  return config;
});

ipcMain.handle('save-config', async (event, newConfig) => {
  const success = await saveConfig(newConfig);
  if (success) {
    config = newConfig;
  }
  return { success };
});

ipcMain.handle('connect-host', async (event, hostKey) => {
  await connectToHost(hostKey);
  return { 
    success: connectionStatus === 'connected',
    status: connectionStatus,
    host: currentHost
  };
});

ipcMain.handle('disconnect-host', async () => {
  currentHost = null;
  stopGlobalKeyboardListener(); // Para listener ao desconectar
  updateConnectionStatus('disconnected');
  return { success: true };
});

ipcMain.handle('get-status', async () => {
  return {
    currentHost,
    connectionStatus,
    hostName: currentHost ? config.hosts[currentHost].name : null
  };
});

ipcMain.handle('test-connection', async (event, hostKey) => {
  const success = await testConnection(hostKey);
  return { success };
});

// Novo handler para simular tecla F do gamepad
ipcMain.handle('simulate-f-key', async (event, fKey) => {
  if (!currentHost || !config.keyMappings[currentHost]) return { success: false };
  
  const keyMap = config.keyMappings[currentHost];
  if (keyMap[fKey]) {
    const { page, scene } = keyMap[fKey];
    console.log(`🎮 Gamepad simulou ${fKey} → Página ${page + 1}, Cena ${scene + 1}`);
    changeScene(page, scene);
    return { success: true };
  }
  
  return { success: false };
});

// Inicialização
app.whenReady().then(async () => {
  config = await loadConfig();
  createMainWindow();
  createTray();
  
  console.log('🚀 Aplicativo iniciado');
  console.log('📁 Configuração em:', configPath);
});

app.on('window-all-closed', () => {
  if (!isQuitting) {
    return;
  }
  app.quit();
});

app.on('before-quit', () => {
  isQuitting = true;
  stopGlobalKeyboardListener();
  if (tray) {
    tray.destroy();
  }
});

app.on('will-quit', (event) => {
  if (!isQuitting) {
    event.preventDefault();
  }
  stopGlobalKeyboardListener();
});

// Previne múltiplas instâncias
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
      mainWindow.show();
    }
  });
}

// Tratamento de erros
process.on('uncaughtException', (error) => {
  console.error('❌ Erro não capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promise rejeitada:', reason);
});
