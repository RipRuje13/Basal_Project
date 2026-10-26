(function () {

    const calendariosService = require('../../services/calendarios.service');
    const gestionService = require('../../services/gestion.service');
    const serviciosWebService = require('../../services/serviciosWeb.service');

    // ================================
    // CALENDARIOS (administración)
    // ================================

    // Clave del calendario que usa departamentos (en lugar de motivos libres)
    // y color automático por departamento.
    const CLAVE_CAL_DEPARTAMENTOS = 'mantenimientos';

    // Clave del calendario de dominios web (entidad rica, color dinámico).
    const CLAVE_CAL_SERVICIOS_WEB = 'servicios_web';

    // Catálogos cacheados a nivel de IIFE (ver §5.4):
    // initCalendarios los rellena y recargarMotivos/recargarColores los reasignan.
    let motivos = [];
    let colores = [];

    // Defaults de notificación para pintar filas sin ajuste guardado.
    // Debe coincidir con DEFAULTS_NOTIFICACION del servicio (FEAT-001);
    // la constante del servicio no se exporta, por eso se replica aquí.
    const DEFAULTS_NOTIFICACION = {
        activo: 1,
        dias_antelacion: 1,
        hora_recordatorio: '09:00',
        repetir_cada_horas: 0,
        recordar_dias_previos: 0
    };

    // Departamentos (de gestion.service) y su mapeo de color asignado.
    let departamentos = [];
    let coloresPorDepartamento = new Map(); // nombre depto -> { color_id, color_valor, color_nombre }

    function esCalendarioDepartamentos(cal) {
        return cal.clave === CLAVE_CAL_DEPARTAMENTOS;
    }

    function esCalendarioServiciosWeb(cal) {
        return cal.clave === CLAVE_CAL_SERVICIOS_WEB;
    }

    // =====================================
    // PAGINACIÓN DE LA LISTA DE DÍAS
    // =====================================
    // Tamaño de página por calendario (clave -> registros por página).
    // Un calendario que no aparezca aquí NO pagina (muestra todos sus días).
    const PAGINA_POR_CLAVE = {
        compras_mensuales: 7,
        compras_bimestrales: 5,
        mantenimientos: 5,
        servicios_web: 10
    };

    // Página actual por calendario (clave -> número de página, 1-indexado).
    const paginaPorCalendario = new Map();

    // Tamaño de página de un calendario, o 0 si no pagina.
    function tamanoPagina(cal) {
        return PAGINA_POR_CLAVE[cal.clave] || 0;
    }

    function calendarioPagina(cal) {
        return tamanoPagina(cal) > 0;
    }

    function escaparHtml(valor) {

        return (valor ?? '')
            .toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

    }

    // =====================================
    // POBLADO DE SELECTS
    // =====================================

    function poblarSelectMotivos(select, lista, seleccionarId) {

        if (!select) return;

        select.innerHTML = lista
            .map((motivo) => {

                return `<option value="${motivo.id}">${escaparHtml(motivo.nombre)}</option>`;

            })
            .join('');

        if (seleccionarId !== undefined && seleccionarId !== null) {
            select.value = String(seleccionarId);
        }

    }

    function poblarSelectColores(select, lista, seleccionarId) {

        if (!select) return;

        select.innerHTML = lista
            .map((color) => {

                // value = id (lo que recibe crearDia/actualizarDia);
                // data-valor = hex (ya validado por el servicio) para pintar la muestra.
                return `<option value="${color.id}" data-valor="${color.valor}">${escaparHtml(color.nombre)}</option>`;

            })
            .join('');

        if (seleccionarId !== undefined && seleccionarId !== null) {
            select.value = String(seleccionarId);
        }

    }

    // =====================================
    // CREAR CARD DE UN CALENDARIO
    // =====================================

    function crearCardCalendario(cal) {

        if (esCalendarioServiciosWeb(cal)) {
            return crearCardServiciosWeb(cal);
        }

        const card =
            document.createElement('div');

        card.className = 'card border-secondary mb-3';

        card.dataset.id = cal.id;
        card.dataset.clave = cal.clave;

        card.innerHTML = `
            <div class="card-header d-flex align-items-center justify-content-between">
                <span>${escaparHtml(cal.nombre)}</span>
                <button
                    type="button"
                    class="btn btn-sm btn-outline-light btn-toggle-card"
                    title="Expandir u ocultar"
                    aria-expanded="false">
                    <i class="bi bi-chevron-down"></i>
                </button>
            </div>

            <!-- Oculto por defecto; se expande con el botón del header -->
            <div class="card-body" style="display: none;">

                <!-- Descripción -->
                <div class="mb-3">
                    <label class="form-label">Descripción</label>
                    <div class="input-group">
                        <input
                            id="descCal-${cal.id}"
                            class="form-control"
                            type="text"
                            value="${escaparHtml(cal.descripcion)}" />
                        <button
                            type="button"
                            class="btn btn-primary btn-guardar-desc"
                            data-id="${cal.id}"
                            data-clave="${escaparHtml(cal.clave)}">
                            Guardar
                        </button>
                    </div>
                </div>

                <!-- Agregar / editar día -->
                <div class="border rounded p-3 mb-3">

                    <div class="row g-2 align-items-end">

                        <div class="col-md-4">
                            <label class="form-label label-motivo">Motivo</label>
                            <div class="input-group">
                                <select class="form-select sel-motivo"></select>
                                <button
                                    type="button"
                                    class="btn btn-outline-secondary btn-add-motivo"
                                    title="Agregar motivo">
                                    +
                                </button>
                            </div>

                            <!-- Formulario en línea para nuevo motivo (oculto por defecto) -->
                            <div class="input-group mt-2 nuevo-motivo-box" style="display: none;">
                                <input
                                    type="text"
                                    class="form-control inp-nuevo-motivo"
                                    placeholder="Nombre del nuevo motivo" />
                                <button
                                    type="button"
                                    class="btn btn-success btn-guardar-motivo"
                                    title="Guardar motivo">
                                    Guardar
                                </button>
                                <button
                                    type="button"
                                    class="btn btn-outline-secondary btn-cancelar-motivo"
                                    title="Cancelar">
                                    &times;
                                </button>
                            </div>
                        </div>

                        <div class="col-md-4 col-color">
                            <label class="form-label">Color</label>
                            <div class="input-group">
                                <span class="input-group-text">
                                    <span class="muestra-color"></span>
                                </span>
                                <select class="form-select sel-color"></select>
                                <button
                                    type="button"
                                    class="btn btn-outline-secondary btn-add-color"
                                    title="Agregar color">
                                    +
                                </button>
                            </div>

                            <!-- Formulario en línea para nuevo color (oculto por defecto) -->
                            <div class="input-group mt-2 nuevo-color-box" style="display: none;">
                                <input
                                    type="color"
                                    class="form-control form-control-color inp-color"
                                    value="#0d6efd"
                                    title="Elegir color nuevo" />
                                <input
                                    type="text"
                                    class="form-control inp-nuevo-color"
                                    placeholder="Nombre del color" />
                                <button
                                    type="button"
                                    class="btn btn-success btn-guardar-color"
                                    title="Guardar color">
                                    Guardar
                                </button>
                                <button
                                    type="button"
                                    class="btn btn-outline-secondary btn-cancelar-color"
                                    title="Cancelar">
                                    &times;
                                </button>
                            </div>
                        </div>

                        <div class="col-md-3">
                            <label class="form-label">Día</label>
                            <input type="date" class="form-control inp-fecha" />
                        </div>

                        <div class="col-md-1">
                            <button
                                type="button"
                                class="btn btn-success btn-guardar-dia w-100"
                                data-id="${cal.id}"
                                data-clave="${escaparHtml(cal.clave)}">
                                Guardar
                            </button>
                        </div>

                    </div>

                </div>

                <!-- Días del calendario -->
                <table class="table table-hover mb-0">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Motivo</th>
                            <th>Color</th>
                            <th class="text-end"></th>
                        </tr>
                    </thead>
                    <tbody id="tablaDias-${cal.id}"></tbody>
                </table>

                <!-- Paginación (solo para el calendario configurado) -->
                <div
                    class="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-3"
                    id="paginacionDias-${cal.id}"
                    style="display: none;">
                    <small class="text-muted info-paginacion-dias"></small>
                    <nav aria-label="Paginación de días">
                        <ul class="pagination pagination-sm mb-0 lista-paginacion-dias"></ul>
                    </nav>
                </div>

                <!-- Ajustes de notificaciones (colapsable, oculto por defecto) -->
                <div
                    class="border rounded p-3 mt-3 notif-box"
                    data-cal-id="${cal.id}"
                    data-clave="${escaparHtml(cal.clave)}">

                    <div class="d-flex align-items-center justify-content-between">
                        <strong>Notificaciones</strong>
                        <button
                            type="button"
                            class="btn btn-sm btn-outline-secondary btn-toggle-notif"
                            title="Mostrar u ocultar ajustes de notificaciones"
                            aria-expanded="false">
                            <i class="bi bi-chevron-down"></i>
                        </button>
                    </div>

                    <div
                        class="notif-panel mt-3"
                        id="notifPanel-${cal.id}"
                        style="display: none;">

                        <table class="table table-sm align-middle mb-0">
                            <thead>
                                <tr>
                                    <th>${esCalendarioDepartamentos(cal) ? 'Departamento' : 'Motivo'}</th>
                                    <th class="text-center">Activo</th>
                                    <th>Días de antelación</th>
                                    <th>Hora del recordatorio</th>
                                    <th>Repetir cada (horas)</th>
                                    <th class="text-center">Recordar cada día previo</th>
                                    <th class="text-end"></th>
                                </tr>
                            </thead>
                            <tbody id="notifTbody-${cal.id}"></tbody>
                        </table>

                    </div>

                </div>

            </div>
        `;

        const selMotivo =
            card.querySelector('.sel-motivo');

        const selColor =
            card.querySelector('.sel-color');

        poblarSelectColores(selColor, colores);

        if (esCalendarioDepartamentos(cal)) {

            // --- Modo DEPARTAMENTOS (mantenimientos) ---

            // El label "Motivo" pasa a "Departamento".
            const labelMotivo =
                card.querySelector('.label-motivo');

            if (labelMotivo) {
                labelMotivo.textContent = 'Departamento';
            }

            // El select se llena con departamentos (no motivos).
            poblarSelectDepartamentos(selMotivo, departamentos);

            // Oculta el botón "+" de agregar motivo (no aplica aquí).
            const btnAddMotivo =
                card.querySelector('.btn-add-motivo');

            if (btnAddMotivo) {
                btnAddMotivo.style.display = 'none';
            }

            // Oculta el bloque Color: el color sale del departamento.
            // Solo reaparece al editar un registro existente.
            const colColor =
                card.querySelector('.col-color');

            if (colColor) {
                colColor.style.display = 'none';
            }

        }
        else {

            // --- Modo MOTIVOS (compras mensuales / bimestrales) ---
            poblarSelectMotivos(selMotivo, motivos);

        }

        // Muestra inicial de color segun el option seleccionado.
        actualizarMuestraColor(card);

        return card;

    }

    // =====================================
    // CARD ESPECIAL: SERVICIOS WEB (dominios)
    // =====================================

    // Crea la card del calendario de dominios: descripción + formulario de 8
    // campos + tabla de dominios con color dinámico + panel de notificaciones
    // con una sola fila ("Todos los dominios").
    function crearCardServiciosWeb(cal) {

        const card =
            document.createElement('div');

        card.className = 'card border-secondary mb-3';

        card.dataset.id = cal.id;
        card.dataset.clave = cal.clave;

        card.innerHTML = `
            <div class="card-header d-flex align-items-center justify-content-between">
                <span>${escaparHtml(cal.nombre)}</span>
                <button
                    type="button"
                    class="btn btn-sm btn-outline-light btn-toggle-card"
                    title="Expandir u ocultar"
                    aria-expanded="false">
                    <i class="bi bi-chevron-down"></i>
                </button>
            </div>

            <div class="card-body" style="display: none;">

                <!-- Descripción -->
                <div class="mb-3">
                    <label class="form-label">Descripción</label>
                    <div class="input-group">
                        <input
                            id="descCal-${cal.id}"
                            class="form-control"
                            type="text"
                            value="${escaparHtml(cal.descripcion)}" />
                        <button
                            type="button"
                            class="btn btn-primary btn-guardar-desc"
                            data-id="${cal.id}"
                            data-clave="${escaparHtml(cal.clave)}">
                            Guardar
                        </button>
                    </div>
                </div>

                <!-- Agregar / editar dominio -->
                <div class="border rounded p-3 mb-3">

                    <div class="row g-2">

                        <div class="col-md-6">
                            <label class="form-label">Dominio *</label>
                            <input type="text" class="form-control inp-dom-dominio" maxlength="255" />
                        </div>

                        <div class="col-md-3">
                            <label class="form-label">Fecha de vencimiento *</label>
                            <input type="date" class="form-control inp-dom-fecha" />
                        </div>

                        <div class="col-md-3">
                            <label class="form-label">Monto</label>
                            <input type="number" step="0.01" min="0" class="form-control inp-dom-monto" />
                        </div>

                        <div class="col-md-4">
                            <label class="form-label">Responsable</label>
                            <input type="text" class="form-control inp-dom-responsable" maxlength="255" />
                        </div>

                        <div class="col-md-4">
                            <label class="form-label">Hosting</label>
                            <input type="text" class="form-control inp-dom-hosting" maxlength="255" />
                        </div>

                        <div class="col-md-4">
                            <label class="form-label">Certificado</label>
                            <input type="text" class="form-control inp-dom-certificado" maxlength="255" />
                        </div>

                        <div class="col-md-4">
                            <label class="form-label">Proveedor</label>
                            <input type="text" class="form-control inp-dom-proveedor" maxlength="255" />
                        </div>

                        <div class="col-md-4">
                            <label class="form-label">Correo de contacto</label>
                            <input type="text" class="form-control inp-dom-correo" maxlength="255" />
                        </div>

                        <div class="col-md-4 d-flex align-items-end">
                            <button
                                type="button"
                                class="btn btn-success btn-guardar-dominio w-100"
                                data-id="${cal.id}"
                                data-clave="${escaparHtml(cal.clave)}">
                                Guardar
                            </button>
                        </div>

                    </div>

                </div>

                <!-- Dominios del calendario -->
                <table class="table table-hover mb-0">
                    <thead>
                        <tr>
                            <th></th>
                            <th>Dominio</th>
                            <th>Vencimiento</th>
                            <th>Responsable</th>
                            <th>Hosting</th>
                            <th>Monto</th>
                            <th class="text-end"></th>
                        </tr>
                    </thead>
                    <tbody id="tablaDominios-${cal.id}"></tbody>
                </table>

                <!-- Paginación -->
                <div
                    class="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-3"
                    id="paginacionDias-${cal.id}"
                    style="display: none;">
                    <small class="text-muted info-paginacion-dias"></small>
                    <nav aria-label="Paginación de dominios">
                        <ul class="pagination pagination-sm mb-0 lista-paginacion-dias"></ul>
                    </nav>
                </div>

                <!-- Ajustes de notificaciones -->
                <div
                    class="border rounded p-3 mt-3 notif-box"
                    data-cal-id="${cal.id}"
                    data-clave="${escaparHtml(cal.clave)}">

                    <div class="d-flex align-items-center justify-content-between">
                        <strong>Notificaciones</strong>
                        <button
                            type="button"
                            class="btn btn-sm btn-outline-secondary btn-toggle-notif"
                            title="Mostrar u ocultar ajustes de notificaciones"
                            aria-expanded="false">
                            <i class="bi bi-chevron-down"></i>
                        </button>
                    </div>

                    <div
                        class="notif-panel mt-3"
                        id="notifPanel-${cal.id}"
                        style="display: none;">

                        <table class="table table-sm align-middle mb-0">
                            <thead>
                                <tr>
                                    <th>Ámbito</th>
                                    <th class="text-center">Activo</th>
                                    <th>Días de antelación</th>
                                    <th>Hora</th>
                                    <th>Repetir (horas)</th>
                                    <th class="text-center">Recordar días previos</th>
                                    <th class="text-end"></th>
                                </tr>
                            </thead>
                            <tbody id="notifTbody-${cal.id}"></tbody>
                        </table>

                    </div>

                </div>

            </div>
        `;

        return card;

    }

    // Puebla un <select> con los departamentos (value = nombre).
    function poblarSelectDepartamentos(select, lista, seleccionarNombre) {

        if (!select) return;

        select.innerHTML = lista
            .map((depto) => {
                return `<option value="${escaparHtml(depto.nombre)}">${escaparHtml(depto.nombre)}</option>`;
            })
            .join('');

        if (seleccionarNombre !== undefined && seleccionarNombre !== null) {
            select.value = String(seleccionarNombre);
        }

    }

    // =====================================
    // MUESTRA DE COLOR
    // =====================================

    function actualizarMuestraColor(card) {

        if (!card) return;

        const selColor =
            card.querySelector('.sel-color');

        const muestra =
            card.querySelector('.muestra-color');

        if (!selColor || !muestra) return;

        const opcion =
            selColor.selectedOptions[0];

        if (opcion && opcion.dataset.valor) {
            muestra.style.backgroundColor = opcion.dataset.valor;
        }
        else {
            muestra.style.backgroundColor = '';
        }

    }

    // =====================================
    // CARGAR DÍAS DE UN CALENDARIO
    // =====================================

    // Construye el <tr> de un día (fila de la tabla).
    function crearFilaDia(fila) {

        const tr =
            document.createElement('tr');

        tr.dataset.fecha = fila.fecha;
        tr.dataset.motivoId = fila.motivo_id;
        tr.dataset.motivoNombre = fila.motivo_nombre != null ? fila.motivo_nombre : '';
        tr.dataset.colorId = fila.color_id;

        // Celda Motivo (vacía si el motivo fue borrado del catálogo).
        const celdaMotivo =
            fila.motivo_nombre != null
                ? escaparHtml(fila.motivo_nombre)
                : '';

        // Celda Color: solo se interpola color_valor (ya validado por
        // el servicio) cuando no es NULL; si es NULL, recuadro vacío.
        let celdaColor = '';

        if (fila.color_valor != null) {

            celdaColor =
                `<span class="muestra-color" style="background-color: ${fila.color_valor}"></span>`
                + escaparHtml(fila.color_nombre);

        }
        else {

            celdaColor =
                '<span class="muestra-color"></span>';

        }

        tr.innerHTML = `
            <td>${escaparHtml(fila.fecha)}</td>
            <td>${celdaMotivo}</td>
            <td>${celdaColor}</td>
            <td class="text-end">

                <button
                    type="button"
                    class="btn btn-sm btn-outline-primary btn-editar-dia"
                    data-id="${fila.id}"
                    title="Editar">

                    <i class="bi bi-pencil-fill"></i>

                </button>

                <button
                    type="button"
                    class="btn btn-sm btn-outline-danger btn-eliminar-dia"
                    data-id="${fila.id}"
                    title="Eliminar">

                    <i class="bi bi-trash-fill"></i>

                </button>

            </td>
        `;

        return tr;

    }

    // Dibuja los controles de paginación de la lista de días de un calendario.
    function renderPaginacionDias(cal, totalFilas, totalPaginas, paginaActual) {

        const contenedor =
            document.getElementById('paginacionDias-' + cal.id);

        if (!contenedor) return;

        const porPagina =
            tamanoPagina(cal);

        const info =
            contenedor.querySelector('.info-paginacion-dias');

        const lista =
            contenedor.querySelector('.lista-paginacion-dias');

        // Mostrar el contenedor (estaba oculto en el markup).
        contenedor.style.display = 'flex';

        if (info) {

            const inicio =
                (paginaActual - 1) * porPagina + 1;

            const fin =
                Math.min(paginaActual * porPagina, totalFilas);

            info.textContent =
                `Mostrando ${inicio}-${fin} de ${totalFilas} días`;

        }

        if (!lista) return;

        lista.innerHTML = '';

        // Con una sola página no mostramos botones de navegación.
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
                    paginaPorCalendario.set(cal.clave, pagina);
                    if (esCalendarioServiciosWeb(cal)) {
                        cargarDominios(cal);
                    }
                    else {
                        cargarDias(cal);
                    }
                });
            }

            li.appendChild(boton);
            lista.appendChild(li);

        };

        crearItem(
            '&laquo;',
            paginaActual - 1,
            { deshabilitado: paginaActual === 1 }
        );

        for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
            crearItem(
                String(pagina),
                pagina,
                { activo: pagina === paginaActual }
            );
        }

        crearItem(
            '&raquo;',
            paginaActual + 1,
            { deshabilitado: paginaActual === totalPaginas }
        );

    }

    async function cargarDias(cal) {

        const tbody =
            document.getElementById('tablaDias-' + cal.id);

        if (!tbody) return;

        const contenedorPaginacion =
            document.getElementById('paginacionDias-' + cal.id);

        try {

            const rows =
                await calendariosService.obtenerDiasPorCalendario(cal.clave);

            tbody.innerHTML = '';

            if (!rows.length) {

                tbody.innerHTML = `
                    <tr>
                        <td colspan="4" class="text-center text-muted py-4">
                            No hay días registrados.
                        </td>
                    </tr>
                `;

                // Sin días: ocultar la paginación.
                if (contenedorPaginacion) {
                    contenedorPaginacion.style.display = 'none';
                }

                return;

            }

            // Si este calendario no pagina, renderiza todas las filas.
            if (!calendarioPagina(cal)) {

                rows.forEach((fila) => {
                    tbody.appendChild(crearFilaDia(fila));
                });

                return;

            }

            // ----- Calendario con paginación -----
            const porPagina = tamanoPagina(cal);

            const totalFilas = rows.length;

            const totalPaginas = Math.max(
                1,
                Math.ceil(totalFilas / porPagina)
            );

            let paginaActual =
                paginaPorCalendario.get(cal.clave) || 1;

            // Mantener la página dentro de rango (p.ej. tras eliminar).
            if (paginaActual > totalPaginas) paginaActual = totalPaginas;
            if (paginaActual < 1) paginaActual = 1;

            paginaPorCalendario.set(cal.clave, paginaActual);

            const inicio =
                (paginaActual - 1) * porPagina;

            const paginaFilas =
                rows.slice(inicio, inicio + porPagina);

            paginaFilas.forEach((fila) => {
                tbody.appendChild(crearFilaDia(fila));
            });

            renderPaginacionDias(
                cal,
                totalFilas,
                totalPaginas,
                paginaActual
            );

        }
        catch (error) {

            console.error(
                'Error cargando días del calendario:',
                error
            );

        }

    }

    // =====================================
    // CARGAR DOMINIOS (SERVICIOS WEB)
    // =====================================

    // Lee el valor (trim) de un input de la card por selector.
    function valorInput(card, selector) {
        const el = card ? card.querySelector(selector) : null;
        return el ? el.value : '';
    }

    // Asigna un valor a un input de la card por selector.
    function asignarInput(card, selector, valor) {
        const el = card ? card.querySelector(selector) : null;
        if (el) {
            el.value = valor == null ? '' : String(valor);
        }
    }

    // Limpia todos los inputs del formulario de dominio.
    function limpiarFormularioDominio(card) {
        [
            '.inp-dom-dominio',
            '.inp-dom-fecha',
            '.inp-dom-monto',
            '.inp-dom-responsable',
            '.inp-dom-hosting',
            '.inp-dom-certificado',
            '.inp-dom-proveedor',
            '.inp-dom-correo'
        ].forEach((sel) => asignarInput(card, sel, ''));
    }

    // Construye el <tr> de un dominio. Usa escaparHtml (comillas dobles) en los
    // textos y colorPorVencimiento (hex de lista fija) para el punto de color.
    function crearFilaDominio(d, hoyIso) {

        const tr =
            document.createElement('tr');

        const color =
            serviciosWebService.colorPorVencimiento(d.fecha_vencimiento, hoyIso);

        const monto =
            d.monto == null ? '' : Number(d.monto).toFixed(2);

        tr.innerHTML = `
            <td>
                <span
                    class="d-inline-block rounded-circle"
                    style="width:12px;height:12px;background-color: ${color}"></span>
            </td>
            <td>${escaparHtml(d.dominio)}</td>
            <td>${escaparHtml(d.fecha_vencimiento)}</td>
            <td>${escaparHtml(d.responsable)}</td>
            <td>${escaparHtml(d.hosting)}</td>
            <td>${escaparHtml(monto)}</td>
            <td class="text-end">

                <button
                    type="button"
                    class="btn btn-sm btn-outline-primary btn-editar-dominio"
                    data-id="${d.id}"
                    title="Editar">

                    <i class="bi bi-pencil-fill"></i>

                </button>

                <button
                    type="button"
                    class="btn btn-sm btn-outline-danger btn-eliminar-dominio"
                    data-id="${d.id}"
                    title="Eliminar">

                    <i class="bi bi-trash-fill"></i>

                </button>

            </td>
        `;

        return tr;

    }

    // Carga la tabla de dominios de la card de Servicios Web. Análoga a
    // cargarDias: pagina con el mismo patrón y degrada a console.error.
    async function cargarDominios(cal) {

        const tbody =
            document.getElementById('tablaDominios-' + cal.id);

        if (!tbody) return;

        const contenedorPaginacion =
            document.getElementById('paginacionDias-' + cal.id);

        // hoyIso local para el color por proximidad.
        const hoy = new Date();
        const hoyIso =
            hoy.getFullYear()
            + '-' + String(hoy.getMonth() + 1).padStart(2, '0')
            + '-' + String(hoy.getDate()).padStart(2, '0');

        try {

            const rows =
                await serviciosWebService.obtenerDominios();

            tbody.innerHTML = '';

            if (!rows.length) {

                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" class="text-center text-muted py-4">
                            No hay dominios registrados.
                        </td>
                    </tr>
                `;

                if (contenedorPaginacion) {
                    contenedorPaginacion.style.display = 'none';
                }

                return;

            }

            if (!calendarioPagina(cal)) {

                rows.forEach((fila) => {
                    tbody.appendChild(crearFilaDominio(fila, hoyIso));
                });

                return;

            }

            const porPagina = tamanoPagina(cal);

            const totalFilas = rows.length;

            const totalPaginas = Math.max(
                1,
                Math.ceil(totalFilas / porPagina)
            );

            let paginaActual =
                paginaPorCalendario.get(cal.clave) || 1;

            if (paginaActual > totalPaginas) paginaActual = totalPaginas;
            if (paginaActual < 1) paginaActual = 1;

            paginaPorCalendario.set(cal.clave, paginaActual);

            const inicio =
                (paginaActual - 1) * porPagina;

            const paginaFilas =
                rows.slice(inicio, inicio + porPagina);

            paginaFilas.forEach((fila) => {
                tbody.appendChild(crearFilaDominio(fila, hoyIso));
            });

            renderPaginacionDias(
                cal,
                totalFilas,
                totalPaginas,
                paginaActual
            );

        }
        catch (error) {

            console.error(
                'Error cargando dominios del calendario:',
                error
            );

        }

    }

    // =====================================
    // CARGAR AJUSTES DE NOTIFICACIÓN
    // =====================================

    // Pinta una fila de la tabla de notificaciones. En compras la fila se
    // identifica por data-motivo-id; en mantenimientos por data-depto-nombre.
    // Los valores salen del ajuste casado o de DEFAULTS_NOTIFICACION.
    function crearFilaNotificacion(cal, etiqueta, ajuste, identificador) {

        const esDeptos =
            esCalendarioDepartamentos(cal);

        const activo =
            ajuste ? ajuste.activo : DEFAULTS_NOTIFICACION.activo;

        const diasAntelacion =
            ajuste ? ajuste.dias_antelacion : DEFAULTS_NOTIFICACION.dias_antelacion;

        const horaRecordatorio =
            ajuste ? ajuste.hora_recordatorio : DEFAULTS_NOTIFICACION.hora_recordatorio;

        const repetirCadaHoras =
            ajuste ? ajuste.repetir_cada_horas : DEFAULTS_NOTIFICACION.repetir_cada_horas;

        const recordarDiasPrevios =
            ajuste ? ajuste.recordar_dias_previos : DEFAULTS_NOTIFICACION.recordar_dias_previos;

        const tr =
            document.createElement('tr');

        // Atributo identificador según el modo del calendario.
        const attrId =
            esDeptos
                ? `data-depto-nombre="${escaparHtml(identificador)}"`
                : `data-motivo-id="${escaparHtml(identificador)}"`;

        const attrBoton =
            esDeptos
                ? `data-depto-nombre="${escaparHtml(identificador)}"`
                : `data-motivo-id="${escaparHtml(identificador)}"`;

        tr.innerHTML = `
            <td ${attrId}>${escaparHtml(etiqueta)}</td>
            <td class="text-center">
                <input
                    type="checkbox"
                    class="form-check-input notif-activo"
                    ${Number(activo) ? 'checked' : ''} />
            </td>
            <td>
                <input
                    type="number"
                    class="form-control form-control-sm notif-dias"
                    min="0"
                    max="365"
                    value="${escaparHtml(diasAntelacion)}" />
            </td>
            <td>
                <input
                    type="time"
                    class="form-control form-control-sm notif-hora"
                    value="${escaparHtml(horaRecordatorio)}" />
            </td>
            <td>
                <input
                    type="number"
                    class="form-control form-control-sm notif-repetir"
                    min="0"
                    max="24"
                    value="${escaparHtml(repetirCadaHoras)}" />
            </td>
            <td class="text-center">
                <input
                    type="checkbox"
                    class="form-check-input notif-previos"
                    title="Recordar cada día previo"
                    ${Number(recordarDiasPrevios) ? 'checked' : ''} />
            </td>
            <td class="text-end">
                <button
                    type="button"
                    class="btn btn-sm btn-success btn-guardar-notif"
                    data-cal-id="${cal.id}"
                    data-clave="${escaparHtml(cal.clave)}"
                    ${attrBoton}>
                    Guardar
                </button>
            </td>
        `;

        return tr;

    }

    // Carga los ajustes de notificación de un calendario en su tabla.
    // Análoga a cargarDias: una fila por motivo (compras) o departamento
    // (mantenimientos), poblada con el ajuste guardado o con los defaults.
    async function cargarAjustesNotificacion(cal) {

        const tbody =
            document.getElementById('notifTbody-' + cal.id);

        if (!tbody) return;

        // Servicios Web tiene UN único ajuste (motivo_id = 0, "todos los
        // dominios"): una sola fila, en vez de una por motivo/departamento.
        if (esCalendarioServiciosWeb(cal)) {

            try {

                const ajustes =
                    await calendariosService.obtenerAjustesNotificacion(cal.clave);

                const aj =
                    (ajustes || []).find((a) => Number(a.motivo_id) === 0) || null;

                tbody.innerHTML = '';

                tbody.appendChild(
                    crearFilaNotificacion(cal, 'Todos los dominios', aj, 0)
                );

            }
            catch (error) {

                console.error(
                    'Error cargando ajustes de notificación (servicios_web):',
                    error
                );

            }

            return;

        }

        const esDeptos =
            esCalendarioDepartamentos(cal);

        try {

            const ajustes =
                await calendariosService.obtenerAjustesNotificacion(cal.clave);

            // Mapa de ajustes guardados por motivo_id (compras) o por
            // motivo_nombre (mantenimientos, que usan nombre de departamento).
            const ajustesPorClave = new Map();

            (ajustes || []).forEach((aj) => {

                if (esDeptos) {
                    ajustesPorClave.set(aj.motivo_nombre, aj);
                }
                else {
                    ajustesPorClave.set(String(aj.motivo_id), aj);
                }

            });

            tbody.innerHTML = '';

            const catalogo =
                esDeptos ? departamentos : motivos;

            if (!catalogo || !catalogo.length) {

                tbody.innerHTML = `
                    <tr>
                        <td colspan="7" class="text-center text-muted py-3">
                            No hay ${esDeptos ? 'departamentos' : 'motivos'} configurables.
                        </td>
                    </tr>
                `;

                return;

            }

            catalogo.forEach((entrada) => {

                if (esDeptos) {

                    const ajuste =
                        ajustesPorClave.get(entrada.nombre);

                    tbody.appendChild(
                        crearFilaNotificacion(cal, entrada.nombre, ajuste, entrada.nombre)
                    );

                }
                else {

                    const ajuste =
                        ajustesPorClave.get(String(entrada.id));

                    tbody.appendChild(
                        crearFilaNotificacion(cal, entrada.nombre, ajuste, entrada.id)
                    );

                }

            });

        }
        catch (error) {

            console.error(
                'Error cargando ajustes de notificación:',
                error
            );

        }

    }

    // =====================================
    // RECARGA DE CATÁLOGOS
    // =====================================

    async function recargarMotivos() {

        motivos =
            await calendariosService.obtenerMotivos();

    }

    async function recargarColores() {

        colores =
            await calendariosService.obtenerColores();

    }

    // Recarga departamentos (gestion.service) y el mapeo departamento->color.
    // Asegura que cada departamento tenga un color inicial distinto asignado.
    async function recargarDepartamentosYColores() {

        departamentos =
            await gestionService.obtenerDepartamentos();

        // Asignación automática inicial: un color distinto por departamento.
        await calendariosService.asegurarColoresParaDepartamentos(
            departamentos.map((d) => d.nombre)
        );

        // Recargar el catálogo de colores (puede haber crecido con los nuevos).
        colores =
            await calendariosService.obtenerColores();

        const mapeos =
            await calendariosService.obtenerColoresDepartamentos();

        coloresPorDepartamento = new Map();

        mapeos.forEach((m) => {
            coloresPorDepartamento.set(m.departamento, {
                color_id: m.color_id,
                color_valor: m.color_valor,
                color_nombre: m.color_nombre
            });
        });

    }

    // Garantiza que un departamento tenga color asignado. Si no lo tiene,
    // elige el color del catálogo menos usado por otros departamentos (para
    // que queden distintos) y lo persiste. Devuelve el color_id asignado.
    async function asegurarColorDepartamento(nombreDepto) {

        const actual =
            coloresPorDepartamento.get(nombreDepto);

        if (actual && actual.color_id) {
            return actual.color_id;
        }

        // Si el departamento aún no tiene color propio, dejar que el servicio
        // le genere uno (color exclusivo de departamento, nunca un color base).
        await calendariosService.asegurarColoresParaDepartamentos([nombreDepto]);

        const mapeo =
            await calendariosService.obtenerColorDepartamento(nombreDepto);

        if (!mapeo || !mapeo.color_id) {
            throw new Error('No se pudo asignar un color al departamento.');
        }

        coloresPorDepartamento.set(nombreDepto, {
            color_id: mapeo.color_id,
            color_valor: mapeo.color_valor,
            color_nombre: mapeo.color_nombre
        });

        return mapeo.color_id;

    }

    function repoblarTodosLosMotivos(root) {

        root
            .querySelectorAll('.sel-motivo')
            .forEach((select) => {

                const valorActual = select.value;

                poblarSelectMotivos(select, motivos, valorActual);

            });

    }

    function repoblarTodosLosColores(root) {

        root
            .querySelectorAll('.sel-color')
            .forEach((select) => {

                const valorActual = select.value;

                poblarSelectColores(select, colores, valorActual);

            });

    }

    // =====================================
    // INIT
    // =====================================

    async function initCalendarios() {

        const root =
            document.getElementById('calendariosAdminRoot');

        if (!root) {
            return false;
        }

        console.log('[calendarios] initCalendarios listo');

        // Evita registrar los listeners más de una vez.
        if (root.dataset.listo === 'true') {
            return true;
        }

        root.dataset.listo = 'true';

        // Carga de catálogos una sola vez.
        motivos =
            await calendariosService.obtenerMotivos();

        colores =
            await calendariosService.obtenerColores();

        // Departamentos y su mapeo de color (para el calendario mantenimientos).
        await recargarDepartamentosYColores();

        // =====================================
        // LISTENER DELEGADO: CLICK
        // =====================================

        root.addEventListener(
            'click',
            async (e) => {

                // ----- Expandir / ocultar tarjeta -----
                const btnToggle =
                    e.target.closest('.btn-toggle-card');

                if (btnToggle) {

                    e.preventDefault();

                    const card =
                        btnToggle.closest('.card');

                    const body =
                        card ? card.querySelector('.card-body') : null;

                    if (!body) return;

                    const oculto =
                        body.style.display === 'none';

                    // Alternar visibilidad del contenido.
                    body.style.display = oculto ? '' : 'none';

                    btnToggle.setAttribute(
                        'aria-expanded',
                        oculto ? 'true' : 'false'
                    );

                    // Cambiar el ícono (flecha arriba = expandido).
                    const icono = btnToggle.querySelector('i');

                    if (icono) {
                        icono.className = oculto
                            ? 'bi bi-chevron-up'
                            : 'bi bi-chevron-down';
                    }

                    return;

                }

                // ----- Expandir / ocultar panel de notificaciones -----
                const btnToggleNotif =
                    e.target.closest('.btn-toggle-notif');

                if (btnToggleNotif) {

                    e.preventDefault();

                    const caja =
                        btnToggleNotif.closest('.notif-box');

                    const panel =
                        caja ? caja.querySelector('.notif-panel') : null;

                    if (!panel) return;

                    const oculto =
                        panel.style.display === 'none';

                    panel.style.display = oculto ? '' : 'none';

                    btnToggleNotif.setAttribute(
                        'aria-expanded',
                        oculto ? 'true' : 'false'
                    );

                    const icono = btnToggleNotif.querySelector('i');

                    if (icono) {
                        icono.className = oculto
                            ? 'bi bi-chevron-up'
                            : 'bi bi-chevron-down';
                    }

                    return;

                }

                // ----- Guardar ajuste de notificación -----
                const btnGuardarNotif =
                    e.target.closest('.btn-guardar-notif');

                if (btnGuardarNotif) {

                    e.preventDefault();

                    const tr =
                        btnGuardarNotif.closest('tr');

                    if (!tr) return;

                    const clave =
                        btnGuardarNotif.dataset.clave;

                    const esDeptos =
                        clave === CLAVE_CAL_DEPARTAMENTOS;

                    const inpActivo =
                        tr.querySelector('.notif-activo');

                    const inpDias =
                        tr.querySelector('.notif-dias');

                    const inpHora =
                        tr.querySelector('.notif-hora');

                    const inpRepetir =
                        tr.querySelector('.notif-repetir');

                    const inpPrevios =
                        tr.querySelector('.notif-previos');

                    // El motivo es el id del motivo (compras) o el nombre del
                    // departamento (mantenimientos); el servicio resuelve este
                    // último con asegurarMotivoPorNombre.
                    const motivo =
                        esDeptos
                            ? btnGuardarNotif.dataset.deptoNombre
                            : btnGuardarNotif.dataset.motivoId;

                    // Hora vacía -> default del diseño.
                    const horaRecordatorio =
                        inpHora && inpHora.value
                            ? inpHora.value
                            : DEFAULTS_NOTIFICACION.hora_recordatorio;

                    const ajuste = {
                        calendario: clave,
                        motivo: motivo,
                        activo: inpActivo ? inpActivo.checked : false,
                        dias_antelacion: inpDias ? inpDias.value : DEFAULTS_NOTIFICACION.dias_antelacion,
                        hora_recordatorio: horaRecordatorio,
                        repetir_cada_horas: inpRepetir ? inpRepetir.value : DEFAULTS_NOTIFICACION.repetir_cada_horas,
                        recordar_dias_previos: inpPrevios ? inpPrevios.checked : false
                    };

                    try {

                        await calendariosService.guardarAjusteNotificacion(ajuste);

                        alert('Ajustes guardados.');

                    }
                    catch (error) {

                        console.error(error);

                        alert(error.message);

                    }

                    return;

                }

                // ----- Guardar descripción -----
                const btnGuardarDesc =
                    e.target.closest('.btn-guardar-desc');

                if (btnGuardarDesc) {

                    e.preventDefault();

                    try {

                        const clave =
                            btnGuardarDesc.dataset.clave;

                        const input =
                            document.getElementById('descCal-' + btnGuardarDesc.dataset.id);

                        const valor =
                            input ? input.value : '';

                        await calendariosService.actualizarDescripcionCalendario(
                            clave,
                            valor
                        );

                        alert('Descripción guardada.');

                    }
                    catch (error) {

                        console.error(error);

                        alert(error.message);

                    }

                    return;

                }

                // ----- Mostrar formulario de nuevo motivo -----
                const btnAddMotivo =
                    e.target.closest('.btn-add-motivo');

                if (btnAddMotivo) {

                    e.preventDefault();

                    const card =
                        btnAddMotivo.closest('.card');

                    const caja =
                        card ? card.querySelector('.nuevo-motivo-box') : null;

                    const input =
                        card ? card.querySelector('.inp-nuevo-motivo') : null;

                    if (caja) {
                        caja.style.display = 'flex';
                    }

                    if (input) {
                        input.value = '';
                        input.focus();
                    }

                    return;

                }

                // ----- Cancelar nuevo motivo -----
                const btnCancelarMotivo =
                    e.target.closest('.btn-cancelar-motivo');

                if (btnCancelarMotivo) {

                    e.preventDefault();

                    const card =
                        btnCancelarMotivo.closest('.card');

                    const caja =
                        card ? card.querySelector('.nuevo-motivo-box') : null;

                    if (caja) {
                        caja.style.display = 'none';
                    }

                    return;

                }

                // ----- Guardar nuevo motivo -----
                const btnGuardarMotivo =
                    e.target.closest('.btn-guardar-motivo');

                if (btnGuardarMotivo) {

                    e.preventDefault();

                    const card =
                        btnGuardarMotivo.closest('.card');

                    const input =
                        card ? card.querySelector('.inp-nuevo-motivo') : null;

                    const nombre =
                        input ? input.value.trim() : '';

                    if (nombre === '') {
                        alert('Escribe un nombre para el motivo.');
                        if (input) input.focus();
                        return;
                    }

                    try {

                        const resultado =
                            await calendariosService.crearMotivo(nombre);

                        await recargarMotivos();

                        repoblarTodosLosMotivos(root);

                        // Seleccionar el nuevo en la card activa y ocultar la caja.
                        const selMotivo =
                            card ? card.querySelector('.sel-motivo') : null;

                        if (selMotivo && resultado && resultado.id) {
                            selMotivo.value = String(resultado.id);
                        }

                        const caja =
                            card ? card.querySelector('.nuevo-motivo-box') : null;

                        if (caja) {
                            caja.style.display = 'none';
                        }

                    }
                    catch (error) {

                        console.error(error);

                        alert(error.message);

                    }

                    return;

                }

                // ----- Mostrar formulario de nuevo color -----
                const btnAddColor =
                    e.target.closest('.btn-add-color');

                if (btnAddColor) {

                    e.preventDefault();

                    const card =
                        btnAddColor.closest('.card');

                    const caja =
                        card ? card.querySelector('.nuevo-color-box') : null;

                    const input =
                        card ? card.querySelector('.inp-nuevo-color') : null;

                    if (caja) {
                        caja.style.display = 'flex';
                    }

                    if (input) {
                        input.value = '';
                        input.focus();
                    }

                    return;

                }

                // ----- Cancelar nuevo color -----
                const btnCancelarColor =
                    e.target.closest('.btn-cancelar-color');

                if (btnCancelarColor) {

                    e.preventDefault();

                    const card =
                        btnCancelarColor.closest('.card');

                    const caja =
                        card ? card.querySelector('.nuevo-color-box') : null;

                    if (caja) {
                        caja.style.display = 'none';
                    }

                    return;

                }

                // ----- Guardar nuevo color -----
                const btnGuardarColor =
                    e.target.closest('.btn-guardar-color');

                if (btnGuardarColor) {

                    e.preventDefault();

                    const card =
                        btnGuardarColor.closest('.card');

                    const inpColor =
                        card ? card.querySelector('.inp-color') : null;

                    const inpNombre =
                        card ? card.querySelector('.inp-nuevo-color') : null;

                    const hex =
                        inpColor ? inpColor.value : '#000000';

                    const etiqueta =
                        inpNombre ? inpNombre.value.trim() : '';

                    if (etiqueta === '') {
                        alert('Escribe un nombre para el color.');
                        if (inpNombre) inpNombre.focus();
                        return;
                    }

                    try {

                        const resultado =
                            await calendariosService.crearColor(etiqueta, hex);

                        await recargarColores();

                        repoblarTodosLosColores(root);

                        // Seleccionar el nuevo en la card activa y repintar su muestra.
                        const selColor =
                            card ? card.querySelector('.sel-color') : null;

                        if (selColor && resultado && resultado.id) {
                            selColor.value = String(resultado.id);
                        }

                        actualizarMuestraColor(card);

                        const caja =
                            card ? card.querySelector('.nuevo-color-box') : null;

                        if (caja) {
                            caja.style.display = 'none';
                        }

                    }
                    catch (error) {

                        console.error(error);

                        alert(error.message);

                    }

                    return;

                }

                // ----- Guardar / actualizar día -----
                const btnGuardarDia =
                    e.target.closest('.btn-guardar-dia');

                if (btnGuardarDia) {

                    e.preventDefault();

                    const card =
                        btnGuardarDia.closest('.card');

                    if (!card) return;

                    const clave =
                        btnGuardarDia.dataset.clave;

                    const esDeptos =
                        clave === CLAVE_CAL_DEPARTAMENTOS;

                    const selMotivo =
                        card.querySelector('.sel-motivo');

                    const selColor =
                        card.querySelector('.sel-color');

                    const inpFecha =
                        card.querySelector('.inp-fecha');

                    const fecha =
                        inpFecha ? inpFecha.value : '';

                    const editando =
                        Boolean(btnGuardarDia.dataset.editId);

                    try {

                        let motivo;
                        let color;

                        if (esDeptos) {

                            // El "motivo" es el departamento elegido: resolver/crear
                            // su motivo por nombre para reutilizar motivo_id.
                            const nombreDepto =
                                selMotivo ? selMotivo.value : '';

                            if (!nombreDepto) {
                                throw new Error('Debe seleccionar un departamento.');
                            }

                            motivo =
                                await calendariosService.asegurarMotivoPorNombre(nombreDepto);

                            if (editando) {

                                // Al editar, el color se toma del selector visible.
                                color = selColor ? selColor.value : '';

                            }
                            else {

                                // Al crear, color automático del departamento.
                                color =
                                    await asegurarColorDepartamento(nombreDepto);

                            }

                        }
                        else {

                            // Calendarios normales: motivo y color de los selects.
                            motivo = selMotivo ? selMotivo.value : '';
                            color = selColor ? selColor.value : '';

                        }

                        if (editando) {

                            await calendariosService.actualizarDia(
                                btnGuardarDia.dataset.editId,
                                {
                                    fecha: fecha,
                                    motivo: motivo,
                                    color: color
                                }
                            );

                        }
                        else {

                            await calendariosService.crearDia({
                                calendario: clave,
                                fecha: fecha,
                                motivo: motivo,
                                color: color
                            });

                        }

                        // Éxito: restaurar modo alta.
                        delete btnGuardarDia.dataset.editId;
                        btnGuardarDia.textContent = 'Guardar';

                        if (inpFecha) {
                            inpFecha.value = '';
                        }

                        // En modo departamentos, re-ocultar el bloque de color.
                        if (esDeptos) {
                            const colColor = card.querySelector('.col-color');
                            if (colColor) colColor.style.display = 'none';
                        }

                        const cal = {
                            id: card.dataset.id,
                            clave: card.dataset.clave
                        };

                        await cargarDias(cal);

                    }
                    catch (error) {

                        console.error(error);

                        alert(error.message);

                        // Se mantiene el modo edición para corregir.

                    }

                    return;

                }

                // ----- Editar día -----
                const btnEditarDia =
                    e.target.closest('.btn-editar-dia');

                if (btnEditarDia) {

                    e.preventDefault();

                    const card =
                        btnEditarDia.closest('.card');

                    const tr =
                        btnEditarDia.closest('tr');

                    if (!card || !tr) return;

                    const selMotivo =
                        card.querySelector('.sel-motivo');

                    const selColor =
                        card.querySelector('.sel-color');

                    const inpFecha =
                        card.querySelector('.inp-fecha');

                    const btnGuardar =
                        card.querySelector('.btn-guardar-dia');

                    const esDeptos =
                        card.dataset.clave === CLAVE_CAL_DEPARTAMENTOS;

                    if (inpFecha) {
                        inpFecha.value = tr.dataset.fecha;
                    }

                    if (selMotivo) {

                        // En modo departamentos el select usa nombres; en modo
                        // normal usa el id del motivo.
                        selMotivo.value = esDeptos
                            ? tr.dataset.motivoNombre
                            : tr.dataset.motivoId;

                    }

                    if (selColor) {
                        selColor.value = tr.dataset.colorId;
                    }

                    // Al editar en modo departamentos, mostrar el bloque Color
                    // para poder cambiarlo puntualmente en este registro.
                    if (esDeptos) {
                        const colColor = card.querySelector('.col-color');
                        if (colColor) colColor.style.display = '';
                    }

                    actualizarMuestraColor(card);

                    if (btnGuardar) {
                        btnGuardar.dataset.editId = btnEditarDia.dataset.id;
                        btnGuardar.textContent = 'Actualizar';
                    }

                    return;

                }

                // ----- Eliminar día -----
                const btnEliminarDia =
                    e.target.closest('.btn-eliminar-dia');

                if (btnEliminarDia) {

                    e.preventDefault();

                    const confirmado =
                        confirm('¿Eliminar este día?');

                    if (!confirmado) return;

                    try {

                        await calendariosService.eliminarDia(
                            btnEliminarDia.dataset.id
                        );

                        const card =
                            btnEliminarDia.closest('.card');

                        if (card) {

                            const cal = {
                                id: card.dataset.id,
                                clave: card.dataset.clave
                            };

                            await cargarDias(cal);

                        }

                    }
                    catch (error) {

                        console.error(error);

                        alert(error.message);

                    }

                    return;

                }

                // ----- Guardar / actualizar dominio (Servicios Web) -----
                const btnGuardarDominio =
                    e.target.closest('.btn-guardar-dominio');

                if (btnGuardarDominio) {

                    e.preventDefault();

                    const card =
                        btnGuardarDominio.closest('.card');

                    if (!card) return;

                    const datos = {
                        dominio: valorInput(card, '.inp-dom-dominio'),
                        fecha_vencimiento: valorInput(card, '.inp-dom-fecha'),
                        monto: valorInput(card, '.inp-dom-monto'),
                        responsable: valorInput(card, '.inp-dom-responsable'),
                        hosting: valorInput(card, '.inp-dom-hosting'),
                        certificado: valorInput(card, '.inp-dom-certificado'),
                        proveedor: valorInput(card, '.inp-dom-proveedor'),
                        correo_contacto: valorInput(card, '.inp-dom-correo')
                    };

                    const editando =
                        Boolean(btnGuardarDominio.dataset.editId);

                    try {

                        if (editando) {
                            await serviciosWebService.actualizarDominio(
                                btnGuardarDominio.dataset.editId,
                                datos
                            );
                        }
                        else {
                            await serviciosWebService.crearDominio(datos);
                        }

                        // Éxito: restaurar modo alta y limpiar el formulario.
                        delete btnGuardarDominio.dataset.editId;
                        btnGuardarDominio.textContent = 'Guardar';
                        limpiarFormularioDominio(card);

                        const cal = {
                            id: card.dataset.id,
                            clave: card.dataset.clave
                        };

                        await cargarDominios(cal);

                    }
                    catch (error) {

                        console.error(error);

                        alert(error.message);

                    }

                    return;

                }

                // ----- Editar dominio -----
                const btnEditarDominio =
                    e.target.closest('.btn-editar-dominio');

                if (btnEditarDominio) {

                    e.preventDefault();

                    const card =
                        btnEditarDominio.closest('.card');

                    if (!card) return;

                    try {

                        const dominios =
                            await serviciosWebService.obtenerDominios();

                        const d =
                            (dominios || []).find(
                                (x) => String(x.id) === String(btnEditarDominio.dataset.id)
                            );

                        if (!d) {
                            alert('El dominio ya no existe.');
                            await cargarDominios({
                                id: card.dataset.id,
                                clave: card.dataset.clave
                            });
                            return;
                        }

                        asignarInput(card, '.inp-dom-dominio', d.dominio);
                        asignarInput(card, '.inp-dom-fecha', d.fecha_vencimiento);
                        asignarInput(card, '.inp-dom-monto', d.monto == null ? '' : d.monto);
                        asignarInput(card, '.inp-dom-responsable', d.responsable);
                        asignarInput(card, '.inp-dom-hosting', d.hosting);
                        asignarInput(card, '.inp-dom-certificado', d.certificado);
                        asignarInput(card, '.inp-dom-proveedor', d.proveedor);
                        asignarInput(card, '.inp-dom-correo', d.correo_contacto);

                        const btnGuardar =
                            card.querySelector('.btn-guardar-dominio');

                        if (btnGuardar) {
                            btnGuardar.dataset.editId = btnEditarDominio.dataset.id;
                            btnGuardar.textContent = 'Actualizar';
                        }

                    }
                    catch (error) {

                        console.error(error);

                        alert(error.message);

                    }

                    return;

                }

                // ----- Eliminar dominio -----
                const btnEliminarDominio =
                    e.target.closest('.btn-eliminar-dominio');

                if (btnEliminarDominio) {

                    e.preventDefault();

                    const confirmado =
                        confirm('¿Eliminar este dominio?');

                    if (!confirmado) return;

                    try {

                        await serviciosWebService.eliminarDominio(
                            btnEliminarDominio.dataset.id
                        );

                        const card =
                            btnEliminarDominio.closest('.card');

                        if (card) {

                            const cal = {
                                id: card.dataset.id,
                                clave: card.dataset.clave
                            };

                            await cargarDominios(cal);

                        }

                    }
                    catch (error) {

                        console.error(error);

                        alert(error.message);

                    }

                    return;

                }

            }
        );

        // =====================================
        // LISTENER DELEGADO: CHANGE
        // =====================================

        root.addEventListener(
            'change',
            async (e) => {

                const selColor =
                    e.target.closest('.sel-color');

                if (selColor) {

                    const card =
                        selColor.closest('.card');

                    actualizarMuestraColor(card);

                    return;

                }

            }
        );

        // =====================================
        // CARGA DE CALENDARIOS
        // =====================================

        const calendarios =
            await calendariosService.obtenerCalendarios();

        for (const cal of calendarios) {

            const card =
                crearCardCalendario(cal);

            root.appendChild(card);

            if (esCalendarioServiciosWeb(cal)) {
                await cargarDominios(cal);
                await cargarAjustesNotificacion(cal);
            }
            else {
                await cargarDias(cal);
                await cargarAjustesNotificacion(cal);
            }

        }

        return true;

    }

    // =====================================
    // ESPERAR A QUE EL FRAGMENTO EXISTA
    // =====================================

    function waitForCalendariosRoot() {

        const rootId = 'calendariosAdminRoot';

        if (
            document.getElementById(rootId)
        ) {

            initCalendarios();
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
                    initCalendarios();

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

        waitForCalendariosRoot();

    }

})();
