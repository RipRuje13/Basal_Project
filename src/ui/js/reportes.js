const comprasService = require('../../services/compras.service');
const almacenService = require('../../services/almacen.service');
const actividadesService = require('../../services/actividades.service');

// ================================
// REPORTES
// ================================

// Instancias de Chart activas, para destruirlas si initReportes() corre
// mas de una vez (evita el error "Canvas is already in use").
const chartsActivos = {};

// Paleta coherente (azules + dorado/acento).
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

// Extrae YYYY-MM de un texto YYYY-MM-DD. Devuelve null si no parsea.
function mesDeFecha(fechaRaw) {
    const texto = (fechaRaw ?? '').toString().trim();
    const match = texto.match(/^(\d{4})-(\d{2})/);
    if (!match) return null;
    return `${match[1]}-${match[2]}`;
}

// Un item de almacen se considera "no funcional" cuando el valor de
// funciona NO indica que funciona: vacio o alguno de los textos conocidos.
// El formulario de almacen solo permite "Si"/"No" (verificado contra la DB
// y almacen-fragment.html), pero la lista se amplia con variantes comunes
// para ser robustos ante datos heredados o insertados manualmente.
function esNoFuncional(funcionaRaw) {
    const v = normalizar(funcionaRaw);
    if (v === '') return true;
    return [
        'no',
        'no funciona',
        'averiado',
        'descompuesto',
        'danado',
        'dañado',
        'en reparacion',
        'en reparación',
        'fuera de servicio',
        'malo'
    ].includes(v);
}

