const { getConnection } = require('../database/connection');

const db = getConnection();

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

function get(sql, params = []) {

    return new Promise((resolve, reject) => {

        db.get(sql, params, (err, row) => {

            if (err) {
                reject(err);
                return;
            }

            // Cuando no hay fila, sqlite3 entrega row === undefined:
            // get RESUELVE con undefined (nunca rechaza por "no encontrado").
            resolve(row);

        });

    });

}

// Helper interno (NO exportado): resuelve una clave (slug) o un id a un id de
// calendario existente. Devuelve el id o null si no existe.
async function resolverCalendarioId(claveOId) {

    if (
        typeof claveOId === 'number'
        || /^\d+$/.test(String(claveOId))
    ) {

        const row = await get(
            'SELECT id FROM calendarios WHERE id = ?',
            [Number(claveOId)]
        );

        return row ? row.id : null;

    }

    const row = await get(
        'SELECT id FROM calendarios WHERE clave = ?',
        [String(claveOId)]
    );

    return row ? row.id : null;

}

// Helper interno (NO exportado): valida que una cadena 'YYYY-MM-DD' (ya pasada
// por el regex) represente un día real del calendario.
function esFechaReal(fecha) {

    const [a, m, d] = fecha.split('-').map(Number);

    const dt = new Date(a, m - 1, d);

    return dt.getFullYear() === a
        && dt.getMonth() === m - 1
        && dt.getDate() === d;

}

// Calendarios fijos de fábrica. Se insertan con INSERT OR IGNORE por clave:
// idempotente y extensible (agregar el 4º calendario es añadir una fila aquí).
const seedCalendarios = [
    { clave: 'compras_mensuales', nombre: 'Formato de Compras Mensuales' },
    { clave: 'compras_bimestrales', nombre: 'Compras bimestrales (Papelería)' },
    { clave: 'mantenimientos', nombre: 'Programa Anual de Mantenimientos' }
];

// Paleta común de colores. Solo se siembra si la tabla está vacía.
const seedColores = [
    { nombre: 'Rojo', valor: '#dc3545' },
    { nombre: 'Verde', valor: '#198754' },
    { nombre: 'Azul', valor: '#0d6efd' },
    { nombre: 'Amarillo', valor: '#ffc107' },
    { nombre: 'Naranja', valor: '#fd7e14' },
    { nombre: 'Morado', valor: '#6f42c1' }
];

async function inicializarCalendarios() {

    await run(`
        CREATE TABLE IF NOT EXISTS calendarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            clave TEXT NOT NULL UNIQUE,
            nombre TEXT NOT NULL,
            descripcion TEXT
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS motivos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL UNIQUE
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS colores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL UNIQUE,
            valor TEXT NOT NULL UNIQUE
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS calendario_dias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            calendario_id INTEGER NOT NULL,
            fecha TEXT NOT NULL,
            motivo_id INTEGER,
            color_id INTEGER
        )
    `);

    // Seed de calendarios: idempotente por el UNIQUE de clave. La descripción
    // arranca igual al nombre y no se sobrescribe si la fila ya existe.
    for (const calendario of seedCalendarios) {
        await run(
            `
            INSERT OR IGNORE INTO calendarios (clave, nombre, descripcion)
            VALUES (?, ?, ?)
            `,
            [calendario.clave, calendario.nombre, calendario.nombre]
        );
    }

    // Seed de colores: solo cuando la tabla está vacía (mismo patrón de conteo
    // que gestion.service.js).
    const totalColores = await all(
        'SELECT COUNT(*) AS total FROM colores'
    );

    if (totalColores[0].total === 0) {

        for (const color of seedColores) {
            await run(
                'INSERT OR IGNORE INTO colores (nombre, valor) VALUES (?, ?)',
                [color.nombre, color.valor]
            );
        }

    }

    // Los motivos NO se siembran: el usuario los crea.

}

const initPromise = inicializarCalendarios();

// SQL base de pintado reutilizado por obtenerDiasPorCalendario y
// obtenerDiasPorCalendarioYMes. El LEFT JOIN permite que un día con
// motivo/color borrado del catálogo aún aparezca (campos en NULL).
const SQL_DIAS_BASE = `
    SELECT
        d.id,
        d.calendario_id,
        d.fecha,
        d.motivo_id,
        m.nombre AS motivo_nombre,
        d.color_id,
        c.nombre AS color_nombre,
        c.valor  AS color_valor
    FROM calendario_dias d
    LEFT JOIN motivos m ON m.id = d.motivo_id
    LEFT JOIN colores c ON c.id = d.color_id
    WHERE d.calendario_id = ?
`;

async function obtenerCalendarios() {

    await initPromise;

    return all(`
        SELECT id, clave, nombre, descripcion
        FROM calendarios
        ORDER BY id ASC
    `);

}

async function obtenerCalendarioPorClave(clave) {

    await initPromise;

    return get(
        `
        SELECT id, clave, nombre, descripcion
        FROM calendarios
        WHERE clave = ?
        `,
        [String(clave)]
    );

}

async function actualizarDescripcionCalendario(claveOId, nuevaDescripcion) {

    await initPromise;

    const descripcionLimpia = (nuevaDescripcion || '').trim();

    if (descripcionLimpia === '') {
        throw new Error('La descripción no puede estar vacía.');
    }

    const calendarioId = await resolverCalendarioId(claveOId);

    if (calendarioId === null) {
        throw new Error('El calendario indicado no existe.');
    }

    return run(
        `
        UPDATE calendarios
        SET descripcion = ?
        WHERE id = ?
        `,
        [descripcionLimpia, calendarioId]
    );

}

