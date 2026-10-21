const comprasService = require('../../services/compras.service');
const gestionService = require('../../services/gestion.service');

// ================================
// COMPRAS
// ================================

function initCompras() {


const purchaseForm =
    document.getElementById('purchaseForm');

const btnAgregar =
    document.getElementById('btnAgregar');

const registroNuevoModal =
    document.getElementById('registroNuevoModal');

const btnCerrarModal =
    document.getElementById('btnCerrarModal');

const filtroComprasTexto =
    document.getElementById('filtroComprasTexto');

const filtroComprasEstatus =
    document.getElementById('filtroComprasEstatus');

const filtroComprasDepartamento =
    document.getElementById('filtroComprasDepartamento');

const filtroComprasUnidad =
    document.getElementById('filtroComprasUnidad');

const btnLimpiarFiltrosCompras =
    document.getElementById('btnLimpiarFiltrosCompras');

const btnMensual =
    document.getElementById('btnMensual');

const menuMesesCompras =
    document.getElementById('menuMesesCompras');

const labelMesCompras =
    document.getElementById('labelMesCompras');

const btnExportar =
    document.getElementById('btnExportar');

const menuExportar =
    document.getElementById('menuExportar');

const comprasPaginacion =
    document.getElementById('comprasPaginacion');

const comprasPaginacionInfo =
    document.getElementById('comprasPaginacionInfo');

if (
    !purchaseForm ||
    !btnAgregar ||
    !registroNuevoModal
) {
    return false;
}

console.log('[compras] initCompras listo');

let compraEditandoId = null;
let comprasCache = [];
let mesSeleccionadoCompra = '';

const FILAS_POR_PAGINA = 10;
let paginaActualCompras = 1;

// =====================================
// FUNCIONES AUXILIARES
// =====================================

// Color FIJO de fondo de fila por estatus (hex inline), independiente del
// tema. Tonos claros para que el texto siga siendo legible:
//   Por Solicitar -> gris claro   (aún sin iniciar)
//   Solicitado    -> azul claro   (en trámite)
//   Aprobado      -> ámbar claro  (en proceso)
//   Entregado     -> verde claro  (completado)
//   Cancelado     -> rojo claro   (cancelado)
function getColorSemaforo(estatusRaw) {

    const estatus =
        (estatusRaw ?? '')
            .toString()
            .trim()
            .toUpperCase();

    if (estatus === 'POR SOLICITAR') return '#e5e7eb';
    if (estatus === 'SOLICITADO') return '#cfe2ff';
    if (estatus === 'APROBADO') return '#ffe8a3';
    if (estatus === 'ENTREGADO') return '#c6f6d5';
    if (estatus === 'CANCELADO') return '#fecaca';

    return 'transparent';
}

function setModoNuevaCompra() {

    compraEditandoId = null;
    purchaseForm.reset();

    const tituloModal =
        registroNuevoModal.querySelector('h5');

    if (tituloModal) {
        tituloModal.textContent = 'Nueva Solicitud';
    }

}

function setModoEditarCompra(compra) {

    compraEditandoId = compra.id;

    document.getElementById('itemNumber').value =
        compra.cantidad ?? '';

    document.getElementById('productName').value =
        compra.producto ?? '';

    document.getElementById('department').value =
        compra.departamento ?? '';

    document.getElementById('businessUnit').value =
        compra.unidad_negocio ?? '';

    document.getElementById('colaborador').value =
        compra.colaborador ?? '';

    document.getElementById('requestDate').value =
        compra.fecha_solicitud ?? '';

    document.getElementById('cotizacion').value =
        compra.cotizacion ?? '';

    document.getElementById('status').value =
        compra.estatus ?? '';

    document.getElementById('productCode').value =
        compra.codigo ?? '';

    document.getElementById('notes').value =
        compra.notas ?? '';

    const tituloModal =
        registroNuevoModal.querySelector('h5');

    if (tituloModal) {
        tituloModal.textContent = 'Editar Solicitud';
    }

}

function normalizarTexto(valor) {

    return (valor ?? '')
        .toString()
        .trim()
        .toLowerCase();

}

function llenarSelectFiltro(select, valores, textoInicial) {

    if (!select) return;

    const valorActual = select.value;

    select.innerHTML =
        `<option value="">${textoInicial}</option>`;

    valores.forEach((valor) => {

        const option =
            document.createElement('option');

        option.value = valor;
        option.textContent = valor;
        select.appendChild(option);

    });

    select.value = valores.includes(valorActual)
        ? valorActual
        : '';

}

async function cargarSelectsFormulario() {

    const selectDepartamento =
        document.getElementById('department');

    const selectUnidad =
        document.getElementById('businessUnit');

    try {

        const departamentos =
            await gestionService.obtenerDepartamentos();

        if (selectDepartamento) {

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

        const unidades =
            await gestionService.obtenerUnidades();

        if (selectUnidad) {

            selectUnidad.innerHTML =
                '<option value="" selected disabled>Seleccione una unidad</option>';

            unidades.forEach((fila) => {

                const option =
                    document.createElement('option');

                option.value = fila.nombre;
                option.textContent = fila.nombre;
                selectUnidad.appendChild(option);

            });

        }

    }
    catch (error) {

        console.error(
            'Error cargando selects del formulario de compras:',
            error
        );

    }

}

const MESES_COTIZACION = [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre'
];

function construirMenuMeses() {

    if (!menuMesesCompras) return;

    menuMesesCompras.innerHTML = '';

    const itemTodos =
        document.createElement('button');

    itemTodos.type = 'button';
    itemTodos.className = 'dropdown-item';
    itemTodos.dataset.mes = '';
    itemTodos.textContent = 'Todos los meses';
    menuMesesCompras.appendChild(itemTodos);

    const separador =
        document.createElement('div');

    separador.className = 'dropdown-divider';
    menuMesesCompras.appendChild(separador);

    MESES_COTIZACION.forEach((mes) => {

        const item =
            document.createElement('button');

        item.type = 'button';
        item.className = 'dropdown-item';
        item.dataset.mes = mes;
        item.dataset.label = mes;
        item.textContent = mes;

        menuMesesCompras.appendChild(item);

    });

}

function actualizarOpcionesFiltros(rows) {

    const departamentos = [
        ...new Set(
            rows
                .map((compra) => compra.departamento)
                .filter(Boolean)
        )
    ].sort();

    const unidades = [
        ...new Set(
            rows
                .map((compra) => compra.unidad_negocio)
                .filter(Boolean)
        )
    ].sort();

    llenarSelectFiltro(
        filtroComprasDepartamento,
        departamentos,
        'Todos'
    );

    llenarSelectFiltro(
        filtroComprasUnidad,
        unidades,
        'Todas'
    );

}

function obtenerComprasFiltradas() {

    const texto =
        normalizarTexto(
            filtroComprasTexto?.value
        );

    const estatus =
        normalizarTexto(
            filtroComprasEstatus?.value
        );

    const departamento =
        normalizarTexto(
            filtroComprasDepartamento?.value
        );

    const unidad =
        normalizarTexto(
            filtroComprasUnidad?.value
        );

    return comprasCache.filter((compra) => {

        const coincideMes =
            !mesSeleccionadoCompra ||
            normalizarTexto(compra.cotizacion) ===
                normalizarTexto(mesSeleccionadoCompra);

        const coincideTexto =
            !texto ||
            [
                compra.producto,
                compra.departamento,
                compra.unidad_negocio,
                compra.colaborador,
                compra.fecha_solicitud,
                compra.estatus,
                compra.codigo,
                compra.notas,
                compra.cantidad
            ]
                .map(normalizarTexto)
                .some((valor) =>
                    valor.includes(texto)
                );

        const coincideEstatus =
            !estatus ||
            normalizarTexto(compra.estatus) === estatus;

        const coincideDepartamento =
            !departamento ||
            normalizarTexto(compra.departamento) === departamento;

        const coincideUnidad =
            !unidad ||
            normalizarTexto(compra.unidad_negocio) === unidad;

        return (
            coincideMes &&
            coincideTexto &&
            coincideEstatus &&
            coincideDepartamento &&
            coincideUnidad
        );

    });

}

function aplicarFiltrosCompras(opciones = {}) {

    // Por defecto cualquier cambio de filtro vuelve a la primera pagina.
    if (opciones.mantenerPagina !== true) {
        paginaActualCompras = 1;
    }

    renderPaginaCompras();

}

function renderPaginaCompras() {

    const filtradas = obtenerComprasFiltradas();

    const totalFilas = filtradas.length;

    const totalPaginas = Math.max(
        1,
        Math.ceil(totalFilas / FILAS_POR_PAGINA)
    );

    // Asegurar que la pagina actual este dentro de rango
    // (por ejemplo tras eliminar el ultimo registro de una pagina).
    if (paginaActualCompras > totalPaginas) {
        paginaActualCompras = totalPaginas;
    }

    if (paginaActualCompras < 1) {
        paginaActualCompras = 1;
    }

    const inicio =
        (paginaActualCompras - 1) * FILAS_POR_PAGINA;

    const paginaFilas =
        filtradas.slice(inicio, inicio + FILAS_POR_PAGINA);

    renderCompras(paginaFilas);

    renderPaginacionCompras(totalFilas, totalPaginas);

}

function renderPaginacionCompras(totalFilas, totalPaginas) {

    if (comprasPaginacionInfo) {

        if (totalFilas === 0) {
            comprasPaginacionInfo.textContent =
                'Sin registros';
        }
        else {

            const inicio =
                (paginaActualCompras - 1) * FILAS_POR_PAGINA + 1;

            const fin =
                Math.min(
                    paginaActualCompras * FILAS_POR_PAGINA,
                    totalFilas
                );

            comprasPaginacionInfo.textContent =
                `Mostrando ${inicio}-${fin} de ${totalFilas} registros`;

        }

    }

    if (!comprasPaginacion) return;

    comprasPaginacion.innerHTML = '';

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
                paginaActualCompras = pagina;
                renderPaginaCompras();
            });
        }

        li.appendChild(boton);
        comprasPaginacion.appendChild(li);

    };

    // Anterior
    crearItem(
        '&laquo;',
        paginaActualCompras - 1,
        { deshabilitado: paginaActualCompras === 1 }
    );

    // Numeros de pagina
    for (let pagina = 1; pagina <= totalPaginas; pagina += 1) {
        crearItem(
            String(pagina),
            pagina,
            { activo: pagina === paginaActualCompras }
        );
    }

    // Siguiente
    crearItem(
        '&raquo;',
        paginaActualCompras + 1,
        { deshabilitado: paginaActualCompras === totalPaginas }
    );

}

