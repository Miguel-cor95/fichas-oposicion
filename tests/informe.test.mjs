// Pruebas del informe de fallos de index.html.
// Carga las utilidades y el parser de CSV (desde el inicio del script hasta la puntuación)
// y el bloque @@INFORME-INICIO / @@INFORME-FIN, y los prueba con un banco inventado de tests/fixtures.
// Uso:  node tests/informe.test.mjs
import {readFileSync} from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const base = html.split("'use strict';")[1]?.split('/* @@PUNTUACION-INICIO */')[0];
const bloque = html.split('/* @@INFORME-INICIO */')[1]?.split('/* @@INFORME-FIN */')[0];
if (!base || !bloque) { console.error('No encuentro el código base o el bloque del informe en index.html'); process.exit(1); }
const {parseBankCSV, markSubstitutes, informeFallos, informeMD, informeMDBreve} =
  new Function(`${base}\n${bloque}\nreturn {parseBankCSV, markSubstitutes, informeFallos, informeMD, informeMDBreve};`)();

const csv = readFileSync(new URL('./fixtures/2024_PRUEBA_PI.csv', import.meta.url), 'utf8');
const banco = parseBankCSV('2024_PRUEBA_PI', csv);
markSubstitutes(banco.questions);
const qs = banco.questions, id = n => `2024_PRUEBA_PI_${String(n).padStart(3, '0')}`;

// Historial inventado:
//  002 (T3): fallada 2 veces, en repaso, marcó la A      006 (T7): fallada, en repaso, sin marca guardada
//  016 (T3): fallada y luego acertada 2 veces → ya no está en repaso
//  030 (T3): acertada pero «estaba dudando» → en repaso   001: anulada, nunca cuenta
//  014 (T1): acertada 6 veces
const dia = Date.UTC(2026, 9, 20);
const hist = {
  [id(2)]: {n: 3, ok: 1, ko: 2, bl: 0, racha: 0, rev: true, lastKo: dia, marcada: 'A', last: dia},
  [id(6)]: {n: 1, ok: 0, ko: 1, bl: 0, racha: 0, rev: true, lastKo: dia, last: dia},
  [id(16)]: {n: 3, ok: 2, ko: 1, bl: 0, racha: 2, rev: false, lastKo: dia, last: dia},
  [id(30)]: {n: 1, ok: 1, ko: 0, bl: 0, racha: 0, rev: true, dud: true, last: dia},
  [id(14)]: {n: 6, ok: 6, ko: 0, bl: 0, racha: 6, last: dia},
  [id(1)]: {n: 1, ok: 0, ko: 1, bl: 0, racha: 0, rev: true, last: dia}
};
const ids = inf => [...inf.preguntas, ...inf.supuestos.flatMap(s => s.items)].map(x => x.q.id).sort();

const repaso = informeFallos(qs, hist);
const todas = informeFallos(qs, hist, {alcance: 'todas'});
const sinDudas = informeFallos(qs, hist, {dudas: false});
const soloC = informeFallos(qs, hist, {temas: ['C1', 'C2']});
const soloT7 = informeFallos(qs, hist, {temas: ['T7']});
const t3t7 = informeFallos(qs, hist, {temas: ['T3', 'T7']});
const md = informeMD(repaso, {fecha: new Date(dia), dias: 95, banco: p => `Banco ${p}`});
const mdTodas = informeMD(todas, {fecha: new Date(dia)});
const t3 = repaso.temas.find(t => t.tema === 'T3');
const breve = informeMDBreve(repaso, {fecha: new Date(dia)});
const q2 = qs.find(q => q.id === id(2));
const bloque2 = breve.slice(breve.indexOf('**1.**'), breve.indexOf('**2.**'));