// Suma de cantidad agrupada por una clave de texto.
function sumarPor(rows, campoClave, campoValor) {
    const mapa = new Map();
    rows.forEach((row) => {
        const clave = (row[campoClave] ?? '').toString().trim();
        if (!clave) return;
        const valor = toNumero(row[campoValor]);
        mapa.set(clave, (mapa.get(clave) ?? 0) + valor);
    });
    return mapa;
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

// =====================================
// INIT
// =====================================

async function initReportes() {

    const root = document.getElementById('reportesRoot');
    if (!root) return false;

    console.log('[reportes] initReportes listo');

    // Chart.js debe estar disponible globalmente.
    if (!window.Chart) {
        const aviso = document.createElement('div');
        aviso.className = 'alert alert-danger';
        aviso.textContent =
            'No se pudo cargar la libreria de graficas (Chart.js). ' +
            'Verifica que el archivo chart.umd.min.js este disponible.';
        root.prepend(aviso);
        return false;
    }

    // Si initReportes corre de nuevo, destruir instancias previas.
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
    const totalSolicitudes = compras.length;
    const totalUnidades = compras.reduce(
        (acc, c) => acc + toNumero(c.cantidad),
        0
    );
    const totalAlmacen = productos.length;
    const totalNoFuncionales = productos.filter(
        (p) => esNoFuncional(p.funciona)
    ).length;

    setKpi('kpiTotalSolicitudes', totalSolicitudes);
    setKpi('kpiTotalUnidades', totalUnidades);
    setKpi('kpiTotalAlmacen', totalAlmacen);
    setKpi('kpiTotalNoFuncionales', totalNoFuncionales);

    // ============ COMPRAS ============

    // 1) Departamento que mas material solicita (barras, suma cantidad)
    const deptSolicita = ordenarMapa(
        sumarPor(compras, 'departamento', 'cantidad'),
        { orden: 'desc', limite: 10 }
    );
    crearChart(
        'chartDeptSolicita',
        {
            type: 'bar',
            data: {
                labels: deptSolicita.labels,
                datasets: [{
                    label: 'Unidades solicitadas',
                    data: deptSolicita.data,
                    backgroundColor: coloresPara(deptSolicita.labels.length)
                }]
            },
            options: opcionesBase({
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            })
        },
        deptSolicita.labels.length > 0
    );

    // 2) Productos mas comprados (barras horizontales, top 10)
    const productosMas = ordenarMapa(
        sumarPor(compras, 'producto', 'cantidad'),
        { orden: 'desc', limite: 10 }
    );
    crearChart(
        'chartProductosMas',
        {
            type: 'bar',
            data: {
                labels: productosMas.labels,
                datasets: [{
                    label: 'Unidades compradas',
                    data: productosMas.data,
                    backgroundColor: coloresPara(productosMas.labels.length)
                }]
            },
            options: opcionesBase({
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: { x: { beginAtZero: true } }
            })
        },
        productosMas.labels.length > 0
    );

    // 3) Productos menos comprados (barras, bottom 10, excluye suma 0)
    const mapaProductos = sumarPor(compras, 'producto', 'cantidad');
    const mapaProductosConDatos = new Map(
        [...mapaProductos.entries()].filter(([, v]) => v > 0)
    );
    const productosMenos = ordenarMapa(
        mapaProductosConDatos,
        { orden: 'asc', limite: 10 }
    );
    crearChart(
        'chartProductosMenos',
        {
            type: 'bar',
            data: {
                labels: productosMenos.labels,
                datasets: [{
                    label: 'Unidades compradas',
                    data: productosMenos.data,
                    backgroundColor: coloresPara(productosMenos.labels.length)
                }]
            },
            options: opcionesBase({
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            })
        },
        productosMenos.labels.length > 0
    );

    // 4) Compras por estatus (doughnut, conteo por estatus)
    const estatus = ordenarMapa(
        contarPor(compras, (c) => (c.estatus ?? '').toString().trim()),
        { orden: 'desc' }
    );
    crearChart(
        'chartEstatus',
        {
            type: 'doughnut',
            data: {
                labels: estatus.labels,
                datasets: [{
                    data: estatus.data,
                    backgroundColor: coloresPara(estatus.labels.length)
                }]
            },
            options: opcionesBase({
                plugins: { legend: { position: 'bottom' } }
            })
        },
        estatus.labels.length > 0
    );

    // 5) Compras por unidad de negocio (pie, suma cantidad)
    const unidad = ordenarMapa(
        sumarPor(compras, 'unidad_negocio', 'cantidad'),
        { orden: 'desc' }
    );
    crearChart(
        'chartUnidadNegocio',
        {
            type: 'pie',
            data: {
                labels: unidad.labels,
                datasets: [{
                    data: unidad.data,
                    backgroundColor: coloresPara(unidad.labels.length)
                }]
            },
            options: opcionesBase({
                plugins: { legend: { position: 'bottom' } }
            })
        },
        unidad.labels.length > 0
    );

    // 6) Tendencia mensual de compras (linea, suma cantidad por YYYY-MM)
    const mapaMensual = new Map();
    compras.forEach((c) => {
        const mes = mesDeFecha(c.fecha_solicitud);
        if (!mes) return;
        mapaMensual.set(mes, (mapaMensual.get(mes) ?? 0) + toNumero(c.cantidad));
    });
    const mensual = ordenarMapa(mapaMensual, { orden: 'clave' });
    crearChart(
        'chartTendenciaMensual',
        {
            type: 'line',
            data: {
                labels: mensual.labels,
                datasets: [{
                    label: 'Unidades solicitadas',
                    data: mensual.data,
                    borderColor: '#1f3c88',
                    backgroundColor: 'rgba(31, 60, 136, 0.15)',
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: '#c9a227'
                }]
            },
            options: opcionesBase({
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            })
        },
        mensual.labels.length > 0
    );

    // ============ ALMACEN ============

    // 7) Departamento con mas averias / equipos no funcionales (barras)
    const mapaAverias = new Map();
    productos.forEach((p) => {
        if (!esNoFuncional(p.funciona)) return;
        const dep = (p.departamento ?? '').toString().trim() || 'Sin departamento';
        mapaAverias.set(dep, (mapaAverias.get(dep) ?? 0) + 1);
    });
    const averias = ordenarMapa(mapaAverias, { orden: 'desc' });
    crearChart(
        'chartAverias',
        {
            type: 'bar',
            data: {
                labels: averias.labels,
                datasets: [{
                    label: 'Equipos no funcionales',
                    data: averias.data,
                    backgroundColor: '#e76f51'
                }]
            },
            options: opcionesBase({
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            })
        },
        averias.labels.length > 0
    );

    // 8) Estado de funcionamiento del inventario (doughnut, por valor
    //    normalizado de funciona)
    const funcionamiento = ordenarMapa(
        contarPor(productos, (p) => {
            const v = normalizar(p.funciona);
            return v === '' ? 'sin dato' : v;
        }),
        { orden: 'desc' }
    );
    crearChart(
        'chartFuncionamiento',
        {
            type: 'doughnut',
            data: {
                labels: funcionamiento.labels,
                datasets: [{
                    data: funcionamiento.data,
                    backgroundColor: coloresPara(funcionamiento.labels.length)
                }]
            },
            options: opcionesBase({
                plugins: { legend: { position: 'bottom' } }
            })
        },
        funcionamiento.labels.length > 0
    );

    // 9) Inventario por departamento (barras, conteo de productos).
    //    Los productos sin departamento se agrupan bajo "Sin departamento",
    //    el mismo criterio que usa chartAverias, para que ambas vistas de
    //    almacen traten el departamento vacio de forma consistente.
    const inventarioDept = ordenarMapa(
        contarPor(
            productos,
            (p) => (p.departamento ?? '').toString().trim() || 'Sin departamento'
        ),
        { orden: 'desc' }
    );
    crearChart(
        'chartInventarioDept',
        {
            type: 'bar',
            data: {
                labels: inventarioDept.labels,
                datasets: [{
                    label: 'Productos',
                    data: inventarioDept.data,
                    backgroundColor: coloresPara(inventarioDept.labels.length)
                }]
            },
            options: opcionesBase({
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            })
        },
        inventarioDept.labels.length > 0
    );

    // ============ ACTIVIDADES ============

    let actividades = [];

    try {
        actividades = await actividadesService.obtenerActividades();
    }
    catch (error) {
        console.error('Error cargando actividades:', error);
    }

    actividades = Array.isArray(actividades) ? actividades : [];

    renderReportesActividades(actividades);

    return true;
}

// Construye los KPIs y gráficas de la sección Actividades.
function renderReportesActividades(actividades) {

    const esHecho = (a) =>
        normalizar(a.estatus) === 'hecho';

    // ---------- KPIs ----------
    const total = actividades.length;

    const completadas =
        actividades.filter(esHecho).length;

    const pendientes =
        total - completadas;

    const avance =
        total > 0
            ? Math.round((completadas / total) * 100)
            : 0;

    setKpi('kpiActTotal', total);
    setKpi('kpiActPendientes', pendientes);
    setKpi('kpiActCompletadas', completadas);

    const elAvance = document.getElementById('kpiActAvance');
    if (elAvance) {
        elAvance.textContent = `${avance}%`;
    }

    // 1) Por estatus (doughnut)
    const porEstatus = ordenarMapa(
        contarPor(actividades, (a) => (a.estatus ?? '').toString().trim()),
        { orden: 'desc' }
    );
    crearChart(
        'chartActEstatus',
        {
            type: 'doughnut',
            data: {
                labels: porEstatus.labels,
                datasets: [{
                    data: porEstatus.data,
                    backgroundColor: porEstatus.labels.map(colorEstatusActividad)
                }]
            },
            options: opcionesBase({
                plugins: { legend: { position: 'bottom' } }
            })
        },
        porEstatus.labels.length > 0
    );

    // 2) Por departamento (barras, conteo)
    const porDepartamento = ordenarMapa(
        contarPor(
            actividades,
            (a) => (a.departamento ?? '').toString().trim() || 'Sin departamento'
        ),
        { orden: 'desc' }
    );
    crearChart(
        'chartActDepartamento',
        {
            type: 'bar',
            data: {
                labels: porDepartamento.labels,
                datasets: [{
                    label: 'Actividades',
                    data: porDepartamento.data,
                    backgroundColor: coloresPara(porDepartamento.labels.length)
                }]
            },
            options: opcionesBase({
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            })
        },
        porDepartamento.labels.length > 0
    );

    // 3) Por prioridad (doughnut)
    const porPrioridad = ordenarMapa(
        contarPor(actividades, (a) => (a.prioridad ?? '').toString().trim()),
        { orden: 'desc' }
    );
    crearChart(
        'chartActPrioridad',
        {
            type: 'doughnut',
            data: {
                labels: porPrioridad.labels,
                datasets: [{
                    data: porPrioridad.data,
                    backgroundColor: porPrioridad.labels.map(colorPrioridadActividad)
                }]
            },
            options: opcionesBase({
                plugins: { legend: { position: 'bottom' } }
            })
        },
        porPrioridad.labels.length > 0
    );

    // 4) Por tipo (doughnut)
    const porTipo = ordenarMapa(
        contarPor(actividades, (a) => (a.tipo ?? '').toString().trim()),
        { orden: 'desc' }
    );
    crearChart(
        'chartActTipo',
        {
            type: 'doughnut',
            data: {
                labels: porTipo.labels,
                datasets: [{
                    data: porTipo.data,
                    backgroundColor: coloresPara(porTipo.labels.length)
                }]
            },
            options: opcionesBase({
                plugins: { legend: { position: 'bottom' } }
            })
        },
        porTipo.labels.length > 0
    );

    // 5) Tendencia mensual de actividades creadas (linea, conteo por YYYY-MM)
    const mapaMensual = new Map();
    actividades.forEach((a) => {
        const mes = mesDeFecha(a.fecha_creacion);
        if (!mes) return;
        mapaMensual.set(mes, (mapaMensual.get(mes) ?? 0) + 1);
    });
    const tendencia = ordenarMapa(mapaMensual, { orden: 'clave' });
    crearChart(
        'chartActTendencia',
        {
            type: 'line',
            data: {
                labels: tendencia.labels,
                datasets: [{
                    label: 'Actividades creadas',
                    data: tendencia.data,
                    borderColor: '#1f3c88',
                    backgroundColor: 'rgba(31, 60, 136, 0.15)',
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: '#c9a227'
                }]
            },
            options: opcionesBase({
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true } }
            })
        },
        tendencia.labels.length > 0
    );

    // 6) Tiempo promedio de resolución (de creación a 'Hecho', en días)
    renderTiempoPromedioActividades(actividades);
}

