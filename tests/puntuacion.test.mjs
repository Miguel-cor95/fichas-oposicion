// Pruebas de la puntuación de index.html.
// Extrae el bloque marcado con @@PUNTUACION-INICIO / @@PUNTUACION-FIN y ejecuta sus casos,
// así la app y las pruebas usan exactamente el mismo código.
// Uso:  node tests/puntuacion.test.mjs
import {readFileSync} from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bloque = html.split('/* @@PUNTUACION-INICIO */')[1]?.split('/* @@PUNTUACION-FIN */')[0];
if (!bloque) { console.error('No encuentro el bloque de puntuación en index.html'); process.exit(1); }

const {probarPuntuacion} = new Function(`${bloque}\nreturn {puntuar, resultadoSimulacro, probarPuntuacion};`)();
const resultados = probarPuntuacion();
for (const r of resultados) {
  console.log(`${r.ok ? '✓' : '✗'} ${r.nombre}`);
  r.fallos.forEach(f => console.log(`    ${f}`));
}
const malos = resultados.filter(r => !r.ok).length;
console.log(`\n${resultados.length - malos} de ${resultados.length} casos correctos`);
process.exit(malos ? 1 : 0);
