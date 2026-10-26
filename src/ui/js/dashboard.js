// ================================
// DASHBOARD
// ================================
//
// Envuelto en una IIFE para aislar su scope del scope global compartido
// entre todos los <script> de la pagina. index.html carga compras.js y
// dashboard.js juntos: sin este aislamiento, declaraciones de nivel
// superior con el mismo nombre (comprasService, almacenService, helpers)
// colisionan ("Identifier has already been declared") y el segundo script
// no se ejecuta.
(function () {

    const comprasService = require('../../services/compras.service');
    const almacenService = require('../../services/almacen.service');
    const calendariosService = require('../../services/calendarios.service');
    const actividadesService = require('../../services/actividades.service');
    const serviciosWebService = require('../../services/serviciosWeb.service');

    // Escapado de texto de usuario antes de inyectarlo con innerHTML.
    // Copia textual del helper de compras.js (reemplaza & < > ").
    function escaparHtml(valor) {

        return (valor ?? '')
            .toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

    }

    // =====================================
    // FUNCIONES PURAS DE FECHA / ORDEN (testeables)
    // =====================================

    // Devuelve la fecha local de HOY como 'YYYY-MM-DD'. Único punto que usa
    // new Date() sin argumentos; el resto de la lógica trabaja con cadenas.
    function fechaHoyIso() {
        const hoy = new Date();
        const a = hoy.getFullYear();
        const m = String(hoy.getMonth() + 1).padStart(2, '0');
        const d = String(hoy.getDate()).padStart(2, '0');
        return `${a}-${m}-${d}`;
    }

    // Convierte 'YYYY-MM-DD' a cadena local a partir de un Date construido con
    // el constructor local (sin desfase UTC).
    function aIso(dt) {
        const a = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        return `${a}-${m}-${d}`;
    }

    // Lunes y viernes ('YYYY-MM-DD') de la semana que contiene a fechaIso.
    // lunes = retroceder (getDay()+6)%7 días; viernes = lunes + 4.
    // Pura: solo usa el constructor local new Date(anio, mes-1, dia).
    function limitesSemana(fechaIso) {
        const [a, m, d] = fechaIso.split('-').map(Number);
        const base = new Date(a, m - 1, d);
        const retroceso = (base.getDay() + 6) % 7;
        const lunes = new Date(a, m - 1, d - retroceso);
        const viernes = new Date(a, m - 1, d - retroceso + 4);
        return { lunes: aIso(lunes), viernes: aIso(viernes) };
    }

    // Nombre del día de la semana en español para fechaIso.
    function nombreDiaSemana(fechaIso) {
        const [a, m, d] = fechaIso.split('-').map(Number);
        const dias = [
            'Domingo',
            'Lunes',
            'Martes',
            'Miércoles',
            'Jueves',
            'Viernes',
            'Sábado'
        ];
        return dias[new Date(a, m - 1, d).getDay()];
    }

    // ¿El evento 'YYYY-MM-DD' entra en la agenda? True si cae dentro del rango
    // [max(hoy, lunes), viernes] de la semana de hoy. Comparación por cadena
    // (orden lexicográfico == cronológico). Rechaza formatos inválidos.
    function eventoEntraEnAgenda(fechaEventoIso, hoyIso) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaEventoIso || '')) return false;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(hoyIso || '')) return false;
        const { lunes, viernes } = limitesSemana(hoyIso);
        const inicio = hoyIso > lunes ? hoyIso : lunes;
        return fechaEventoIso >= inicio && fechaEventoIso <= viernes;
    }

    // Peso de prioridad para ordenar actividades: Alta=0, Media=1, Baja=2,
    // cualquier otro (incluye vacío/desconocido) = 3 (al final).
    function pesoPrioridad(prioridad) {
        const p = (prioridad ?? '').toString().trim().toLowerCase();
        if (p === 'alta') return 0;
        if (p === 'media') return 1;
        if (p === 'baja') return 2;
        return 3;
    }

    // Instancias de Chart activas, para destruirlas si initDashboard() corre
    // mas de una vez (evita el error "Canvas is already in use").
    const chartsActivos = {};

    // Paleta coherente (azules + dorado/acento), clonada de reportes.js.
    const PALETA = [
        '#1f3c88',
        '#274bb0',
        '#4f74d1',
        '#7a9ae0',
        '#c9a227',
        '#e0b84c',
        '#2a9d8f',
        '#457b9d',
        '#8d99ae',
        '#e76f51',
        '#6a4c93',
        '#1d7874'
    ];

    function colorEn(indice) {
        return PALETA[indice % PALETA.length];
    }

    function coloresPara(cantidad) {
        const colores = [];
        for (let i = 0; i < cantidad; i += 1) {
            colores.push(colorEn(i));
        }
        return colores;
    }

    // =====================================
    // HELPERS DEFENSIVOS
    // =====================================

    function toNumero(valor) {
        const n = Number(valor);
        return Number.isFinite(n) ? n : 0;
    }

    function normalizar(valor) {
        return (valor ?? '').toString().trim().toLowerCase();
    }

    // Conteo de filas agrupadas por una clave.
    function contarPor(rows, obtenerClave) {
        const mapa = new Map();
        rows.forEach((row) => {
            const clave = obtenerClave(row);
            if (clave === null || clave === undefined || clave === '') return;
            mapa.set(clave, (mapa.get(clave) ?? 0) + 1);
        });
        return mapa;
    }

    // Convierte un Map a arrays {labels, data} ordenados.
    function ordenarMapa(mapa, { orden = 'desc', limite = null } = {}) {
        let entradas = [...mapa.entries()];

        if (orden === 'desc') {
            entradas.sort((a, b) => b[1] - a[1]);
        }
        else if (orden === 'asc') {
            entradas.sort((a, b) => a[1] - b[1]);
        }
        else if (orden === 'clave') {
            entradas.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
        }

        if (limite) {
            entradas = entradas.slice(0, limite);
        }

        return {
            labels: entradas.map((e) => e[0]),
            data: entradas.map((e) => e[1])
        };
    }

    // =====================================
    // RENDER DE GRAFICAS
    // =====================================

    function destruirCharts() {
        Object.keys(chartsActivos).forEach((id) => {
            try {
                chartsActivos[id].destroy();
            }
            catch (e) {
                // ignorar
            }
            delete chartsActivos[id];
        });
    }

    // Devuelve el wrapper (.reporte-chart-wrapper) que contiene al canvas.
    function wrapperDe(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return null;
        return canvas.closest('.reporte-chart-wrapper') || canvas.parentElement;
    }

    // Muestra "Sin datos" reemplazando el canvas dentro de su wrapper.
    function mostrarVacio(canvasId, mensaje = 'Sin datos') {
        const wrapper = wrapperDe(canvasId);
        if (!wrapper) return;
        wrapper.innerHTML =
            `<div class="reporte-vacio">${mensaje}</div>`;
    }

    // Crea una grafica si hay datos; si no, muestra estado vacio.
    function crearChart(canvasId, config, tieneDatos) {
        if (!tieneDatos) {
            mostrarVacio(canvasId);
            return;
        }

        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        chartsActivos[canvasId] = new window.Chart(ctx, config);
    }

    function opcionesBase(extra = {}) {
        return Object.assign(
            {
                responsive: true,
                maintainAspectRatio: false
            },
            extra
        );
    }

    function setKpi(id, valor) {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = Number(valor).toLocaleString('es-MX');
        }
    }

    // Parseo defensivo de fecha YYYY-MM-DD. Devuelve el texto si es valido,
    // null si no cumple el formato (para descartar la entrada).
    function fechaValida(fechaRaw) {
        const texto = (fechaRaw ?? '').toString().trim();
        return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : null;
    }

    // =====================================
    // INIT
    // =====================================

    async function initDashboard() {

        const root = document.getElementById('dashboardRoot');
        if (!root) return false;

        console.log('[dashboard] initDashboard listo');

        let chartDisponible = true;

        // Chart.js debe estar disponible globalmente. Si no lo esta, degradamos
        // elegantemente: avisamos y seguimos rellenando KPIs y lista.
        if (!window.Chart) {
            chartDisponible = false;
            const aviso = document.createElement('div');
            aviso.className = 'alert alert-danger';
            aviso.textContent =
                'No se pudo cargar la libreria de graficas (Chart.js). ' +
                'Verifica que el archivo chart.umd.min.js este disponible.';
            root.prepend(aviso);
        }

        // Si initDashboard corre de nuevo, destruir instancias previas.
        destruirCharts();

        let compras = [];
        let productos = [];

        try {
            compras = await comprasService.obtenerCompras();
        }
        catch (error) {
            console.error('Error cargando compras:', error);
        }

        try {
            productos = await almacenService.obtenerProductos();
        }
        catch (error) {
            console.error('Error cargando almacen:', error);
        }

        compras = Array.isArray(compras) ? compras : [];
        productos = Array.isArray(productos) ? productos : [];

        // ---------- KPIs ----------

        // 1) Compras Pendientes: estatus normalizado NO 'entregado' NI 'cancelado'.
        const totalComprasPendientes = compras.filter((c) => {
            const e = normalizar(c.estatus);
            return e !== 'entregado' && e !== 'cancelado';
        }).length;

        // 2) Compras Aprobadas: estatus normalizado == 'aprobado'.
        const totalComprasAprobadas = compras.filter(
            (c) => normalizar(c.estatus) === 'aprobado'
        ).length;

        // 3) Equipos Inactivos: funciona normalizado == 'si'
        //    (decision del usuario: 'Si' => inactivo).
        const totalEquiposInactivos = productos.filter(
            (p) => normalizar(p.funciona) === 'si'
        ).length;

        // 4) Equipos Averiados: funciona normalizado == 'no'.
        const totalEquiposAveriados = productos.filter(
            (p) => normalizar(p.funciona) === 'no'
        ).length;

        setKpi('totalComprasPendientes', totalComprasPendientes);
        setKpi('totalComprasAprobadas', totalComprasAprobadas);
        setKpi('totalEquiposInactivos', totalEquiposInactivos);
        setKpi('totalEquiposAveriados', totalEquiposAveriados);

        // ---------- GRAFICA: Inactivos / Averiado / Cajas por departamento ----------
        // Tres series agrupadas por departamento:
        //   Inactivos = funciona == 'si'
        //   Averiado  = funciona == 'no'
        //   Cajas     = el campo producto contiene 'caja' (sin distinguir mayus/minus)
        if (chartDisponible) {

            // Departamentos presentes (orden alfabetico), 'Sin departamento' si falta.
            const departamentos = [...new Set(
                productos.map(
                    (p) => (p.departamento ?? '').toString().trim() || 'Sin departamento'
                )
            )].sort();

            const deptoDe = (p) =>
                (p.departamento ?? '').toString().trim() || 'Sin departamento';

            const esCaja = (p) =>
                normalizar(p.producto).includes('caja');

            const inactivosPorDepto = departamentos.map(
                (depto) => productos.filter(
                    (p) => deptoDe(p) === depto && normalizar(p.funciona) === 'si'
                ).length
            );

            const averiadoPorDepto = departamentos.map(
                (depto) => productos.filter(
                    (p) => deptoDe(p) === depto && normalizar(p.funciona) === 'no'
                ).length
            );

            const cajasPorDepto = departamentos.map(
                (depto) => productos.filter(
                    (p) => deptoDe(p) === depto && esCaja(p)
                ).length
            );

            crearChart(
                'departmentChart',
                {
                    type: 'bar',
                    data: {
                        labels: departamentos,
                        datasets: [
                            {
                                label: 'Inactivos',
                                data: inactivosPorDepto,
                                backgroundColor: '#1f3c88'
                            },
                            {
                                label: 'Averiado',
                                data: averiadoPorDepto,
                                backgroundColor: '#e76f51'
                            },
                            {
                                label: 'Cajas',
                                data: cajasPorDepto,
                                backgroundColor: '#c9a227'
                            }
                        ]
                    },
                    options: opcionesBase({
                        plugins: { legend: { display: true, position: 'top' } },
                        scales: {
                            x: { stacked: false },
                            y: { beginAtZero: true, ticks: { precision: 0 } }
                        }
                    })
                },
                departamentos.length > 0
            );
        }

        // ---------- PANEL: Agenda (solo pendientes) ----------
        renderAgenda();

        return true;
    }

    // Máximo de actividades pendientes visibles en la agenda.
    const MAX_ACTIVIDADES_AGENDA = 5;

    // Etiqueta corta del calendario para mostrar al final del aviso y evitar
    // confusión sobre a qué calendario pertenece.
    function etiquetaCalendario(cal) {

        const etiquetas = {
            compras_mensuales: 'Compra mensual',
            compras_bimestrales: 'Papelería',
            mantenimientos: 'Mantenimiento',
            servicios_web: 'Servicios Web'
        };

        const etiqueta =
            etiquetas[cal.clave] || cal.nombre || cal.clave || '';

        return escaparHtml(etiqueta);

    }

    // Recolecta los avisos de calendario de la semana actual (lun–vie, de hoy
    // en adelante). Devuelve un array de { fecha, html, color_valor, destino }
    // ordenado por fecha ascendente. Degrada a [] si la fuente falla.
    async function recolectarAvisosCalendario(hoyIso) {

        const avisos = [];

        try {
            const calendarios = await calendariosService.obtenerCalendarios();
            const lista = Array.isArray(calendarios) ? calendarios : [];

            for (const cal of lista) {

                // Servicios Web: los avisos salen de los dominios (por fecha de
                // vencimiento), no de calendario_dias. Produce los mismos objetos
                // { fecha, html, color_valor, destino } que la rama genérica.
                if (cal.clave === 'servicios_web') {

                    let dominios = [];
                    try {
                        dominios = await serviciosWebService.obtenerDominios();
                    }
                    catch (e) {
                        console.error('[dashboard] dominios', e);
                        continue;
                    }

                    (Array.isArray(dominios) ? dominios : []).forEach((d) => {

                        const fecha = (d.fecha_vencimiento ?? '').toString().trim();
                        if (!eventoEntraEnAgenda(fecha, hoyIso)) return;

                        const esHoy = fecha === hoyIso;
                        const prefijo = esHoy ? 'Hoy' : nombreDiaSemana(fecha);
                        const dominio = escaparHtml(d.dominio);
                        const base = `${prefijo}: vence ${dominio}`;
                        const html =
                            `${base} <span class="badge bg-secondary">Servicios Web</span>`;

                        avisos.push({
                            fecha,
                            html,
                            color_valor: serviciosWebService.colorPorVencimiento(fecha, hoyIso),
                            destino: './calendarios.html'
                        });

                    });

                    continue;
                }

                let dias = [];
                try {
                    dias = await calendariosService.obtenerDiasPorCalendario(cal.clave);
                }
                catch (error) {
                    console.error('[dashboard] Error cargando días del calendario', cal.clave, error);
                    continue;
                }

                (Array.isArray(dias) ? dias : []).forEach((dia) => {

                    const fecha = (dia.fecha ?? '').toString().trim();
                    if (!eventoEntraEnAgenda(fecha, hoyIso)) return;

                    const esHoy = fecha === hoyIso;
                    const prefijo = esHoy ? 'Hoy' : nombreDiaSemana(fecha);
                    const motivo = escaparHtml(dia.motivo_nombre);

                    // Etiqueta que indica a qué calendario pertenece el aviso,
                    // para evitar confusión entre calendarios.
                    const etiquetaCal = etiquetaCalendario(cal);

                    const base = esHoy
                        ? `Hoy: ${motivo}`
                        : `${prefijo}: ${motivo}`;

                    const html =
                        `${base} <span class="badge bg-secondary">${etiquetaCal}</span>`;

                    avisos.push({
                        fecha,
                        html,
                        color_valor: dia.color_valor || null,
                        destino: './calendarios.html'
                    });

                });

            }
        }
        catch (error) {
            console.error('[dashboard] Error cargando calendarios para la agenda:', error);
        }

        avisos.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));

        return avisos;
    }

    // Recolecta las actividades pendientes (estatus != 'Hecho') ordenadas por
    // prioridad y, en empate, más antiguas primero (id ascendente). Devuelve
    // { items, total }: items son como máximo MAX_ACTIVIDADES_AGENDA.
    async function recolectarActividadesPendientes() {

        let pendientes = [];

        try {
            const actividades = await actividadesService.obtenerActividades();
            const lista = Array.isArray(actividades) ? actividades : [];

            pendientes = lista
                .filter((a) => (a.estatus ?? '').toString().trim() !== 'Hecho')
                .sort((a, b) => {
                    const dp = pesoPrioridad(a.prioridad) - pesoPrioridad(b.prioridad);
                    if (dp !== 0) return dp;
                    // Desempate: más antigua primero (menor id).
                    return toNumero(a.id) - toNumero(b.id);
                });
        }
        catch (error) {
            console.error('[dashboard] Error cargando actividades para la agenda:', error);
            return { items: [], total: 0 };
        }

        const items = pendientes.slice(0, MAX_ACTIVIDADES_AGENDA).map((a) => {
            const prioridad = escaparHtml(a.prioridad || 'Sin prioridad');
            const titulo = escaparHtml(a.titulo);
            const estatus = escaparHtml(a.estatus);
            return {
                html: `[${prioridad}] ${titulo} — ${estatus}`,
                destino: './actividades.html'
            };
        });

        return { items, total: pendientes.length };
    }

    // Construye el marcado de una subsección: subtítulo + list-group.
    function construirSubseccion(titulo, items) {

        const li = items
            .map((it) => {

                const puntito = it.color_valor
                    ? `<span class="d-inline-block rounded-circle me-2" `
                        + `style="width:10px;height:10px;background-color:${it.color_valor}"></span>`
                    : '';

                if (it.destino) {
                    return `<button type="button" `
                        + `class="list-group-item list-group-item-action text-start" `
                        + `style="cursor:pointer" data-destino="${it.destino}">`
                        + `${puntito}${it.html}</button>`;
                }

                // Ítem no clicable (p.ej. "y N más…").
                return `<span class="list-group-item text-muted">${it.html}</span>`;

            })
            .join('');

        return `<h6 class="mt-2 mb-2">${titulo}</h6>`
            + `<div class="list-group mb-3">${li}</div>`;
    }

    // Construye el panel Agenda con las dos subsecciones. Aislado de los KPIs y
    // la gráfica: cada fuente degrada por su cuenta y nunca lanza hacia init.
    async function renderAgenda() {

        const contenedor = document.getElementById('agendaLista');
        if (!contenedor) return;

        const hoyIso = fechaHoyIso();

        const avisos = await recolectarAvisosCalendario(hoyIso);
        const { items: actividades, total: totalActividades } =
            await recolectarActividadesPendientes();

        // Ítems de la subsección de actividades (+ posible "y N más…").
        const itemsActividades = actividades.slice();
        if (totalActividades > MAX_ACTIVIDADES_AGENDA) {
            const restantes = totalActividades - MAX_ACTIVIDADES_AGENDA;
            itemsActividades.push({
                html: `y ${restantes} más…`,
                destino: null
            });
        }

        if (avisos.length === 0 && actividades.length === 0) {
            contenedor.innerHTML =
                '<div class="list-group">'
                + '<span class="list-group-item text-muted">'
                + 'Sin pendientes para esta semana</span></div>';
            return;
        }

        let html = '';

        if (avisos.length > 0) {
            html += construirSubseccion('Calendarios (esta semana)', avisos);
        }

        if (itemsActividades.length > 0) {
            html += construirSubseccion('Actividades pendientes', itemsActividades);
        }

        contenedor.innerHTML = html;

        // Listener delegado de navegación: cualquier ítem con data-destino.
        // Se registra una sola vez aunque renderAgenda vuelva a ejecutarse.
        if (contenedor.dataset.listenerAgenda !== '1') {
            contenedor.dataset.listenerAgenda = '1';
            contenedor.addEventListener('click', (e) => {
                const target = e.target.closest('[data-destino]');
                if (!target) return;
                const destino = target.getAttribute('data-destino');
                if (destino) {
                    window.location.href = destino;
                }
            });
        }
    }

    // =====================================
    // ESPERAR A QUE EL FRAGMENTO EXISTA
    // =====================================

    function waitForDashboardRoot() {

        const rootId = 'dashboardRoot';

        if (document.getElementById(rootId)) {
            initDashboard();
            return;
        }

        const observer = new MutationObserver(() => {
            if (document.getElementById(rootId)) {
                observer.disconnect();
                initDashboard();
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
        waitForDashboardRoot();
    }

    // Exposición de las funciones puras para los tests unitarios (node:test)
    // sin afectar la ejecución en el navegador.
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            limitesSemana,
            eventoEntraEnAgenda,
            nombreDiaSemana,
            pesoPrioridad
        };
    }

})();
