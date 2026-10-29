const { webUtils } = require('electron');
const { pathToFileURL } = require('url');
const path = require('path');
const fs = require('fs');
const { ipcRenderer } = require('electron');
const almacenService = require('../../services/almacen.service');
const gestionService = require('../../services/gestion.service');
const { FOTOS_DIR } = require('../../database/paths');

function initAlmacen() {
    const almacenForm = document.getElementById('almacenForm');
    const btnAgregar = document.getElementById('btnAgregarAlmacen');
    const registroModal = document.getElementById('registroNuevoModalAlmacen');
    const btnCerrarModal = document.getElementById('btnCerrarModalAlmacen');
    const filtroTexto = document.getElementById('filtroAlmacenTexto');
    const filtroFunciona = document.getElementById('filtroAlmacenFunciona');
    const filtroDepartamento = document.getElementById('filtroAlmacenDepartamento');
    const filtroUbicacion = document.getElementById('filtroAlmacenUbicacion');
    const btnLimpiarFiltros = document.getElementById('btnLimpiarFiltrosAlmacen');
    const btnMensual = document.getElementById('btnMensualAlmacen');
    const menuMeses = document.getElementById('menuMesesAlmacen');
    const labelMes = document.getElementById('labelMesAlmacen');
    const inputFotos = document.getElementById('imagenesProducto');
    const btnCerrarDetalle = document.getElementById('btnCerrarDetalleAlmacen');
    const btnEditarDetalle = document.getElementById('btnEditarDetalleAlmacen');

    if (!almacenForm || !btnAgregar || !registroModal) {
        return false;
    }

    let productoEditandoId = null;
    let productoSeleccionadoId = null;
    let almacenCache = [];
    let mesSeleccionado = '';

    function normalizarTexto(valor) {
        return (valor ?? '').toString().trim().toLowerCase();
    }

    function escapeHtml(valor) {
        return (valor ?? '')
            .toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function getFotoSrc(ruta) {
        if (!ruta) return '';

        const texto = ruta.toString();

        if (
            texto.startsWith('file:') ||
            texto.startsWith('data:') ||
            texto.startsWith('http://') ||
            texto.startsWith('https://')
        ) {
            return texto;
        }

        return pathToFileURL(texto).href;
    }

    // URL file:// de la imagen de reemplazo "Not-Found.png", que se muestra
    // cuando una foto fue borrada o movida y no se encuentra. Se resuelve
    // desde la carpeta de fotos centralizada (data/ en dev, userData en prod).
    function getNotFoundSrc() {
        const ruta = path.join(FOTOS_DIR, 'Not-Found.png');
        return pathToFileURL(ruta).href;
    }

    function getFotoNombre(ruta) {
        if (!ruta) return 'Sin nombre';

        const partes = ruta.toString().split(/[\\/]/);
        return partes[partes.length - 1] || 'Sin nombre';
    }

    function mostrarModal() {
        registroModal.style.display = 'flex';
        registroModal.setAttribute('aria-hidden', 'false');
    }

    function ocultarModal() {
        registroModal.style.display = 'none';
        registroModal.setAttribute('aria-hidden', 'true');
    }

    function getProductoSeleccionado() {
        return almacenCache.find(
            (producto) => Number(producto.id) === Number(productoSeleccionadoId)
        );
    }

    function llenarSelectFiltro(select, valores, textoInicial) {
        if (!select) return;

        const valorActual = select.value;
        select.innerHTML = `<option value="">${textoInicial}</option>`;

        valores.forEach((valor) => {
            const option = document.createElement('option');
            option.value = valor;
            option.textContent = valor;
            select.appendChild(option);
        });

        select.value = valores.includes(valorActual)
            ? valorActual
            : '';
    }

    async function cargarDepartamentosFormulario() {
        const select = document.getElementById('almacenDepartamento');
        if (!select) return;

        try {
            const departamentos = await gestionService.obtenerDepartamentos();

            select.innerHTML =
                '<option value="" selected disabled>Seleccione un departamento</option>';

            departamentos.forEach((fila) => {
                const option = document.createElement('option');
                option.value = fila.nombre;
                option.textContent = fila.nombre;
                select.appendChild(option);
            });
        }
        catch (error) {
            console.error(
                'Error cargando departamentos del formulario de almacen:',
                error
            );
        }
    }

    async function cargarUbicacionesFormulario() {
        const select = document.getElementById('almacenUbicacion');
        if (!select) return;

        try {
            const ubicaciones = await gestionService.obtenerUbicaciones();

            select.innerHTML =
                '<option value="" selected disabled>Seleccione la oficina</option>';

            ubicaciones.forEach((fila) => {
                const option = document.createElement('option');
                option.value = fila.nombre;
                option.textContent = fila.nombre;
                select.appendChild(option);
            });
        }
        catch (error) {
            console.error(
                'Error cargando ubicaciones del formulario de almacen:',
                error
            );
        }
    }

    function crearInfoMes(fechaRaw) {
        if (!fechaRaw) return null;

        const partes = fechaRaw.toString().split('-');
        if (partes.length < 2) return null;

        const anio = Number(partes[0]);
        const mes = Number(partes[1]);
        if (!anio || !mes) return null;

        const fecha = new Date(anio, mes - 1, 1);
        const nombre = fecha.toLocaleDateString('es-MX', {
            month: 'long',
            year: 'numeric'
        });

        return {
            key: `${anio}-${partes[1]}`,
            label: nombre.charAt(0).toUpperCase() + nombre.slice(1),
            sortValue: anio * 100 + mes
        };
    }

    function actualizarMenuMeses(rows) {
        if (!menuMeses) return;

        const mesesPorKey = new Map();

        rows.forEach((producto) => {
            const infoMes = crearInfoMes(producto.fecha_ingreso);

            if (infoMes) {
                mesesPorKey.set(infoMes.key, infoMes);
            }
        });

        const meses = [...mesesPorKey.values()]
            .sort((a, b) => b.sortValue - a.sortValue);

        menuMeses.innerHTML = '';

        if (!meses.length) {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'dropdown-item disabled';
            item.textContent = 'Sin meses registrados';
            menuMeses.appendChild(item);

            mesSeleccionado = '';
            if (labelMes) labelMes.textContent = '';
            return;
        }

        const itemTodos = document.createElement('button');
        itemTodos.type = 'button';
        itemTodos.className = 'dropdown-item';
        itemTodos.dataset.mes = '';
        itemTodos.textContent = 'Todos los meses';
        menuMeses.appendChild(itemTodos);

        const separador = document.createElement('div');
        separador.className = 'dropdown-divider';
        menuMeses.appendChild(separador);

        meses.forEach((mes) => {
            const item = document.createElement('button');
            item.type = 'button';
            item.className = 'dropdown-item';
            item.dataset.mes = mes.key;
            item.dataset.label = mes.label;
            item.textContent = mes.label;
            menuMeses.appendChild(item);
        });

        const existe = meses.some((mes) => mes.key === mesSeleccionado);
        if (!existe) {
            mesSeleccionado = '';
            if (labelMes) labelMes.textContent = '';
        }
    }

    function actualizarOpcionesFiltros(rows) {
        const departamentos = [
            ...new Set(rows.map((producto) => producto.departamento).filter(Boolean))
        ].sort();

        const ubicaciones = [
            ...new Set(rows.map((producto) => producto.ubicacion).filter(Boolean))
        ].sort();

        llenarSelectFiltro(filtroDepartamento, departamentos, 'Todos');
        llenarSelectFiltro(filtroUbicacion, ubicaciones, 'Todas');
    }

    function obtenerProductosFiltrados() {
        const texto = normalizarTexto(filtroTexto?.value);
        const funciona = normalizarTexto(filtroFunciona?.value);
        const departamento = normalizarTexto(filtroDepartamento?.value);
        const ubicacion = normalizarTexto(filtroUbicacion?.value);

        return almacenCache.filter((producto) => {
            const infoMes = crearInfoMes(producto.fecha_ingreso);

            const coincideMes =
                !mesSeleccionado ||
                infoMes?.key === mesSeleccionado;

            const coincideTexto =
                !texto ||
                [
                    producto.id,
                    producto.producto,
                    producto.marca,
                    producto.modelo,
                    producto.no_serie,
                    producto.codigo_etiqueta,
                    producto.departamento,
                    producto.caracteristicas,
                    producto.funciona,
                    producto.ubicacion,
                    producto.usuarios,
                    producto.fecha_ingreso
                ]
                    .map(normalizarTexto)
                    .some((valor) => valor.includes(texto));

            const coincideFunciona =
                !funciona ||
                normalizarTexto(producto.funciona) === funciona;

            const coincideDepartamento =
                !departamento ||
                normalizarTexto(producto.departamento) === departamento;

            const coincideUbicacion =
                !ubicacion ||
                normalizarTexto(producto.ubicacion) === ubicacion;

            return (
                coincideMes &&
                coincideTexto &&
                coincideFunciona &&
                coincideDepartamento &&
                coincideUbicacion
            );
        });
    }

    function renderHistorial(eventos, vacio) {
        if (!eventos?.length) {
            return `<div class="text-muted">${escapeHtml(vacio)}</div>`;
        }

        return `
            <ul class="list-unstyled mb-0">
                ${eventos.map((evento) => `
                    <li class="historial-item">
                        <span class="fw-semibold">${escapeHtml(evento.fecha)}</span>
                        <span>${escapeHtml(evento.tipo)}:</span>
                        <span>${escapeHtml(evento.anterior || 'Sin dato')}</span>
                        <span class="text-muted">a</span>
                        <span>${escapeHtml(evento.nuevo || 'Sin dato')}</span>
                    </li>
                `).join('')}
            </ul>
        `;
    }

    function setTexto(id, valor, vacio) {
        const el = document.getElementById(id);
        if (!el) return;

        el.textContent = valor || vacio;
        el.classList.toggle('text-muted', !valor);
    }

    function renderDetalle(producto) {
        const badge = document.getElementById('detalleFuncionaBadge');
        const idHeader = document.getElementById('detalleProductoId');
        const btnEditar = document.getElementById('btnEditarDetalleAlmacen');

        if (!producto) {
            if (idHeader) idHeader.textContent = 'sin seleccionar';
            if (badge) {
                badge.className = 'badge bg-secondary fs-6';
                badge.textContent = 'Sin producto';
            }

            setTexto('detalleId', '', 'Selecciona un producto de la tabla.');
            setTexto('detalleProducto', '', 'Sin producto seleccionado.');
            setTexto('detalleMarca', '', 'La marca aparecera aqui.');
            setTexto('detalleModelo', '', 'El modelo aparecera aqui.');
            setTexto('detalleNoSerie', '', 'El numero de serie aparecera aqui.');
            setTexto('detalleCodigoEtiqueta', '', 'El codigo de etiqueta aparecera aqui.');
            setTexto('detalleDepartamento', '', 'El departamento aparecera aqui.');
            setTexto('detalleUbicacion', '', 'La ubicacion aparecera aqui.');
            setTexto('detalleUsuarioActual', '', 'El usuario aparecera aqui.');
            setTexto('detalleFechaIngreso', '', 'La fecha de ingreso aparecera aqui.');

            const caracteristicas = document.getElementById('detalleCaracteristicas');
            if (caracteristicas) {
                caracteristicas.textContent =
                    'Selecciona un producto para ver sus caracteristicas.';
                caracteristicas.classList.add('text-muted');
            }

            const usuarios = document.getElementById('detalleHistorialUsuarios');
            if (usuarios) {
                usuarios.innerHTML = 'Aun no hay un producto seleccionado.';
                usuarios.classList.add('text-muted');
            }

            const ubicaciones = document.getElementById('detalleHistorialUbicaciones');
            if (ubicaciones) {
                ubicaciones.innerHTML = 'Aun no hay un producto seleccionado.';
                ubicaciones.classList.add('text-muted');
            }

            renderGaleria([]);
            if (inputFotos) inputFotos.disabled = true;
            if (btnEditar) btnEditar.disabled = true;
            return;
        }

        if (idHeader) idHeader.textContent = producto.id;
        if (badge) {
            const funciona = normalizarTexto(producto.funciona);
            badge.className =
                funciona === 'si'
                    ? 'badge bg-success fs-6'
                    : 'badge bg-danger fs-6';
            badge.textContent = producto.funciona || 'Sin estatus';
        }

        setTexto('detalleId', producto.id, 'Sin ID');
        setTexto('detalleProducto', producto.producto, 'Sin producto');
        setTexto('detalleMarca', producto.marca, 'Sin marca');
        setTexto('detalleModelo', producto.modelo, 'Sin modelo');
        setTexto('detalleNoSerie', producto.no_serie, 'Sin numero de serie');
        setTexto('detalleCodigoEtiqueta', producto.codigo_etiqueta, 'Sin codigo');
        setTexto('detalleDepartamento', producto.departamento, 'Sin departamento');
        setTexto('detalleUbicacion', producto.ubicacion, 'Sin ubicacion');
        setTexto('detalleUsuarioActual', producto.usuario_actual, 'Sin usuario');
        setTexto('detalleFechaIngreso', producto.fecha_ingreso, 'Sin fecha');

        const caracteristicas = document.getElementById('detalleCaracteristicas');
        if (caracteristicas) {
            caracteristicas.textContent =
                producto.caracteristicas || 'Sin caracteristicas registradas.';
            caracteristicas.classList.toggle('text-muted', !producto.caracteristicas);
        }

        const usuarios = document.getElementById('detalleHistorialUsuarios');
        if (usuarios) {
            usuarios.innerHTML = renderHistorial(
                producto.historial_usuarios,
                'Sin historial de usuarios.'
            );
            usuarios.classList.remove('text-muted');
        }

        const ubicaciones = document.getElementById('detalleHistorialUbicaciones');
        if (ubicaciones) {
            ubicaciones.innerHTML = renderHistorial(
                producto.historial_ubicaciones,
                'Sin historial de ubicaciones.'
            );
            ubicaciones.classList.remove('text-muted');
        }

        renderGaleria(producto.fotografias || []);
        if (inputFotos) inputFotos.disabled = false;
        if (btnEditar) btnEditar.disabled = false;
    }

    function renderGaleria(fotografias) {
        const galeria = document.getElementById('galeriaProducto');
        const conteo = document.getElementById('detalleFotosConteo');

        if (conteo) conteo.textContent = fotografias.length;
        if (!galeria) return;

        galeria.className = 'galeria-producto';

        if (!fotografias.length) {
            galeria.classList.add('galeria-vacia');
            galeria.innerHTML = `
                <div class="text-muted text-center py-4">
                    No hay fotografias para este producto.
                </div>
            `;
            return;
        }

        if (fotografias.length <= 2) {
            galeria.classList.add('galeria-centrada');
        }

        if (fotografias.length > 3) {
            galeria.classList.add('galeria-carrusel');
        }

        const notFoundSrc = getNotFoundSrc();

        galeria.innerHTML = fotografias.map((foto) => `
            <div class="foto-producto">
                <img
                    src="${escapeHtml(getFotoSrc(foto))}"
                    alt="Fotografia del producto"
                    onerror="this.onerror=null; this.src='${escapeHtml(notFoundSrc)}';" />
                <div class="foto-producto-nombre" title="${escapeHtml(getFotoNombre(foto))}">
                    ${escapeHtml(getFotoNombre(foto))}
                </div>
                <button
                    type="button"
                    class="btn btn-sm btn-danger btn-eliminar-foto"
                    data-ruta="${escapeHtml(foto)}"
                    title="Eliminar fotografia"
                >
                    <i class="bi bi-trash-fill"></i>
                </button>
            </div>
        `).join('');
    }

    function setModoNuevo() {
        productoEditandoId = null;
        almacenForm.reset();

        const titulo = registroModal.querySelector('h5');
        if (titulo) titulo.textContent = 'Nueva Solicitud';

        const fecha = document.getElementById('almacenFechaIngreso');
        if (fecha && !fecha.value) {
            fecha.value = new Date().toISOString().slice(0, 10);
        }
    }

    function setModoEditar(producto) {
        productoEditandoId = producto.id;

        document.getElementById('almacenProducto').value = producto.producto ?? '';
        document.getElementById('almacenMarca').value = producto.marca ?? '';
        document.getElementById('almacenModelo').value = producto.modelo ?? '';
        document.getElementById('almacenNoSerie').value = producto.no_serie ?? '';
        document.getElementById('almacenCodigoEtiqueta').value = producto.codigo_etiqueta ?? '';
        document.getElementById('almacenDepartamento').value = producto.departamento ?? '';
        document.getElementById('almacenCaracteristicas').value = producto.caracteristicas ?? '';
        document.getElementById('almacenFunciona').value = producto.funciona ?? '';
        document.getElementById('almacenUbicacion').value = producto.ubicacion ?? '';
        document.getElementById('almacenUsuario').value = producto.usuario_actual ?? '';
        document.getElementById('almacenFechaIngreso').value = producto.fecha_ingreso ?? '';

        const titulo = registroModal.querySelector('h5');
        if (titulo) titulo.textContent = 'Editar Solicitud';
    }

    function getDatosFormulario() {
        return {
            producto: document.getElementById('almacenProducto').value.trim(),
            marca: document.getElementById('almacenMarca').value.trim(),
            modelo: document.getElementById('almacenModelo').value.trim(),
            no_serie: document.getElementById('almacenNoSerie').value.trim(),
            codigo_etiqueta: document.getElementById('almacenCodigoEtiqueta').value.trim(),
            departamento: document.getElementById('almacenDepartamento').value,
            caracteristicas: document.getElementById('almacenCaracteristicas').value.trim(),
            funciona: document.getElementById('almacenFunciona').value,
            ubicacion: document.getElementById('almacenUbicacion').value,
            usuarios: document.getElementById('almacenUsuario').value.trim(),
            fecha_ingreso: document.getElementById('almacenFechaIngreso').value
        };
    }

    function renderAlmacen(rows) {
        const tbody = document.querySelector('#tablaAlmacen tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (!rows.length) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="13" class="text-center text-muted py-4">
                        No hay productos que coincidan con los filtros.
                    </td>
                </tr>
            `;
            return;
        }

        rows.forEach((producto) => {
            const tr = document.createElement('tr');
            const funciona = normalizarTexto(producto.funciona);
            tr.dataset.id = producto.id;
            tr.classList.toggle(
                'table-active',
                Number(producto.id) === Number(productoSeleccionadoId)
            );

            if (funciona === 'si') {
                tr.classList.add('table-success');
            } else if (funciona === 'no') {
                tr.classList.add('table-danger');
            }

            tr.innerHTML = `
                <td>${escapeHtml(producto.id)}</td>
                <td>${escapeHtml(producto.producto)}</td>
                <td>${escapeHtml(producto.marca)}</td>
                <td>${escapeHtml(producto.modelo)}</td>
                <td>${escapeHtml(producto.no_serie)}</td>
                <td>${escapeHtml(producto.codigo_etiqueta)}</td>
                <td>${escapeHtml(producto.departamento)}</td>
                <td>${escapeHtml(producto.caracteristicas)}</td>
                <td>${escapeHtml(producto.funciona)}</td>
                <td>${escapeHtml(producto.ubicacion)}</td>
                <td>${escapeHtml(producto.usuarios)}</td>
                <td>${escapeHtml(producto.fecha_ingreso)}</td>
                <td class="action-cell">
                    <div class="action-buttons">
                        <button
                            type="button"
                            class="btn btn-sm btn-outline-primary btn-editar-almacen"
                            data-id="${escapeHtml(producto.id)}"
                            title="Editar"
                        >
                            <i class="bi bi-pencil-fill"></i>
                        </button>

                        <button
                            type="button"
                            class="btn btn-sm btn-outline-danger btn-eliminar-almacen"
                            data-id="${escapeHtml(producto.id)}"
                            title="Eliminar"
                        >
                            <i class="bi bi-trash-fill"></i>
                        </button>
                    </div>
                </td>
            `;

            tbody.appendChild(tr);
        });
    }

    function aplicarFiltros() {
        renderAlmacen(obtenerProductosFiltrados());
    }

    // =====================================
    // EXPORTAR (EXCEL / PDF) CON IMÁGENES
    // =====================================

    const btnExportarAlmacen =
        document.getElementById('btnExportarAlmacen');

    const menuExportarAlmacen =
        document.getElementById('menuExportarAlmacen');

    // Columnas de datos a exportar (sin las fotos, que van en su propia columna).
    const COLUMNAS_EXPORT_ALMACEN = [
        { clave: 'id', titulo: 'ID' },
        { clave: 'producto', titulo: 'Producto' },
        { clave: 'marca', titulo: 'Marca' },
        { clave: 'modelo', titulo: 'Modelo' },
        { clave: 'no_serie', titulo: 'No. Serie' },
        { clave: 'codigo_etiqueta', titulo: 'Código Etiqueta' },
        { clave: 'departamento', titulo: 'Departamento' },
        { clave: 'funciona', titulo: 'Funciona' },
        { clave: 'ubicacion', titulo: 'Ubicación' },
        { clave: 'usuario_actual', titulo: 'Usuario' },
        { clave: 'fecha_ingreso', titulo: 'Fecha Ingreso' }
    ];

    // Lee una imagen de disco y la devuelve como data URI base64, o null si no
    // existe o no se puede leer. Así las imágenes viajan dentro del archivo.
    function imagenADataUri(ruta) {
        try {
            if (!ruta) return null;
            const limpia = ruta.toString().replace(/^file:\/\//i, '');
            const rutaFs = decodeURI(limpia);
            if (!fs.existsSync(rutaFs)) return null;

            const ext = (path.extname(rutaFs).replace('.', '') || 'png').toLowerCase();
            const mime = ext === 'jpg' ? 'jpeg' : ext;
            const datos = fs.readFileSync(rutaFs).toString('base64');
            return `data:image/${mime};base64,${datos}`;
        }
        catch (e) {
            return null;
        }
    }

    // Devuelve el HTML de las imágenes de un producto (hasta un máximo), ya
    // como data URI. Si una no se encuentra, se omite.
    function imagenesHtmlProducto(producto, maxImgs) {
        const fotos = Array.isArray(producto.fotografias) ? producto.fotografias : [];
        const html = [];

        for (const foto of fotos) {
            if (html.length >= maxImgs) break;
            const dataUri = imagenADataUri(foto);
            if (dataUri) {
                html.push(`<img src="${dataUri}" style="max-width:120px;max-height:90px;margin:2px;border:1px solid #ccc;" />`);
            }
        }

        return html.length ? html.join('') : '<span style="color:#999">Sin imágenes</span>';
    }

    function describirFiltrosAlmacen() {
        const partes = [];
        const texto = (filtroTexto?.value || '').trim();
        if (texto) partes.push(`Búsqueda: "${texto}"`);
        const funciona = (filtroFunciona?.value || '').trim();
        if (funciona) partes.push(`Funciona: ${funciona}`);
        const depto = (filtroDepartamento?.value || '').trim();
        if (depto) partes.push(`Departamento: ${depto}`);
        const ubic = (filtroUbicacion?.value || '').trim();
        if (ubic) partes.push(`Ubicación: ${ubic}`);
        if (mesSeleccionado) partes.push(`Mes de ingreso: ${mesSeleccionado}`);
        return partes.length ? partes.join('  |  ') : 'Sin filtros (todos los registros)';
    }

    function timestampArchivo() {
        const n = new Date();
        const p = (x) => String(x).padStart(2, '0');
        return `${n.getFullYear()}${p(n.getMonth() + 1)}${p(n.getDate())}_${p(n.getHours())}${p(n.getMinutes())}`;
    }

    // Construye el cuerpo HTML (filas) compartido por Excel y PDF.
    function construirFilasAlmacen(rows, maxImgs) {
        return rows.map((prod) => {
            const celdas = COLUMNAS_EXPORT_ALMACEN
                .map((col) => `<td>${escapeHtml(prod[col.clave])}</td>`)
                .join('');
            const imgs = imagenesHtmlProducto(prod, maxImgs);
            return `<tr>${celdas}<td>${imgs}</td></tr>`;
        }).join('');
    }

    function encabezadoAlmacen() {
        return COLUMNAS_EXPORT_ALMACEN
            .map((col) => `<th>${escapeHtml(col.titulo)}</th>`)
            .join('') + '<th>Imágenes</th>';
    }

    async function exportarAlmacenExcel(rows) {
        const html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office"
                  xmlns:x="urn:schemas-microsoft-com:office:excel"
                  xmlns="http://www.w3.org/TR/REC-html40">
            <head><meta charset="UTF-8" />
            <style>
                table { border-collapse: collapse; }
                th, td { border: 1px solid #999; padding: 4px 8px; vertical-align: top; }
                th { background: #0d6efd; color: #fff; }
            </style></head>
            <body>
                <table>
                    <thead><tr>${encabezadoAlmacen()}</tr></thead>
                    <tbody>${construirFilasAlmacen(rows, 3)}</tbody>
                </table>
            </body></html>
        `;

        const contenido = '\uFEFF' + html;

        return ipcRenderer.invoke('exportar-archivo', {
            contenido,
            nombreSugerido: `almacen_${timestampArchivo()}.xls`,
            filtros: [{ name: 'Excel', extensions: ['xls'] }]
        });
    }

    async function exportarAlmacenPdf(rows) {
        const filtrosTexto = escapeHtml(describirFiltrosAlmacen());
        const fecha = new Date().toLocaleString('es-MX');

        const html = `
            <!doctype html>
            <html lang="es"><head><meta charset="UTF-8" />
            <style>
                * { font-family: Arial, Helvetica, sans-serif; }
                body { padding: 16px; color: #212529; }
                h1 { font-size: 18px; margin: 0 0 4px; }
                .meta { font-size: 11px; color: #555; margin-bottom: 12px; }
                table { border-collapse: collapse; width: 100%; font-size: 9px; }
                th, td { border: 1px solid #ccc; padding: 3px 5px; text-align: left; vertical-align: top; }
                th { background: #0d6efd; color: #fff; }
                tr:nth-child(even) td { background: #f5f7fa; }
                img { max-width: 90px; max-height: 70px; margin: 1px; }
            </style></head>
            <body>
                <h1>Inventario de Almacén</h1>
                <div class="meta">
                    <div>Generado: ${escapeHtml(fecha)}</div>
                    <div>Filtros: ${filtrosTexto}</div>
                    <div>Total de registros: ${rows.length}</div>
                </div>
                <table>
                    <thead><tr>${encabezadoAlmacen()}</tr></thead>
                    <tbody>${construirFilasAlmacen(rows, 3)}</tbody>
                </table>
            </body></html>
        `;

        return ipcRenderer.invoke('exportar-pdf', {
            html,
            nombreSugerido: `almacen_${timestampArchivo()}.pdf`
        });
    }

    async function exportarAlmacen(formato) {
        const rows = obtenerProductosFiltrados();

        if (!rows.length) {
            alert('No hay registros para exportar con la configuración actual.');
            return;
        }

        try {
            const resultado = formato === 'pdf'
                ? await exportarAlmacenPdf(rows)
                : await exportarAlmacenExcel(rows);

            if (resultado && resultado.success) {
                console.log('Almacén exportado a:', resultado.filePath);
            }
            else if (resultado && !resultado.canceled) {
                alert('No fue posible exportar el inventario.');
            }
        }
        catch (error) {
            console.error('Error al exportar almacén:', error);
            alert('No fue posible exportar el inventario.');
        }
    }

    if (btnExportarAlmacen && menuExportarAlmacen) {

        btnExportarAlmacen.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const abierto = menuExportarAlmacen.classList.toggle('show');
            btnExportarAlmacen.setAttribute('aria-expanded', abierto ? 'true' : 'false');
        });

        menuExportarAlmacen.addEventListener('click', (e) => {
            const item = e.target.closest('[data-formato]');
            if (!item) return;
            e.preventDefault();
            menuExportarAlmacen.classList.remove('show');
            btnExportarAlmacen.setAttribute('aria-expanded', 'false');
            exportarAlmacen(item.dataset.formato);
        });

        document.addEventListener('click', (e) => {
            if (btnExportarAlmacen.contains(e.target) || menuExportarAlmacen.contains(e.target)) {
                return;
            }
            menuExportarAlmacen.classList.remove('show');
            btnExportarAlmacen.setAttribute('aria-expanded', 'false');
        });

    }

    async function seleccionarProducto(id) {
        productoSeleccionadoId = id;
        const producto = await almacenService.obtenerProductoPorId(id);
        renderDetalle(producto);
        aplicarFiltros();
    }

    async function cargarAlmacen() {
        try {
            almacenCache = await almacenService.obtenerProductos();

            actualizarOpcionesFiltros(almacenCache);
            actualizarMenuMeses(almacenCache);
            aplicarFiltros();

            if (productoSeleccionadoId) {
                const seleccionado = almacenCache.find(
                    (producto) => Number(producto.id) === Number(productoSeleccionadoId)
                );
                renderDetalle(seleccionado || null);
            }
            else {
                renderDetalle(null);
            }
        }
        catch (error) {
            console.error('Error cargando almacen:', error);
            alert('No fue posible cargar los productos de almacen.');
        }
    }

    btnAgregar.addEventListener('click', () => {
        setModoNuevo();
        mostrarModal();
    });

    if (btnCerrarModal) {
        btnCerrarModal.addEventListener('click', ocultarModal);
    }

    registroModal.addEventListener('click', (e) => {
        if (e.target === registroModal) {
            ocultarModal();
        }
    });

    almacenForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        try {
            const datos = getDatosFormulario();

            if (productoEditandoId) {
                await almacenService.actualizarProducto(productoEditandoId, datos);
                productoSeleccionadoId = productoEditandoId;
            }
            else {
                const result = await almacenService.guardarProducto(datos);
                productoSeleccionadoId = result.id;
            }

            productoEditandoId = null;
            almacenForm.reset();
            ocultarModal();
            await cargarAlmacen();
        }
        catch (error) {
            console.error(error);
            alert('No fue posible guardar el producto.');
        }
    });

    document.addEventListener('click', async (e) => {
        const fila = e.target.closest('#tablaAlmacen tbody tr');
        if (!fila || e.target.closest('button')) return;

        const id = fila.dataset.id;
        if (!id) return;

        await seleccionarProducto(id);
    });

    document.addEventListener('click', async (e) => {
        const btnEditar = e.target.closest('.btn-editar-almacen');
        if (!btnEditar) return;

        e.preventDefault();
        e.stopPropagation();

        try {
            const producto = await almacenService.obtenerProductoPorId(btnEditar.dataset.id);
            if (!producto) {
                alert('No se encontro el producto seleccionado.');
                return;
            }

            productoSeleccionadoId = producto.id;
            renderDetalle(producto);
            setModoEditar(producto);
            mostrarModal();
        }
        catch (error) {
            console.error(error);
            alert('No fue posible cargar el producto.');
        }
    });

    document.addEventListener('click', async (e) => {
        const btnEliminar = e.target.closest('.btn-eliminar-almacen');
        if (!btnEliminar) return;

        e.preventDefault();
        e.stopImmediatePropagation();

        const confirmado = confirm(
            'Estas seguro de que deseas eliminar este producto?'
        );

        if (!confirmado) return;

        try {
            await almacenService.eliminarProducto(btnEliminar.dataset.id);

            if (Number(productoSeleccionadoId) === Number(btnEliminar.dataset.id)) {
                productoSeleccionadoId = null;
            }

            await cargarAlmacen();
        }
        catch (error) {
            console.error(error);
            alert('No fue posible eliminar el producto.');
        }
    }, true);

    [
        filtroTexto,
        filtroFunciona,
        filtroDepartamento,
        filtroUbicacion
    ]
        .filter(Boolean)
        .forEach((control) => {
            control.addEventListener('input', aplicarFiltros);
            control.addEventListener('change', aplicarFiltros);
        });

    if (btnLimpiarFiltros) {
        btnLimpiarFiltros.addEventListener('click', () => {
            if (filtroTexto) filtroTexto.value = '';
            if (filtroFunciona) filtroFunciona.value = '';
            if (filtroDepartamento) filtroDepartamento.value = '';
            if (filtroUbicacion) filtroUbicacion.value = '';

            mesSeleccionado = '';
            if (labelMes) labelMes.textContent = '';

            aplicarFiltros();
        });
    }

    if (menuMeses) {
        menuMeses.addEventListener('click', (e) => {
            const item = e.target.closest('[data-mes]');
            if (!item) return;

            e.preventDefault();

            mesSeleccionado = item.dataset.mes || '';

            if (labelMes) {
                labelMes.textContent = mesSeleccionado
                    ? `del ${item.dataset.label}`
                    : '';
            }

            menuMeses.classList.remove('show');
            if (btnMensual) {
                btnMensual.setAttribute('aria-expanded', 'false');
            }

            aplicarFiltros();
        });
    }

    if (btnMensual && menuMeses) {
        btnMensual.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const estaAbierto = menuMeses.classList.toggle('show');
            btnMensual.setAttribute(
                'aria-expanded',
                estaAbierto ? 'true' : 'false'
            );
        });

        document.addEventListener('click', (e) => {
            if (
                btnMensual.contains(e.target) ||
                menuMeses.contains(e.target)
            ) {
                return;
            }

            menuMeses.classList.remove('show');
            btnMensual.setAttribute('aria-expanded', 'false');
        });
    }

    if (btnCerrarDetalle) {
        btnCerrarDetalle.addEventListener('click', () => {
            productoSeleccionadoId = null;
            renderDetalle(null);
            aplicarFiltros();
        });
    }

    if (btnEditarDetalle) {
        btnEditarDetalle.addEventListener('click', () => {
            const producto = getProductoSeleccionado();
            if (!producto) return;

            setModoEditar(producto);
            mostrarModal();
        });
    }

    if (inputFotos) {
        inputFotos.addEventListener('change', async () => {
            const producto = getProductoSeleccionado();
            if (!producto) {
                alert('Selecciona un producto antes de agregar fotografias.');
                inputFotos.value = '';
                return;
            }

            const archivos = Array.from(inputFotos.files || []);
            if (!archivos.length) return;

            try {
                for (const archivo of archivos) {
                    const ruta = archivo.path || webUtils.getPathForFile(archivo);
                    if (!ruta) {
                        throw new Error('No se pudo obtener la ruta de la imagen.');
                    }

                    await almacenService.agregarFotografia(producto.id, ruta);
                }

                inputFotos.value = '';
                await cargarAlmacen();
            }
            catch (error) {
                console.error(error);
                alert('No fue posible agregar la fotografia.');
                inputFotos.value = '';
            }
        });
    }

    document.addEventListener('click', async (e) => {
        const btnEliminarFoto = e.target.closest('.btn-eliminar-foto');
        if (!btnEliminarFoto) return;

        e.preventDefault();

        const producto = getProductoSeleccionado();
        if (!producto) return;

        try {
            await almacenService.eliminarFotografia(
                producto.id,
                btnEliminarFoto.dataset.ruta
            );

            await cargarAlmacen();
        }
        catch (error) {
            console.error(error);
            alert('No fue posible eliminar la ruta de la fotografia.');
        }
    });

    // Poblar los selects de departamento y ubicacion desde la BD antes de
    // cargar los datos, de modo que al abrir el modal de edicion el valor
    // existente ya tenga su <option> disponible para seleccionarse.
    Promise.all([
        cargarDepartamentosFormulario(),
        cargarUbicacionesFormulario()
    ]).then(() => {
        cargarAlmacen();
    });

    return true;
}

function waitForAlmacenRoot() {
    if (document.getElementById('almacenForm')) {
        initAlmacen();
        return;
    }

    const observer = new MutationObserver(() => {
        if (document.getElementById('almacenForm')) {
            observer.disconnect();
            initAlmacen();
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
}

if (typeof document !== 'undefined') {
    waitForAlmacenRoot();
}
