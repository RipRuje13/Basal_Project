'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
    colorPorVencimiento,
    diffEnDiasIso,
    construirEventoDominio
} = require('../../services/serviciosWeb.service.js');

// =====================================
// diffEnDiasIso
// =====================================

test('diffEnDiasIso: signo a - b y casos inválidos', () => {
    assert.strictEqual(diffEnDiasIso('2024-01-10', '2024-01-01'), 9);
    assert.strictEqual(diffEnDiasIso('2024-01-01', '2024-01-10'), -9);
    assert.strictEqual(diffEnDiasIso('2024-01-01', '2024-01-01'), 0);
    assert.strictEqual(diffEnDiasIso('mal', '2024-01-01'), null);
    assert.strictEqual(diffEnDiasIso('2024-01-01', 'mal'), null);
    // Desbordamiento: 2024-02-31 no es una fecha real.
    assert.strictEqual(diffEnDiasIso('2024-02-31', '2024-01-01'), null);
});

// =====================================
// colorPorVencimiento
// =====================================

test('colorPorVencimiento: fronteras exactas de la paleta', () => {
    const hoy = '2024-06-01';

    // dias = -1 (vencido ayer) -> rojo.
    assert.strictEqual(colorPorVencimiento('2024-05-31', hoy), '#dc3545');
    // dias = 0 (vence hoy) -> rojo.
    assert.strictEqual(colorPorVencimiento('2024-06-01', hoy), '#dc3545');
    // dias = 15 -> rojo.
    assert.strictEqual(colorPorVencimiento('2024-06-16', hoy), '#dc3545');
    // dias = 16 -> ámbar.
    assert.strictEqual(colorPorVencimiento('2024-06-17', hoy), '#ffc107');
    // dias = 45 -> ámbar.
    assert.strictEqual(colorPorVencimiento('2024-07-16', hoy), '#ffc107');
    // dias = 46 -> verde.
    assert.strictEqual(colorPorVencimiento('2024-07-17', hoy), '#198754');
    // fecha inválida -> gris.
    assert.strictEqual(colorPorVencimiento('no-fecha', hoy), '#6c757d');
});

// =====================================
// construirEventoDominio (shape)
// =====================================

test('construirEventoDominio: shape y copia de ajuste', () => {
    const row = {
        id: 42,
        dominio: 'ejemplo.com',
        fecha_vencimiento: '2024-06-10'
    };

    const ajuste = {
        activo: 1,
        dias_antelacion: 3,
        hora_recordatorio: '08:30',
        repetir_cada_horas: 2,
        recordar_dias_previos: 1
    };

    const ev = construirEventoDominio(row, ajuste, 7);

    assert.strictEqual(ev.motivo_origen, 'servicios_web');
    assert.strictEqual(ev.motivo_nombre, 'ejemplo.com');
    assert.strictEqual(ev.dia_id, 'dom-42');
    assert.strictEqual(typeof ev.dia_id, 'string');
    assert.strictEqual(ev.motivo_id, null);
    assert.strictEqual(ev.calendario_id, 7);
    assert.strictEqual(ev.calendario_clave, 'servicios_web');
    assert.strictEqual(ev.calendario_nombre, 'Servicios Web');
    assert.strictEqual(ev.fecha, '2024-06-10');

    // Los cinco campos de ajuste se copian del ajuste recibido.
    assert.strictEqual(ev.activo, 1);
    assert.strictEqual(ev.dias_antelacion, 3);
    assert.strictEqual(ev.hora_recordatorio, '08:30');
    assert.strictEqual(ev.repetir_cada_horas, 2);
    assert.strictEqual(ev.recordar_dias_previos, 1);
});

test('construirEventoDominio: con ajuste null cae en la fila (dominioRow)', () => {
    // En producción el productor pasa (row, row, id): a === row. Aquí probamos
    // el contrato `const a = ajuste || dominioRow` con ajuste null.
    const row = {
        id: 5,
        dominio: 'sitio.mx',
        fecha_vencimiento: '2024-12-01',
        activo: 1,
        dias_antelacion: 1,
        hora_recordatorio: '09:00',
        repetir_cada_horas: 0,
        recordar_dias_previos: 0
    };

    const ev = construirEventoDominio(row, null, 3);

    assert.strictEqual(ev.dia_id, 'dom-5');
    assert.strictEqual(ev.motivo_nombre, 'sitio.mx');
    assert.strictEqual(ev.activo, 1);
    assert.strictEqual(ev.dias_antelacion, 1);
    assert.strictEqual(ev.hora_recordatorio, '09:00');
    assert.strictEqual(ev.repetir_cada_horas, 0);
    assert.strictEqual(ev.recordar_dias_previos, 0);
});
