// ================================
// CALENDARIOS — VISTA EN INICIO (DASHBOARD)
// ================================
//
// Vista mensual navegable por cada calendario en la pagina de Inicio.
// Envuelto en una IIFE para aislar su scope del scope global compartido
// entre todos los <script> de la pagina: index.html carga compras.js,
// dashboard.js y este archivo juntos; sin el aislamiento, declaraciones
// de nivel superior con el mismo nombre colisionan
// ("Identifier has already been declared") y el script no se ejecuta.
(function () {

    const calendariosService = require('../../services/calendarios.service');
    const serviciosWebService = require('../../services/serviciosWeb.service');

    // escaparHtml identica a dashboard.js/gestion.js: reemplaza & < > "
    // (NO la comilla simple '), por eso todos los atributos generados por
    // JS van en comillas DOBLES.
    function escaparHtml(valor) {
        return (valor ?? '')
            .toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Nombres de meses y cabecera de dias (semana con inicio en domingo,
    // para coincidir con getDay() 0 = Dom).
    const NOMBRES_MESES = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    const DIAS_SEMANA = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    // Estado de mes POR calendario. Clave canonica: cal.clave (string slug);
    // NUNCA calendario_id, para que una card no navegue el mes de otra.
    // clave -> { anio, mes }  (mes en 1..12)
    const estado = new Map();

    // =====================================
    // HELPERS DE CUADRICULA (puros)
    // =====================================

    // Formatea 'YYYY-MM-DD' a partir de anio, mes (1..12) y dia (1..31).
    function fechaIso(anio, mes, dia) {
        const mm = String(mes).padStart(2, '0');
        const dd = String(dia).padStart(2, '0');
        return String(anio) + '-' + mm + '-' + dd;
    }

    // Normaliza un cambio de mes con Date para manejar el cambio de año sin
    // off-by-one (enero < -> diciembre anterior; diciembre > -> enero siguiente).
    function navegarMes(anio, mes, delta) {
        const d = new Date(anio, (mes - 1) + delta, 1);
        return { anio: d.getFullYear(), mes: d.getMonth() + 1 };
    }

    // =====================================
    // RENDER
    // =====================================

    // Construye el HTML de la tabla del mes para un calendario, usando el
    // indice de marcas (Map fecha -> {color_valor, motivo_nombre}).
    function construirCuadricula(anio, mes, marcas) {
        const primerDiaSemana = new Date(anio, mes - 1, 1).getDay(); // 0 = Dom
        const totalDias = new Date(anio, mes, 0).getDate();

        let html = '<table class="table table-bordered text-center mb-0">';

        html += '<thead><tr>';
        DIAS_SEMANA.forEach((d) => {
            html += '<th>' + d + '</th>';
        });
        html += '</tr></thead>';

        html += '<tbody><tr>';

        // Celdas vacias antes del dia 1.
        for (let i = 0; i < primerDiaSemana; i += 1) {
            html += '<td></td>';
        }

        let columna = primerDiaSemana;

        for (let dia = 1; dia <= totalDias; dia += 1) {

            if (columna === 7) {
                html += '</tr><tr>';
                columna = 0;
            }

            const iso = fechaIso(anio, mes, dia);
            const marca = marcas.get(iso);

            let estilo = '';
            let titulo = '';

            if (marca) {
                // Solo se pinta si el color no fue borrado (color_valor NULL).
                // El hex ya quedo validado en el servicio (/^#[0-9a-f]{6}$/),
                // es seguro interpolarlo en style; nunca se interpola texto
                // de usuario en style.
                if (marca.color_valor) {
                    estilo = ' style="background-color: ' + marca.color_valor + '"';
                }
                if (marca.motivo_nombre) {
                    titulo = ' title="' + escaparHtml(marca.motivo_nombre) + '"';
                }
            }

            html += '<td' + estilo + titulo + '>' + dia + '</td>';

            columna += 1;
        }

        // Celdas vacias para completar la ultima fila.
        while (columna < 7) {
            html += '<td></td>';
            columna += 1;
        }

        html += '</tr></tbody></table>';

        return html;
    }

    // Vuelve a consultar el mes visible de un calendario y re-renderiza SOLO
    // su cuadricula (localizada por el contenedor con data-clave coincidente).
    async function renderCuadricula(clave) {

        const contenedor = document.querySelector(
            '[data-grid-clave="' + clave + '"]'
        );
        if (!contenedor) return;

        const { anio, mes } = estado.get(clave);

        // Actualizar la etiqueta "Mes de Año" de esa card.
        const etiqueta = document.querySelector(
            '[data-label-clave="' + clave + '"]'
        );
        if (etiqueta) {
            etiqueta.textContent = NOMBRES_MESES[mes - 1] + ' ' + anio;
        }

        const marcas = new Map();

        if (clave === 'servicios_web') {

            // Servicios Web: no hay filas en calendario_dias; se pintan los
            // vencimientos de los dominios con color dinámico por proximidad.
            let dominios = [];

            try {
                dominios = await serviciosWebService.obtenerDominiosPorMes(anio, mes);
            }
            catch (error) {
                console.error('Error cargando dominios del calendario:', error);
                dominios = [];
            }

            dominios = Array.isArray(dominios) ? dominios : [];

            // fechaIso tiene firma (anio, mes, dia) con mes en 1..12; se
            // compone hoyIso a partir de un Date local.
            const hoyD = new Date();
            const hoyIso = fechaIso(
                hoyD.getFullYear(),
                hoyD.getMonth() + 1,
                hoyD.getDate()
            );

            dominios.forEach((d) => {
                const fecha = d.fecha_vencimiento;
                const diffNuevo = serviciosWebService.diffEnDiasIso(fecha, hoyIso);
                const previo = marcas.get(fecha);

                // Colisión de fechas: conservar el MÁS urgente (menor diff).
                if (previo && previo.diff !== null
                    && (diffNuevo === null || diffNuevo >= previo.diff)) {
                    return;
                }

                marcas.set(fecha, {
                    color_valor: serviciosWebService.colorPorVencimiento(fecha, hoyIso),
                    motivo_nombre: d.dominio,
                    diff: diffNuevo
                });
            });

        }
        else {

            let dias = [];

            try {
                dias = await calendariosService.obtenerDiasPorCalendarioYMes(
                    clave, anio, mes
                );
            }
            catch (error) {
                console.error('Error cargando dias del calendario:', error);
                dias = [];
            }

            dias = Array.isArray(dias) ? dias : [];

            dias.forEach((d) => {
                marcas.set(d.fecha, {
                    color_valor: d.color_valor,
                    motivo_nombre: d.motivo_nombre
                });
            });

        }

        contenedor.innerHTML = construirCuadricula(anio, mes, marcas);
    }

    // Crea la card (columna Bootstrap) de un calendario y la devuelve como
    // nodo listo para insertar en el root.
    function crearCardCalendario(cal) {

        const clave = cal.clave;
        const titulo = cal.descripcion || cal.nombre || '';

        const col = document.createElement('div');
        col.className = 'col-md-6 col-xl-4';

        const card = document.createElement('div');
        card.className = 'card h-100';

        const header = document.createElement('div');
        header.className =
            'card-header d-flex justify-content-between align-items-center';

        const tituloSpan = document.createElement('span');
        tituloSpan.className = 'fw-semibold';
        tituloSpan.textContent = titulo;

        const nav = document.createElement('div');
        nav.className = 'd-flex align-items-center gap-2';

        const btnAnterior = document.createElement('button');
        btnAnterior.type = 'button';
        btnAnterior.className = 'btn btn-sm btn-outline-secondary';
        btnAnterior.textContent = '‹';
        btnAnterior.setAttribute('data-clave', clave);
        btnAnterior.setAttribute('data-dir', 'anterior');

        const labelMes = document.createElement('small');
        labelMes.className = 'text-muted';
        labelMes.setAttribute('data-label-clave', clave);

        const btnSiguiente = document.createElement('button');
        btnSiguiente.type = 'button';
        btnSiguiente.className = 'btn btn-sm btn-outline-secondary';
        btnSiguiente.textContent = '›';
        btnSiguiente.setAttribute('data-clave', clave);
        btnSiguiente.setAttribute('data-dir', 'siguiente');

        nav.appendChild(btnAnterior);
        nav.appendChild(labelMes);
        nav.appendChild(btnSiguiente);

        header.appendChild(tituloSpan);
        header.appendChild(nav);

        const body = document.createElement('div');
        body.className = 'card-body p-2';

        const grid = document.createElement('div');
        grid.className = 'table-responsive';
        grid.setAttribute('data-grid-clave', clave);

        body.appendChild(grid);

        card.appendChild(header);
        card.appendChild(body);
        col.appendChild(card);

        return col;
    }

    // =====================================
    // INIT
    // =====================================

    async function initCalendariosDashboard() {

        const root = document.getElementById('calendariosDashboardRoot');
        if (!root) return false;

        console.log('[calendariosDashboard] init listo');

        let calendarios = [];

        try {
            calendarios = await calendariosService.obtenerCalendarios();
        }
        catch (error) {
            console.error('Error cargando calendarios:', error);
            calendarios = [];
        }

        calendarios = Array.isArray(calendarios) ? calendarios : [];

        // Si no hay calendarios (no deberia ocurrir por el seed), la seccion
        // queda vacia sin romper el dashboard.
        root.innerHTML = '';
        estado.clear();

        const hoy = new Date();
        const anioActual = hoy.getFullYear();
        const mesActual = hoy.getMonth() + 1;

        for (const cal of calendarios) {
            // Estado inicial: mes actual, por clave canonica.
            estado.set(cal.clave, { anio: anioActual, mes: mesActual });
            root.appendChild(crearCardCalendario(cal));
        }

        // Pintar la cuadricula inicial de cada calendario.
        for (const cal of calendarios) {
            await renderCuadricula(cal.clave);
        }

        return true;
    }

    // =====================================
    // LISTENER DELEGADO DE NAVEGACION
    // =====================================

    function registrarListenerNavegacion() {

        const root = document.getElementById('calendariosDashboardRoot');
        if (!root) return;

        root.addEventListener('click', (e) => {

            const btn = e.target.closest('[data-clave]');
            if (!btn || !root.contains(btn)) return;

            const clave = btn.getAttribute('data-clave');
            const estadoCal = estado.get(clave);
            if (!estadoCal) return;

            const dir = btn.getAttribute('data-dir');
            const delta = dir === 'anterior' ? -1 : 1;

            const siguiente = navegarMes(estadoCal.anio, estadoCal.mes, delta);
            estado.set(clave, siguiente);

            renderCuadricula(clave);
        });
    }

    // =====================================
    // ESPERAR A QUE EL FRAGMENTO EXISTA
    // =====================================

    function waitForCalendariosDashboardRoot() {

        const rootId = 'calendariosDashboardRoot';

        if (document.getElementById(rootId)) {
            registrarListenerNavegacion();
            initCalendariosDashboard();
            return;
        }

        const observer = new MutationObserver(() => {
            if (document.getElementById(rootId)) {
                observer.disconnect();
                registrarListenerNavegacion();
                initCalendariosDashboard();
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
        waitForCalendariosDashboardRoot();
    }

})();
