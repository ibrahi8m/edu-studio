// IBRAHI8M EDU STUDIO — desktop shell.
// Serves the built app from disk through a private app:// scheme, so it works
// offline from the very first launch. All network requests are blocked.
const { app, BrowserWindow, protocol, session, net } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const DIST = path.join(__dirname, '..', 'dist');
const ORIGIN = 'app://edu';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// Keep data next to the app profile, isolated from any web browser.
app.setName('IBRAHI8M EDU STUDIO');
if (process.env.IBRAHI8M_USER_DATA) app.setPath('userData', process.env.IBRAHI8M_USER_DATA);

function serveFromDist(request) {
  const { pathname } = new URL(request.url);
  const rel = decodeURIComponent(pathname === '/' ? '/index.html' : pathname);
  const file = path.normalize(path.join(DIST, rel));
  if (!file.startsWith(DIST)) return new Response('forbidden', { status: 403 });
  return net.fetch(pathToFileURL(file).toString());
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: '#0E1014',
    title: 'IBRAHI8M EDU STUDIO',
    icon: path.join(DIST, 'icon-512.png'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  // Never navigate away from the app; open nothing externally by default.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) e.preventDefault();
  });
  win.loadURL(`${ORIGIN}/index.html`);
  return win;
}

app.whenReady().then(() => {
  protocol.handle('app', serveFromDist);
  // Hard offline guarantee: cancel every request that is not part of the app.
  session.defaultSession.webRequest.onBeforeRequest((details, cb) => {
    const ok = /^(app:|data:|blob:|devtools:|chrome-extension:)/.test(details.url);
    cb({ cancel: !ok });
  });
  // Exported pictures: a normal "Save as" dialog. Tests set a folder to save into without the dialog.
  session.defaultSession.on('will-download', (_e, item) => {
    const dir = process.env.IBRAHI8M_DOWNLOAD_DIR;
    if (dir) item.setSavePath(path.join(dir, item.getFilename()));
  });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});


