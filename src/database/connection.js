const sqlite3 = require('sqlite3').verbose();
const { DB_PATH, asegurarBaseDatos } = require('./paths');

// Garantiza que la carpeta de datos exista y, en producción, que la base de
// datos esté copiada en userData antes de abrir la conexión.
asegurarBaseDatos();

const connection = new sqlite3.Database(
    DB_PATH,
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
