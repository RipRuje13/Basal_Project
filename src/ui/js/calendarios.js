(function () {

    const calendariosService = require('../../services/calendarios.service');
    const gestionService = require('../../services/gestion.service');

    // ================================
    // CALENDARIOS (administración)
    // ================================

    // Clave del calendario que usa departamentos (en lugar de motivos libres)
    // y color automático por departamento.
    const CLAVE_CAL_DEPARTAMENTOS = 'mantenimientos';

    // Catálogos cacheados a nivel de IIFE (ver §5.4):
    // initCalendarios los rellena y recargarMotivos/recargarColores los reasignan.
    let motivos = [];
    let colores = [];

    // Departamentos (de gestion.service) y su mapeo de color asignado.
    let departamentos = [];
    let coloresPorDepartamento = new Map(); // nombre depto -> { color_id, color_valor, color_nombre }

    function esCalendarioDepartamentos(cal) {
        return cal.clave === CLAVE_CAL_DEPARTAMENTOS;
    }

    // =====================================
    // PAGINACIÓN DE LA LISTA DE DÍAS
    // =====================================
    // Tamaño de página por calendario (clave -> registros por página).
    // Un calendario que no aparezca aquí NO pagina (muestra todos sus días).
    const PAGINA_POR_CLAVE = {
        compras_mensuales: 7,
        compras_bimestrales: 5,
        mantenimientos: 5
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
                    cargarDias(cal);
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

            await cargarDias(cal);

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