async function obtenerMotivos() {

    await initPromise;

    return all(`
        SELECT id, nombre
        FROM motivos
        ORDER BY nombre ASC
    `);

}

async function crearMotivo(nombre) {

    await initPromise;

    const nombreLimpio = (nombre || '').trim();

    if (nombreLimpio === '') {
        throw new Error('El nombre no puede estar vacío.');
    }

    return new Promise((resolve, reject) => {

        const sql = `
            INSERT INTO motivos (nombre)
            VALUES (?)
        `;

        db.run(
            sql,
            [nombreLimpio],
            function (err) {

                if (err) {

                    if (
                        err.code === 'SQLITE_CONSTRAINT'
                        || /UNIQUE/.test(err.message)
                    ) {
                        reject(new Error('Ya existe un registro con ese nombre.'));
                        return;
                    }

                    reject(err);
                    return;
                }

                resolve({
                    success: true,
                    id: this.lastID
                });

            }
        );

    });

}

async function obtenerColores() {

    await initPromise;

    return all(`
        SELECT id, nombre, valor
        FROM colores
        ORDER BY nombre ASC
    `);

}

async function crearColor(nombre, valorHex) {

    await initPromise;

    const nombreLimpio = (nombre || '').trim();
    const valor = (valorHex || '').trim().toLowerCase();

    if (nombreLimpio === '') {
        throw new Error('El nombre no puede estar vacío.');
    }

    if (!/^#[0-9a-f]{6}$/.test(valor)) {
        throw new Error('El color debe ser un valor hexadecimal válido (ej. #ff0000).');
    }

    return new Promise((resolve, reject) => {

        const sql = `
            INSERT INTO colores (nombre, valor)
            VALUES (?, ?)
        `;

        db.run(
            sql,
            [nombreLimpio, valor],
            function (err) {

                if (err) {

                    if (
                        err.code === 'SQLITE_CONSTRAINT'
                        || /UNIQUE/.test(err.message)
                    ) {
                        reject(new Error('Ya existe un registro con ese nombre.'));
                        return;
                    }

                    reject(err);
                    return;
                }

                resolve({
                    success: true,
                    id: this.lastID
                });

            }
        );

    });

}

async function obtenerDiasPorCalendario(claveOId) {

    await initPromise;

    const calendarioId = await resolverCalendarioId(claveOId);

    if (calendarioId === null) {
        throw new Error('El calendario indicado no existe.');
    }

    return all(
        `${SQL_DIAS_BASE}
        ORDER BY d.fecha ASC`,
        [calendarioId]
    );

}

async function obtenerDiasPorCalendarioYMes(claveOId, anio, mes) {

    await initPromise;

    if (
        !Number.isInteger(mes)
        || mes < 1
        || mes > 12
    ) {
        throw new Error('Mes o año no válidos.');
    }

    if (
        !Number.isInteger(anio)
        || anio < 1000
        || anio > 9999
    ) {
        throw new Error('Mes o año no válidos.');
    }

    const periodo = String(anio) + '-' + String(mes).padStart(2, '0');

    const calendarioId = await resolverCalendarioId(claveOId);

    if (calendarioId === null) {
        throw new Error('El calendario indicado no existe.');
    }

    return all(
        `${SQL_DIAS_BASE}
          AND substr(d.fecha, 1, 7) = ?
        ORDER BY d.fecha ASC`,
        [calendarioId, periodo]
    );

}

async function crearDia({ calendario, fecha, motivo, color }) {

    await initPromise;

    const calendarioId = await resolverCalendarioId(calendario);

    if (calendarioId === null) {
        throw new Error('El calendario indicado no existe.');
    }

    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')
        || !esFechaReal(fecha)
    ) {
        throw new Error('La fecha no es válida.');
    }

    if (!motivo || !color) {
        throw new Error('Debe seleccionar un motivo y un color.');
    }

    return run(
        `
        INSERT INTO calendario_dias (calendario_id, fecha, motivo_id, color_id)
        VALUES (?, ?, ?, ?)
        `,
        [calendarioId, fecha, motivo, color]
    );

}

async function actualizarDia(id, { fecha, motivo, color }) {

    await initPromise;

    if (
        !/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')
        || !esFechaReal(fecha)
    ) {
        throw new Error('La fecha no es válida.');
    }

    if (!motivo || !color) {
        throw new Error('Debe seleccionar un motivo y un color.');
    }

    return run(
        `
        UPDATE calendario_dias
        SET fecha = ?, motivo_id = ?, color_id = ?
        WHERE id = ?
        `,
        [fecha, motivo, color, id]
    );

}

async function eliminarDia(id) {

    await initPromise;

    return run(
        `
        DELETE
        FROM calendario_dias
        WHERE id = ?
        `,
        [id]
    );

}

module.exports = {
    obtenerCalendarios,
    obtenerCalendarioPorClave,
    actualizarDescripcionCalendario,
    obtenerMotivos,
    crearMotivo,
    obtenerColores,
    crearColor,
    obtenerDiasPorCalendario,
    obtenerDiasPorCalendarioYMes,
    crearDia,
    actualizarDia,
    eliminarDia
};
