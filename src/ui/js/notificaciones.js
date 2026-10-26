(function () {
    const calendariosService = require('../../services/calendarios.service');

    // Invariante: VENTANA_MINUTOS >= INTERVALO_MS / 60000 (ver diseno §3.2).
    // Con INTERVALO_MS = 60000 queda 5 >= 1; si se sube INTERVALO_MS por encima de
    // VENTANA_MINUTOS * 60000 se perderian disparos del dia exacto/antelacion.
    const INTERVALO_MS = 60 * 1000;
    const VENTANA_MINUTOS = 5;

    // Anti-spam en memoria: claves de notificaciones ya disparadas en esta sesion.
    const yaNotificado = new Set();

    // ---- helpers puros ----

    // 'YYYY-MM-DD' -> Date local (medianoche). Tolerante a fecha invalida: devuelve null.
    function parseFechaLocal(iso) {
        if (typeof iso !== 'string') {
            return null;
        }
        const partes = iso.split('-');
        if (partes.length !== 3) {
            return null;
        }
        const anio = Number(partes[0]);
        const mes = Number(partes[1]);
        const dia = Number(partes[2]);
        if (!Number.isInteger(anio) || !Number.isInteger(mes) || !Number.isInteger(dia)) {
            return null;
        }
        const fecha = new Date(anio, mes - 1, dia);
        // Verificar que la fecha no se haya "desbordado" (p.ej. 2024-02-31).
        if (fecha.getFullYear() !== anio
            || fecha.getMonth() !== mes - 1
            || fecha.getDate() !== dia) {
            return null;
        }
        return fecha;
    }

    // Diferencia en dias enteros entre dos fechas (aFecha - bFecha), ignorando la hora.
    function diffEnDias(aFecha, bFecha) {
        const a = new Date(aFecha.getFullYear(), aFecha.getMonth(), aFecha.getDate());
        const b = new Date(bFecha.getFullYear(), bFecha.getMonth(), bFecha.getDate());
        const MS_POR_DIA = 24 * 60 * 60 * 1000;
        return Math.round((a.getTime() - b.getTime()) / MS_POR_DIA);
    }

    // Formatea 'YYYY-MM-DD' a partir de un Date local.
    function fechaISOLocal(fecha) {
        const anio = fecha.getFullYear();
        const mes = String(fecha.getMonth() + 1).padStart(2, '0');
        const dia = String(fecha.getDate()).padStart(2, '0');
        return `${anio}-${mes}-${dia}`;
    }

    // Construye titulo y cuerpo segun el tipo de calendario/motivo (diseno §3.5).
    function componerTexto(evento, tipo, diasRestantes) {
        const esDepto = evento.motivo_origen === 'departamento';
        const nombre = evento.motivo_nombre;
        const fecha = evento.fecha;
        const n = diasRestantes;
        const plural = n === 1 ? '' : 's';

        // NUEVO: avisos de dominios (Servicios Web). Rama aditiva; no toca las otras.
        if (evento.motivo_origen === 'servicios_web') {
            const titulo = 'Servicios Web';
            if (tipo === 'dia') {
                return {
                    titulo,
                    cuerpo: `Vence hoy el dominio «${nombre}» (${fecha}).`
                };
            }
            return {
                titulo,
                cuerpo: `Vence el dominio «${nombre}» en ${n} día${plural} (${fecha}).`
            };
        }

        if (esDepto) {
            const titulo = `Mantenimiento: ${evento.calendario_nombre}`;
            if (tipo === 'dia') {
                return {
                    titulo,
                    cuerpo: `Hoy toca mantenimiento al departamento «${nombre}» (${fecha}).`
                };
            }
            return {
                titulo,
                cuerpo: `Falta${plural} ${n} día${plural}: mantenimiento del departamento «${nombre}» (${fecha}).`
            };
        }

        const titulo = `Recordatorio: ${evento.calendario_nombre}`;
        if (tipo === 'dia') {
            return {
                titulo,
                cuerpo: `Hoy: «${nombre}» (${fecha}).`
            };
        }
        return {
            titulo,
            cuerpo: `Falta${plural} ${n} día${plural} para «${nombre}» (${fecha}).`
        };
    }

    // ---- funcion pura testeable (nucleo, diseno §3.4) ----
    // Asume que `evento` llega ya normalizado por el COALESCE de obtenerEventosParaNotificar
    // (no re-aplica defaults). `ahora` es un Date inyectado (sin new Date() interno).
    function calcularNotificacionesPendientes(evento, ahora) {
        // (1) Guardo de corte: inactivo.
        if (!evento.activo) {
            return [];
        }
        // (2) Guardo de corte: sin motivo nombrable.
        if (evento.motivo_nombre === null
            || evento.motivo_nombre === undefined
            || evento.motivo_nombre === '') {
            return [];
        }

        const fechaEvento = parseFechaLocal(evento.fecha);
        if (fechaEvento === null) {
            return [];
        }

        const diasAntelacion = evento.dias_antelacion;
        const diasRestantes = diffEnDias(fechaEvento, ahora);

        // (3) Fuera de ventana de dias.
        if (diasRestantes < 0 || diasRestantes > diasAntelacion) {
            return [];
        }

        // (4) Parsear hora_recordatorio ('HH:MM').
        const horaPartes = String(evento.hora_recordatorio).split(':');
        if (horaPartes.length !== 2) {
            return [];
        }
        const hh = Number(horaPartes[0]);
        const mm = Number(horaPartes[1]);
        if (!Number.isInteger(hh) || !Number.isInteger(mm)) {
            return [];
        }
        const horaObjetivoEnMin = hh * 60 + mm;
        const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();
        const minutosDesde = minutosAhora - horaObjetivoEnMin;

        const fechaHoy = fechaISOLocal(ahora);
        const pendientes = [];

        if (diasRestantes === 0) {
            // Dia del evento.
            // Disparo base: solo dentro de la ventana [0, VENTANA_MINUTOS).
            if (minutosDesde >= 0 && minutosDesde < VENTANA_MINUTOS) {
                const texto = componerTexto(evento, 'dia', 0);
                pendientes.push({
                    clave: `${evento.dia_id}:dia:${evento.fecha}:0`,
                    titulo: texto.titulo,
                    cuerpo: texto.cuerpo
                });
            }
            // Repeticiones: indice vigente (>= 1), deduplicado por el Set.
            if (evento.repetir_cada_horas > 0 && minutosDesde >= 0) {
                const periodo = evento.repetir_cada_horas * 60;
                const indice = Math.floor(minutosDesde / periodo);
                if (indice >= 1) {
                    const texto = componerTexto(evento, 'dia', 0);
                    pendientes.push({
                        clave: `${evento.dia_id}:dia:${evento.fecha}:${indice}`,
                        titulo: texto.titulo,
                        cuerpo: texto.cuerpo
                    });
                }
            }
        }
        else if (diasRestantes === diasAntelacion && diasAntelacion > 0) {
            // Recordatorio del dia exacto de antelacion (siempre, con dias_antelacion > 0).
            if (minutosDesde >= 0 && minutosDesde < VENTANA_MINUTOS) {
                const texto = componerTexto(evento, 'ant', diasRestantes);
                pendientes.push({
                    clave: `${evento.dia_id}:ant:${fechaHoy}`,
                    titulo: texto.titulo,
                    cuerpo: texto.cuerpo
                });
            }
        }
        else if (diasRestantes > 0 && diasRestantes < diasAntelacion) {
            // Dias intermedios: solo si recordar_dias_previos === 1.
            if (evento.recordar_dias_previos === 1
                && minutosDesde >= 0 && minutosDesde < VENTANA_MINUTOS) {
                const texto = componerTexto(evento, 'ant', diasRestantes);
                pendientes.push({
                    clave: `${evento.dia_id}:ant:${fechaHoy}`,
                    titulo: texto.titulo,
                    cuerpo: texto.cuerpo
                });
            }
        }

        return pendientes;
    }

    // ---- efectos ----
    async function tick() {
        try {
            const ahora = new Date();
            const eventos = await calendariosService.obtenerEventosParaNotificar();
            for (const ev of eventos) {
                const pendientes = calcularNotificacionesPendientes(ev, ahora);
                for (const p of pendientes) {
                    if (yaNotificado.has(p.clave)) {
                        continue;
                    }
                    yaNotificado.add(p.clave);
                    new Notification(p.titulo, { body: p.cuerpo });
                }
            }
        }
        catch (error) {
            console.error('Error en el tick de notificaciones:', error);
        }
    }

    function iniciar() {
        if (typeof Notification !== 'undefined'
            && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {});
        }
        tick();                       // primer disparo inmediato
        setInterval(tick, INTERVALO_MS);
    }

    // Arrancar solo en el renderer (cuando hay document). En Node (test) no corre.
    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', iniciar);
        }
        else {
            iniciar();
        }
    }

    // Exposicion para test unitario sin romper el navegador.
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { calcularNotificacionesPendientes, diffEnDias, parseFechaLocal };
    }
})();
