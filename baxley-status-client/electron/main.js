import { app, BrowserWindow, Tray, Menu, ipcMain, shell, Notification } from 'electron';
import path from 'path';
import fs from 'fs';
import mqtt from 'mqtt';
import squirrelStartup from 'electron-squirrel-startup';
import { icons } from './icons';

// Handle Squirrel.Windows install/update/uninstall events — must quit immediately.
if (squirrelStartup) app.quit();

// ─── Settings persistence ─────────────────────────────────────────────────────

const SETTINGS_FILE = path.join(app.getPath('userData'), 'settings.json');

const DEFAULT_SETTINGS = {
  mqttHost: '127.0.0.1',
  mqttPort: 1883,
  projectId: '',
  systemId: '',
};

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings) {
  fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true });
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

// ─── App state ────────────────────────────────────────────────────────────────

let tray = null;
let mainWindow = null;
let mqttClient = null;
let currentStatus = null;        // most recent status payload
let currentConnectionState = 'grey'; // 'grey' | 'live' | 'black'
let lastCheckedAt = null;        // payload.checkedAt from most recent message
let settings = loadSettings();
let isQuitting = false;

const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── MQTT ──────────────────────────────────────────────────────────────────────

function mqttTopic(s) {
  if (!s.projectId || !s.systemId) return null;
  return `${s.projectId}/${s.systemId}/status`;
}

function setConnectionState(state) {
  currentConnectionState = state;
  broadcastConnectionState(state);
  if (state === 'black') updateTray('black');
}

function connectMqtt() {
  if (mqttClient) {
    mqttClient.end(true);
    mqttClient = null;
  }

  // Reset to grey when (re)connecting
  currentConnectionState = 'grey';
  broadcastConnectionState('grey');
  updateTray('grey');

  const topic = mqttTopic(settings);
  if (!topic) {
    console.log('[MQTT] No topic configured — open Settings to enter your share code.');
    return;
  }

  const url = `mqtt://${settings.mqttHost}:${settings.mqttPort}`;
  console.log(`[MQTT] Connecting to ${url}`);

  mqttClient = mqtt.connect(url, { clean: true, reconnectPeriod: 15_000 });

  mqttClient.on('connect', () => {
    console.log(`[MQTT] Connected — subscribing to topic`);
    mqttClient.subscribe(topic, { qos: 1 });
    // Stay grey until the retained message arrives
  });

  mqttClient.on('message', (_topic, message) => {
    let payload;
    try {
      payload = JSON.parse(message.toString());
    } catch {
      return;
    }

    lastCheckedAt = payload.checkedAt;
    const age = lastCheckedAt
      ? Date.now() - new Date(lastCheckedAt).getTime()
      : Infinity;

    const prev = currentStatus;
    currentStatus = payload;
    broadcastToRenderer(payload);

    if (age > STALE_MS) {
      // Broker has a retained message but the API stopped publishing long ago
      setConnectionState('black');
    } else {
      const wasBlackOrGrey = currentConnectionState !== 'live';
      setConnectionState('live');
      updateTray(payload.status);
      if (prev && prev.status !== payload.status && !wasBlackOrGrey) {
        sendNotification(payload);
      }
    }
  });

  mqttClient.on('error', (err) => {
    console.error('[MQTT] Error:', err.message);
    setConnectionState('black');
  });

  // Tray shows grey while reconnecting, but panel keeps last known status
  mqttClient.on('close', () => {
    if (currentConnectionState === 'live') {
      updateTray('grey');
    }
  });
}

// ─── Staleness interval ───────────────────────────────────────────────────────

// Runs every minute to catch the case where MQTT is connected but the API
// stopped publishing (no new messages for 24h).
function startStalenessCheck() {
  setInterval(() => {
    if (currentConnectionState === 'black') return;
    if (!lastCheckedAt) return;
    const age = Date.now() - new Date(lastCheckedAt).getTime();
    if (age > STALE_MS) {
      console.log('[STALENESS] No update in 24h — going black');
      setConnectionState('black');
    }
  }, 60_000);
}