// =====================================
// EXPORTAR (EXCEL / PDF)
// =====================================

const { ipcRenderer } = require('electron');

const COLUMNAS_EXPORT = [
    { clave: 'cantidad', titulo: 'Cantidad' },
    { clave: 'producto', titulo: 'Producto' },
    { clave: 'departamento', titulo: 'Departamento' },
    { clave: 'unidad_negocio', titulo: 'Unidad Negocio' },
    { clave: 'colaborador', titulo: 'Colaborador' },
    { clave: 'fecha_solicitud', titulo: 'Fecha Solicitud' },
    { clave: 'cotizacion', titulo: 'Mes Cotización' },
    { clave: 'estatus', titulo: 'Estatus' },
    { clave: 'codigo', titulo: 'Código' },
    { clave: 'notas', titulo: 'Notas' }
];

function escaparHtml(valor) {

    return (valor ?? '')
        .toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');

}

function describirFiltrosActivos() {

    const partes = [];

    const texto = (filtroComprasTexto?.value || '').trim();
    if (texto) partes.push(`Búsqueda: "${texto}"`);

    const estatus = (filtroComprasEstatus?.value || '').trim();
    if (estatus) partes.push(`Estatus: ${estatus}`);

    const departamento = (filtroComprasDepartamento?.value || '').trim();
    if (departamento) partes.push(`Departamento: ${departamento}`);

    const unidad = (filtroComprasUnidad?.value || '').trim();
    if (unidad) partes.push(`Unidad: ${unidad}`);

    if (mesSeleccionadoCompra) partes.push(`Mes de cotización: ${mesSeleccionadoCompra}`);

    return partes.length
        ? partes.join('  |  ')
        : 'Sin filtros (todos los registros)';

}

