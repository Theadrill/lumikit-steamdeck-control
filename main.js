// main.js

// Módulos do Electron e outras dependências
// ✅ CORREÇÃO 1: Adicionado 'globalShortcut' e REMOVIDA a dependência 'node-global-key-listener'
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, globalShortcut } = require("electron") 
const http = require("http")
const path = require("path")
const fsp = require("fs").promises
const os = require("os");
const dns = require("dns"); 
const { exec } = require("child_process"); 

// Determina o Sistema Operacional
const isWindows = os.platform() === "win32";
const isLinux = os.platform() === "linux";

// Define o caminho seguro para salvar a configuração
const userDataPath = app.getPath("userData")
const configPath = path.join(userDataPath, "config.json")

// Variáveis de estado global
let config = null
let mainWindow = null
let tray = null
let currentHost = null
let connectionStatus = "disconnected"
let isQuitting = false
let resolvedHostCache = {}; // CACHE PARA ARMAZENAR IPs RESOLVIDOS
let isEditMode = false; // Flag para pausar disparos de atalhos de hardware em Modo Edição

// IPC para retornar SO atual para a interface (renderer)
ipcMain.handle("get-os", () => (isWindows ? "windows" : isLinux ? "linux" : "outro"));

// Configuração padrão
const defaultConfig = {
    hosts: {
        favela: { name: "PC Favela Rodrigo", address: "pcrodrigoxeon", port: 5000 },
        maria: { name: "PC Maria Rodrigo", address: "pcmariarodrigo", port: 5000 },
    },
    keyMappings: { favela: {}, maria: {} }, 
}

// Inicializa o mapeamento padrão F1-F12 (0-based)
for (let i = 1; i <= 12; i++) {
    defaultConfig.keyMappings.favela[`F${i}`] = { page: 0, scene: i - 1 }
    defaultConfig.keyMappings.maria[`F${i}`] = { page: 1, scene: i - 1 }
}

/**
 * @description Carrega a configuração do disco e faz a fusão com a configuração padrão
 */
async function loadConfig() {
    let loadedConfig = {}; 
    let configLoadedFromFile = false;

    try {
        const data = await fsp.readFile(configPath, "utf-8")
        loadedConfig = JSON.parse(data)
        configLoadedFromFile = true;
    } catch (error) {
        console.warn("⚠️ Arquivo config.json não encontrado ou inválido. Usando defaults.");
    }
    
    // ✅ CORREÇÃO AQUI: Garante que os mapeamentos são fundidos de forma profunda
    const finalConfig = {
        ...defaultConfig,
        hosts: Object.assign({}, defaultConfig.hosts, loadedConfig.hosts),
        keyMappings: Object.keys(defaultConfig.keyMappings).reduce((acc, hostKey) => {
            // Para cada host, funde o default F1-F12 com o que foi carregado do disco
            const loadedHostMapping = loadedConfig.keyMappings ? loadedConfig.keyMappings[hostKey] || {} : {};
            acc[hostKey] = Object.assign({}, defaultConfig.keyMappings[hostKey], loadedHostMapping);
            return acc;
        }, {}),
    };
    
    if (!configLoadedFromFile) {
        try {
            await fsp.mkdir(userDataPath, { recursive: true })
            await saveConfig(finalConfig);
        } catch (saveError) {
             console.error("❌ Erro ao salvar config padrão:", saveError.message);
        }
    }

    return finalConfig;
}


// Salva configuração
async function saveConfig(newConfig) {
    try {
        await fsp.writeFile(configPath, JSON.stringify(newConfig, null, 2))
        return true
    } catch (error) {
        console.error("❌ ERRO AO SALVAR CONFIGURAÇÃO:", error)
        return false
    }
}

