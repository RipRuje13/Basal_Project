const { getConnection } = require('../database/connection');

const db = getConnection();

function obtenerCompras() {

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

function obtenerCompraPorId(id) {

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

function guardarCompra(datos) {

    return new Promise((resolve, reject) => {

        const sql = `
            INSERT INTO comprasdb (
                cantidad,
                producto,
                departamento,
                unidad_negocio,
                colaborador,
                fecha_solicitud,
                estatus,
                codigo,
                notas
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            datos.cantidad,
            datos.producto,
            datos.departamento,
            datos.unidad_negocio,
            datos.colaborador,
            datos.fecha_solicitud,
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
console.log("entro a la funcion guardar")
}

function actualizarCompra(id, datos) {

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

function eliminarCompra(id) {

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
