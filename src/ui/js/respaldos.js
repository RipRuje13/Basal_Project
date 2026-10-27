// ================================
// RESPALDOS (exportar / importar base de datos)
// ================================
//
// Usa IPC para delegar al proceso main el copiado del archivo de BD
// (el renderer no debe tocar directamente inventario.db mientras la
// conexión sqlite está abierta).

const { ipcRenderer } = require('electron');

function initRespaldos() {

    const root =
        document.getElementById('respaldosRoot');

    if (!root) {
        return false;
    }

    // Evitar registrar listeners más de una vez.
    if (root.dataset.listo === 'true') {
        return true;
    }

    root.dataset.listo = 'true';

    console.log('[respaldos] initRespaldos listo');

    const btnExportar =
        document.getElementById('btnExportarBd');

    const btnImportar =
        document.getElementById('btnImportarBd');

    const mensaje =
        document.getElementById('respaldoMensaje');

    function mostrarMensaje(texto, tipo) {

        if (!mensaje) return;

        mensaje.innerHTML =
            `<div class="alert alert-${tipo}">${texto}</div>`;

    }

    if (btnExportar) {

        btnExportar.addEventListener('click', async () => {

            try {

                const resultado =
                    await ipcRenderer.invoke('respaldar-bd');

                if (resultado && resultado.success) {
                    mostrarMensaje(
                        'Respaldo exportado correctamente.',
                        'success'
                    );
                }
                else if (resultado && resultado.canceled) {
                    // El usuario canceló el diálogo; no mostramos nada.
                }
                else {
                    mostrarMensaje(
                        'No fue posible exportar el respaldo'
                            + (resultado && resultado.error ? ': ' + resultado.error : '.'),
                        'danger'
                    );
                }

            }
            catch (error) {

                console.error(error);
                mostrarMensaje(
                    'Ocurrió un error al exportar el respaldo.',
                    'danger'
                );

            }

        });

    }

    if (btnImportar) {

        btnImportar.addEventListener('click', async () => {

            try {

                // El main pide el archivo, confirma y, si procede, reinicia la
                // app. Si llega una respuesta aquí es porque se canceló o falló.
                const resultado =
                    await ipcRenderer.invoke('importar-bd');

                if (resultado && resultado.canceled) {
                    // Cancelado: no mostramos nada.
                }
                else if (resultado && !resultado.success) {
                    mostrarMensaje(
                        'No fue posible importar el respaldo'
                            + (resultado.error ? ': ' + resultado.error : '.'),
                        'danger'
                    );
                }

            }
            catch (error) {

                console.error(error);
                mostrarMensaje(
                    'Ocurrió un error al importar el respaldo.',
                    'danger'
                );

            }

        });

    }

    return true;

}

// =====================================
// ESPERAR A QUE EL FRAGMENTO EXISTA
// =====================================

function waitForRespaldosRoot() {

    const rootId = 'respaldosRoot';

    if (document.getElementById(rootId)) {
        initRespaldos();
        return;
    }

    const observer =
        new MutationObserver(() => {

            if (document.getElementById(rootId)) {
                observer.disconnect();
                initRespaldos();
            }

        });

    observer.observe(
        document.documentElement,
        {
            childList: true,
            subtree: true
        }
    );

}

if (typeof document !== 'undefined') {
    waitForRespaldosRoot();
}
