'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
    limitesSemana,
    eventoEntraEnAgenda,
    nombreDiaSemana,
    pesoPrioridad
} = require('./dashboard.js');

test('limitesSemana: miércoles devuelve lunes y viernes de esa semana', () => {
    const r = limitesSemana('2024-06-12');
    assert.strictEqual(r.lunes, '2024-06-10');
    assert.strictEqual(r.viernes, '2024-06-14');
});

test('limitesSemana: lunes se mantiene como lunes', () => {
    const r = limitesSemana('2024-06-10');
    assert.strictEqual(r.lunes, '2024-06-10');
    assert.strictEqual(r.viernes, '2024-06-14');
});

test('limitesSemana: viernes se mantiene en rango', () => {
    const r = limitesSemana('2024-06-14');
    assert.strictEqual(r.lunes, '2024-06-10');
    assert.strictEqual(r.viernes, '2024-06-14');
});

test('limitesSemana: domingo pertenece a la semana que empieza el lunes previo', () => {
    // 2024-06-16 es domingo -> lunes 2024-06-10, viernes 2024-06-14.
    const r = limitesSemana('2024-06-16');
    assert.strictEqual(r.lunes, '2024-06-10');
    assert.strictEqual(r.viernes, '2024-06-14');
});

test('limitesSemana: cruce de mes/año', () => {
    // 2025-01-01 es miércoles -> lunes 2024-12-30, viernes 2025-01-03.
    const r = limitesSemana('2025-01-01');
    assert.strictEqual(r.lunes, '2024-12-30');
    assert.strictEqual(r.viernes, '2025-01-03');
});

test('eventoEntraEnAgenda: hoy entra', () => {
    assert.strictEqual(eventoEntraEnAgenda('2024-06-12', '2024-06-12'), true);
});

test('eventoEntraEnAgenda: ayer (ya pasó) no entra', () => {
    assert.strictEqual(eventoEntraEnAgenda('2024-06-11', '2024-06-12'), false);
});

test('eventoEntraEnAgenda: viernes de esta semana entra', () => {
    assert.strictEqual(eventoEntraEnAgenda('2024-06-14', '2024-06-12'), true);
});

test('eventoEntraEnAgenda: sábado no entra', () => {
    assert.strictEqual(eventoEntraEnAgenda('2024-06-15', '2024-06-12'), false);
});

test('eventoEntraEnAgenda: otra semana no entra', () => {
    assert.strictEqual(eventoEntraEnAgenda('2024-06-17', '2024-06-12'), false);
});

test('eventoEntraEnAgenda: fecha inválida no entra', () => {
    assert.strictEqual(eventoEntraEnAgenda('fecha-mala', '2024-06-12'), false);
});

test('nombreDiaSemana: jueves', () => {
    assert.strictEqual(nombreDiaSemana('2024-06-13'), 'Jueves');
});

test('pesoPrioridad: orden Alta<Media<Baja y desconocido al final', () => {
    assert.deepStrictEqual(['Baja', 'Alta', 'Media'].map(pesoPrioridad), [2, 0, 1]);
    assert.strictEqual(pesoPrioridad(''), 3);
    assert.strictEqual(pesoPrioridad(null), 3);
    assert.strictEqual(pesoPrioridad('otra'), 3);
});