// Funções de resolução DNS com cache
async function resolveHostAddress(hostname) {
    if (resolvedHostCache[hostname]) {
        return resolvedHostCache[hostname];
    }
    
    return new Promise((resolve) => {
        dns.lookup(hostname, { family: 4 }, (err, address, family) => {
            if (err) {
                console.error(`❌ ERRO na resolução DNS para ${hostname}:`, err.code);
                return resolve(null);
            }
            resolvedHostCache[hostname] = address;
            resolve(address);
        });
    });
}


// Testa conexão
async function testConnection(hostKey) {
    if (!config || !config.hosts || !config.hosts[hostKey]) return false;

    const host = config.hosts[hostKey];
    const ipAddress = await resolveHostAddress(host.address);
    if (!ipAddress) return false;

    return new Promise((resolve) => {
        const req = http.request(
            { 
                hostname: ipAddress, 
                port: host.port, 
                path: "/", 
                method: "HEAD", 
                timeout: 3000,
            },
            (res) => resolve(true)
        )
        req.on("error", (err) => {
            delete resolvedHostCache[host.address]; 
            resolve(false);
        })
        req.on("timeout", () => { 
            req.destroy(); 
            delete resolvedHostCache[host.address];
            resolve(false); 
        })
        req.end()
    })
}

// Envia comando HTTP GET (0-based)
async function changeScene(page, scene) {
    if (!config || !currentHost || !config.hosts[currentHost]) return

    const host = config.hosts[currentHost]
    const ipAddress = await resolveHostAddress(host.address);
    if (!ipAddress) return;

    const options = {
        hostname: ipAddress,
        port: host.port,
        path: `/services/edmx_change_scene/${page}/${scene}`, // 0-based no backend
        method: "GET",
        timeout: 2000,
    }

    const req = http.request(options, (res) => updateConnectionStatus("connected"))
    
    req.on("error", (err) => {
        updateConnectionStatus("error");
    })
    req.on("timeout", () => { 
        req.destroy(); 
        updateConnectionStatus("timeout"); 
    })
    req.end()
}

// Atualiza status e envia para o frontend
function updateConnectionStatus(status) {
    connectionStatus = status
    if (mainWindow && !mainWindow.isDestroyed()) {
        const hostName = currentHost && config && config.hosts[currentHost] ? config.hosts[currentHost].name : null;
        mainWindow.webContents.send("connection-status-update", {
            status: connectionStatus,
            host: currentHost,
            hostName: hostName,
            config: config 
        })
    }
    updateTrayMenu()
}

// Listener Global de Teclado (F1-F12)
// ✅ CORREÇÃO 2: Usa o módulo globalShortcut do Electron para interceptar e bloquear teclas
function registerGlobalKeyboardListener() {
    // Garante que atalhos anteriores sejam limpos antes de registrar novamente
    globalShortcut.unregisterAll();

    // 1. Teclas de função (F1-F12)
    const functionKeys = [
        'F1', 'F2', 'F3', 'F4', 'F5', 'F6',
        'F7', 'F8', 'F9', 'F10', 'F11', 'F12'
    ];

    try {
        // Itera sobre as teclas F para registrar e bloquear/executar ação
        functionKeys.forEach(key => {
            const success = globalShortcut.register(key, () => {
                // Lógica de Ação: Executa a função mapeada se estiver conectado e NÃO estiver em Modo de Edição
                if (!isEditMode && currentHost && config && config.keyMappings[currentHost]) {
                    const keyMap = config.keyMappings[currentHost];
                    const mapping = keyMap[key];

                    if (mapping) {
                        changeScene(mapping.page, mapping.scene); // Ação Principal

                        if (mapping.command) {
                            runCommand(mapping.command); // Comando Opcional
                        }
                    }
                }
                // O simples fato da função ser executada aqui já BLOQUEIA a propagação do evento no OS.
                console.log(`Atalho global ${key} capturado e bloqueado. (isEditMode: ${isEditMode})`);
            });

            if (!success) {
                console.error(`❌ Falha ao registrar o atalho global ${key}`);
            }
        });

        // 2. Bloqueia atalhos comuns (Ctrl+R, F5, etc.) que você quer anular sempre.
        const shortcutsToBlock = ['CommandOrControl+R'];
        shortcutsToBlock.forEach(key => {
             globalShortcut.register(key, () => {
                console.log(`Atalho de sistema ${key} bloqueado.`);
            });
        });

    } catch (error) {
        console.error("❌ Erro ao registrar globalShortcut:", error.message);
    }
}

