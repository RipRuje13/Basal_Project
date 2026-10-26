const gestionService = require('../../services/gestion.service');

// ================================
// GESTIÓN (Departamentos y Unidades de Negocio)
// ================================

function escaparHtml(valor) {

    return (valor ?? '')
        .toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

}

function initGestion() {


const inputNuevoDepartamento =
    document.getElementById('inputNuevoDepartamento');

const btnAgregarDepartamento =
    document.getElementById('btnAgregarDepartamento');

const tablaDepartamentos =
    document.getElementById('tablaDepartamentos');

const inputNuevaUnidad =
    document.getElementById('inputNuevaUnidad');

const btnAgregarUnidad =
    document.getElementById('btnAgregarUnidad');

const tablaUnidades =
    document.getElementById('tablaUnidades');

const inputNuevaUbicacion =
    document.getElementById('inputNuevaUbicacion');

const btnAgregarUbicacion =
    document.getElementById('btnAgregarUbicacion');

const tablaUbicaciones =
    document.getElementById('tablaUbicaciones');

if (!tablaDepartamentos) {
    return false;
}

console.log('[gestion] initGestion listo');

const tbodyDepartamentos =
    tablaDepartamentos.querySelector('tbody');

const tbodyUnidades =
    tablaUnidades
        ? tablaUnidades.querySelector('tbody')
        : null;

const tbodyUbicaciones =
    tablaUbicaciones
        ? tablaUbicaciones.querySelector('tbody')
        : null;

// =====================================
// RENDER
// =====================================

function renderDepartamentos(rows) {

    if (!tbodyDepartamentos) return;

    tbodyDepartamentos.innerHTML = '';

    if (!rows.length) {

        tbodyDepartamentos.innerHTML = `
            <tr>
                <td colspan="2" class="text-center text-muted py-4">
                    No hay departamentos registrados.
                </td>
            </tr>
        `;

        return;

    }

    rows.forEach((fila) => {

        const tr =
            document.createElement('tr');

        tr.innerHTML = `
            <td>${escaparHtml(fila.nombre)}</td>
            <td class="text-end">

                <button
                    type="button"
                    class="btn btn-sm btn-outline-primary btn-editar-departamento"
                    data-id="${fila.id}"
                    title="Editar">

                    <i class="bi bi-pencil-fill"></i>

                </button>

                <button
                    type="button"
                    class="btn btn-sm btn-outline-danger btn-eliminar-departamento"
                    data-id="${fila.id}"
                    title="Eliminar">

                    <i class="bi bi-trash-fill"></i>

                </button>

            </td>
        `;

        tbodyDepartamentos.appendChild(tr);

    });

}

function renderUnidades(rows) {

    if (!tbodyUnidades) return;

    tbodyUnidades.innerHTML = '';

    if (!rows.length) {

        tbodyUnidades.innerHTML = `
            <tr>
                <td colspan="2" class="text-center text-muted py-4">
                    No hay unidades de negocio registradas.
                </td>
            </tr>
        `;

        return;

    }

    rows.forEach((fila) => {

        const tr =
            document.createElement('tr');

        tr.innerHTML = `
            <td>${escaparHtml(fila.nombre)}</td>
            <td class="text-end">

                <button
                    type="button"
                    class="btn btn-sm btn-outline-primary btn-editar-unidad"
                    data-id="${fila.id}"
                    title="Editar">

                    <i class="bi bi-pencil-fill"></i>

                </button>

                <button
                    type="button"
                    class="btn btn-sm btn-outline-danger btn-eliminar-unidad"
                    data-id="${fila.id}"
                    title="Eliminar">

                    <i class="bi bi-trash-fill"></i>

                </button>

            </td>
        `;

        tbodyUnidades.appendChild(tr);

    });

}

function renderUbicaciones(rows) {

    if (!tbodyUbicaciones) return;

    tbodyUbicaciones.innerHTML = '';

    if (!rows.length) {

        tbodyUbicaciones.innerHTML = `
            <tr>
                <td colspan="2" class="text-center text-muted py-4">
                    No hay ubicaciones registradas.
                </td>
            </tr>
        `;

        return;

    }

    rows.forEach((fila) => {

        const tr =
            document.createElement('tr');

        tr.innerHTML = `
            <td>${escaparHtml(fila.nombre)}</td>
            <td class="text-end">

                <button
                    type="button"
                    class="btn btn-sm btn-outline-primary btn-editar-ubicacion"
                    data-id="${fila.id}"
                    title="Editar">

                    <i class="bi bi-pencil-fill"></i>

                </button>

                <button
                    type="button"
                    class="btn btn-sm btn-outline-danger btn-eliminar-ubicacion"
                    data-id="${fila.id}"
                    title="Eliminar">

                    <i class="bi bi-trash-fill"></i>

                </button>

            </td>
        `;

        tbodyUbicaciones.appendChild(tr);

    });

}

// =====================================
// EDICIÓN EN LÍNEA (reemplaza window.prompt, deshabilitado en Electron)
// =====================================

// Convierte la primera celda de una fila en un input editable con botones
// Guardar / Cancelar. Al guardar llama a actualizarFn(id, nombre) y recargaFn().
function editarEnLinea(fila, id, actualizarFn, recargarFn) {

    if (!fila) return;

    const celdaNombre =
        fila.querySelector('td');

    if (!celdaNombre) return;

    // Evitar entrar dos veces en modo edición sobre la misma fila.
    if (celdaNombre.querySelector('.input-editar-nombre')) {
        return;
    }

    const nombreActual =
        celdaNombre.textContent.trim();

    celdaNombre.innerHTML = `
        <div class="input-group input-group-sm">
            <input
                type="text"
                class="form-control input-editar-nombre"
                value="${escaparHtml(nombreActual)}" />
            <button type="button" class="btn btn-success btn-guardar-edicion">
                Guardar
            </button>
            <button type="button" class="btn btn-outline-secondary btn-cancelar-edicion">
                Cancelar
            </button>
        </div>
    `;

    const input =
        celdaNombre.querySelector('.input-editar-nombre');

    if (input) {
        input.focus();
        input.select();
    }

    const guardar = async () => {

        const nuevoNombre =
            input ? input.value : '';

        try {

            await actualizarFn(id, nuevoNombre);

            await recargaFnSeguro(recargarFn);

        }
        catch (error) {

            console.error(error);
            alert(error.message);

        }

    };

    celdaNombre
        .querySelector('.btn-guardar-edicion')
        .addEventListener('click', guardar);

    celdaNombre
        .querySelector('.btn-cancelar-edicion')
        .addEventListener('click', () => {
            recargaFnSeguro(recargarFn);
        });

    if (input) {

        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                guardar();
            }
            else if (ev.key === 'Escape') {
                recargaFnSeguro(recargarFn);
            }
        });

    }

}

