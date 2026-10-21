// ================================
// SELECTOR DE TEMA (Bootstrap CSS de la carpeta vendor)
// ================================
//
// Lee los archivos .css de src/ui/assets/vendor, los ofrece como "temas" en
// un dropdown del navbar (junto a Search) con nombres legibles, aplica el
// tema elegido reemplazando el <link> de Bootstrap y persiste la elección en
// localStorage para que se mantenga entre páginas y reinicios.
//
// Envuelto en IIFE porque index.html carga varios scripts juntos y el scope
// global es compartido (evita colisiones de identificadores de nivel superior).
(function () {

    const fs = require('fs');
    const path = require('path');

    // Carpeta vendor en disco (este archivo vive en src/ui/js/).
    const vendorDir = path.join(__dirname, '..', 'assets', 'vendor');

    // Ruta relativa que usan los <link> dentro de las páginas (src/ui/pages/).
    const vendorHrefBase = '../assets/vendor/';

    const STORAGE_KEY = 'temaSeleccionado';

    // Convierte un nombre de archivo en una etiqueta legible.
    //   bootstrap.min.css            -> "Por defecto"
    //   bootstrap.min_Azul_Rosa.css  -> "Azul Rosa"
    //   bootstrap.min_Negro.css      -> "Negro"
    function nombreBonito(archivo) {

        if (archivo === 'bootstrap.min.css') {
            return 'Por defecto';
        }

        let base = archivo
            .replace(/^bootstrap\.min_?/i, '')
            .replace(/\.css$/i, '');

        base = base.replace(/_/g, ' ').trim();

        if (base === '') {
            return 'Por defecto';
        }

        // Capitalizar cada palabra.
        return base
            .split(/\s+/)
            .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
            .join(' ');

    }

    // Lista los temas (.css) disponibles en vendor, ordenados con el tema por
    // defecto primero. Devuelve [{ archivo, nombre }].
    function listarTemas() {

        let archivos = [];

        try {
            archivos = fs.readdirSync(vendorDir);
        }
        catch (error) {
            console.error('No se pudo leer la carpeta de temas:', error);
            return [];
        }

        const temas = archivos
            .filter((f) => /^bootstrap\.min.*\.css$/i.test(f))
            .map((f) => ({ archivo: f, nombre: nombreBonito(f) }));

        // Tema por defecto primero, luego alfabético por nombre.
        temas.sort((a, b) => {
            if (a.archivo === 'bootstrap.min.css') return -1;
            if (b.archivo === 'bootstrap.min.css') return 1;
            return a.nombre.localeCompare(b.nombre);
        });

        return temas;

    }

    // Localiza el <link> de la hoja de Bootstrap en la página actual.
    function linkBootstrap() {

        const links = document.querySelectorAll('link[rel="stylesheet"]');

        for (const link of links) {
            const href = link.getAttribute('href') || '';
            if (/vendor\/bootstrap\.min.*\.css$/i.test(href)) {
                return link;
            }
        }

        return null;

    }

    // Aplica un tema (por nombre de archivo) cambiando el href del <link>.
    function aplicarTema(archivo) {

        const link = linkBootstrap();
        if (!link) return;

        link.setAttribute('href', vendorHrefBase + archivo);

    }

    // Tema guardado o el por defecto si no hay/ya no existe.
    function temaActual() {

        const guardado = localStorage.getItem(STORAGE_KEY);
        const temas = listarTemas();

        const existe = temas.some((t) => t.archivo === guardado);

        if (guardado && existe) {
            return guardado;
        }

        return 'bootstrap.min.css';

    }

    // Construye las opciones del dropdown y marca la activa.
    function renderMenuTema() {

        const menu = document.getElementById('menuTema');
        if (!menu) return;

        const temas = listarTemas();
        const actual = temaActual();

        menu.innerHTML = temas
            .map((t) => {
                const activo = t.archivo === actual ? ' active' : '';
                // data-archivo sin comillas problemáticas: son nombres de archivo.
                return `<button type="button" class="dropdown-item${activo}" data-archivo="${t.archivo}">${t.nombre}</button>`;
            })
            .join('');

    }

    // Aplica el tema guardado cuanto antes (reduce parpadeo). Se llama tanto al
    // cargar el script como en DOMContentLoaded por si el <link> aún no existía.
    function aplicarTemaGuardado() {
        aplicarTema(temaActual());
    }

    aplicarTemaGuardado();

    // Delegación de clics para elegir tema (el navbar se inyecta dinámicamente).
    document.addEventListener('click', (e) => {

        const item = e.target.closest('#menuTema [data-archivo]');
        if (!item) return;

        const archivo = item.getAttribute('data-archivo');
        if (!archivo) return;

        localStorage.setItem(STORAGE_KEY, archivo);
        aplicarTema(archivo);
        renderMenuTema();

    });

    // Rellena el menú cuando el navbar ya está en el DOM.
    function cuandoNavbarListo() {

        if (document.getElementById('menuTema')) {
            renderMenuTema();
            aplicarTemaGuardado();
            return;
        }

        const observer = new MutationObserver(() => {
            if (document.getElementById('menuTema')) {
                observer.disconnect();
                renderMenuTema();
                aplicarTemaGuardado();
            }
        });

        observer.observe(
            document.documentElement,
            { childList: true, subtree: true }
        );

    }

    if (typeof document !== 'undefined') {
        document.addEventListener('DOMContentLoaded', aplicarTemaGuardado);
        cuandoNavbarListo();
    }

})();
