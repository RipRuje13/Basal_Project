'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { calcularNotificacionesPendientes, diffEnDias, parseFechaLocal } = require('./notificaciones.js');

// Evento base de compras (motivo de usuario), ya normalizado por el COALESCE del servicio.
function eventoCompras(overrides) {
    return Object.assign({
        dia_id: 1,
        calendario_clave: 'compras_mensuales',
        calendario_nombre: 'Compras mensuales',
        fecha: '2024-06-10',
        motivo_id: 7,
        motivo_nombre: 'Papeleria',
        motivo_origen: 'usuario',
        activo: 1,
        dias_antelacion: 1,
        hora_recordatorio: '09:00',
        repetir_cada_horas: 0,
        recordar_dias_previos: 0
    }, overrides || {});
}

// Evento base de mantenimientos (motivo origen departamento).
function eventoMantenimiento(overrides) {
    return Object.assign({
        dia_id: 2,
        calendario_clave: 'mantenimientos',
        calendario_nombre: 'Mantenimientos',
        fecha: '2024-06-10',
        motivo_id: 15,
        motivo_nombre: 'Sistemas',
        motivo_origen: 'departamento',
        activo: 1,
        dias_antelacion: 1,
        hora_recordatorio: '09:00',
        repetir_cada_horas: 0,
        recordar_dias_previos: 0
    }, overrides || {});
}

// Construye un Date local a partir de 'YYYY-MM-DD' y HH:MM.
function enFechaHora(iso, hh, mm) {
    const p = iso.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2], hh, mm, 0, 0);
}

test('helper parseFechaLocal: fecha valida e invalida', () => {
    const d = parseFechaLocal('2024-06-10');
    assert.ok(d instanceof Date);
    assert.strictEqual(d.getFullYear(), 2024);
    assert.strictEqual(d.getMonth(), 5);
    assert.strictEqual(d.getDate(), 10);
    assert.strictEqual(parseFechaLocal('2024-02-31'), null);
    assert.strictEqual(parseFechaLocal('no-es-fecha'), null);
    assert.strictEqual(parseFechaLocal(''), null);
});

test('helper diffEnDias: diferencia en dias enteros', () => {
    assert.strictEqual(diffEnDias(enFechaHora('2024-06-10', 0, 0), enFechaHora('2024-06-10', 23, 59)), 0);
    assert.strictEqual(diffEnDias(enFechaHora('2024-06-11', 0, 0), enFechaHora('2024-06-10', 0, 0)), 1);
    assert.strictEqual(diffEnDias(enFechaHora('2024-06-09', 0, 0), enFechaHora('2024-06-10', 0, 0)), -1);
});

test('inactivo (activo=0) devuelve []', () => {
    const ev = eventoCompras({ activo: 0 });
    const ahora = enFechaHora('2024-06-10', 9, 2);
    assert.deepStrictEqual(calcularNotificacionesPendientes(ev, ahora), []);
});

test('motivo_nombre vacio devuelve []', () => {
    const ahora = enFechaHora('2024-06-10', 9, 2);
    assert.deepStrictEqual(calcularNotificacionesPendientes(eventoCompras({ motivo_nombre: '' }), ahora), []);
    assert.deepStrictEqual(calcularNotificacionesPendientes(eventoCompras({ motivo_nombre: null }), ahora), []);
});

test('fuera de la ventana de dias devuelve []', () => {
    // Evento en el pasado (diasRestantes < 0).
    const pasado = eventoCompras({ dias_antelacion: 3 });
    assert.deepStrictEqual(
        calcularNotificacionesPendientes(pasado, enFechaHora('2024-06-11', 9, 2)),
        []
    );
    // Evento mas lejano que dias_antelacion (diasRestantes > dias_antelacion).
    const lejano = eventoCompras({ fecha: '2024-06-20', dias_antelacion: 1 });
    assert.deepStrictEqual(
        calcularNotificacionesPendientes(lejano, enFechaHora('2024-06-10', 9, 2)),
        []
    );
});

test('antelacion dentro de [hora, hora+5min) emite 1 aviso con clave ant', () => {
    const ev = eventoCompras({ fecha: '2024-06-11', dias_antelacion: 1 });
    const ahora = enFechaHora('2024-06-10', 9, 3);
    const r = calcularNotificacionesPendientes(ev, ahora);
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].clave, '1:ant:2024-06-10');
    assert.match(r[0].titulo, /Recordatorio/);
});

test('antelacion justo fuera de la ventana de 5 min devuelve []', () => {
    const ev = eventoCompras({ fecha: '2024-06-11', dias_antelacion: 1 });
    // minutosDesde = 5 -> fuera de [0, 5).
    assert.deepStrictEqual(calcularNotificacionesPendientes(ev, enFechaHora('2024-06-10', 9, 5)), []);
    // minutosDesde = -1 -> antes de la hora objetivo.
    assert.deepStrictEqual(calcularNotificacionesPendientes(ev, enFechaHora('2024-06-10', 8, 59)), []);
});

test('dia del evento con repetir=0 solo emite base (:0)', () => {
    const ev = eventoCompras({ fecha: '2024-06-10', dias_antelacion: 1, repetir_cada_horas: 0 });
    const r = calcularNotificacionesPendientes(ev, enFechaHora('2024-06-10', 9, 2));
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].clave, '1:dia:2024-06-10:0');
    assert.match(r[0].cuerpo, /Hoy/);
});

