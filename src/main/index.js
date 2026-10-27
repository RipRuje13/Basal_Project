const path = require('path')
const fs = require('fs')
const {createWindow} = require('./window')
const {app, ipcMain, dialog, BrowserWindow} = require('electron')

require('../database/connection')
require('electron-reload')(path.join(__dirname, '..'))

app.allowRendererProcessReuse = false;

// En Windows, las notificaciones nativas requieren un App User Model ID
// explícito; sin él, Windows suele descartar las notificaciones de apps no
// empaquetadas (ejecutadas con `npm start`). Debe fijarse antes de crear la
// ventana / mostrar cualquier notificación.
if (process.platform === 'win32') {
    app.setAppUserModelId('com.basal.inventario');
}

app.whenReady().then(createWindow);

// Ruta de la base de datos (misma que usa src/database/connection.js).
const DB_PATH = path.join(__dirname, '..', '..', 'data', 'inventario.db');

// ============================================================
// RESPALDO: exporta una copia del archivo de base de datos.
// ============================================================
ipcMain.handle('respaldar-bd', async (event) => {

    const ventana = BrowserWindow.fromWebContents(event.sender);

    const ahora = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const sello =
        `${ahora.getFullYear()}${pad(ahora.getMonth() + 1)}${pad(ahora.getDate())}`
        + `_${pad(ahora.getHours())}${pad(ahora.getMinutes())}`;

    const { canceled, filePath } = await dialog.showSaveDialog(ventana, {
        title: 'Guardar respaldo de la base de datos',
        defaultPath: `inventario_respaldo_${sello}.db`,
        filters: [{ name: 'Base de datos SQLite', extensions: ['db'] }]
    });

    if (canceled || !filePath) {
        return { success: false, canceled: true };
    }

    try {
        fs.copyFileSync(DB_PATH, filePath);
        return { success: true, filePath };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
});

// ============================================================
// IMPORTAR: reemplaza la base de datos por un respaldo elegido.
// Como la conexión SQLite está abierta, tras copiar el archivo se
// reinicia la app para recargar los datos de forma consistente.
// ============================================================
ipcMain.handle('importar-bd', async (event) => {

    const ventana = BrowserWindow.fromWebContents(event.sender);

    const { canceled, filePaths } = await dialog.showOpenDialog(ventana, {
        title: 'Seleccionar respaldo a importar',
        properties: ['openFile'],
        filters: [{ name: 'Base de datos SQLite', extensions: ['db'] }]
    });

    if (canceled || !filePaths || !filePaths.length) {
        return { success: false, canceled: true };
    }

    const origen = filePaths[0];

    // Confirmación: la importación sobrescribe los datos actuales.
    const respuesta = await dialog.showMessageBox(ventana, {
        type: 'warning',
        buttons: ['Cancelar', 'Importar y reiniciar'],
        defaultId: 0,
        cancelId: 0,
        title: 'Confirmar importación',
        message: 'Esto reemplazará TODA la base de datos actual por el respaldo seleccionado.',
        detail: 'Los datos actuales se perderán. La aplicación se reiniciará para aplicar los cambios. ¿Deseas continuar?'
    });

    if (respuesta.response !== 1) {
        return { success: false, canceled: true };
    }

    try {
        // Copia de seguridad previa automática por si algo falla.
        if (fs.existsSync(DB_PATH)) {
            fs.copyFileSync(DB_PATH, DB_PATH + '.pre-import.bak');
        }

        fs.copyFileSync(origen, DB_PATH);

        // Reiniciar la app para recargar la conexión con los datos nuevos.
        app.relaunch();
        app.exit(0);

        return { success: true };
    }
    catch (error) {
        return { success: false, error: error.message };
    }
});

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