const casos = [
  ['«En el repaso» trae las que están en repaso, sin la anulada', ids(repaso), [id(2), id(6), id(30)].sort()],
  ['«Falladas alguna vez» suma la que ya salió del repaso', ids(todas), [id(2), id(6), id(16), id(30)].sort()],
  ['Sin «estaba dudando» quita la que solo se marcó por duda', ids(sinDudas), [id(2), id(6)].sort()],
  ['Filtrar por temas sin preguntas deja el informe vacío', soloC.resumen.fallos, 0],
  ['Elegir solo T7 deja su única fallada', ids(soloT7), [id(6)]],
  ['Elegir T3 y T7 suma las de los dos temas', ids(t3t7), [id(2), id(6), id(30)].sort()],
  ['Con temas elegidos, el resumen solo cuenta los suyos (3 de T3 + 2 de T7)', t3t7.resumen.total, 5],
  ['El .md dice qué temas se eligieron', informeMD(t3t7).includes('solo los temas T3, T7') && informeMD(soloT7).includes('solo el tema T7'), true],
  ['El resumen deja fuera la anulada: 30 de 31 preguntas', repaso.resumen.total, 30],
  ['Respuestas dadas sin la anulada: 14', repaso.resumen.n, 14],
  ['T3 junta 3 preguntas vistas con 4 aciertos de 7 respuestas', t3 && [t3.vistas, t3.ok, t3.n, Math.round(t3.pct)], [3, 4, 7, 57]],
  ['T1, con 6 aciertos, va el último de los temas fiables', repaso.temas.at(-1)?.tema, 'T1'],
  ['T7 con 1 respuesta va a «pocas respuestas»', repaso.pocos.map(t => t.tema), ['T7']],
  ['Orden de estudio: primero el epígrafe de T3 (2 falladas)', repaso.prioridad[0]?.tema, 'T3'],
  ['Las preguntas salen por orden de temario: T3 antes que T7', repaso.preguntas.map(x => x.q.tema), ['T3', 'T3', 'T7']],
  ['El .md trae instrucciones para la IA', md.includes('## Instrucciones para la IA'), true],
  ['El .md marca la correcta y la que marqué', md.includes('✅ **correcta**') && md.includes('❌ **la que marqué**'), true],
  ['El .md avisa cuando no consta la respuesta', md.includes('no consta cuál marqué'), true],
  ['El .md explica la que se acertó dudando', md.includes('la acerté, pero estaba dudando'), true],
  ['El .md pone los días que faltan y el nombre del banco', md.includes('faltan 95 días') && md.includes('Banco 2024_PRUEBA_PI'), true],
  ['El .md de «alguna vez» lo dice en el resumen', mdTodas.includes('todas las preguntas que he fallado alguna vez'), true],
  ['El .md no deja tres saltos de línea seguidos', /\n{3,}/.test(md), false],
  ['El .md completo dice con palabras cuál marqué y cuál es la correcta', md.includes(`marqué la A (incorrecta); la correcta es la ${q2.oficial}`), true],
  ['El breve no lleva instrucciones, tablas ni fuentes', ['Instrucciones', '| Tema', 'Fuente:', 'Historial:'].some(s => breve.includes(s)), false],
  ['El breve trae las 3 preguntas', (breve.match(/^\*\*\d+\.\*\*/gm) || []).length, 3],
  ['El breve pone la correcta y la que marqué con su texto', bloque2.includes(`- ✅ Correcta: ${q2.oficial}) ${q2[q2.oficial].trim()}`) && bloque2.includes(`- ❌ Marqué: A) ${q2.A.trim()}`), true],
  ['El breve avisa cuando no consta lo que marqué', breve.includes('- ❌ Marqué: no consta'), true],
  ['El breve explica la que se acertó dudando', breve.includes('Marqué la correcta, pero estaba dudando'), true],
  ['El breve agrupa por tema y epígrafe', /^## T3 · /m.test(breve) && /^## T7 · /m.test(breve), true]
];
let malos = 0;
for (const [nombre, got, espera] of casos) {
  const ok = JSON.stringify(got) === JSON.stringify(espera);
  if (!ok) malos++;
  console.log(`${ok ? '✓' : '✗'} ${nombre}`);
  if (!ok) console.log(`    esperaba ${JSON.stringify(espera)}, salió ${JSON.stringify(got)}`);
}
console.log(`\n${casos.length - malos} de ${casos.length} casos correctos`);
process.exit(malos ? 1 : 0);
