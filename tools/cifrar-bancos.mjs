// Cifra los bancos de /bancos con tu contraseña y deja el resultado en /datos, que es lo único
// que se publica. Sin la contraseña, los archivos de /datos no se pueden leer.
//   node tools/cifrar-bancos.mjs
// Te pide la contraseña (no se ve al escribirla). Ejecútalo cada vez que añadas o cambies un
// .csv o un _supuestos.md; solo se vuelven a cifrar los que han cambiado. Si usas otra
// contraseña, se cifra todo de nuevo y cada dispositivo te la pedirá otra vez.
import {readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync} from 'node:fs';
import {pbkdf2Sync, randomBytes, createCipheriv, createDecipheriv, createHmac} from 'node:crypto';

const ORIGEN = new URL('../bancos/', import.meta.url), DESTINO = new URL('../datos/', import.meta.url);
const INDICE = new URL('indice.json', DESTINO), ITERACIONES = 600000;

// AES-256-GCM. Formato de cada archivo: iv (12 bytes) + cifrado + etiqueta (16), como lo espera Web Crypto
const derivar = (clave, sal) => { const b = pbkdf2Sync(clave.normalize('NFC'), sal, ITERACIONES, 64, 'sha256'); return {aes: b.subarray(0, 32), mac: b.subarray(32)}; };
function cifrar(aes, datos) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', aes, iv);
  return Buffer.concat([iv, c.update(datos), c.final(), c.getAuthTag()]);
}
function descifrar(aes, buf) {
  const d = createDecipheriv('aes-256-gcm', aes, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(-16));
  return Buffer.concat([d.update(buf.subarray(12, -16)), d.final()]);
}

function pedir(texto) {
  if (process.env.FICHAS_CLAVE) return Promise.resolve(process.env.FICHAS_CLAVE);   // para pruebas automáticas
  const {stdin, stdout} = process;
  if (!stdin.isTTY) { console.error('Ejecútalo en una terminal para poder escribir la contraseña.'); process.exit(1); }
  return new Promise(ok => {
    let s = '';
    const fin = () => { stdin.off('data', tecla); stdin.setRawMode(false); stdin.pause(); stdout.write('\n'); };
    const tecla = trozo => {
      for (const ch of trozo) {
        if (ch === '\r' || ch === '\n') { fin(); return ok(s); }
        if (ch === '\u0003') { fin(); process.exit(1); }                     // Ctrl+C
        if (ch === '\u007f' || ch === '\b') { if (s) { s = s.slice(0, -1); stdout.write('\b \b'); } continue; }
        s += ch; stdout.write('•');
      }
    };
    stdout.write(texto); stdin.setRawMode(true); stdin.setEncoding('utf8'); stdin.resume(); stdin.on('data', tecla);
  });
}

const clave = await pedir('Contraseña: ');
if (clave.length < 6) { console.error('Usa al menos 6 caracteres.'); process.exit(1); }
if (!process.env.FICHAS_CLAVE && await pedir('Repítela: ') !== clave) { console.error('No coinciden. No se ha cambiado nada.'); process.exit(1); }

// Con la misma contraseña se reaprovecha la sal: los bancos que no cambian conservan su huella
// y los dispositivos no los vuelven a descargar
const previo = existsSync(INDICE) ? JSON.parse(readFileSync(INDICE, 'utf8')) : null;
let sal = randomBytes(16), mismaClave = false;
if (previo) {
  const s = Buffer.from(previo.kdf.sal, 'base64');
  try { descifrar(derivar(clave, s).aes, Buffer.from(previo.verificador, 'base64')); sal = s; mismaClave = true; }
  catch (e) { console.log('Contraseña nueva: se cifra todo otra vez.'); }
}
const {aes, mac} = derivar(clave, sal);
const anteriores = new Map(mismaClave ? previo.archivos.map(a => [a.nombre, a.huella]) : []);

mkdirSync(DESTINO, {recursive: true});
const nombres = readdirSync(ORIGEN).filter(n => /\.csv$|_supuestos\.md$/i.test(n)).sort((a, b) => a.localeCompare(b, 'es', {numeric: true}));
const archivos = [];
let nuevos = 0;
for (const nombre of nombres) {
  const datos = readFileSync(new URL(nombre, ORIGEN));
  const huella = createHmac('sha256', mac).update(nombre + '\0').update(datos).digest('hex').slice(0, 16);
  const destino = new URL(nombre + '.enc', DESTINO);
  if (anteriores.get(nombre) !== huella || !existsSync(destino)) { writeFileSync(destino, cifrar(aes, datos)); nuevos++; }
  archivos.push({nombre, huella});
}
// Los que ya no están en /bancos se quitan de /datos
for (const n of readdirSync(DESTINO)) if (n.endsWith('.enc') && !nombres.includes(n.slice(0, -4))) rmSync(new URL(n, DESTINO));

writeFileSync(INDICE, JSON.stringify({
  version: 1,
  kdf: {nombre: 'PBKDF2-SHA256', iteraciones: ITERACIONES, sal: sal.toString('base64')},
  verificador: cifrar(aes, Buffer.from('fichas-oposicion')).toString('base64'),
  archivos
}, null, 1) + '\n');
console.log(`datos/: ${archivos.length} bancos cifrados (${nuevos} nuevos o cambiados). Ahora haz commit y push.`);
