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

// Agrega la columna "origen" a motivos/colores si no existe y clasifica los
// registros preexistentes: los que pertenecen a departamentos quedan marcados
// como 'departamento'; el resto permanece 'usuario'.
async function migrarColumnaOrigen() {

    // 1) Asegurar que la columna "origen" exista en ambas tablas.
    const colsMotivos = await all('PRAGMA table_info(motivos)');
    if (!colsMotivos.some((c) => c.name === 'origen')) {
        await run(
            `ALTER TABLE motivos ADD COLUMN origen TEXT NOT NULL DEFAULT 'usuario'`
        );
    }

    const colsColores = await all('PRAGMA table_info(colores)');
    if (!colsColores.some((c) => c.name === 'origen')) {
        await run(
            `ALTER TABLE colores ADD COLUMN origen TEXT NOT NULL DEFAULT 'usuario'`
        );
    }

    // 2) Clasificar orígenes (idempotente, se ejecuta siempre).
    // Motivos de departamento: su nombre coincide con un departamento mapeado.
    await run(`
        UPDATE motivos
        SET origen = 'departamento'
        WHERE nombre IN (SELECT departamento FROM departamento_colores)
    `);

    // Colores referenciados por algún departamento -> 'departamento'...
    await run(`
        UPDATE colores
        SET origen = 'departamento'
        WHERE id IN (SELECT color_id FROM departamento_colores)
    `);

    // ...pero los 6 colores base SIEMPRE son de usuario (aunque un
    // departamento los hubiera reutilizado antes de esta separación).
    const valoresBase = seedColores.map((c) => c.valor);
    const marcadores = valoresBase.map(() => '?').join(', ');

    await run(
        `UPDATE colores SET origen = 'usuario' WHERE valor IN (${marcadores})`,
        valoresBase
    );

}

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
            nombre TEXT NOT NULL UNIQUE,
            origen TEXT NOT NULL DEFAULT 'usuario'
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS colores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL UNIQUE,
            valor TEXT NOT NULL UNIQUE,
            origen TEXT NOT NULL DEFAULT 'usuario'
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

    // Mapeo de color por departamento. Aplica SOLO al calendario de
    // mantenimientos: cada departamento tiene un color asignado (editable).
    await run(`
        CREATE TABLE IF NOT EXISTS departamento_colores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            departamento TEXT NOT NULL UNIQUE,
            color_id INTEGER NOT NULL
        )
    `);

    // Migración: columna "origen" en motivos y colores (bases existentes).
    // 'usuario'      -> creados por el usuario en la página de calendarios.
    // 'departamento' -> generados automáticamente para mantenimientos.
    // Los dos primeros calendarios solo muestran los de origen 'usuario'.
    await migrarColumnaOrigen();

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

    // Solo motivos creados por el usuario (excluye los de departamento, que
    // pertenecen al calendario de mantenimientos).
    return all(`
        SELECT id, nombre
        FROM motivos
        WHERE origen = 'usuario'
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

    // Solo colores base/creados por el usuario (excluye los generados
    // automáticamente para los departamentos de mantenimientos).
    return all(`
        SELECT id, nombre, valor
        FROM colores
        WHERE origen = 'usuario'
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

// =====================================
// DEPARTAMENTOS CON COLOR (solo mantenimientos)
// =====================================

// Resuelve (o crea) un motivo cuyo nombre coincide con el del departamento.
// Así el día de mantenimiento reutiliza calendario_dias.motivo_id sin tocar el
// esquema. Devuelve el id del motivo.
async function asegurarMotivoPorNombre(nombre) {

    await initPromise;

    const nombreLimpio = (nombre || '').trim();

    if (nombreLimpio === '') {
        throw new Error('El departamento no puede estar vacío.');
    }

    const existente = await get(
        'SELECT id FROM motivos WHERE nombre = ?',
        [nombreLimpio]
    );

    if (existente) {
        return existente.id;
    }

    // Motivo generado para un departamento: origen 'departamento' para que NO
    // aparezca en los calendarios de compras.
    const resultado = await run(
        `INSERT INTO motivos (nombre, origen) VALUES (?, 'departamento')`,
        [nombreLimpio]
    );

    return resultado.id;

}

// Devuelve el mapeo color de un departamento, o undefined si no tiene.
async function obtenerColorDepartamento(departamento) {

    await initPromise;

    const nombreLimpio = (departamento || '').trim();

    if (nombreLimpio === '') {
        return undefined;
    }

    return get(
        `
        SELECT
            dc.departamento,
            dc.color_id,
            c.nombre AS color_nombre,
            c.valor  AS color_valor
        FROM departamento_colores dc
        LEFT JOIN colores c ON c.id = dc.color_id
        WHERE dc.departamento = ?
        `,
        [nombreLimpio]
    );

}

// Lista todos los mapeos departamento -> color (para editarlos en la tarjeta).
async function obtenerColoresDepartamentos() {

    await initPromise;

    return all(`
        SELECT
            dc.departamento,
            dc.color_id,
            c.nombre AS color_nombre,
            c.valor  AS color_valor
        FROM departamento_colores dc
        LEFT JOIN colores c ON c.id = dc.color_id
        ORDER BY dc.departamento ASC
    `);

}

// Upsert del color de un departamento (crea el mapeo o lo actualiza).
async function asignarColorDepartamento(departamento, colorId) {

    await initPromise;

    const nombreLimpio = (departamento || '').trim();

    if (nombreLimpio === '') {
        throw new Error('El departamento no puede estar vacío.');
    }

    if (!colorId) {
        throw new Error('Debe indicar un color.');
    }

    return run(
        `
        INSERT INTO departamento_colores (departamento, color_id)
        VALUES (?, ?)
        ON CONFLICT(departamento) DO UPDATE SET color_id = excluded.color_id
        `,
        [nombreLimpio, colorId]
    );

}

// Genera un color hexadecimal distribuido uniformemente por el círculo
// cromático (matiz), para producir N colores bien diferenciados.
function colorPorIndice(indice, total) {

    const h = Math.round((360 / Math.max(total, 1)) * indice) % 360;
    const s = 65; // saturación %
    const l = 55; // luminosidad %

    // HSL -> RGB -> HEX
    const sN = s / 100;
    const lN = l / 100;

    const c = (1 - Math.abs(2 * lN - 1)) * sN;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = lN - c / 2;

    let r = 0;
    let g = 0;
    let b = 0;

    if (h < 60) { r = c; g = x; b = 0; }
    else if (h < 120) { r = x; g = c; b = 0; }
    else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; }
    else if (h < 300) { r = x; g = 0; b = c; }
    else { r = c; g = 0; b = x; }

    const aHex = (v) =>
        Math.round((v + m) * 255).toString(16).padStart(2, '0');

    return '#' + aHex(r) + aHex(g) + aHex(b);

}