// ✅ CORREÇÃO 3: Desregistra todos os atalhos
function stopGlobalKeyboardListener() {
    globalShortcut.unregisterAll(); 
    console.log("Atalhos globais desregistrados.");
}

// Função para executar comando externo 
function runCommand(command) {
    const adapted = isWindows ? command : command.replace(/\\.bat/g, ".sh");
    exec(adapted, { cwd: __dirname }, (error, stdout, stderr) => {
        if (error) {
            dialog.showErrorBox("Erro", `Falha ao executar: ${error.message}`); 
            return;
        }
    });
}


// Cria janela principal
function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        // ✅ Inicia a janela visível e adequada para 1280x800 do Steam Deck
        show: true,
        skipTaskbar: false,
        resizable: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
        icon: path.join(__dirname, isWindows ? "icon.ico" : "icon.png"),
    })

    mainWindow.loadFile("index.html")
    mainWindow.setMenuBarVisibility(false)

    mainWindow.on("close", (event) => {
        // Mantém a lógica de esconder, não fechar
        if (!isQuitting) {
            event.preventDefault()
            mainWindow.hide() 
        }
    })
    
    // ✅ ADIÇÃO: Força a janela a aparecer (Segurança)
    mainWindow.show();
}

// Cria Tray
function createTray() {
    try {
        const iconFile = isWindows ? "icon.ico" : "icon.png";
        const iconPath = path.join(__dirname, iconFile);
        let icon = nativeImage.createFromPath(iconPath);
        if (isLinux) {
            icon.setTemplateImage(true);
        }
        tray = isWindows ? new Tray(icon.resize({ width: 16, height: 16 })) : new Tray(icon);
        tray.on("click", () => {
            if (mainWindow.isVisible()) {
                mainWindow.hide();
            } else {
                mainWindow.show();
                mainWindow.focus();
            }
        });
    } catch (error) {
        // Se a criação do Tray falhar (comum no Wayland), o aplicativo continua rodando
        // e é acessível pela barra de tarefas (Taskbar), graças às correções acima.
        console.error("❌ Erro ao criar tray. Continuando a execução.", error);
    }
}

// Atualiza menu do tray
function updateTrayMenu() {
    if (!tray || !config || !config.hosts || !config.hosts.favela || !config.hosts.maria) return; 

    const statusText = currentHost && config.hosts[currentHost]
        ? `${config.hosts[currentHost].name} (${connectionStatus})`
        : "Não conectado";

    const contextMenu = Menu.buildFromTemplate([
        { label: "Lumikit Steam Deck Control", enabled: false },
        { type: "separator" },
        { label: "Abrir Interface", click: () => { mainWindow.show(); mainWindow.focus(); } },
        { label: `Status: ${statusText}`, enabled: false },
        { type: "separator" },
        { label: `Conectar ${config.hosts.favela.name}`, click: () => connectToHost("favela") },
        { label: `Conectar ${config.hosts.maria.name}`, click: () => connectToHost("maria") },
        { label: "Desconectar", enabled: currentHost !== null, click: () => { currentHost = null; updateConnectionStatus("disconnected"); stopGlobalKeyboardListener(); } },
        { type: "separator" },
        { label: "Sair", click: () => { isQuitting = true; stopGlobalKeyboardListener(); app.quit(); } },
    ]);

    tray.setContextMenu(contextMenu);
    tray.setToolTip(`Lumikit Control - ${statusText}`);
}