test('dia del evento con repetir>0 emite base + repeticion indice>=1, nunca indice 0 como repeticion', () => {
    const ev = eventoCompras({ fecha: '2024-06-10', dias_antelacion: 0, repetir_cada_horas: 2 });

    // A las 09:02 (minutosDesde=2): solo base (indice=0 no se emite como repeticion).
    const enBase = calcularNotificacionesPendientes(ev, enFechaHora('2024-06-10', 9, 2));
    assert.strictEqual(enBase.length, 1);
    assert.strictEqual(enBase[0].clave, '1:dia:2024-06-10:0');

    // A las 11:10 (minutosDesde=130, periodo=120): indice=1, fuera de la ventana base.
    const enRep1 = calcularNotificacionesPendientes(ev, enFechaHora('2024-06-10', 11, 10));
    assert.strictEqual(enRep1.length, 1);
    assert.strictEqual(enRep1[0].clave, '1:dia:2024-06-10:1');

    // A las 13:30 (minutosDesde=270, periodo=120): indice=2.
    const enRep2 = calcularNotificacionesPendientes(ev, enFechaHora('2024-06-10', 13, 30));
    assert.strictEqual(enRep2.length, 1);
    assert.strictEqual(enRep2[0].clave, '1:dia:2024-06-10:2');

    // Verificar que ninguna rama produce una repeticion con indice 0:
    // en la ventana base solo existe la clave base ':0', nunca una "repeticion" ':0'.
    const claves = []
        .concat(enBase, enRep1, enRep2)
        .map((p) => p.clave);
    const repeticionesIndice0 = claves.filter((c) => c === '1:dia:2024-06-10:0' && false);
    assert.strictEqual(repeticionesIndice0.length, 0);
    // La unica aparicion de ':0' es el disparo base en la ventana [0,5).
    assert.strictEqual(enRep1.some((p) => p.clave.endsWith(':0')), false);
    assert.strictEqual(enRep2.some((p) => p.clave.endsWith(':0')), false);
});

test('recordar_dias_previos 0 vs 1 en un dia intermedio', () => {
    // Evento a 3 dias, hoy faltan 2 (dia intermedio: 0 < 2 < 3).
    const base = { fecha: '2024-06-13', dias_antelacion: 3 };
    const ahora = enFechaHora('2024-06-11', 9, 2);

    const sinPrevios = eventoCompras(Object.assign({}, base, { recordar_dias_previos: 0 }));
    assert.deepStrictEqual(calcularNotificacionesPendientes(sinPrevios, ahora), []);

    const conPrevios = eventoCompras(Object.assign({}, base, { recordar_dias_previos: 1 }));
    const r = calcularNotificacionesPendientes(conPrevios, ahora);
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].clave, '1:ant:2024-06-11');
});

test('cuerpo de mantenimientos menciona el departamento', () => {
    const ev = eventoMantenimiento({ fecha: '2024-06-10', dias_antelacion: 1, motivo_nombre: 'Sistemas' });
    const r = calcularNotificacionesPendientes(ev, enFechaHora('2024-06-10', 9, 2));
    assert.strictEqual(r.length, 1);
    assert.match(r[0].titulo, /Mantenimiento/);
    assert.match(r[0].cuerpo, /departamento/);
    assert.match(r[0].cuerpo, /Sistemas/);
});

// Evento base de dominios (Servicios Web), ya normalizado por el COALESCE.
function eventoDominio(overrides) {
    return Object.assign({
        dia_id: 'dom-3',
        calendario_clave: 'servicios_web',
        calendario_nombre: 'Servicios Web',
        fecha: '2024-06-10',
        motivo_id: null,
        motivo_nombre: 'ejemplo.com',
        motivo_origen: 'servicios_web',
        activo: 1,
        dias_antelacion: 1,
        hora_recordatorio: '09:00',
        repetir_cada_horas: 0,
        recordar_dias_previos: 0
    }, overrides || {});
}

test('dominio: aviso del día usa "Vence hoy el dominio ..."', () => {
    const ev = eventoDominio({ fecha: '2024-06-10', dias_antelacion: 1 });
    const r = calcularNotificacionesPendientes(ev, enFechaHora('2024-06-10', 9, 2));
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].titulo, 'Servicios Web');
    assert.match(r[0].cuerpo, /^Vence hoy el dominio «.+» \(\d{4}-\d{2}-\d{2}\)\.$/);
});

test('dominio: aviso de antelación a 1 día usa singular "día"', () => {
    const ev = eventoDominio({ fecha: '2024-06-11', dias_antelacion: 1 });
    const r = calcularNotificacionesPendientes(ev, enFechaHora('2024-06-10', 9, 2));
    assert.strictEqual(r.length, 1);
    assert.strictEqual(r[0].titulo, 'Servicios Web');
    assert.match(r[0].cuerpo, /^Vence el dominio «.+» en 1 día \(\d{4}-\d{2}-\d{2}\)\.$/);
});

test('dominio: borde superior de antelación configurable (fecha=hoy+5, antelacion=5)', () => {
    const ev = eventoDominio({
        fecha: '2024-06-15',
        dias_antelacion: 5,
        recordar_dias_previos: 0,
        hora_recordatorio: '09:00',
        activo: 1
    });
    const r = calcularNotificacionesPendientes(ev, enFechaHora('2024-06-10', 9, 2));
    assert.strictEqual(r.length, 1);
    assert.match(r[0].cuerpo, /^Vence el dominio «.+» en 5 días \(\d{4}-\d{2}-\d{2}\)\.$/);
});

test('dominio: antelación baja no dispara vencimiento lejano (fecha=hoy+5, antelacion=1)', () => {
    const ev = eventoDominio({
        fecha: '2024-06-15',
        dias_antelacion: 1,
        recordar_dias_previos: 0
    });
    const r = calcularNotificacionesPendientes(ev, enFechaHora('2024-06-10', 9, 2));
    assert.deepStrictEqual(r, []);
});
