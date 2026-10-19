const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('ibrahi8mDesktop', {
  platform: process.platform,
  version: process.versions.electron,
});
