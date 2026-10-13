const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(
    __dirname,
    '..',
    '..',
    'data',
    'inventario.db'
);

const connection = new sqlite3.Database(
    dbPath,
    (err) => {
        if (err) {
            console.error(
                'Error al conectar:',
                err.message
            );
        } else {
            console.log(
                'Conectado a SQLite'
            );
        }
    }
);

function getConnection() {
    return connection;
}

module.exports = {
    getConnection
};