function construirTablaHtml(rows) {

    const encabezado = COLUMNAS_EXPORT
        .map((col) => `<th>${escaparHtml(col.titulo)}</th>`)
        .join('');

    const cuerpo = rows
        .map((compra) => {
            const celdas = COLUMNAS_EXPORT
                .map((col) => `<td>${escaparHtml(compra[col.clave])}</td>`)
                .join('');
            return `<tr>${celdas}</tr>`;
        })
        .join('');

    return { encabezado, cuerpo };

}

function timestampArchivo() {

    const ahora = new Date();
    const pad = (n) => n.toString().padStart(2, '0');

    return `${ahora.getFullYear()}${pad(ahora.getMonth() + 1)}${pad(ahora.getDate())}` +
        `_${pad(ahora.getHours())}${pad(ahora.getMinutes())}`;

}

async function exportarExcel(rows) {

    const { encabezado, cuerpo } = construirTablaHtml(rows);

    // Excel abre de forma nativa una tabla HTML guardada como .xls.
    const html = `
        <html xmlns:o="urn:schemas-microsoft-com:office:office"
              xmlns:x="urn:schemas-microsoft-com:office:excel"
              xmlns="http://www.w3.org/TR/REC-html40">
        <head>
            <meta charset="UTF-8" />
            <style>
                table { border-collapse: collapse; }
                th, td { border: 1px solid #999; padding: 4px 8px; mso-number-format:"\\@"; }
                th { background: #0d6efd; color: #fff; }
            </style>
        </head>
        <body>
            <table>
                <thead><tr>${encabezado}</tr></thead>
                <tbody>${cuerpo}</tbody>
            </table>
        </body>
        </html>
    `;

    // BOM para que Excel respete UTF-8 (acentos).
    const contenido = '\uFEFF' + html;

    const resultado = await ipcRenderer.invoke('exportar-archivo', {
        contenido,
        nombreSugerido: `compras_${timestampArchivo()}.xls`,
        filtros: [{ name: 'Excel', extensions: ['xls'] }]
    });

    return resultado;

}

