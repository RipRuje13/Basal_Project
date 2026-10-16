const path = require('path')
const fs = require('fs')
const {createWindow} = require('./window')
const {app, ipcMain, dialog, BrowserWindow} = require('electron')

require('../database/connection')
require('electron-reload')(path.join(__dirname, '..'))

app.allowRendererProcessReuse = false;
app.whenReady().then(createWindow);

// ============================================================
// EXPORTACIÓN: guarda un archivo (Excel/CSV/HTML) en disco.
// Recibe el contenido ya generado desde el renderer.
// ============================================================
ipcMain.handle('exportar-archivo', async (event, { contenido, nombreSugerido, filtros, codificacionBase64 }) => {

    const ventana = BrowserWindow.fromWebContents(event.sender);

    const { canceled, filePath } = await dialog.showSaveDialog(ventana, {
        title: 'Guardar exportación',
        defaultPath: nombreSugerido,
        filters: filtros || [{ name: 'Todos', extensions: ['*'] }]
    });

    if (canceled || !filePath) {
        return { success: false, canceled: true };
    }

    const datos = codificacionBase64
        ? Buffer.from(contenido, 'base64')
        : Buffer.from(contenido, 'utf8');

    fs.writeFileSync(filePath, datos);

    return { success: true, filePath };
});

// ============================================================
// EXPORTACIÓN PDF: usa printToPDF de Electron sobre un HTML.
// ============================================================
ipcMain.handle('exportar-pdf', async (event, { html, nombreSugerido }) => {

    const ventanaPadre = BrowserWindow.fromWebContents(event.sender);

    const { canceled, filePath } = await dialog.showSaveDialog(ventanaPadre, {
        title: 'Guardar PDF',
        defaultPath: nombreSugerido,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });

    if (canceled || !filePath) {
        return { success: false, canceled: true };
    }

    // Ventana oculta para renderizar el HTML y convertirlo a PDF.
    const ventanaPdf = new BrowserWindow({
        show: false,
        webPreferences: { offscreen: true }
    });

    try {
        await ventanaPdf.loadURL(
            'data:text/html;charset=utf-8,' + encodeURIComponent(html)
        );

        const pdf = await ventanaPdf.webContents.printToPDF({
            landscape: true,
            printBackground: true,
            margins: { marginType: 'default' }
        });

        fs.writeFileSync(filePath, pdf);

        return { success: true, filePath };
    }
    finally {
        ventanaPdf.destroy();
    }
});
