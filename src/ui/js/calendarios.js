(function () {

    const calendariosService = require('../../services/calendarios.service');

    // ================================
    // CALENDARIOS (administración)
    // ================================

    // Catálogos cacheados a nivel de IIFE (ver §5.4):
    // initCalendarios los rellena y recargarMotivos/recargarColores los reasignan.
    let motivos = [];
    let colores = [];

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
            <div class="card-header">
                ${escaparHtml(cal.nombre)}
            </div>

            <div class="card-body">

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
                            <label class="form-label">Motivo</label>
                            <div class="input-group">
                                <select class="form-select sel-motivo"></select>
                                <button
                                    type="button"
                                    class="btn btn-outline-secondary btn-add-motivo"
                                    title="Agregar motivo">
                                    +
                                </button>
                            </div>
                        </div>

                        <div class="col-md-4">
                            <label class="form-label">Color</label>
                            <div class="input-group">
                                <span class="input-group-text">
                                    <span class="muestra-color"></span>
                                </span>
                                <select class="form-select sel-color"></select>
                                <input
                                    type="color"
                                    class="form-control form-control-color inp-color"
                                    value="#000000"
                                    title="Elegir color nuevo" />
                                <button
                                    type="button"
                                    class="btn btn-outline-secondary btn-add-color"
                                    title="Agregar color">
                                    +
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

            </div>
        `;

        const selMotivo =
            card.querySelector('.sel-motivo');

        const selColor =
            card.querySelector('.sel-color');

        poblarSelectMotivos(selMotivo, motivos);

        poblarSelectColores(selColor, colores);

        // Muestra inicial de color segun el option seleccionado.
        actualizarMuestraColor(card);

        return card;

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

    async function cargarDias(cal) {

        const tbody =
            document.getElementById('tablaDias-' + cal.id);

        if (!tbody) return;

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

                return;

            }

            rows.forEach((fila) => {

                const tr =
                    document.createElement('tr');

                tr.dataset.fecha = fila.fecha;
                tr.dataset.motivoId = fila.motivo_id;
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

                tbody.appendChild(tr);

            });

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

        // =====================================
        // LISTENER DELEGADO: CLICK
        // =====================================

        root.addEventListener(
            'click',
            async (e) => {

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

                // ----- Agregar motivo -----
                const btnAddMotivo =
                    e.target.closest('.btn-add-motivo');

                if (btnAddMotivo) {

                    e.preventDefault();

                    const nombre =
                        prompt('Nombre del nuevo motivo:');

                    if (nombre === null || nombre.trim() === '') {
                        return;
                    }

                    try {

                        const resultado =
                            await calendariosService.crearMotivo(nombre.trim());

                        await recargarMotivos();

                        repoblarTodosLosMotivos(root);

                        // Seleccionar el nuevo en la card activa.
                        const card =
                            btnAddMotivo.closest('.card');

                        const selMotivo =
                            card ? card.querySelector('.sel-motivo') : null;

                        if (selMotivo && resultado && resultado.id) {
                            selMotivo.value = String(resultado.id);
                        }

                    }
                    catch (error) {

                        console.error(error);

                        alert(error.message);

                    }

                    return;

                }

                // ----- Agregar color (Opción A) -----
                const btnAddColor =
                    e.target.closest('.btn-add-color');

                if (btnAddColor) {

                    e.preventDefault();

                    const card =
                        btnAddColor.closest('.card');

                    const inpColor =
                        card ? card.querySelector('.inp-color') : null;

                    // Leer el hex ANTES de abrir el prompt (ver §5.2).
                    const hex =
                        inpColor ? inpColor.value : '#000000';

                    const etiqueta =
                        prompt('Nombre del nuevo color:');

                    if (etiqueta === null || etiqueta.trim() === '') {
                        return;
                    }

                    try {

                        const resultado =
                            await calendariosService.crearColor(etiqueta.trim(), hex);

                        await recargarColores();

                        repoblarTodosLosColores(root);

                        // Seleccionar el nuevo en la card activa y repintar su muestra.
                        const selColor =
                            card ? card.querySelector('.sel-color') : null;

                        if (selColor && resultado && resultado.id) {
                            selColor.value = String(resultado.id);
                        }

                        actualizarMuestraColor(card);

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

                    const selMotivo =
                        card.querySelector('.sel-motivo');

                    const selColor =
                        card.querySelector('.sel-color');

                    const inpFecha =
                        card.querySelector('.inp-fecha');

                    const fecha =
                        inpFecha ? inpFecha.value : '';

                    const motivo =
                        selMotivo ? selMotivo.value : '';

                    const color =
                        selColor ? selColor.value : '';

                    try {

                        if (btnGuardarDia.dataset.editId) {

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

                    if (inpFecha) {
                        inpFecha.value = tr.dataset.fecha;
                    }

                    if (selMotivo) {
                        selMotivo.value = tr.dataset.motivoId;
                    }

                    if (selColor) {
                        selColor.value = tr.dataset.colorId;
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
            (e) => {

                const selColor =
                    e.target.closest('.sel-color');

                if (selColor) {

                    const card =
                        selColor.closest('.card');

                    actualizarMuestraColor(card);

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