// Llama a la función de recarga de forma segura (ignora errores de recarga).
async function recargaFnSeguro(recargarFn) {
    try {
        await recargarFn();
    }
    catch (error) {
        console.error(error);
    }
}

// =====================================
// CARGAR
// =====================================

async function cargarDepartamentos() {

    try {

        const rows =
            await gestionService.obtenerDepartamentos();

        renderDepartamentos(rows);

    }
    catch (error) {

        console.error(
            'Error cargando departamentos:',
            error
        );

    }

}

async function cargarUnidades() {

    try {

        const rows =
            await gestionService.obtenerUnidades();

        renderUnidades(rows);

    }
    catch (error) {

        console.error(
            'Error cargando unidades:',
            error
        );

    }

}

async function cargarUbicaciones() {

    try {

        const rows =
            await gestionService.obtenerUbicaciones();

        renderUbicaciones(rows);

    }
    catch (error) {

        console.error(
            'Error cargando ubicaciones:',
            error
        );

    }

}

// =====================================
// DEPARTAMENTOS: AGREGAR / EDITAR / ELIMINAR
// =====================================

if (btnAgregarDepartamento) {

    btnAgregarDepartamento.addEventListener(
        'click',
        async () => {

            try {

                const nombre =
                    inputNuevoDepartamento
                        ? inputNuevoDepartamento.value
                        : '';

                await gestionService.crearDepartamento(nombre);

                if (inputNuevoDepartamento) {
                    inputNuevoDepartamento.value = '';
                }

                await cargarDepartamentos();

            }
            catch (error) {

                console.error(error);

                alert(error.message);

            }

        }
    );

}

if (tbodyDepartamentos) {

    tbodyDepartamentos.addEventListener(
        'click',
        async (e) => {

            const btnEditar =
                e.target.closest('.btn-editar-departamento');

            if (btnEditar) {

                e.preventDefault();

                editarEnLinea(
                    btnEditar.closest('tr'),
                    btnEditar.dataset.id,
                    gestionService.actualizarDepartamento,
                    cargarDepartamentos
                );

                return;

            }

            const btnEliminar =
                e.target.closest('.btn-eliminar-departamento');

            if (btnEliminar) {

                e.preventDefault();

                const confirmado =
                    confirm(
                        '¿Estás seguro de que deseas eliminar este departamento?'
                    );

                if (!confirmado) return;

                try {

                    await gestionService.eliminarDepartamento(
                        btnEliminar.dataset.id
                    );

                    await cargarDepartamentos();

                }
                catch (error) {

                    console.error(error);

                    alert(error.message);

                }

            }

        }
    );

}

