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

        // ---------- LISTA: ultimos movimientos ----------
        renderMovimientos(compras, productos);

        return true;
    }

    // Construye la lista de movimientos combinando altas de almacen y compras,
    // ordenada por fecha descendente, con parseo defensivo.
    function renderMovimientos(compras, productos) {
        const lista = document.getElementById('movementList');
        if (!lista) return;

        const movimientos = [];

        productos.forEach((p) => {
            const fecha = fechaValida(p.fecha_ingreso);
            if (!fecha) return;
            const producto = (p.producto ?? '').toString().trim();
            const marca = (p.marca ?? '').toString().trim();
            const texto = `Alta de almacen: ${producto} ${marca}`.trim();
            movimientos.push({ fecha, texto });
        });

        compras.forEach((c) => {
            const fecha = fechaValida(c.fecha_solicitud);
            if (!fecha) return;
            const estatus = (c.estatus ?? '').toString().trim();
            const producto = (c.producto ?? '').toString().trim();
            const cantidad = toNumero(c.cantidad);
            const texto = `Compra ${estatus}: ${producto} (x${cantidad})`;
            movimientos.push({ fecha, texto });
        });

        // Orden por fecha YYYY-MM-DD descendente (comparacion lexicografica).
        movimientos.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));

        lista.innerHTML = '';

        if (movimientos.length === 0) {
            const li = document.createElement('li');
            li.className = 'list-group-item';
            li.textContent = 'Sin movimientos registrados';
            lista.appendChild(li);
            return;
        }

        movimientos.slice(0, 8).forEach((mov) => {
            const li = document.createElement('li');
            li.className = 'list-group-item';
            li.textContent = mov.texto;

            const fecha = document.createElement('small');
            fecha.className = 'text-muted d-block';
            fecha.textContent = mov.fecha;
            li.appendChild(fecha);

            lista.appendChild(li);
        });
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

})();