async function exportarPdf(rows) {

    const { encabezado, cuerpo } = construirTablaHtml(rows);
    const filtrosTexto = escaparHtml(describirFiltrosActivos());
    const fecha = new Date().toLocaleString('es-MX');

    const html = `
        <!doctype html>
        <html lang="es">
        <head>
            <meta charset="UTF-8" />
            <style>
                * { font-family: Arial, Helvetica, sans-serif; }
                body { padding: 16px; color: #212529; }
                h1 { font-size: 18px; margin: 0 0 4px; }
                .meta { font-size: 11px; color: #555; margin-bottom: 12px; }
                table { border-collapse: collapse; width: 100%; font-size: 10px; }
                th, td { border: 1px solid #ccc; padding: 4px 6px; text-align: left; }
                th { background: #0d6efd; color: #fff; }
                tr:nth-child(even) td { background: #f5f7fa; }
            </style>
        </head>
        <body>
            <h1>Compras</h1>
            <div class="meta">
                <div>Generado: ${escaparHtml(fecha)}</div>
                <div>Filtros: ${filtrosTexto}</div>
                <div>Total de registros: ${rows.length}</div>
            </div>
            <table>
                <thead><tr>${encabezado}</tr></thead>
                <tbody>${cuerpo}</tbody>
            </table>
        </body>
        </html>
    `;

    const resultado = await ipcRenderer.invoke('exportar-pdf', {
        html,
        nombreSugerido: `compras_${timestampArchivo()}.pdf`
    });

    return resultado;

}

