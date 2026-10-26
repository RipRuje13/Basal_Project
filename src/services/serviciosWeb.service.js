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

            resolve(row);

        });

    });

}

// Helper interno (NO exportado): valida que una cadena 'YYYY-MM-DD' (ya pasada
// por el regex) represente un día real del calendario. Copia textual del
// helper homónimo de calendarios.service.js (allí tampoco se exporta).
function esFechaReal(fecha) {

    const [a, m, d] = fecha.split('-').map(Number);

    const dt = new Date(a, m - 1, d);

    return dt.getFullYear() === a
        && dt.getMonth() === m - 1
        && dt.getDate() === d;

}

// Copia textual de DEFAULTS_NOTIFICACION de calendarios.service.js.
// ACOPLE: si allá cambian los defaults, actualizar aquí (esa constante no
// está exportada, así que no se puede importar; se replica a propósito).
const DEFAULTS_DOMINIO = {
    activo: 1,
    dias_antelacion: 1,
    hora_recordatorio: '09:00',
    repetir_cada_horas: 0,
    recordar_dias_previos: 0
};

async function inicializar() {

    await run(`
        CREATE TABLE IF NOT EXISTS dominios_web (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            dominio TEXT NOT NULL,
            fecha_vencimiento TEXT NOT NULL,
            responsable TEXT,
            hosting TEXT,
            certificado TEXT,
            monto REAL,
            correo_contacto TEXT,
            proveedor TEXT
        )
    `);

}

const initPromise = inicializar();

// =====================================
// HELPERS PUROS (color, diferencia de fechas, shape de evento)
// =====================================

// 'YYYY-MM-DD' -> Date local (medianoche). Tolerante a fecha inválida:
// devuelve null. Replica parseFechaLocal de notificaciones.js (constructor
// local + verificación anti-desbordamiento 2024-02-31).
function parseIso(iso) {

    if (typeof iso !== 'string') {
        return null;
    }

    const partes = iso.split('-');

    if (partes.length !== 3) {
        return null;
    }

    const anio = Number(partes[0]);
    const mes = Number(partes[1]);
    const dia = Number(partes[2]);

    if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) {
        return null;
    }

    const fecha = new Date(anio, mes - 1, dia);

    if (fecha.getFullYear() !== anio
        || fecha.getMonth() !== mes - 1
        || fecha.getDate() !== dia) {
        return null;
    }

    return fecha;

}

// diffEnDiasIso(a, b): devuelve (a - b) en días enteros, o null si a o b
// no son 'YYYY-MM-DD' válidas. El signo es a MENOS b: una fecha futura
// respecto de 'hoy' da POSITIVO; una vencida da NEGATIVO. Invertir el
// signo rompería TODOS los colores (vencido pasaría a verde).
function diffEnDiasIso(a, b) {

    const da = parseIso(a);
    const db = parseIso(b);

    if (da === null || db === null) {
        return null;
    }

    const MS = 24 * 60 * 60 * 1000;

    return Math.round((da.getTime() - db.getTime()) / MS);

}

// fechaVenc, hoy: cadenas 'YYYY-MM-DD'. Devuelve un hex de la paleta fija.
function colorPorVencimiento(fechaVenc, hoy) {

    const dias = diffEnDiasIso(fechaVenc, hoy);

    if (dias === null) {
        return '#6c757d';   // fecha inválida -> gris neutro
    }

    if (dias <= 15) {
        return '#dc3545';   // vencido o <= 15 días: rojo
    }

    if (dias <= 45) {
        return '#ffc107';   // 16-45 días: ámbar
    }

    return '#198754';       // > 45 días: verde

}

// Construye el evento sintético de notificación de un dominio. Shape idéntico
// al que produce el SELECT de calendario para que calcularNotificacionesPendientes
// lo consuma sin ramas nuevas. Contrato único: `const a = ajuste || dominioRow`;
// en producción el productor pasa construirEventoDominio(row, row, row.calendario_id),
// de modo que `a === row` (fila COALESCE-ada) y los ajustes del usuario se respetan.
// En el test se pasa un `ajuste` explícito; si fuese nulo, cae en dominioRow.
function construirEventoDominio(dominioRow, ajuste, calendarioId) {

    const a = ajuste || dominioRow;

    return {
        dia_id: 'dom-' + dominioRow.id,
        calendario_id: calendarioId,
        calendario_clave: 'servicios_web',
        calendario_nombre: 'Servicios Web',
        fecha: dominioRow.fecha_vencimiento,
        motivo_id: null,
        motivo_nombre: dominioRow.dominio,
        motivo_origen: 'servicios_web',
        activo: a.activo,
        dias_antelacion: a.dias_antelacion,
        hora_recordatorio: a.hora_recordatorio,
        repetir_cada_horas: a.repetir_cada_horas,
        recordar_dias_previos: a.recordar_dias_previos
    };

}

// =====================================
// VALIDACIÓN DE CAMPOS DE DOMINIO
// =====================================

