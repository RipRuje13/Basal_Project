const fs = require('fs');
const path = require('path');
const { getConnection } = require('../database/connection');

const db = getConnection();
const fotosDir = path.join(__dirname, '..', '..', 'data', 'almacen-fotos');

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) {
                reject(err);
                return;
            }

            resolve({
                success: true,
                id: this.lastID,
                changes: this.changes
            });
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(row);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                reject(err);
                return;
            }

            resolve(rows);
        });
    });
}

function ensureStorage() {
    fs.mkdirSync(fotosDir, { recursive: true });
}

function serializar(valor) {
    return JSON.stringify(valor ?? []);
}

function parsearJson(valor, fallback = []) {
    if (!valor) return fallback;

    try {
        const parsed = JSON.parse(valor);
        return Array.isArray(parsed) ? parsed : fallback;
    }
    catch {
        return fallback;
    }
}

function normalizarTexto(valor) {
    return (valor ?? '').toString().trim();
}

function normalizarRutaArchivo(ruta) {
    try {
        return fs.realpathSync.native(ruta);
    }
    catch {
        return path.resolve(ruta);
    }
}

function normalizarRutaComparacion(ruta) {
    return normalizarRutaArchivo(ruta).toLowerCase();
}

function esMismaRuta(rutaA, rutaB) {
    return normalizarRutaComparacion(rutaA) === normalizarRutaComparacion(rutaB);
}

function estaEnCarpetaFotos(ruta) {
    const base = normalizarRutaArchivo(fotosDir);
    const archivo = normalizarRutaArchivo(ruta);
    const relativa = path.relative(base, archivo);

    return Boolean(relativa) &&
        !relativa.startsWith('..') &&
        !path.isAbsolute(relativa);
}

function crearDestinoConNombreOriginal(origen) {
    const parsed = path.parse(path.basename(origen));
    let destino = path.join(fotosDir, path.basename(origen));
    let contador = 1;

    while (fs.existsSync(destino) && !esMismaRuta(origen, destino)) {
        destino = path.join(
            fotosDir,
            `${parsed.name}-${contador}${parsed.ext}`
        );
        contador += 1;
    }

    return destino;
}

function obtenerRutasUnicas(rutas) {
    const vistas = new Set();

    return rutas.filter((ruta) => {
        const normalizada = normalizarRutaComparacion(ruta);
        if (vistas.has(normalizada)) {
            return false;
        }

        vistas.add(normalizada);
        return true;
    });
}

function crearEvento(tipo, anterior, nuevo, fecha) {
    return {
        tipo,
        anterior: normalizarTexto(anterior),
        nuevo: normalizarTexto(nuevo),
        fecha: normalizarTexto(fecha) || new Date().toISOString().slice(0, 10)
    };
}

function mapRow(row) {
    if (!row) return row;

    const historialUsuarios = parsearJson(row.historial_usuarios);
    const ultimoUsuario =
        historialUsuarios.length
            ? historialUsuarios[historialUsuarios.length - 1].nuevo
            : row.usuarios;

    return {
        ...row,
        usuario_actual: row.usuario_actual || ultimoUsuario || '',
        historial_usuarios: historialUsuarios,
        historial_ubicaciones: parsearJson(row.historial_ubicaciones),
        historial_fechas: parsearJson(row.historial_fechas),
        fotografias: parsearJson(row.fotografias)
    };
}

async function inicializarAlmacen() {
    ensureStorage();

    await run(`
        CREATE TABLE IF NOT EXISTS almacendb (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            producto TEXT,
            marca TEXT,
            modelo TEXT,
            no_serie TEXT,
            codigo_etiqueta TEXT,
            departamento TEXT,
            caracteristicas TEXT,
            funciona TEXT,
            ubicacion TEXT,
            usuarios TEXT,
            usuario_actual TEXT,
            fecha_ingreso TEXT,
            historial_usuarios TEXT,
            historial_ubicaciones TEXT,
            historial_fechas TEXT,
            fotografias TEXT
        )
    `);

    const columns = await all('PRAGMA table_info(almacendb)');
    const hasUsuarioActual = columns.some(
        (column) => column.name === 'usuario_actual'
    );

    if (!hasUsuarioActual) {
        await run('ALTER TABLE almacendb ADD COLUMN usuario_actual TEXT');
        await run(`
            UPDATE almacendb
            SET usuario_actual = usuarios
            WHERE usuario_actual IS NULL
        `);
    }
}

const initPromise = inicializarAlmacen();

async function obtenerProductos() {
    await initPromise;

    const rows = await all(`
        SELECT
            id,
            producto,
            marca,
            modelo,
            no_serie,
            codigo_etiqueta,
            departamento,
            caracteristicas,
            funciona,
            ubicacion,
            usuarios,
            usuario_actual,
            fecha_ingreso,
            historial_usuarios,
            historial_ubicaciones,
            historial_fechas,
            fotografias
        FROM almacendb
        ORDER BY id DESC
    `);

    return rows.map(mapRow);
}

async function obtenerProductoPorId(id) {
    await initPromise;

    const row = await get(`
        SELECT *
        FROM almacendb
        WHERE id = ?
    `, [id]);

    return mapRow(row);
}