// =====================================
// UNIDADES: AGREGAR / EDITAR / ELIMINAR
// =====================================

if (btnAgregarUnidad) {

    btnAgregarUnidad.addEventListener(
        'click',
        async () => {

            try {

                const nombre =
                    inputNuevaUnidad
                        ? inputNuevaUnidad.value
                        : '';

                await gestionService.crearUnidad(nombre);

                if (inputNuevaUnidad) {
                    inputNuevaUnidad.value = '';
                }

                await cargarUnidades();

            }
            catch (error) {

                console.error(error);

                alert(error.message);

            }

        }
    );

}

if (tbodyUnidades) {

    tbodyUnidades.addEventListener(
        'click',
        async (e) => {

            const btnEditar =
                e.target.closest('.btn-editar-unidad');

            if (btnEditar) {

                e.preventDefault();

                editarEnLinea(
                    btnEditar.closest('tr'),
                    btnEditar.dataset.id,
                    gestionService.actualizarUnidad,
                    cargarUnidades
                );

                return;

            }

            const btnEliminar =
                e.target.closest('.btn-eliminar-unidad');

            if (btnEliminar) {

                e.preventDefault();

                const confirmado =
                    confirm(
                        '¿Estás seguro de que deseas eliminar esta unidad de negocio?'
                    );

                if (!confirmado) return;

                try {

                    await gestionService.eliminarUnidad(
                        btnEliminar.dataset.id
                    );

                    await cargarUnidades();

                }
                catch (error) {

                    console.error(error);

                    alert(error.message);

                }

            }

        }
    );

}

// =====================================
// UBICACIONES: AGREGAR / EDITAR / ELIMINAR
// =====================================

if (btnAgregarUbicacion) {

    btnAgregarUbicacion.addEventListener(
        'click',
        async () => {

            try {

                const nombre =
                    inputNuevaUbicacion
                        ? inputNuevaUbicacion.value
                        : '';

                await gestionService.crearUbicacion(nombre);

                if (inputNuevaUbicacion) {
                    inputNuevaUbicacion.value = '';
                }

                await cargarUbicaciones();

            }
            catch (error) {

                console.error(error);

                alert(error.message);

            }

        }
    );

}

if (tbodyUbicaciones) {

    tbodyUbicaciones.addEventListener(
        'click',
        async (e) => {

            const btnEditar =
                e.target.closest('.btn-editar-ubicacion');

            if (btnEditar) {

                e.preventDefault();

                editarEnLinea(
                    btnEditar.closest('tr'),
                    btnEditar.dataset.id,
                    gestionService.actualizarUbicacion,
                    cargarUbicaciones
                );

                return;

            }

            const btnEliminar =
                e.target.closest('.btn-eliminar-ubicacion');

            if (btnEliminar) {

                e.preventDefault();

                const confirmado =
                    confirm(
                        '¿Estás seguro de que deseas eliminar esta ubicación?'
                    );

                if (!confirmado) return;

                try {

                    await gestionService.eliminarUbicacion(
                        btnEliminar.dataset.id
                    );

                    await cargarUbicaciones();

                }
                catch (error) {

                    console.error(error);

                    alert(error.message);

                }

            }

        }
    );

}

// =====================================
// EXPANDIR / OCULTAR TARJETAS
// =====================================

document.addEventListener('click', (e) => {

    const btnToggle =
        e.target.closest('.card-gestion .btn-toggle-card');

    if (!btnToggle) return;

    e.preventDefault();

    const card =
        btnToggle.closest('.card');

    const body =
        card ? card.querySelector('.card-body') : null;

    if (!body) return;

    const oculto =
        body.style.display === 'none';

    body.style.display = oculto ? '' : 'none';

    btnToggle.setAttribute(
        'aria-expanded',
        oculto ? 'true' : 'false'
    );

    const icono = btnToggle.querySelector('i');

    if (icono) {
        icono.className = oculto
            ? 'bi bi-chevron-up'
            : 'bi bi-chevron-down';
    }

});

// =====================================
// CARGA INICIAL
// =====================================

cargarDepartamentos();

cargarUnidades();

cargarUbicaciones();

return true;


}

// =====================================
// ESPERAR A QUE EL FRAGMENTO EXISTA
// =====================================

function waitForGestionRoot() {


const rootId = 'tablaDepartamentos';

if (
    document.getElementById(rootId)
) {

    initGestion();
    return;

}

const observer =
    new MutationObserver(() => {

        if (
            document.getElementById(
                rootId
            )
        ) {

            observer.disconnect();
            initGestion();

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

if (
typeof document !== 'undefined'
) {


waitForGestionRoot();


}