async function exportarCompras(formato) {

    const rows = obtenerComprasFiltradas();

    if (!rows.length) {
        alert('No hay registros para exportar con la configuración actual.');
        return;
    }

    try {

        const resultado = formato === 'pdf'
            ? await exportarPdf(rows)
            : await exportarExcel(rows);

        if (resultado && resultado.success) {
            console.log('Exportado a:', resultado.filePath);
        }

    }
    catch (error) {

        console.error('Error al exportar:', error);
        alert('No fue posible exportar la tabla.');

    }

}

if (btnExportar && menuExportar) {

    btnExportar.addEventListener('click', (e) => {

        e.preventDefault();
        e.stopPropagation();

        const abierto = menuExportar.classList.toggle('show');

        btnExportar.setAttribute(
            'aria-expanded',
            abierto ? 'true' : 'false'
        );

    });

    menuExportar.addEventListener('click', (e) => {

        const item = e.target.closest('[data-formato]');
        if (!item) return;

        e.preventDefault();

        menuExportar.classList.remove('show');
        btnExportar.setAttribute('aria-expanded', 'false');

        exportarCompras(item.dataset.formato);

    });

    document.addEventListener('click', (e) => {

        if (
            btnExportar.contains(e.target) ||
            menuExportar.contains(e.target)
        ) {
            return;
        }

        menuExportar.classList.remove('show');
        btnExportar.setAttribute('aria-expanded', 'false');

    });

}

// =====================================
// MODAL
// =====================================

btnAgregar.addEventListener('click', () => {

    setModoNuevaCompra();

    registroNuevoModal.style.display = 'flex';

    registroNuevoModal.setAttribute(
        'aria-hidden',
        'false'
    );

});

if (btnCerrarModal) {

    btnCerrarModal.addEventListener(
        'click',
        () => {

            registroNuevoModal.style.display =
                'none';

            registroNuevoModal.setAttribute(
                'aria-hidden',
                'true'
            );

        }
    );

}

registroNuevoModal.addEventListener(
    'click',
    (e) => {

        if (e.target === registroNuevoModal) {

            registroNuevoModal.style.display =
                'none';

            registroNuevoModal.setAttribute(
                'aria-hidden',
                'true'
            );

        }

    }
);

document.addEventListener(
    'click',
    async (e) => {

        const btnEditar =
            e.target.closest('.btn-editar-fila');

        if (!btnEditar) return;

        e.preventDefault();
        e.stopPropagation();

        try {

            const id =
                btnEditar.dataset.id;

            const compra =
                await comprasService.obtenerCompraPorId(
                    id
                );

            if (!compra) {
                alert(
                    'No se encontro la compra seleccionada.'
                );
                return;
            }

            setModoEditarCompra(compra);

            registroNuevoModal.style.display =
                'flex';

            registroNuevoModal.setAttribute(
                'aria-hidden',
                'false'
            );

        }
        catch (error) {

            console.error(error);

            alert(
                'No fue posible cargar la compra.'
            );

        }

    }
);

document.addEventListener(
    'click',
    async (e) => {

        const btnEliminar =
            e.target.closest('.btn-eliminar-fila');

        if (!btnEliminar) return;

        e.preventDefault();
        e.stopImmediatePropagation();

        const confirmado =
            confirm(
                'Estas seguro de que deseas eliminar este registro?'
            );

        if (!confirmado) return;

        try {

            await comprasService.eliminarCompra(
                btnEliminar.dataset.id
            );

            await cargarCompras();

        }
        catch (error) {

            console.error(error);

            alert(
                'No fue posible eliminar la compra.'
            );

        }

    },
    true
);