async function guardarProducto(datos) {
    await initPromise;

    const usuario = normalizarTexto(datos.usuarios);
    const ubicacion = normalizarTexto(datos.ubicacion);
    const fecha = normalizarTexto(datos.fecha_ingreso);

    const historialUsuarios = usuario
        ? [crearEvento('usuario inicial', '', usuario, fecha)]
        : [];

    const historialUbicaciones = ubicacion
        ? [crearEvento('ubicacion inicial', '', ubicacion, fecha)]
        : [];

    const historialFechas = [
        ...historialUsuarios,
        ...historialUbicaciones
    ];

    return run(`
        INSERT INTO almacendb (
            producto,
            marca,
            modelo,
            no_serie,
            codigo_etiqueta,
            departamento,
            caracteristicas,
            funciona,
            ubicacion,
            usuarios,
            usuario_actual,
            fecha_ingreso,
            historial_usuarios,
            historial_ubicaciones,
            historial_fechas,
            fotografias
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
        datos.producto,
        datos.marca,
        datos.modelo,
        datos.no_serie,
        datos.codigo_etiqueta,
        datos.departamento,
        datos.caracteristicas,
        datos.funciona,
        ubicacion,
        usuario,
        usuario,
        fecha,
        serializar(historialUsuarios),
        serializar(historialUbicaciones),
        serializar(historialFechas),
        serializar([])
    ]);
}

async function actualizarProducto(id, datos) {
    await initPromise;

    const anterior = await obtenerProductoPorId(id);
    if (!anterior) {
        throw new Error('Producto no encontrado');
    }

    const usuarioNuevo = normalizarTexto(datos.usuarios);
    const ubicacionNueva = normalizarTexto(datos.ubicacion);
    const fechaCambio =
        normalizarTexto(datos.fecha_ingreso) ||
        new Date().toISOString().slice(0, 10);

    const historialUsuarios = [...anterior.historial_usuarios];
    const historialUbicaciones = [...anterior.historial_ubicaciones];
    const historialFechas = [...anterior.historial_fechas];

    if (
        usuarioNuevo &&
        normalizarTexto(anterior.usuario_actual) !== usuarioNuevo
    ) {
        const evento = crearEvento(
            'cambio de usuario',
            anterior.usuario_actual,
            usuarioNuevo,
            fechaCambio
        );

        historialUsuarios.push(evento);
        historialFechas.push(evento);
    }

    const usuariosHistoricos = [
        ...new Set(
            historialUsuarios
                .map((evento) => normalizarTexto(evento.nuevo))
                .filter(Boolean)
        )
    ].join(', ');

    if (
        ubicacionNueva &&
        normalizarTexto(anterior.ubicacion) !== ubicacionNueva
    ) {
        const evento = crearEvento(
            'cambio de ubicacion',
            anterior.ubicacion,
            ubicacionNueva,
            fechaCambio
        );

        historialUbicaciones.push(evento);
        historialFechas.push(evento);
    }

    return run(`
        UPDATE almacendb
        SET
            producto = ?,
            marca = ?,
            modelo = ?,
            no_serie = ?,
            codigo_etiqueta = ?,
            departamento = ?,
            caracteristicas = ?,
            funciona = ?,
            ubicacion = ?,
            usuarios = ?,
            usuario_actual = ?,
            fecha_ingreso = ?,
            historial_usuarios = ?,
            historial_ubicaciones = ?,
            historial_fechas = ?
        WHERE id = ?
    `, [
        datos.producto,
        datos.marca,
        datos.modelo,
        datos.no_serie,
        datos.codigo_etiqueta,
        datos.departamento,
        datos.caracteristicas,
        datos.funciona,
        ubicacionNueva,
        usuariosHistoricos || usuarioNuevo,
        usuarioNuevo,
        datos.fecha_ingreso,
        serializar(historialUsuarios),
        serializar(historialUbicaciones),
        serializar(historialFechas),
        id
    ]);
}

async function eliminarProducto(id) {
    await initPromise;

    return run(`
        DELETE
        FROM almacendb
        WHERE id = ?
    `, [id]);
}

async function agregarFotografia(id, origen) {
    await initPromise;
    ensureStorage();

    const producto = await obtenerProductoPorId(id);
    if (!producto) {
        throw new Error('Producto no encontrado');
    }

    if (!origen || !fs.existsSync(origen)) {
        throw new Error('La imagen seleccionada no existe');
    }

    const destino = estaEnCarpetaFotos(origen)
        ? normalizarRutaArchivo(origen)
        : crearDestinoConNombreOriginal(origen);

    if (!esMismaRuta(origen, destino) && !fs.existsSync(destino)) {
        fs.copyFileSync(origen, destino);
    }

    const fotografiasActuales = obtenerRutasUnicas(producto.fotografias);
    const yaExiste = fotografiasActuales.some(
        (foto) => esMismaRuta(foto, destino)
    );

    const fotografias = yaExiste
        ? fotografiasActuales
        : [...fotografiasActuales, destino];

    await run(`
        UPDATE almacendb
        SET fotografias = ?
        WHERE id = ?
    `, [
        serializar(fotografias),
        id
    ]);

    return obtenerProductoPorId(id);
}

async function eliminarFotografia(id, ruta) {
    await initPromise;

    const producto = await obtenerProductoPorId(id);
    if (!producto) {
        throw new Error('Producto no encontrado');
    }

    const fotografias = producto.fotografias.filter(
        (foto) => foto !== ruta
    );

    await run(`
        UPDATE almacendb
        SET fotografias = ?
        WHERE id = ?
    `, [
        serializar(fotografias),
        id
    ]);

    return obtenerProductoPorId(id);
}

module.exports = {
    obtenerProductos,
    obtenerProductoPorId,
    guardarProducto,
    actualizarProducto,
    eliminarProducto,
    agregarFotografia,
    eliminarFotografia
};
