const {BrowserWindow} = require('electron')
const path = require('path')

let window

function createWindow(){
    window = new BrowserWindow({
        width: 1024,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    })
    window.loadFile(path.join(__dirname, '..', 'ui', 'pages', 'index.html'))
}

module.exports = {
    createWindow
}