// ─── Tray ─────────────────────────────────────────────────────────────────────

function statusLabel(s) {
  const labels = {
    green: 'All good', yellow: 'Needs attention',
    red: 'Pipeline issue', grey: 'Connecting…', black: 'No updates',
  };
  return labels[s] || 'Unknown';
}

function buildContextMenu(status) {
  return Menu.buildFromTemplate([
    { label: 'Baxley Pipeline Status', enabled: false },
    { label: `Status: ${statusLabel(status)}`, enabled: false },
    { type: 'separator' },
    { label: 'Open Details', click: () => showWindow() },
    { type: 'separator' },
    { label: 'Quit', click: () => app.quit() },
  ]);
}

function updateTray(status) {
  if (!tray) return;
  tray.setImage(icons[status] || icons.grey);
  tray.setToolTip(`Baxley Pipeline — ${statusLabel(status)}`);
  tray.setContextMenu(buildContextMenu(status));
}

// ─── Main window ──────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 480,
    resizable: false,
    skipTaskbar: true,
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  mainWindow.on('close', (e) => {
    if (isQuitting) return;
    e.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('blur', () => {
    if (!mainWindow.webContents.isDevToolsOpened()) {
      mainWindow.hide();
    }
  });
}

function showWindow() {
  if (!mainWindow) createWindow();

  const trayBounds = tray.getBounds();
  const windowBounds = mainWindow.getBounds();
  const x = Math.round(trayBounds.x + trayBounds.width / 2 - windowBounds.width / 2);
  const y = trayBounds.y > 400
    ? trayBounds.y - windowBounds.height - 4
    : trayBounds.y + trayBounds.height + 4;

  mainWindow.setPosition(x, y);
  mainWindow.show();
  mainWindow.focus();
}

function broadcastToRenderer(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mqtt:status', payload);
  }
}

function broadcastConnectionState(state) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('mqtt:connection', state);
  }
}

// ─── Notifications ────────────────────────────────────────────────────────────

function sendNotification(payload) {
  if (!Notification.isSupported()) return;
  const titles = { green: 'Pipeline OK', yellow: 'Pipeline Warning', red: 'Pipeline Error' };
  new Notification({
    title: titles[payload.status] || 'Pipeline Status Changed',
    body: payload.detail || '',
    urgency: payload.status === 'red' ? 'critical' : 'normal',
  }).show();
}

// ─── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  if (app.dock) app.dock.hide();

  tray = new Tray(icons.grey);
  updateTray('grey');

  tray.on('click', () => {
    if (mainWindow && mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      showWindow();
    }
  });

  startStalenessCheck();
  connectMqtt();
});

app.on('before-quit', () => { isQuitting = true; });

app.on('window-all-closed', () => {});

app.on('will-quit', () => {
  if (mqttClient) mqttClient.end(true); // force-close, don't wait for handshake
});

// ─── IPC handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('status:get', () => ({
  status: currentStatus,
  connectionState: currentConnectionState,
}));

ipcMain.handle('settings:get', () => settings);

ipcMain.handle('settings:save', (_e, newSettings) => {
  if (newSettings.shareCode) {
    try {
      const decoded = JSON.parse(Buffer.from(newSettings.shareCode, 'base64').toString('utf8'));
      newSettings.mqttHost  = decoded.mqttHost  || newSettings.mqttHost;
      newSettings.mqttPort  = decoded.mqttPort  || decoded.mqttWsPort || newSettings.mqttPort;
      newSettings.projectId = decoded.projectId  || newSettings.projectId;
      newSettings.systemId  = decoded.systemId   || newSettings.systemId;
    } catch {
      return { ok: false, error: 'Invalid share code' };
    }
  }
  delete newSettings.shareCode;
  settings = { ...settings, ...newSettings };
  saveSettings(settings);
  connectMqtt();
  return { ok: true };
});

ipcMain.handle('shell:openExternal', (_e, url) => shell.openExternal(url));