[
    filtroComprasTexto,
    filtroComprasEstatus,
    filtroComprasDepartamento,
    filtroComprasUnidad
]
    .filter(Boolean)
    .forEach((control) => {

        control.addEventListener(
            'input',
            aplicarFiltrosCompras
        );

        control.addEventListener(
            'change',
            aplicarFiltrosCompras
        );

    });

if (btnLimpiarFiltrosCompras) {

    btnLimpiarFiltrosCompras.addEventListener(
        'click',
        () => {

            if (filtroComprasTexto) {
                filtroComprasTexto.value = '';
            }

            if (filtroComprasEstatus) {
                filtroComprasEstatus.value = '';
            }

            if (filtroComprasDepartamento) {
                filtroComprasDepartamento.value = '';
            }

            if (filtroComprasUnidad) {
                filtroComprasUnidad.value = '';
            }

            mesSeleccionadoCompra = '';

            if (labelMesCompras) {
                labelMesCompras.textContent = '';
            }

            aplicarFiltrosCompras();

        }
    );

}

if (menuMesesCompras) {

    menuMesesCompras.addEventListener(
        'click',
        (e) => {

            const item =
                e.target.closest('[data-mes]');

            if (!item) return;

            e.preventDefault();

            mesSeleccionadoCompra =
                item.dataset.mes || '';

            if (labelMesCompras) {

                labelMesCompras.textContent =
                    mesSeleccionadoCompra
                        ? `del ${item.dataset.label}`
                        : '';

            }

            menuMesesCompras.classList.remove(
                'show'
            );

            if (btnMensual) {
                btnMensual.setAttribute(
                    'aria-expanded',
                    'false'
                );
            }

            aplicarFiltrosCompras();

        }
    );

}

if (
    btnMensual &&
    menuMesesCompras
) {

    btnMensual.addEventListener(
        'click',
        (e) => {

            e.preventDefault();
            e.stopPropagation();

            const estaAbierto =
                menuMesesCompras.classList.toggle(
                    'show'
                );

            btnMensual.setAttribute(
                'aria-expanded',
                estaAbierto ? 'true' : 'false'
            );

        }
    );

    document.addEventListener(
        'click',
        (e) => {

            if (
                btnMensual.contains(e.target) ||
                menuMesesCompras.contains(e.target)
            ) {
                return;
            }

            menuMesesCompras.classList.remove(
                'show'
            );

            btnMensual.setAttribute(
                'aria-expanded',
                'false'
            );

        }
    );

}

// =====================================
// RENDER TABLA
// =====================================

