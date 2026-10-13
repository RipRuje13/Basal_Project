// app.js ahora es compatible con navbar cargado dinámicamente.

function safeQuery(id) {
  return document.getElementById(id);
}

function initNavbarEvents() {
  // Delegación de eventos: funciona aunque el navbar se inyecte dinámicamente.
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const link = target.closest('a');
    if (!link) return;

    const pageTitle = safeQuery('pageTitle');
    const href = link.getAttribute('href') || '';

    // Si es un enlace del navbar, dejamos que navegue.
    // (Electron abrirá la nueva pantalla/HTML.)
    // Aquí solo podríamos hacer logs.
    if (link.id && ['navDashboard', 'navCompras', 'navEquipos', 'navAlmacen', 'navReportes'].includes(link.id)) {
      // No preventDefault: queremos redirección.
      if (pageTitle) {
        const map = {
          navDashboard: 'Dashboard',
          navCompras: 'Compras',
          navEquipos: 'Equipos',
          navAlmacen: 'Almacén',
          navReportes: 'Reportes'
        };
        pageTitle.textContent = map[link.id] || pageTitle.textContent;
      }
      console.log('Navegando a:', href);
    }

    if (link.id && ['navUsuarios', 'navDepartamentos', 'navPermisos'].includes(link.id)) {
      console.log('Menú configuración:', link.id);
    }
  });

  // Buscador (delegado también)
  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (form.id !== 'searchForm') return;

    e.preventDefault();
    const input = safeQuery('searchInput');
    const textoBusqueda = (input ? input.value.trim() : '');
    console.log('Buscando:', textoBusqueda);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initNavbarEvents();
  console.log('Sistema Inventario SIN iniciado');
});

