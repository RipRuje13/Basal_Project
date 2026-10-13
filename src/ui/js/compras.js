const comprasService = require('../../services/compras.service');

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

// =====================================
// FUNCIONES AUXILIARES
// =====================================

function getFilaClassPorEstatus(estatusRaw) {

    const estatus =
        (estatusRaw ?? '')
            .toString()
            .trim()
            .toUpperCase();

    if (estatus === 'POR SOLICITAR') {
        return 'table-info';
    }

    if (estatus === 'APROBADO') {
        return 'table-warning';
    }

    if (estatus === 'ENTREGADO') {
        return 'table-success';
    }

    if (estatus === 'CANCELADO') {
        return 'table-dark';
    }

    return '';
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

function crearInfoMes(fechaRaw) {

    if (!fechaRaw) return null;

    const partes =
        fechaRaw.toString().split('-');

    if (partes.length < 2) return null;

    const anio =
        Number(partes[0]);

    const mes =
        Number(partes[1]);

    if (!anio || !mes) return null;

    const fecha =
        new Date(anio, mes - 1, 1);

    const nombre =
        fecha.toLocaleDateString(
            'es-MX',
            {
                month: 'long',
                year: 'numeric'
            }
        );

    return {
        key: `${anio}-${partes[1]}`,
        label: nombre.charAt(0).toUpperCase() +
            nombre.slice(1),
        sortValue: anio * 100 + mes
    };

}

function actualizarMenuMeses(rows) {

    if (!menuMesesCompras) return;

    const mesesPorKey =
        new Map();

    rows.forEach((compra) => {

        const infoMes =
            crearInfoMes(compra.fecha_solicitud);

        if (infoMes) {
            mesesPorKey.set(
                infoMes.key,
                infoMes
            );
        }

    });

    const meses =
        [...mesesPorKey.values()]
            .sort((a, b) =>
                b.sortValue - a.sortValue
            );

    menuMesesCompras.innerHTML = '';

    if (!meses.length) {

        const item =
            document.createElement('button');

        item.type = 'button';
        item.className =
            'dropdown-item disabled';
        item.textContent =
            'Sin meses registrados';

        menuMesesCompras.appendChild(item);

        mesSeleccionadoCompra = '';

        if (labelMesCompras) {
            labelMesCompras.textContent = '';
        }

        return;

    }

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

    meses.forEach((mes) => {

        const item =
            document.createElement('button');

        item.type = 'button';
        item.className = 'dropdown-item';
        item.dataset.mes = mes.key;
        item.dataset.label = mes.label;
        item.textContent = mes.label;

        menuMesesCompras.appendChild(item);

    });

    const mesTodaviaExiste =
        meses.some((mes) =>
            mes.key === mesSeleccionadoCompra
        );

    if (!mesTodaviaExiste) {
        mesSeleccionadoCompra = '';

        if (labelMesCompras) {
            labelMesCompras.textContent = '';
        }
    }

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

        const infoMesCompra =
            crearInfoMes(
                compra.fecha_solicitud
            );

        const coincideMes =
            !mesSeleccionadoCompra ||
            infoMesCompra?.key === mesSeleccionadoCompra;

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

function aplicarFiltrosCompras() {

    renderCompras(
        obtenerComprasFiltradas()
    );

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
                <td colspan="10" class="text-center text-muted py-4">
                    No hay compras que coincidan con los filtros.
                </td>
            </tr>
        `;

        return;

    }

    rows.forEach((compra) => {

        const tr =
            document.createElement('tr');

        const clase =
            getFilaClassPorEstatus(
                compra.estatus
            );

        if (clase) {
            tr.classList.add(clase);
        }

        tr.innerHTML = `
            <td>${compra.cantidad ?? ''}</td>
            <td>${compra.producto ?? ''}</td>
            <td>${compra.departamento ?? ''}</td>
            <td>${compra.unidad_negocio ?? ''}</td>
            <td>${compra.colaborador ?? ''}</td>
            <td>${compra.fecha_solicitud ?? ''}</td>
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

        actualizarMenuMeses(
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
console.log("entro a la funcion guardar");
    }
    
);

// =====================================
// CARGA INICIAL
// =====================================

cargarCompras();

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
