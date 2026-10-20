// Fichas técnicas en vivo — AMA Maquinaria
// Lee la pestaña "Publicado" de la hoja de Google (solo filas que aprobó el dueño) y arma las specs con la
// misma limpieza que importar_fichas.py, más las correcciones de correcciones.js. Si Google no responde, la
// página se queda con las fichas guardadas.
// NO EDITAR la copia que está dentro de catalogo-ama / herramientas-ama: la original está en HTML Catalogo/
// y sincronizar_cotizador.py la copia a los dos sitios.
(function () {
  const HOJA = '1yohOuMj7N_hHqNLBJvWVS-dbK4zec1hvx6dyCGmH9n0';
  const URL = 'https://docs.google.com/spreadsheets/d/' + HOJA + '/gviz/tq?tqx=out:csv&headers=1&sheet=Publicado';

  const BASE = ['Marca', 'Modelo', 'No. Serie'];
  const FINAL = ['Dimensiones (L×An×Al)', 'Unidades', 'Año', 'Condición', 'Horas de uso'];
  const NO_VA = new Set(['ID', 'Equipo', 'Fotos', '% completo', 'Disponible', 'Unidades', 'Otros datos',
    'Fuente (link o documento)', 'Notas', 'Aprobado']);
  const NO_WEB = new Set(['No. Serie']);
  const SIN_UNIDADES = new Set(['Marca', 'Modelo', 'No. Serie']);
  const MARCAS = {};
  ['SDLOOL', 'SDLANCH', 'Furd', 'Case', 'Vicsec', 'KUL', 'GIYI', 'Terramax', 'Energy', 'STMA', 'Liondi', 'ApexGen',
    'Yale', 'Heli'].forEach(m => { MARCAS[m.toUpperCase()] = m; });
  const UNIDADES = '(kg|mm|m³|L|Hz|HP|kW|kN|dB|km/h|N/cm|cc|Ah|V|A)';
  const miles = n => Number(n).toLocaleString('en-US');

  function limpiar(k, v) {                       // igual que limpiar() de importar_fichas.py
    if (v === null || v === undefined) return null;
    if (k === 'Horas de uso' && (v === 0 || v === '0')) return null;
    if (k === 'Cap. de ascenso' && typeof v === 'number' && v > 0 && v <= 1) return parseFloat((v * 100).toPrecision(6)) + '%';
    v = String(v).replace(/\s+/g, ' ').trim().replace(/;+$/, '').trim();
    if (['', 'n/a', 'na', 'np', 'n/p', 'no aplica', '-', '—'].includes(v.toLowerCase())) return null;
    if (k === 'Piezas por lote' && v === '1') return null;
    if (['si', 'sí'].includes(v.toLowerCase())) return 'Sí';
    if (v.toLowerCase() === 'no') return 'No';
    if (k === 'Marca') return MARCAS[v.toUpperCase()] || v;
    v = v.replace(/\bhidraulic([oa])\b/gi, 'Hidráulic$1');
    if (!SIN_UNIDADES.has(k)) {
      v = v.replace(new RegExp('(\\d)\\s*' + UNIDADES + '(?![A-Za-z])', 'g'), '$1 $2');
      v = v.replace(/(?<![\d.,])(\d{4,})(?=\s?(mm|kg)\b)/g, m => miles(m));
      if (k.includes('Dimensiones') || k.includes('Medidas')) v = v.replace(/(?<=\d)\s*[×xX*]\s*(?=\d)/g, ' × ');
      v = v.replace(/(\d)(in|ft)\b/g, '$1 $2');
      v = v.replace(/(?<![\d.,])(\d{4,})(?= ×)/g, m => miles(m));
      v = v.replace(/^(\d+(?:\.\d+)?)\s*-\s*(\d)/, '$1 – $2');
    }
    if (k === 'Motor') {
      v = v.replace(/(\s*\+\s*)+/g, ', ').replace(/^[, ]+|[, ]+$/g, '').replaceAll('enfriador por', 'enfriado por');
      v = v.replace(/, (Diésel|Gasolina|Gas)/g, (m, g) => ', ' + g.toLowerCase());
    }
    if (k === 'Potencia') {
      v = v.replace(/(\d)\s*kw\b/gi, '$1 kW');
      const hp = v.match(/([\d.]+) HP/), kw = v.match(/([\d.]+) kW/);
      if (hp && kw && !v.includes('GLP')) v = hp[1] + ' HP (' + kw[1] + ' kW)';
    }
    v = v.replace(/(\d)ft\b/g, '$1 ft');
    const c = v[0];
    if (c !== c.toUpperCase() && c === c.toLowerCase()) v = c.toUpperCase() + v.slice(1);
    return v;
  }

  function otros(texto) {                         // "Campo: valor; Campo: valor"
    const pares = [];
    String(texto || '').split(';').forEach(parte => {
      const i = parte.indexOf(':'); if (i < 0) return;
      const k = parte.slice(0, i).replace(/\s*\([A-Z][A-Za-z ]*\)/g, '').trim();
      const v = limpiar(k, parte.slice(i + 1));
      if (k && v) pares.push([k[0].toUpperCase() + k.slice(1), v]);
    });
    return pares;
  }

  // Una fila aprobada ([[encabezado, valor], ...] en el orden de la hoja) → {specs, disp, qty}
  function ficha(pares) {
    const hdr = pares.map(p => p[0]), d = Object.fromEntries(pares);
    const campos = hdr.filter(h => h && !NO_VA.has(h) && !BASE.includes(h) && !FINAL.includes(h));
    let specs = [];
    BASE.concat(campos, ['__otros__'], FINAL).forEach(k => {
      if (k === '__otros__') { specs = specs.concat(otros(d['Otros datos'])); return; }
      if (k === 'Unidades') { const q = d.Unidades; if (typeof q === 'number' && q > 1) specs.push([k, String(Math.trunc(q))]); return; }
      const v = limpiar(k, d[k]); if (v) specs.push([k, v]);
    });
    const vistos = new Set();
    specs = specs.filter(s => !vistos.has(s[0]) && vistos.add(s[0]));
    return { specs, disp: String(d.Disponible || 'Sí').trim().toLowerCase() !== 'no', qty: d.Unidades };
  }

  function corregir(id, f) {                      // correcciones_fichas.json (window.AMA_CORRECCIONES)
    const c = (window.AMA_CORRECCIONES || {})[id]; if (!c) return f;
    Object.entries(c).forEach(([k, v]) => {
      if (k === '_disp') { f.disp = v; return; }
      if (k === '_qty') { f.qty = v; return; }
      if (k[0] === '_') return;
      const i = f.specs.findIndex(s => s[0] === k);
      if (v === null) { if (i >= 0) f.specs.splice(i, 1); }
      else if (i >= 0) f.specs[i][1] = v;
      else { let fin = f.specs.findIndex(s => FINAL.includes(s[0])); if (fin < 0) fin = f.specs.length; f.specs.splice(fin, 0, [k, v]); }
    });
    return f;
  }

  function csv(texto) {                           // CSV de Google (comillas dobles)
    const filas = []; let fila = [], campo = '', q = false;
    for (let i = 0; i < texto.length; i++) {
      const c = texto[i];
      if (q) { if (c === '"') { if (texto[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += c; }
      else if (c === '"') q = true;
      else if (c === ',') { fila.push(campo); campo = ''; }
      else if (c === '\n') { fila.push(campo); filas.push(fila); fila = []; campo = ''; }
      else if (c !== '\r') campo += c;
    }
    if (campo || fila.length) { fila.push(campo); filas.push(fila); }
    return filas;
  }

  // {id: {specs, disp, qty}} con lo aprobado; sin el No. de serie
  function procesar(texto) {
    const filas = csv(texto), h = (filas.shift() || []).map(x => x.trim());
    const cId = h.indexOf('ID'), cDatos = h.indexOf('Datos'), res = {};
    filas.forEach(r => {
      const id = parseInt(r[cId], 10); if (!id || !r[cDatos]) return;
      try {
        const f = corregir(String(id), ficha(JSON.parse(r[cDatos])));
        f.specs = f.specs.filter(s => !NO_WEB.has(s[0]));
        res[id] = f;
      } catch (e) { /* fila dañada: se queda la ficha guardada */ }
    });
    return res;
  }

  function cargar(ms) {
    const ctl = window.AbortController ? new AbortController() : null;
    const t = ctl && setTimeout(() => ctl.abort(), ms || 6000);
    return fetch(URL + '&_=' + Date.now(), ctl ? { signal: ctl.signal } : {})
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(procesar)
      .finally(() => t && clearTimeout(t));
  }

  // Ficha del cotizador ("Concepto: valor"), igual que ficha_desde() de sincronizar_cotizador.py
  function fichaCotizador(specs) {
    const d = Object.fromEntries(specs), out = [];
    const marca = d.Marca || '', modelo = d.Modelo || '';
    if (marca || modelo) out.push('Marca / Modelo: ' + (marca && modelo.toLowerCase().startsWith(marca.toLowerCase()) ? modelo : (marca + ' ' + modelo).trim()));
    const ren = { 'Año': 'Año de fabricación', 'Condición': 'Estado' };
    specs.forEach(([k, v]) => {
      if (k === 'Marca' || k === 'Modelo' || ['No. Serie', 'Unidades', 'Garantía'].includes(k)) return;
      out.push((ren[k] || k) + ': ' + v);
    });
    return out;
  }

  window.AMA_FICHAS_VIVO = { cargar, procesar, fichaCotizador };
})();