// Color fijo por estatus (coherente con el semáforo de la app).
function colorEstatusActividad(estatus) {
    const v = normalizar(estatus);
    if (v === 'por hacer') return '#9ca3af';
    if (v === 'en progreso') return '#f59e0b';
    if (v === 'hecho') return '#22c55e';
    return '#8d99ae';
}

// Color fijo por prioridad.
function colorPrioridadActividad(prioridad) {
    const v = normalizar(prioridad);
    if (v === 'alta') return '#ef4444';
    if (v === 'media') return '#f59e0b';
    if (v === 'baja') return '#22c55e';
    return '#8d99ae';
}

// Calcula y muestra el tiempo promedio (días) entre fecha_creacion y
// fecha_hecho de las actividades completadas que tengan ambos sellos.
function renderTiempoPromedioActividades(actividades) {

    const elValor = document.getElementById('kpiActTiempoPromedio');
    const elDetalle = document.getElementById('kpiActTiempoDetalle');

    const MS_POR_DIA = 24 * 60 * 60 * 1000;

    const duraciones = [];

    actividades.forEach((a) => {
        if (normalizar(a.estatus) !== 'hecho') return;
        if (!a.fecha_creacion || !a.fecha_hecho) return;

        const inicio = new Date(a.fecha_creacion);
        const fin = new Date(a.fecha_hecho);

        if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) return;

        const dias = (fin.getTime() - inicio.getTime()) / MS_POR_DIA;
        if (dias >= 0) {
            duraciones.push(dias);
        }
    });

    if (!elValor) return;

    if (!duraciones.length) {
        elValor.textContent = '—';
        if (elDetalle) {
            elDetalle.textContent = 'Aún no hay actividades completadas con fechas.';
        }
        return;
    }

    const promedio =
        duraciones.reduce((acc, d) => acc + d, 0) / duraciones.length;

    elValor.textContent = promedio.toFixed(1);

    if (elDetalle) {
        elDetalle.textContent =
            `Calculado sobre ${duraciones.length} actividad${duraciones.length === 1 ? '' : 'es'} completada${duraciones.length === 1 ? '' : 's'}.`;
    }
}

function setKpi(id, valor) {
    const el = document.getElementById(id);
    if (el) {
        el.textContent = Number(valor).toLocaleString('es-MX');
    }
}

// =====================================
// ESPERAR A QUE EL FRAGMENTO EXISTA
// =====================================

function waitForReportesRoot() {

    const rootId = 'reportesRoot';

    if (document.getElementById(rootId)) {
        initReportes();
        return;
    }

    const observer = new MutationObserver(() => {
        if (document.getElementById(rootId)) {
            observer.disconnect();
            initReportes();
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
    waitForReportesRoot();
}
