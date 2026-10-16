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

async function inicializarCompras() {

    await run(`
        CREATE TABLE IF NOT EXISTS comprasdb (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cantidad INTEGER,
            producto TEXT,
            departamento TEXT,
            unidad_negocio TEXT,
            colaborador TEXT,
            fecha_solicitud TEXT,
            cotizacion TEXT,
            estatus TEXT,
            codigo TEXT,
            notas TEXT
        )
    `);

    // Migración: agregar la columna "cotizacion" a bases de datos existentes.
    const columnas = await all('PRAGMA table_info(comprasdb)');
    const tieneCotizacion = columnas.some(
        (columna) => columna.name === 'cotizacion'
    );

    if (!tieneCotizacion) {
        await run('ALTER TABLE comprasdb ADD COLUMN cotizacion TEXT');
    }

}

const initPromise = inicializarCompras();

async function obtenerCompras() {

    await initPromise;

    return new Promise((resolve, reject) => {

        const sql = `
            SELECT
                id,
                cantidad,
                producto,
                departamento,
                unidad_negocio,
                colaborador,
                fecha_solicitud,
                cotizacion,
                estatus,
                codigo,
                notas
            FROM comprasdb
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

async function obtenerCompraPorId(id) {

    await initPromise;

    return new Promise((resolve, reject) => {

        const sql = `
            SELECT *
            FROM comprasdb
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

async function guardarCompra(datos) {

    await initPromise;

    return new Promise((resolve, reject) => {

        const sql = `
            INSERT INTO comprasdb (
                cantidad,
                producto,
                departamento,
                unidad_negocio,
                colaborador,
                fecha_solicitud,
                cotizacion,
                estatus,
                codigo,
                notas
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            datos.cantidad,
            datos.producto,
            datos.departamento,
            datos.unidad_negocio,
            datos.colaborador,
            datos.fecha_solicitud,
            datos.cotizacion,
            datos.estatus,
            datos.codigo,
            datos.notas
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

async function actualizarCompra(id, datos) {

    await initPromise;

    return new Promise((resolve, reject) => {

        const sql = `
            UPDATE comprasdb
            SET
                cantidad = ?,
                producto = ?,
                departamento = ?,
                unidad_negocio = ?,
                colaborador = ?,
                fecha_solicitud = ?,
                cotizacion = ?,
                estatus = ?,
                codigo = ?,
                notas = ?
            WHERE id = ?
        `;

        const params = [
            datos.cantidad,
            datos.producto,
            datos.departamento,
            datos.unidad_negocio,
            datos.colaborador,
            datos.fecha_solicitud,
            datos.cotizacion,
            datos.estatus,
            datos.codigo,
            datos.notas,
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

async function eliminarCompra(id) {

    await initPromise;

    return new Promise((resolve, reject) => {

        const sql = `
            DELETE
            FROM comprasdb
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
    obtenerCompras,
    obtenerCompraPorId,
    guardarCompra,
    actualizarCompra,
    eliminarCompra
};
