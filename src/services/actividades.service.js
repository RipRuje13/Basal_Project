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

// Estatus válidos para la metodología ágil adaptada al español.
const ESTATUS_VALIDOS = ['Por hacer', 'En progreso', 'Hecho'];

async function inicializarActividades() {

    await run(`
        CREATE TABLE IF NOT EXISTS actividades (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT,
            titulo TEXT,
            descripcion TEXT,
            colaborador TEXT,
            departamento TEXT,
            prioridad TEXT,
            estatus TEXT NOT NULL DEFAULT 'Por hacer',
            fecha_creacion TEXT NOT NULL,
            fecha_en_progreso TEXT,
            fecha_hecho TEXT
        )
    `);

}

const initPromise = inicializarActividades();

async function obtenerActividades() {

    await initPromise;

    return new Promise((resolve, reject) => {

        const sql = `
            SELECT
                id,
                tipo,
                titulo,
                descripcion,
                colaborador,
                departamento,
                prioridad,
                estatus,
                fecha_creacion,
                fecha_en_progreso,
                fecha_hecho
            FROM actividades
            ORDER BY id DESC
        `;

        db.all(sql, [], (err, rows) => {

            if (err) {
                reject(err);
                return;
            }

            resolve(rows);

        });

    });

}

async function obtenerActividadPorId(id) {

    await initPromise;

    return new Promise((resolve, reject) => {

        const sql = `
            SELECT *
            FROM actividades
            WHERE id = ?
        `;

        db.get(sql, [id], (err, row) => {

            if (err) {
                reject(err);
                return;
            }

            resolve(row);

        });

    });

}

async function crearActividad(datos) {

    await initPromise;

    return new Promise((resolve, reject) => {

        const titulo = (datos.titulo || '').trim();

        if (titulo === '') {
            reject(new Error('El título no puede estar vacío.'));
            return;
        }

        const sql = `
            INSERT INTO actividades (
                tipo,
                titulo,
                descripcion,
                colaborador,
                departamento,
                prioridad,
                estatus,
                fecha_creacion,
                fecha_en_progreso,
                fecha_hecho
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        // El estatus SIEMPRE arranca en 'Por hacer' ignorando cualquier
        // valor entrante; las fechas de estado quedan NULL hasta avanzar.
        const params = [
            datos.tipo || '',
            titulo,
            datos.descripcion || '',
            datos.colaborador || '',
            datos.departamento || '',
            datos.prioridad || '',
            'Por hacer',
            new Date().toISOString(),
            null,
            null
        ];

        db.run(
            sql,
            params,
            function (err) {

                if (err) {
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

async function actualizarActividad(id, datos) {

    await initPromise;

    return new Promise((resolve, reject) => {

        const titulo = (datos.titulo || '').trim();

        if (titulo === '') {
            reject(new Error('El título no puede estar vacío.'));
            return;
        }

        // Solo se actualizan los campos editables; NO se tocan el estatus
        // ni los timestamps de estado.
        const sql = `
            UPDATE actividades
            SET
                tipo = ?,
                titulo = ?,
                descripcion = ?,
                colaborador = ?,
                departamento = ?,
                prioridad = ?
            WHERE id = ?
        `;

        const params = [
            datos.tipo || '',
            titulo,
            datos.descripcion || '',
            datos.colaborador || '',
            datos.departamento || '',
            datos.prioridad || '',
            id
        ];

        db.run(
            sql,
            params,
            function (err) {

                if (err) {
                    reject(err);
                    return;
                }

                resolve({
                    success: true,
                    changes: this.changes
                });

            }
        );

    });

}

async function cambiarEstatus(id, nuevoEstatus) {

    await initPromise;

    const estatus = (nuevoEstatus || '').trim();

    if (!ESTATUS_VALIDOS.includes(estatus)) {
        return Promise.reject(new Error('Estatus no válido.'));
    }

    const actividad = await get(
        'SELECT * FROM actividades WHERE id = ?',
        [id]
    );

    if (!actividad) {
        return Promise.reject(new Error('La actividad no existe.'));
    }

    // Se sella el timestamp solo la primera vez que se avanza a un estado
    // (cuando aún está NULL). Nunca se borran sellos existentes al retroceder.
    let fechaEnProgreso = actividad.fecha_en_progreso;
    let fechaHecho = actividad.fecha_hecho;

    if (estatus === 'En progreso' && !fechaEnProgreso) {
        fechaEnProgreso = new Date().toISOString();
    }

    if (estatus === 'Hecho' && !fechaHecho) {
        fechaHecho = new Date().toISOString();
    }

    await run(
        `
            UPDATE actividades
            SET
                estatus = ?,
                fecha_en_progreso = ?,
                fecha_hecho = ?
            WHERE id = ?
        `,
        [estatus, fechaEnProgreso, fechaHecho, id]
    );

    return { success: true };

}

async function eliminarActividad(id) {

    await initPromise;

    return new Promise((resolve, reject) => {

        const sql = `
            DELETE
            FROM actividades
            WHERE id = ?
        `;

        db.run(
            sql,
            [id],
            function (err) {

                if (err) {
                    reject(err);
                    return;
                }

                resolve({
                    success: true,
                    changes: this.changes
                });

            }
        );

    });

}

module.exports = {
    obtenerActividades,
    obtenerActividadPorId,
    crearActividad,
    actualizarActividad,
    cambiarEstatus,
    eliminarActividad
};
