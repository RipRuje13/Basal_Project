const actividadesService = require('../../services/actividades.service');
const gestionService = require('../../services/gestion.service');

// ================================
// ACTIVIDADES
// ================================

function escaparHtml(valor) {

    return (valor ?? '')
        .toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

}

// Color FIJO de fondo de fila por estatus (hex inline), independiente del
// tema. Tonos claros para que el texto siga siendo legible:
//   Por hacer    -> gris claro   (aún sin iniciar)
//   En progreso  -> ámbar claro  (en proceso)
//   Hecho        -> verde claro  (completado)
function getColorEstatus(estatusRaw) {

    const estatus =
        (estatusRaw ?? '')
            .toString()
            .trim();

    if (estatus === 'Por hacer') return '#e5e7eb';
    if (estatus === 'En progreso') return '#ffe8a3';
    if (estatus === 'Hecho') return '#c6f6d5';

    return 'transparent';
}

function initActividades() {

    const actividadForm =
        document.getElementById('actividadForm');

    const tablaActividades =
        document.getElementById('tablaActividades');

    if (
        !actividadForm ||
        !tablaActividades
    ) {
        return false;
    }

    console.log('[actividades] initActividades listo');

    const btnGuardarActividad =
        document.getElementById('btnGuardarActividad');

    const actividadesPaginacion =
        document.getElementById('actividadesPaginacion');

    const actividadesPaginacionInfo =
        document.getElementById('actividadesPaginacionInfo');

    let actividadEditandoId = null;
    let actividadesCache = [];

    const FILAS_POR_PAGINA = 10;
    let paginaActualActividades = 1;

    // =====================================
    // FUNCIONES AUXILIARES
    // =====================================

    async function cargarDepartamentos() {

        const selectDepartamento =
            document.getElementById('actDepartamento');

        if (!selectDepartamento) return;

        try {

            const departamentos =
                await gestionService.obtenerDepartamentos();

            selectDepartamento.innerHTML =
                '<option value="" selected disabled>Seleccione un departamento</option>';

            departamentos.forEach((fila) => {

                const option =
                    document.createElement('option');

                option.value = fila.nombre;
                option.textContent = fila.nombre;
                selectDepartamento.appendChild(option);

            });

        }
        catch (error) {

            console.error(
                'Error cargando departamentos de actividades:',
                error
            );

        }

    }

    function setModoNuevaActividad() {

        actividadEditandoId = null;
        actividadForm.reset();

        if (btnGuardarActividad) {
            btnGuardarActividad.textContent = 'Guardar';
        }

    }

    function setModoEditarActividad(actividad) {

        actividadEditandoId = actividad.id;

        document.getElementById('actTipo').value =
            actividad.tipo ?? '';

        document.getElementById('actTitulo').value =
            actividad.titulo ?? '';

        document.getElementById('actDescripcion').value =
            actividad.descripcion ?? '';

        document.getElementById('actColaborador').value =
            actividad.colaborador ?? '';

        document.getElementById('actDepartamento').value =
            actividad.departamento ?? '';

        document.getElementById('actPrioridad').value =
            actividad.prioridad ?? '';

        if (btnGuardarActividad) {
            btnGuardarActividad.textContent = 'Actualizar';
        }

    }

    function formatearFecha(fecha) {

        return (fecha ?? '')
            .toString()
            .slice(0, 16)
            .replace('T', ' ');

    }

    // =====================================
    // PAGINACIÓN
    // =====================================

    function renderPaginaActividades() {

        const totalFilas = actividadesCache.length;

        const totalPaginas = Math.max(
            1,
            Math.ceil(totalFilas / FILAS_POR_PAGINA)
        );

        // Asegurar que la pagina actual este dentro de rango
        // (por ejemplo tras eliminar el ultimo registro de una pagina).
        if (paginaActualActividades > totalPaginas) {
            paginaActualActividades = totalPaginas;
        }

        if (paginaActualActividades < 1) {
            paginaActualActividades = 1;
        }

        const inicio =
            (paginaActualActividades - 1) * FILAS_POR_PAGINA;

        const paginaFilas =
            actividadesCache.slice(inicio, inicio + FILAS_POR_PAGINA);

        renderActividades(paginaFilas);

        renderPaginacionActividades(totalFilas, totalPaginas);

    }

    function renderPaginacionActividades(totalFilas, totalPaginas) {

        if (actividadesPaginacionInfo) {

            if (totalFilas === 0) {
                actividadesPaginacionInfo.textContent =
                    'Sin registros';
            }
            else {

                const inicio =
                    (paginaActualActividades - 1) * FILAS_POR_PAGINA + 1;

                const fin =
                    Math.min(
                        paginaActualActividades * FILAS_POR_PAGINA,
                        totalFilas
                    );

                actividadesPaginacionInfo.textContent =
                    `Mostrando ${inicio}-${fin} de ${totalFilas} registros`;

            }

        }

        if (!actividadesPaginacion) return;

        actividadesPaginacion.innerHTML = '';

        // Si solo hay una pagina (o ninguna), no mostramos controles.
        if (totalPaginas <= 1) return;

        const crearItem = (etiqueta, pagina, opciones = {}) => {

            const li = document.createElement('li');
            li.className = 'page-item';

            if (opciones.activo) li.classList.add('active');
            if (opciones.deshabilitado) li.classList.add('disabled');

            const boton = document.createElement('button');
            boton.type = 'button';
            boton.className = 'page-link';
            boton.innerHTML = etiqueta;

            if (!opciones.deshabilitado && !opciones.activo) {
                boton.addEventListener('click', () => {
                    paginaActualActividades = pagina;
                    renderPaginaActividades();
                });
            }

            li.appendChild(boton);
            actividadesPaginacion.appendChild(li);

        };

        // Anterior
        crearItem(
            '&laquo;',
            paginaActualActividades - 1,
            { deshabilitado: paginaActualActividades === 1 }
        );

        // Numeros de pagina
        for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
            crearItem(
                String(pagina),
                pagina,
                { activo: pagina === paginaActualActividades }
            );
        }

        // Siguiente
        crearItem(
            '&raquo;',
            paginaActualActividades + 1,
            { deshabilitado: paginaActualActividades === totalPaginas }
        );

    }

    // =====================================
    // RENDER TABLA
    // =====================================

    function botonEstatus(actividad, estatus, claseColor) {

        const activo = (actividad.estatus ?? '').trim() === estatus;

        const clase = activo
            ? `btn btn-sm ${claseColor}`
            : `btn btn-sm btn-outline-${claseColor.replace('btn-', '')}`;

        return `
            <button
                type="button"
                class="${clase} btn-estatus-actividad"
                data-id="${actividad.id}"
                data-estatus="${escaparHtml(estatus)}"
                title="Marcar como ${escaparHtml(estatus)}">
                ${escaparHtml(estatus)}
            </button>
        `;

    }

    function renderActividades(rows) {

        const tbody =
            document.querySelector(
                '#tablaActividades tbody'
            );

        if (!tbody) return;

        tbody.innerHTML = '';

        if (!rows.length) {

            tbody.innerHTML = `
                <tr>
                    <td colspan="9" class="text-center text-muted py-4">
                        No hay actividades registradas.
                    </td>
                </tr>
            `;

            return;

        }

        rows.forEach((actividad) => {

            const tr =
                document.createElement('tr');

            // Color FIJO de la fila según el estatus (independiente del tema).
            const colorFila =
                getColorEstatus(actividad.estatus);

            if (colorFila && colorFila !== 'transparent') {
                tr.style.setProperty('--bs-table-bg', colorFila);
                tr.style.setProperty('--bs-table-accent-bg', colorFila);
                tr.style.setProperty('--bs-table-color', '#212529');
                tr.style.color = '#212529';
            }

            tr.innerHTML = `
                <td>${escaparHtml(actividad.tipo)}</td>
                <td>${escaparHtml(actividad.titulo)}</td>
                <td>${escaparHtml(actividad.descripcion)}</td>
                <td>${escaparHtml(actividad.colaborador)}</td>
                <td>${escaparHtml(actividad.departamento)}</td>
                <td>${escaparHtml(actividad.prioridad)}</td>
                <td>${escaparHtml(actividad.estatus)}</td>
                <td>${escaparHtml(formatearFecha(actividad.fecha_creacion))}</td>

                <td class="action-cell">
                    <div class="action-buttons">
                        ${botonEstatus(actividad, 'Por hacer', 'btn-secondary')}
                        ${botonEstatus(actividad, 'En progreso', 'btn-warning')}
                        ${botonEstatus(actividad, 'Hecho', 'btn-success')}

                        <button
                            type="button"
                            class="btn btn-sm btn-outline-primary btn-editar-actividad"
                            data-id="${actividad.id}"
                            title="Editar">
                            <i class="bi bi-pencil-fill"></i>
                        </button>
                    </div>
                </td>
            `;

            tbody.appendChild(tr);

        });

    }

    // =====================================
    // CARGAR ACTIVIDADES
    // =====================================

    async function cargarActividades() {

        try {

            const actividades =
                await actividadesService.obtenerActividades();

            actividadesCache = actividades;

            renderPaginaActividades();

        }
        catch (error) {

            console.error(
                'Error cargando actividades:',
                error
            );

        }

    }

    // =====================================
    // DELEGACIÓN DE CLICS
    // =====================================

    document.addEventListener(
        'click',
        async (e) => {

            const btnEstatus =
                e.target.closest('.btn-estatus-actividad');

            if (!btnEstatus) return;

            e.preventDefault();
            e.stopPropagation();

            try {

                await actividadesService.cambiarEstatus(
                    btnEstatus.dataset.id,
                    btnEstatus.dataset.estatus
                );

                await cargarActividades();

            }
            catch (error) {

                console.error(error);
                alert(error.message);

            }

        }
    );

    document.addEventListener(
        'click',
        async (e) => {

            const btnEditar =
                e.target.closest('.btn-editar-actividad');

            if (!btnEditar) return;

            e.preventDefault();
            e.stopPropagation();

            try {

                const actividad =
                    await actividadesService.obtenerActividadPorId(
                        btnEditar.dataset.id
                    );

                if (!actividad) {
                    alert('No se encontró la actividad seleccionada.');
                    return;
                }

                setModoEditarActividad(actividad);

            }
            catch (error) {

                console.error(error);
                alert('No fue posible cargar la actividad.');

            }

        }
    );

    // =====================================
    // GUARDAR / ACTUALIZAR ACTIVIDAD
    // =====================================

    actividadForm.addEventListener(
        'submit',
        async (e) => {

            e.preventDefault();

            try {

                const datos = {

                    tipo:
                        document.getElementById('actTipo').value,

                    titulo:
                        document.getElementById('actTitulo').value,

                    descripcion:
                        document.getElementById('actDescripcion').value,

                    colaborador:
                        document.getElementById('actColaborador').value,

                    departamento:
                        document.getElementById('actDepartamento').value,

                    prioridad:
                        document.getElementById('actPrioridad').value

                };

                if (actividadEditandoId) {

                    await actividadesService.actualizarActividad(
                        actividadEditandoId,
                        datos
                    );

                }
                else {

                    await actividadesService.crearActividad(datos);

                    // Un registro nuevo siempre vuelve a la primera pagina.
                    paginaActualActividades = 1;

                }

                setModoNuevaActividad();

                await cargarActividades();

            }
            catch (error) {

                console.error(error);
                alert(error.message);

            }

        }
    );

    // =====================================
    // CARGA INICIAL
    // =====================================

    cargarDepartamentos().then(() => {
        cargarActividades();
    });

    return true;

}

// =====================================
// ESPERAR A QUE EL FRAGMENTO EXISTA
// =====================================

function waitForActividadesRoot() {

    const formId = 'actividadForm';

    if (
        document.getElementById(formId)
    ) {

        initActividades();
        return;

    }

    const observer =
        new MutationObserver(() => {

            if (
                document.getElementById(formId)
            ) {

                observer.disconnect();
                initActividades();

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

    waitForActividadesRoot();

}
