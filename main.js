const { app, BrowserWindow } = require('electron');
const path = require('path');
const { exec } = require('child_process');

let serverProcess;

function createWindow() {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    icon: path.join(__dirname, 'assets', 'icon.ico') // Añade el ícono explícitamente
  });

  // Determina la ruta de server.js en desarrollo y empaquetado
  const serverPath = app.isPackaged
    ? path.join(process.resourcesPath, 'server.js')
    : path.join(__dirname, 'server.js');

  // Inicia el servidor Express
  serverProcess = exec(`node "${serverPath}"`, (err) => {
    if (err) {
      console.error('Error iniciando el servidor:', err);
    }
  });

  // Carga la URL del servidor
  win.loadURL('http://localhost:3000');

  win.on('closed', () => {
    if (serverProcess) serverProcess.kill();
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});