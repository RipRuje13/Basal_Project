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

// Valores iniciales tomados literalmente del HTML (compras-fragment.html).
const seedDepartamentos = [
    'Administración XPD',
    'Análisis de Negocio',
    'Asesoría',
    'Atención a Clientes',
    'Auditoría-Contabilidad 3',
    'Contabilidad 1',
    'Contabilidad 2',
    'Contraloría',
    'Desarrollo XPD',
    'Dirección',
    'Gerencia General de Operaciones',
    'Gerencia Operaciones XPD',
    'Help AI',
    'Jurídico Contencioso',
    'Jurídico Laboral',
    'Mercadotecnia',
    'Nóminas',
    'Operaciones XPD',
    'Recursos Humanos',
    'Sistemas de Gestión',
    'Sistemas Informáticos'
];

const seedUnidades = [
    'Basal Capital',
    'XPD',
    'HELP AI'
];

async function inicializarGestion() {

    await run(`
        CREATE TABLE IF NOT EXISTS departamentos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL UNIQUE
        )
    `);

    await run(`
        CREATE TABLE IF NOT EXISTS unidades_negocio (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL UNIQUE
        )
    `);

    // Seed idempotente: solo se inserta cuando la tabla está vacía.
    const totalDepartamentos = await all(
        'SELECT COUNT(*) AS total FROM departamentos'
    );

    if (totalDepartamentos[0].total === 0) {

        for (const nombre of seedDepartamentos) {
            await run(
                'INSERT OR IGNORE INTO departamentos (nombre) VALUES (?)',
                [nombre]
            );
        }

    }

    const totalUnidades = await all(
        'SELECT COUNT(*) AS total FROM unidades_negocio'
    );

    if (totalUnidades[0].total === 0) {

        for (const nombre of seedUnidades) {
            await run(
                'INSERT OR IGNORE INTO unidades_negocio (nombre) VALUES (?)',
                [nombre]
            );
        }

    }

}

const initPromise = inicializarGestion();

async function obtenerDepartamentos() {

    await initPromise;

    return new Promise((resolve, reject) => {

        const sql = `
            SELECT id, nombre
            FROM departamentos
            ORDER BY nombre ASC
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

async function crearDepartamento(nombre) {

    await initPromise;

    return new Promise((resolve, reject) => {

        const nombreLimpio = (nombre || '').trim();

        if (nombreLimpio === '') {
            reject(new Error('El nombre no puede estar vacío.'));
            return;
        }

        const sql = `
            INSERT INTO departamentos (nombre)
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

async function actualizarDepartamento(id, nombre) {

    await initPromise;

    return new Promise((resolve, reject) => {

        const nombreLimpio = (nombre || '').trim();

        if (nombreLimpio === '') {
            reject(new Error('El nombre no puede estar vacío.'));
            return;
        }

        const sql = `
            UPDATE departamentos
            SET nombre = ?
            WHERE id = ?
        `;

        db.run(
            sql,
            [nombreLimpio, id],
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
                    changes: this.changes
                });

            }
        );

    });

}

async function eliminarDepartamento(id) {

    await initPromise;

    return new Promise((resolve, reject) => {

        const sql = `
            DELETE
            FROM departamentos
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

async function obtenerUnidades() {

    await initPromise;

    return new Promise((resolve, reject) => {

        const sql = `
            SELECT id, nombre
            FROM unidades_negocio
            ORDER BY nombre ASC
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

async function crearUnidad(nombre) {

    await initPromise;

    return new Promise((resolve, reject) => {

        const nombreLimpio = (nombre || '').trim();

        if (nombreLimpio === '') {
            reject(new Error('El nombre no puede estar vacío.'));
            return;
        }

        const sql = `
            INSERT INTO unidades_negocio (nombre)
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

async function actualizarUnidad(id, nombre) {

    await initPromise;

    return new Promise((resolve, reject) => {

        const nombreLimpio = (nombre || '').trim();

        if (nombreLimpio === '') {
            reject(new Error('El nombre no puede estar vacío.'));
            return;
        }

        const sql = `
            UPDATE unidades_negocio
            SET nombre = ?
            WHERE id = ?
        `;

        db.run(
            sql,
            [nombreLimpio, id],
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
                    changes: this.changes
                });

            }
        );

    });

}

async function eliminarUnidad(id) {

    await initPromise;

    return new Promise((resolve, reject) => {

        const sql = `
            DELETE
            FROM unidades_negocio
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
    obtenerDepartamentos,
    crearDepartamento,
    actualizarDepartamento,
    eliminarDepartamento,
    obtenerUnidades,
    crearUnidad,
    actualizarUnidad,
    eliminarUnidad
};
