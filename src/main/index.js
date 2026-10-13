const path = require('path')
const {createWindow} = require('./window')
const {app} = require('electron')

require('../database/connection')
require('electron-reload')(path.join(__dirname, '..'))

app.allowRendererProcessReuse = false;
app.whenReady().then(createWindow);
