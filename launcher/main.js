const { app, BrowserWindow, ipcMain, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// ── Project paths ────────────────────────────────────────────────────────
// Assumes launcher/ sits alongside backend/ and frontend/ in the project root.
const PROJECT_ROOT = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(PROJECT_ROOT, 'backend');
const FRONTEND_DIR = path.join(PROJECT_ROOT, 'frontend');

let mainWindow;
let backendProc = null;
let frontendProc = null;

function sendLog(channel, text) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('log', { channel, text });
  }
}

function sendStatus() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('status', {
      backend: backendProc !== null,
      frontend: frontendProc !== null,
    });
  }
}

function runNpm(args, cwd, label) {
  return new Promise((resolve, reject) => {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const proc = spawn(npmCmd, args, { cwd, shell: true });

    proc.stdout.on('data', (d) => sendLog(label, d.toString()));
    proc.stderr.on('data', (d) => sendLog(label, d.toString()));

    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} exited with code ${code}`));
    });

    return proc;
  });
}

function spawnPersistent(args, cwd, label) {
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const proc = spawn(npmCmd, args, { cwd, shell: true });
  proc.stdout.on('data', (d) => sendLog(label, d.toString()));
  proc.stderr.on('data', (d) => sendLog(label, d.toString()));
  proc.on('close', (code) => {
    sendLog(label, `\n[process exited with code ${code}]\n`);
    if (label === 'backend') backendProc = null;
    if (label === 'frontend') frontendProc = null;
    sendStatus();
  });
  return proc;
}

// ── IPC handlers ─────────────────────────────────────────────────────────
ipcMain.handle('start-dashboard', async () => {
  if (backendProc || frontendProc) {
    sendLog('system', 'Dashboard already running.\n');
    return;
  }
  sendLog('system', 'Starting backend...\n');
  backendProc = spawnPersistent(['run', 'dev'], BACKEND_DIR, 'backend');
  sendStatus();

  sendLog('system', 'Starting frontend...\n');
  frontendProc = spawnPersistent(['run', 'start'], FRONTEND_DIR, 'frontend');
  sendStatus();

  // Give it a moment then open the browser
  setTimeout(() => {
    shell.openExternal('http://127.0.0.1:3002');
  }, 3000);
});

ipcMain.handle('stop-dashboard', async () => {
  sendLog('system', 'Stopping dashboard...\n');
  if (backendProc) { backendProc.kill(); backendProc = null; }
  if (frontendProc) { frontendProc.kill(); frontendProc = null; }
  sendStatus();
});

ipcMain.handle('rebuild-frontend', async () => {
  sendLog('system', 'Rebuilding frontend (this can take a minute)...\n');
  try {
    await runNpm(['run', 'build'], FRONTEND_DIR, 'build');
    sendLog('system', '\n✓ Rebuild complete.\n');
  } catch (e) {
    sendLog('system', `\n✗ Rebuild failed: ${e.message}\n`);
  }
});

ipcMain.handle('open-dashboard', () => {
  shell.openExternal('http://127.0.0.1:3002');
});

ipcMain.handle('open-syslite', () => {
  shell.openExternal('http://127.0.0.1:3002/syslite');
});

ipcMain.handle('get-status', () => ({
  backend: backendProc !== null,
  frontend: frontendProc !== null,
}));

ipcMain.handle('check-first-run', () => {
  const configPath = path.join(BACKEND_DIR, 'src', 'config.ts');
  const nodeModulesBackend = path.join(BACKEND_DIR, 'node_modules');
  const nodeModulesFrontend = path.join(FRONTEND_DIR, 'node_modules');
  return {
    needsInstall: !fs.existsSync(nodeModulesBackend) || !fs.existsSync(nodeModulesFrontend),
    needsConfig: !fs.existsSync(configPath),
  };
});

ipcMain.handle('first-time-setup', async () => {
  sendLog('system', 'Installing backend dependencies...\n');
  await runNpm(['install'], BACKEND_DIR, 'install');
  sendLog('system', 'Installing frontend dependencies...\n');
  await runNpm(['install'], FRONTEND_DIR, 'install');
  sendLog('system', 'Building frontend...\n');
  await runNpm(['run', 'build'], FRONTEND_DIR, 'build');
  sendLog('system', '\n✓ Setup complete. Click Start Dashboard, then configure via the setup wizard.\n');
});

// ── Window ───────────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 640,
    backgroundColor: '#0a0c0a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (backendProc) backendProc.kill();
  if (frontendProc) frontendProc.kill();
  if (process.platform !== 'darwin') app.quit();
});
