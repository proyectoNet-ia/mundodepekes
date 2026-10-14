/**
 * Utility to convert numbers to Spanish currency words
 * Useful for cash confirmation, checks, and tickets.
 * Example: 9519 -> "Nueve mil quinientos diecinueve pesos 00/100 M.N."
 */

export function numeroALetras(monto: number): string {
  if (isNaN(monto) || monto < 0) return 'Cero pesos 00/100 M.N.';

  const enteros = Math.floor(monto);
  const centavos = Math.round((monto - enteros) * 100);
  const centavosStr = `${centavos.toString().padStart(2, '0')}/100 M.N.`;

  if (enteros === 0) return `Cero pesos ${centavosStr}`;

  const unidades = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve'];
  const decenas = ['', 'diez', 'veinte', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const diezY = ['', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve'];
  const veinti = ['', 'veintiún', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
  const centenas = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

  function convertirGrupo(n: number): string {
    let salida = '';
    if (n === 100) return 'cien';

    const c = Math.floor(n / 100);
    const d = Math.floor((n % 100) / 10);
    const u = n % 10;

    if (c > 0) salida += centenas[c] + ' ';

    if (d === 1) {
      if (u === 0) salida += 'diez ';
      else salida += diezY[u] + ' ';
    } else if (d === 2) {
      if (u === 0) salida += 'veinte ';
      else salida += veinti[u] + ' ';
    } else if (d > 2) {
      salida += decenas[d] + ' ';
      if (u > 0) salida += 'y ' + unidades[u] + ' ';
    } else if (u > 0) {
      salida += unidades[u] + ' ';
    }

    return salida.trim();
  }

  let resultado = '';
  const millones = Math.floor(enteros / 1000000);
  const miles = Math.floor((enteros % 1000000) / 1000);
  const resto = enteros % 1000;

  if (millones === 1) {
    resultado += 'un millón ';
  } else if (millones > 1) {
    resultado += convertirGrupo(millones) + ' millones ';
  }

  if (miles === 1) {
    resultado += 'mil ';
  } else if (miles > 1) {
    resultado += convertirGrupo(miles) + ' mil ';
  }

  if (resto > 0) {
    resultado += convertirGrupo(resto) + ' ';
  }

  const palabraPesos = enteros === 1 ? 'peso' : 'pesos';
  const textoFinal = `${resultado.trim()} ${palabraPesos} ${centavosStr}`;
  return textoFinal.charAt(0).toUpperCase() + textoFinal.slice(1);
}
