// ================================
// RUTAS DE DATOS DE LA APLICACIÓN
// ================================
//
// Centraliza dónde viven los datos de la app (base de datos, fotos y
// cualquier archivo que la app deba poder ESCRIBIR).
//
// - En desarrollo (npm start): se usa la carpeta `data/` del propio proyecto,
//   igual que siempre, para no mover la base de datos de trabajo.
// - En producción (app empaquetada): se usa la carpeta de datos del usuario
//   (app.getPath('userData')), porque la carpeta de instalación es de solo
//   lectura. La primera vez se copia ahí una base de datos "semilla" incluida
//   en el paquete, si existe.
//
// Este módulo lo cargan tanto el proceso main como los servicios desde el
// renderer (nodeIntegration), por eso resuelve `app` de forma defensiva.

const path = require('path');
const fs = require('fs');

// Intentar obtener el módulo app de Electron (disponible en main y, con
// nodeIntegration, también en el renderer).
let app = null;
try {
    app = require('electron').app || null;
}
catch (e) {
    app = null;
}

// Raíz del proyecto (este archivo está en src/database/).
const RAIZ_PROYECTO = path.join(__dirname, '..', '..');
const DATA_DEV = path.join(RAIZ_PROYECTO, 'data');

// ¿La app está empaquetada? Solo es fiable cuando `app` existe.
const empaquetada = Boolean(app && app.isPackaged);

// Carpeta base de datos de la app.
//   dev / sin empaquetar -> data/ del proyecto
//   empaquetada          -> userData del sistema
function resolverDataDir() {
    if (empaquetada && app) {
        return app.getPath('userData');
    }
    return DATA_DEV;
}

const DATA_DIR = resolverDataDir();
const DB_PATH = path.join(DATA_DIR, 'inventario.db');
const FOTOS_DIR = path.join(DATA_DIR, 'almacen-fotos');

// Garantiza que la carpeta de datos exista.
function asegurarDataDir() {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// En producción, prepara la carpeta de datos del usuario la primera vez:
// copia la base de datos "semilla" y la imagen Not-Found.png desde los
// recursos empaquetados. En desarrollo no hace nada (todo vive en data/).
// Es seguro llamarlo siempre.
function asegurarBaseDatos() {
    asegurarDataDir();

    if (!empaquetada) {
        return;
    }

    // Base de datos semilla.
    try {
        if (!fs.existsSync(DB_PATH)) {
            const semilla = path.join(process.resourcesPath, 'inventario.db');
            if (fs.existsSync(semilla)) {
                fs.copyFileSync(semilla, DB_PATH);
            }
        }
    }
    catch (e) {
        // Si no hay semilla, el servicio creará las tablas vacías igualmente.
        console.error('No se pudo copiar la base de datos semilla:', e.message);
    }

    // Imagen de reemplazo Not-Found.png en la carpeta de fotos del usuario.
    try {
        fs.mkdirSync(FOTOS_DIR, { recursive: true });
        const destino = path.join(FOTOS_DIR, 'Not-Found.png');
        if (!fs.existsSync(destino)) {
            const origen = path.join(process.resourcesPath, 'almacen-fotos', 'Not-Found.png');
            if (fs.existsSync(origen)) {
                fs.copyFileSync(origen, destino);
            }
        }
    }
    catch (e) {
        console.error('No se pudo copiar Not-Found.png:', e.message);
    }
}

module.exports = {
    DATA_DIR,
    DB_PATH,
    FOTOS_DIR,
    empaquetada,
    asegurarDataDir,
    asegurarBaseDatos
};