function renderCompras(rows) {

    const tbody =
        document.querySelector(
            '#tablaCompras tbody'
        );

    if (!tbody) return;

    tbody.innerHTML = '';

    if (!rows.length) {

        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="text-center text-muted py-4">
                    No hay compras que coincidan con los filtros.
                </td>
            </tr>
        `;

        return;

    }

    rows.forEach((compra) => {

        const tr =
            document.createElement('tr');

        // Color FIJO de la fila según el estatus (independiente del tema).
        // Se usa la variable --bs-table-bg que Bootstrap aplica a las celdas,
        // de modo que toda la fila queda pintada con el color del estatus.
        const colorFila =
            getColorSemaforo(compra.estatus);

        if (colorFila && colorFila !== 'transparent') {
            tr.style.setProperty('--bs-table-bg', colorFila);
            tr.style.setProperty('--bs-table-accent-bg', colorFila);
            // Texto oscuro para legibilidad sobre el fondo claro, sin importar
            // el tema (p. ej. el tema oscuro usaría texto claro por defecto).
            tr.style.setProperty('--bs-table-color', '#212529');
            tr.style.color = '#212529';
        }

        tr.innerHTML = `
            <td>${compra.cantidad ?? ''}</td>
            <td>${compra.producto ?? ''}</td>
            <td>${compra.departamento ?? ''}</td>
            <td>${compra.unidad_negocio ?? ''}</td>
            <td>${compra.colaborador ?? ''}</td>
            <td>${compra.fecha_solicitud ?? ''}</td>
            <td>${compra.cotizacion ?? ''}</td>
            <td>${compra.estatus ?? ''}</td>
            <td>${compra.codigo ?? ''}</td>
            <td>${compra.notas ?? ''}</td>

            <td class="action-cell">
                <div class="action-buttons">

                    <button
                        type="button"
                        class="btn btn-sm btn-outline-primary btn-editar-fila"
                        data-id="${compra.id}"
                        title="Editar">

                        <i class="bi bi-pencil-fill"></i>

                    </button>

                    <button
                        type="button"
                        class="btn btn-sm btn-outline-danger btn-eliminar-fila"
                        data-id="${compra.id}"
                        title="Eliminar">

                        <i class="bi bi-trash-fill"></i>

                    </button>

                </div>
            </td>
        `;

        tbody.appendChild(tr);

    });

}

// =====================================
// CARGAR COMPRAS
// =====================================

async function cargarCompras() {

    try {

        const compras =
            await comprasService.obtenerCompras();

        comprasCache = compras;

        actualizarOpcionesFiltros(
            comprasCache
        );

        aplicarFiltrosCompras();

    }
    catch (error) {

        console.error(
            'Error cargando compras:',
            error
        );

    }

}

// =====================================
// GUARDAR COMPRA
// =====================================

purchaseForm.addEventListener(
    'submit',
    async (e) => {

        e.preventDefault();

        try {

            const datos = {

                cantidad: parseInt(
                    document.getElementById(
                        'itemNumber'
                    ).value
                ),

                producto:
                    document.getElementById(
                        'productName'
                    ).value,

                departamento:
                    document.getElementById(
                        'department'
                    ).value,

                unidad_negocio:
                    document.getElementById(
                        'businessUnit'
                    ).value,

                colaborador:
                    document.getElementById(
                        'colaborador'
                    ).value,

                fecha_solicitud:
                    document.getElementById(
                        'requestDate'
                    ).value,

                cotizacion:
                    document.getElementById(
                        'cotizacion'
                    ).value,

                estatus:
                    document.getElementById(
                        'status'
                    ).value,

                codigo:
                    document.getElementById(
                        'productCode'
                    ).value,

                notas:
                    document.getElementById(
                        'notes'
                    ).value

            };

            if (compraEditandoId) {

                await comprasService.actualizarCompra(
                    compraEditandoId,
                    datos
                );

            }
            else {

                await comprasService.guardarCompra(
                    datos
                );

            }

            purchaseForm.reset();
            compraEditandoId = null;

            registroNuevoModal.style.display =
                'none';

            registroNuevoModal.setAttribute(
                'aria-hidden',
                'true'
            );

            await cargarCompras();

        }
        catch (error) {

            console.error(error);

            alert(
                'No fue posible guardar la compra.'
            );

        }

    }

);

// =====================================
// CARGA INICIAL
// =====================================

construirMenuMeses();

// Poblar los selects del formulario desde la BD antes de cargar los
// datos, de modo que al abrir el modal de edicion el valor existente
// ya tenga su <option> disponible para seleccionarse.
cargarSelectsFormulario().then(() => {
    cargarCompras();
});

return true;


}

// =====================================
// ESPERAR A QUE EL FRAGMENTO EXISTA
// =====================================

function waitForComprasRoot() {


const formId = 'purchaseForm';

if (
    document.getElementById(formId)
) {

    initCompras();
    return;

}

const observer =
    new MutationObserver(() => {

        if (
            document.getElementById(
                formId
            )
        ) {

            observer.disconnect();
            initCompras();

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


waitForComprasRoot();


}