// Conecta a um host
async function connectToHost(hostKey) {
    if (!config) {
        updateConnectionStatus("error");
        return { success: false, status: "error", host: null };
    }

    updateConnectionStatus("connecting")

    const success = await testConnection(hostKey)
    if (success) {
        currentHost = hostKey
        isEditMode = false; // Ao conectar com sucesso no Live, desativa o edit mode
        updateConnectionStatus("connected")
        registerGlobalKeyboardListener()
    } else {
        updateConnectionStatus("error")
    }
    return { success: success, status: connectionStatus, host: currentHost };
}

// ===================================
// ===== IPC HANDLERS =====
// ===================================

ipcMain.handle("get-config", async () => config);
ipcMain.handle("save-config", async (event, newConfig) => {
    const success = await saveConfig(newConfig)
    if (success) config = newConfig;
    return { success }
});
ipcMain.handle("connect-host", async (event, hostKey) => await connectToHost(hostKey));
ipcMain.handle("disconnect-host", async () => {
    currentHost = null
    stopGlobalKeyboardListener() 
    updateConnectionStatus("disconnected")
    return { success: true }
});
ipcMain.handle("get-status", async () => ({
    currentHost,
    connectionStatus,
    hostName: currentHost && config && config.hosts[currentHost] ? config.hosts[currentHost].name : null,
}));
ipcMain.handle("test-connection", async (event, hostKey) => await testConnection(hostKey));

ipcMain.handle("simulate-f-key", async (event, fKey) => {
    if (!config || !currentHost || !config.keyMappings[currentHost] || !config.keyMappings[currentHost][fKey]) {
        return { success: false }
    }
    const mapping = config.keyMappings[currentHost][fKey];
    const { page, scene, command } = mapping;
    
    await changeScene(page, scene); // 0-based

    if (command) {
        runCommand(command);
    }
    
    return { success: true }
});

ipcMain.handle("run-command", async (event, command) => {
    return new Promise((resolve, reject) => {
        const adapted = isWindows ? command : command.replace(/\\.bat/g, ".sh");
        exec(adapted, { cwd: __dirname }, (error, stdout, stderr) => {
            if (error) {
                dialog.showErrorBox("Erro", `Falha ao executar: ${error.message}`);
                return reject(stderr);
            }
            resolve(stdout);
        });
    });
});

ipcMain.handle("set-edit-mode", (event, editMode) => {
    isEditMode = !!editMode;
    console.log(`Modo de Edição alterado para: ${isEditMode}`);
    if (isEditMode) {
        // Ao entrar em modo de edição, libera as teclas F1-F12 do atalho global do SO
        // para que a janela do Chromium receba os eventos keydown para navegação D-Pad
        stopGlobalKeyboardListener();
    } else {
        // Ao voltar para o Live Mode, reativa os atalhos globais para disparos DMX
        if (currentHost && connectionStatus === "connected") {
            registerGlobalKeyboardListener();
        }
    }
    return { success: true, isEditMode };
});

// Inicialização
app.whenReady().then(async () => {
    config = await loadConfig() 
    createMainWindow()          
    createTray()                
    updateTrayMenu()            
})

app.on("window-all-closed", () => {
    if (!isQuitting) return
    app.quit()
})

app.on("before-quit", () => {
    isQuitting = true
    stopGlobalKeyboardListener() 
    if (tray) tray.destroy()
})

app.on("will-quit", (event) => {
    if (!isQuitting) event.preventDefault()
    stopGlobalKeyboardListener() 
})

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
    app.quit()
} else {
    app.on("second-instance", () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.focus()
            mainWindow.show()
        }
    })
}

process.on("uncaughtException", (error) => console.error("❌ Erro não capturado:", error))
process.on("unhandledRejection", (reason, promise) => console.error("❌ Promise rejeitada:", reason))