// Garantiza un color DISTINTO para cada departamento de la lista. Si un
// departamento no tiene color asignado, genera uno nuevo (matiz único según
// la cantidad total), lo inserta en el catálogo de colores y crea el mapeo.
// Idempotente: los departamentos que ya tienen color no se tocan.
async function asegurarColoresParaDepartamentos(nombres) {

    await initPromise;

    const lista = Array.isArray(nombres)
        ? nombres.map((n) => (n || '').trim()).filter(Boolean)
        : [];

    if (!lista.length) {
        return { success: true, asignados: 0 };
    }

    const total = lista.length;
    let asignados = 0;

    // Valores de los 6 colores base (reservados para los calendarios de
    // compras): un departamento NO debe quedarse con uno de estos.
    const valoresBase = new Set(seedColores.map((c) => c.valor));

    for (let i = 0; i < lista.length; i += 1) {

        const depto = lista[i];

        // ¿Ya tiene color asignado?
        const existente = await get(
            `
            SELECT dc.color_id, c.valor AS color_valor
            FROM departamento_colores dc
            LEFT JOIN colores c ON c.id = dc.color_id
            WHERE dc.departamento = ?
            `,
            [depto]
        );

        // Tiene un color propio (no base): no lo tocamos.
        if (existente && existente.color_valor && !valoresBase.has(existente.color_valor)) {
            continue;
        }

        // Generar un color único por índice. Si colisiona con un color base,
        // lo desplazamos un grado de matiz hasta que sea propio.
        let valor = colorPorIndice(i, total);
        let intento = 0;

        while (valoresBase.has(valor) && intento < 360) {
            valor = colorPorIndice(i + intento + 1, total + 1);
            intento += 1;
        }

        const nombreColor = 'Depto ' + depto;

        // Insertar el color si no existe (por valor). Reutiliza si ya existía.
        let colorRow = await get(
            'SELECT id FROM colores WHERE valor = ?',
            [valor]
        );

        if (!colorRow) {

            // Evitar colisión por el UNIQUE de nombre. Origen 'departamento'
            // para que NO aparezca en los calendarios de compras.
            const insert = await run(
                `INSERT OR IGNORE INTO colores (nombre, valor, origen) VALUES (?, ?, 'departamento')`,
                [nombreColor, valor]
            );

            colorRow = await get(
                'SELECT id FROM colores WHERE valor = ?',
                [valor]
            );

            if (!colorRow && insert && insert.id) {
                colorRow = { id: insert.id };
            }

        }

        if (!colorRow) {
            continue;
        }

        await run(
            `
            INSERT INTO departamento_colores (departamento, color_id)
            VALUES (?, ?)
            ON CONFLICT(departamento) DO UPDATE SET color_id = excluded.color_id
            `,
            [depto, colorRow.id]
        );

        asignados += 1;

    }

    return { success: true, asignados };

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
    eliminarDia,
    asegurarMotivoPorNombre,
    obtenerColorDepartamento,
    obtenerColoresDepartamentos,
    asignarColorDepartamento,
    asegurarColoresParaDepartamentos
};