// Valida y normaliza los 8 campos de un dominio. Lanza Error (en español) al
// primer fallo. Devuelve un objeto con los valores listos para insertar/actualizar
// (textos vacíos -> NULL; monto vacío -> NULL).
function validarYNormalizarDominio(datos) {

    const d = datos || {};

    const dominio = (d.dominio || '').toString().trim();

    if (dominio === '') {
        throw new Error('El dominio es obligatorio.');
    }

    if (dominio.length > 255) {
        throw new Error('El dominio no puede superar 255 caracteres.');
    }

    const fechaVenc = (d.fecha_vencimiento || '').toString().trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaVenc) || !esFechaReal(fechaVenc)) {
        throw new Error('La fecha de vencimiento no es válida.');
    }

    // Monto: opcional. Si viene no vacío, debe ser número finito >= 0.
    let monto = null;
    const montoRaw = d.monto;

    if (montoRaw !== null && montoRaw !== undefined && String(montoRaw).trim() !== '') {
        const n = Number(montoRaw);
        if (!Number.isFinite(n) || n < 0) {
            throw new Error('El monto debe ser un número mayor o igual a 0.');
        }
        monto = n;
    }

    // Textos opcionales (<= 255). Vacío -> NULL.
    const opcionales = {
        responsable: 'Responsable',
        hosting: 'Hosting',
        certificado: 'Certificado',
        correo_contacto: 'Correo de contacto',
        proveedor: 'Proveedor'
    };

    const normalizados = {};

    for (const campo of Object.keys(opcionales)) {
        const valor = (d[campo] || '').toString().trim();
        if (valor.length > 255) {
            throw new Error('El campo ' + opcionales[campo] + ' no puede superar 255 caracteres.');
        }
        normalizados[campo] = valor === '' ? null : valor;
    }

    return {
        dominio: dominio,
        fecha_vencimiento: fechaVenc,
        monto: monto,
        responsable: normalizados.responsable,
        hosting: normalizados.hosting,
        certificado: normalizados.certificado,
        correo_contacto: normalizados.correo_contacto,
        proveedor: normalizados.proveedor
    };

}

function validarId(id) {

    const n = Number(id);

    if (!Number.isInteger(n) || n <= 0) {
        throw new Error('Dominio no válido.');
    }

    return n;

}

// =====================================
// CRUD
// =====================================

async function obtenerDominios() {

    await initPromise;

    return all('SELECT * FROM dominios_web ORDER BY fecha_vencimiento ASC');

}

async function obtenerDominiosPorMes(anio, mes) {

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

    return all(
        `
        SELECT *
        FROM dominios_web
        WHERE substr(fecha_vencimiento, 1, 7) = ?
        ORDER BY fecha_vencimiento ASC
        `,
        [periodo]
    );

}

async function crearDominio(datos) {

    await initPromise;

    const v = validarYNormalizarDominio(datos);

    return run(
        `
        INSERT INTO dominios_web (
            dominio,
            fecha_vencimiento,
            responsable,
            hosting,
            certificado,
            monto,
            correo_contacto,
            proveedor
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
            v.dominio,
            v.fecha_vencimiento,
            v.responsable,
            v.hosting,
            v.certificado,
            v.monto,
            v.correo_contacto,
            v.proveedor
        ]
    );

}

async function actualizarDominio(id, datos) {

    await initPromise;

    const idValido = validarId(id);

    const v = validarYNormalizarDominio(datos);

    return run(
        `
        UPDATE dominios_web
        SET dominio = ?,
            fecha_vencimiento = ?,
            responsable = ?,
            hosting = ?,
            certificado = ?,
            monto = ?,
            correo_contacto = ?,
            proveedor = ?
        WHERE id = ?
        `,
        [
            v.dominio,
            v.fecha_vencimiento,
            v.responsable,
            v.hosting,
            v.certificado,
            v.monto,
            v.correo_contacto,
            v.proveedor,
            idValido
        ]
    );

}

async function eliminarDominio(id) {

    await initPromise;

    const idValido = validarId(id);

    return run(
        'DELETE FROM dominios_web WHERE id = ?',
        [idValido]
    );

}

// =====================================
// EVENTOS DE NOTIFICACIÓN (UNION con el scheduler, opción A del diseño §7)
// =====================================

// Devuelve los eventos sintéticos de los dominios dentro de la ventana próxima,
// con el ajuste único (motivo_id = 0) del calendario servicios_web aplicado vía
// COALESCE con DEFAULTS_DOMINIO. Cada fila ya trae los 5 campos de ajuste
// resueltos, así que se pasa como dominioRow Y como ajuste al helper.
async function obtenerEventosDominiosParaNotificar() {

    await initPromise;

    const filas = await all(`
        SELECT
            d.id,
            d.dominio,
            d.fecha_vencimiento,
            COALESCE(na.activo, ${DEFAULTS_DOMINIO.activo})                              AS activo,
            COALESCE(na.dias_antelacion, ${DEFAULTS_DOMINIO.dias_antelacion})            AS dias_antelacion,
            COALESCE(na.hora_recordatorio, '${DEFAULTS_DOMINIO.hora_recordatorio}')      AS hora_recordatorio,
            COALESCE(na.repetir_cada_horas, ${DEFAULTS_DOMINIO.repetir_cada_horas})      AS repetir_cada_horas,
            COALESCE(na.recordar_dias_previos, ${DEFAULTS_DOMINIO.recordar_dias_previos}) AS recordar_dias_previos,
            cal.id AS calendario_id
        FROM dominios_web d
        LEFT JOIN calendarios cal ON cal.clave = 'servicios_web'
        LEFT JOIN notificacion_ajustes na
            ON na.calendario_id = cal.id AND na.motivo_id = 0
        WHERE d.fecha_vencimiento >= date('now', '-1 day')
            AND d.fecha_vencimiento <= date('now', '+365 day')
        ORDER BY d.fecha_vencimiento ASC
    `);

    return filas.map((row) => construirEventoDominio(row, row, row.calendario_id));

}

module.exports = {
    obtenerDominios,
    obtenerDominiosPorMes,
    crearDominio,
    actualizarDominio,
    eliminarDominio,
    obtenerEventosDominiosParaNotificar,
    colorPorVencimiento,
    diffEnDiasIso,
    construirEventoDominio
};
