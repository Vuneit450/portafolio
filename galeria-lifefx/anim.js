// LifeFX v1.1 · build 2026-11-24 23:07 · generado por construir.py — no editar a mano; editar nucleo.js y efectos/*.js
// ===== LifeFX · biblioteca de animaciones para data apps (BINATSA) =====
// Núcleo: utilidades, motor de partículas, registro de efectos, clasificación de gráficas y ciclo de animación.
// Cada efecto vive en efectos/*.js y se registra con LifeFX.efecto(nombre, { para, descripcion, costo, aplicar(ctx) }).
// Reglas: respeta prefers-reduced-motion, se pausa con la pestaña oculta, se apaga al redimensionar (body.noanim)
// y reparte el movimiento según el peso de cada parte del dato.
(function () {
  'use strict';
  var MQ = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var RM = MQ ? MQ.matches : false;
  var NS = 'http://www.w3.org/2000/svg';
  var FX = window.LifeFX = {
    version: '1.1',
    reducido: RM,
    efectos: {},
    globales: {},
    // Tipo de gráfica → efecto(s). Se puede cambiar con LifeFX.config({ mapa: {...} }) o por panel con data-fx.
    mapa: {
      flujo: 'particulas-flujo', 'barras-v': ['liquido', 'meta-pulso'], 'barras-h': 'franjas', cascada: 'gota-cascada', embudo: 'goteo-embudo',
      burbujas: 'ondas', dispersion: 'nube-dispersion', histograma: 'conteo-histograma', arcos: 'reflector', radial: ['reflector', 'radar'], treemap: 'reflector', calor: 'calor-onda', lineas: 'cometa', radar: 'telarana', medidor: 'aguja-medidor',
      cifras: 'contador'
    },
    selector: '.panel .body > svg',
    vivo: { maxMinutos: 60, intervaloMs: 60000 },
    // Umbrales OFICIALES del semáforo (Decisión 2, Jonathan 2026-11-24: se adoptan
    // como oficiales los valores de ejemplo de la galería). Son los DEFAULTS:
    // LifeFX.config({ umbrales: {...} }) los cambia por KPI y los data-* por
    // tarjeta mandan sobre la config (ver efectos/semaforo.js). `valor` y `meta`
    // son los valores de referencia de INTER ATC nov 2026; `vigilar`/`actuar`/
    // `direccion`/`formato` son los umbrales oficiales. Revisión de dirección
    // (2026-11-24, sin correcciones): NS y NPS son 'mayor' (lo malo es BAJAR:
    // por debajo de vigilar → Vigilar, por debajo de actuar → Actuar; en ambos
    // vigilar > actuar) y abandono y TMO son 'menor' (lo malo es SUBIR: por
    // encima de vigilar → Vigilar, por encima de actuar → Actuar; en ambos
    // vigilar < actuar). TMO va en segundos: actual 532 s = 8:52, vigilar
    // 550 s = 9:10, actuar 580 s = 9:40, meta 540 s = 9:00.
    umbrales: {
      ns:       { valor: 89.6, meta: 90,  vigilar: 89.8, actuar: 88,  direccion: 'mayor', formato: 'pct',  nombre: 'NS' },
      abandono: { valor: 4.7,  meta: 5,   vigilar: 5.2,  actuar: 6,   direccion: 'menor', formato: 'pct',  nombre: 'Abandono' },
      tmo:      { valor: 532,  meta: 540, vigilar: 550,  actuar: 580, direccion: 'menor', formato: 'mmss', nombre: 'TMO' },
      nps:      { valor: 34.1, meta: 30,  vigilar: 25,  actuar: 10,  direccion: 'mayor', formato: 'num',  nombre: 'NPS' }
    },
    tickers: [],
    efecto: function (nombre, def) { def.nombre = nombre; FX.efectos[nombre] = def; },
    global: function (nombre, def) { def.nombre = nombre; FX.globales[nombre] = def; },
    config: function (o) { if (o && o.mapa) for (var k in o.mapa) FX.mapa[k] = o.mapa[k]; if (o && o.selector) FX.selector = o.selector; if (o && o.vivo) for (var v in o.vivo) FX.vivo[v] = o.vivo[v]; if (o && o.umbrales) for (var k in o.umbrales) FX.umbrales[k] = Object.assign({}, FX.umbrales[k] || {}, o.umbrales[k]); },
    tick: function (fn) { FX.tickers.push(fn); }
  };

  // prefers-reduced-motion EN VIVO (no solo al cargar): el MediaQuery avisa a mitad de sesión.
  // Al activarse: FX.reducido se actualiza (valor vivo, no cacheado) y se pone body.noanim — el
  // loop ya salta tickers con noanim y el CSS oculta .lifeL y neutraliza animaciones.
  // Al desactivarse: se quita noanim y, si el motor nunca arrancó por cargar con
  // reduced-motion, se arranca entonces (FX.arrancar).
  if (MQ) {
    var onRM = function () {
      FX.reducido = MQ.matches;
      if (!document.body) return;
      if (MQ.matches) document.body.classList.add('noanim');
      else { document.body.classList.remove('noanim'); if (!FX.__on) FX.arrancar(); }
    };
    if (MQ.addEventListener) MQ.addEventListener('change', onRM); else if (MQ.addListener) MQ.addListener(onRM);
    if (RM && document.body) document.body.classList.add('noanim');
  }

  // ---------- Utilidades ----------
  var u = FX.u = {
    NS: NS,
    vis: function (el) { return el && el.isConnected && el.getClientRects().length && !el.closest('[hidden]'); },
    mk: function (tag, at) { var e = document.createElementNS(NS, tag); for (var k in at) e.setAttribute(k, at[k]); return e; },
    layer: function (svg) { var g = svg.querySelector(':scope > g.lifeL'); if (!g) { g = u.mk('g', { class: 'lifeL', 'pointer-events': 'none', 'aria-hidden': 'true' }); svg.appendChild(g); } return g; },
    defs: function (svg) { var d = svg.querySelector(':scope > defs.lifeD'); if (!d) { d = u.mk('defs', { class: 'lifeD' }); svg.insertBefore(d, svg.firstChild); } return d; },
    num: function (e, a) { return +e.getAttribute(a) || 0; },
    id: function (p) { return (p || 'fx') + Math.random().toString(36).slice(2, 8); },
    rgb: function (c) { var m = /^#([0-9a-f]{6})$/i.exec(c || ''); if (!m) return null; var n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; },
    luz: function (c) { var r = u.rgb(c); return r ? (0.299 * r[0] + 0.587 * r[1] + 0.114 * r[2]) / 255 : 1; },
    pcol: function (fill) { var c = u.rgb(fill); if (!c) return '#ffffff'; return u.luz(fill) < 0.78 ? '#ffffff' : 'rgb(' + c.map(function (v) { return Math.round(v * 0.45); }).join(',') + ')'; },
    bez: function (a, b, c, d, t) { var v = 1 - t; return v * v * v * a + 3 * v * v * t * b + 3 * v * t * t * c + t * t * t * d; },
    // Selección ponderada: índice con probabilidad proporcional al peso.
    wpick: function (ws) { var s = 0, i; for (i = 0; i < ws.length; i++) s += ws[i]; var r = Math.random() * s; for (i = 0; i < ws.length; i++) { r -= ws[i]; if (r <= 0) return i; } return ws.length - 1; },
    areaOf: function (e) { try { var b = e.getBBox(); return Math.max(0.0001, b.width * b.height); } catch (x) { return 0.0001; } },
    shares: function (ws) { var s = ws.reduce(function (a, b) { return a + b; }, 0) || 1; return ws.map(function (w) { return w / s; }); },
    // Matriz forma→svg solo con atributos transform (ignora animaciones CSS, que pueden tener escala 0).
    toLocal: function (e, svg) {
      try { var m = svg.createSVGMatrix(); for (var n = e; n && n !== svg; n = n.parentNode) { var tl = n.transform && n.transform.baseVal; if (tl && tl.numberOfItems) m = tl.consolidate().matrix.multiply(m); } return m; } catch (x) { return null; }
    },
    center: function (els, svg) {
      var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
      els.forEach(function (e) { var m = u.toLocal(e, svg), b = e.getBBox(); if (!m) return; [[b.x, b.y], [b.x + b.width, b.y + b.height]].forEach(function (p) { var q = new DOMPoint(p[0], p[1]).matrixTransform(m); x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }); });
      return [(x0 + x1) / 2, (y0 + y1) / 2, Math.max(x1 - x0, y1 - y0) / 2];
    },
    lines: function (svg) {
      return [].filter.call(svg.querySelectorAll('path'), function (p) { var L = 0; if (p.getAttribute('fill') !== 'none' || !p.getAttribute('stroke') || p.getAttribute('stroke-dasharray') || p.hasAttribute('data-flow') || p.closest('.lifeL')) return false; try { L = p.getTotalLength(); } catch (e) { return false; } return L > 60; });
    }
  };

  // ---------- Motor de partículas compartido ----------
  var parts = [], emit = [], MAXP = 360, acc = new WeakMap();
  FX.particulas = parts;
  function inside(em, x, y) {
    var p = new DOMPoint(x, y).matrixTransform(em.inv);
    try { return em.e.isPointInFill(p); } catch (e) { return p.x >= em.bb.x && p.x <= em.bb.x + em.bb.width && p.y >= em.bb.y && p.y <= em.bb.y + em.bb.height; }
  }
  // Emisor sobre una forma: modo 'rise' (suben), 'flowX' (corren a la derecha), 'orbit'/'swirl' (giran), 'spark' (chispas).
  u.emisor = function (svg, e, mode, opts) {
    opts = opts || {};
    var bb; try { bb = e.getBBox(); } catch (x) { return null; } if (bb.width < 3 || bb.height < 3) return null;
    var m = u.toLocal(e, svg); if (!m) return null; var inv; try { inv = m.inverse(); } catch (x) { return null; }
    var em = { svg: svg, e: e, mode: mode, bb: bb, m: m, inv: inv, rate: opts.rate || Math.max(0.4, Math.min(5, bb.width * bb.height / 1600)), a: Math.random(), col: opts.col || u.pcol(e.getAttribute('fill')), ctr: opts.ctr, n: 0, max: opts.max || 40 };
    emit.push(em); return em;
  };
  // Partículas que siguen una banda tipo sankey: data-flow="xa,ya,xb,yb,h" en el path.
  function spawnFlows(dt) {
    [].forEach.call(document.querySelectorAll('path[data-flow]'), function (p) {
      var svg = p.ownerSVGElement; if (!svg || svg.__fxFlow !== 1 || !u.vis(svg) || parts.length >= MAXP) return;
      var f = p.getAttribute('data-flow').split(',').map(Number), h = f[4]; if (!(h > 0.5)) return;
      var a = (acc.get(p) || 0) + Math.min(9, 0.5 + h / 7) * dt;
      while (a >= 1 && parts.length < MAXP) {
        a -= 1;
        var c = u.mk('circle', { r: (1.6 + Math.random() * 1.6).toFixed(1), fill: p.getAttribute('fill') || '#2a78d6', opacity: 0 });
        u.layer(svg).appendChild(c); parts.push({ k: 'flow', c: c, f: f, o: h * (0.12 + Math.random() * 0.76), t: 0, d: 1.6 + Math.random() * 1.2 });
      }
      acc.set(p, a);
    });
  }
  function spawnEmit(dt) {
    for (var i = emit.length - 1; i >= 0; i--) {
      var em = emit[i]; if (!em.e.isConnected) { emit.splice(i, 1); continue; }
      if (!u.vis(em.svg) || parts.length >= MAXP || em.n > em.max) continue;
      em.a += em.rate * dt;
      while (em.a >= 1 && parts.length < MAXP) {
        em.a -= 1;
        var b = em.bb, pt = null;
        for (var k = 0; k < 12 && !pt; k++) {
          var lx = em.mode === 'flowX' ? b.x + Math.random() * 4 : b.x + Math.random() * b.width;
          var ly = em.mode === 'rise' ? b.y + b.height - 1 - Math.random() * Math.min(6, b.height * 0.3) : b.y + Math.random() * b.height;
          var q = new DOMPoint(lx, ly).matrixTransform(em.m); if (inside(em, q.x, q.y)) pt = q;
        }
        if (!pt) continue;
        var c = u.mk('circle', { cx: pt.x, cy: pt.y, r: (1.3 + Math.random() * 1.5).toFixed(1), fill: em.col, opacity: 0 }); u.layer(em.svg).appendChild(c);
        parts.push({ k: em.mode, c: c, em: em, x: pt.x, y: pt.y, t: 0, life: em.mode === 'spark' ? 1.2 + Math.random() : 2.2 + Math.random() * 1.6, sp: 18 + Math.random() * 26, w: (0.5 + Math.random()) * (Math.random() < 0.5 ? -1 : 1), ph: Math.random() * 6.28, f: 0 });
        em.n++;
      }
    }
  }
  function kill(q, i) { if (q.c.parentNode) q.c.parentNode.removeChild(q.c); if (q.em) q.em.n--; parts.splice(i, 1); }
  function stepParts(dt) {
    for (var i = parts.length - 1; i >= 0; i--) {
      var q = parts[i];
      if (q.k === 'flow') {
        q.t += dt / q.d;
        if (q.t >= 1 || !q.c.isConnected) { kill(q, i); continue; }
        var f = q.f, mx = (f[0] + f[2]) / 2, t = q.t;
        q.c.setAttribute('cx', u.bez(f[0], mx, mx, f[2], t).toFixed(1)); q.c.setAttribute('cy', u.bez(f[1] + q.o, f[1] + q.o, f[3] + q.o, f[3] + q.o, t).toFixed(1));
        q.c.setAttribute('opacity', (Math.min(1, t * 6, (1 - t) * 6) * 0.9).toFixed(2)); continue;
      }
      q.t += dt; var em = q.em;
      if (q.t > q.life || !q.c.isConnected || !em.e.isConnected) { kill(q, i); continue; }
      if (q.k === 'rise') { q.y -= q.sp * dt; q.x += Math.sin(q.t * 4 + q.ph) * 6 * dt; }
      else if (q.k === 'flowX') { q.x += q.sp * 1.6 * dt; q.y += Math.sin(q.t * 5 + q.ph) * 3 * dt; }
      else if (q.k === 'orbit' || q.k === 'swirl') { var cx = em.ctr[0], cy = em.ctr[1], dx = q.x - cx, dy = q.y - cy, R = Math.sqrt(dx * dx + dy * dy) || 1, ang = Math.atan2(dy, dx) + q.w * (q.k === 'swirl' ? 1.6 : 0.9) * dt; q.x = cx + R * Math.cos(ang); q.y = cy + R * Math.sin(ang); }
      else if (q.k === 'spark') { q.y -= 6 * dt; }
      q.f++; if (q.k !== 'spark' && q.f % 4 === 0 && !inside(em, q.x, q.y)) { kill(q, i); continue; }
      var o = q.k === 'spark' ? Math.sin(Math.PI * q.t / q.life) : Math.min(1, q.t * 4, (q.life - q.t) * 3);
      q.c.setAttribute('cx', q.x.toFixed(1)); q.c.setAttribute('cy', q.y.toFixed(1)); q.c.setAttribute('opacity', (o * 0.9).toFixed(2));
    }
  }

  // ---------- Clasificación de gráficas ----------
  // Devuelve una lista de grupos { tipo, marks, ws } a partir de lo que la gráfica dibujó.
  FX.clasificar = function (svg) {
    var g = [], num = u.num, medidorPaths = [];
    if (svg.querySelector('path[data-flow]')) { g.push({ tipo: 'flujo', marks: [].slice.call(svg.querySelectorAll('path[data-flow]')), ws: [] }); return g; }
    var marks = [].slice.call(svg.querySelectorAll('rect.hit, rect[role=button], path.hit, path[role=button], circle.hit, circle[role=button], polygon.hit, polygon[role=button], [data-fx-mark]')).filter(function (e) { var f = e.getAttribute('fill') || 'none'; return !e.closest('.lifeL') && f !== 'none' && f !== 'transparent' && f !== '#fff' && f !== '#ffffff'; });
    var arcs = [].filter.call(svg.querySelectorAll('path'), function (e) { var f = e.getAttribute('fill') || 'none'; return !e.closest('.lifeL') && /A[\d.]/.test(e.getAttribute('d') || '') && f !== 'none' && f !== 'transparent' && f.indexOf('url(') < 0; });
    var rects = marks.filter(function (e) { return e.tagName === 'rect'; }), circs = marks.filter(function (e) { return e.tagName === 'circle' && num(e, 'r') >= 7; });
    var pequenos = marks.filter(function (e) { return e.tagName === 'circle' && num(e, 'r') > 0 && num(e, 'r') < 7; });
    var ls = u.lines(svg);
    var aguja = svg.querySelector('polygon[data-fx-aguja], line[data-fx-aguja], path[data-fx-aguja]');
    var valorArcs = arcs.filter(function (e) { return e.classList.contains('hit') || e.hasAttribute('data-fx-mark'); });
    if (aguja && valorArcs.length) {
      medidorPaths = arcs.slice(); medidorPaths.push(aguja);
      g.push({ tipo: 'medidor', marks: valorArcs.concat([aguja]), ws: valorArcs.map(u.areaOf) });
      arcs = []; ls = ls.filter(function (p) { return medidorPaths.indexOf(p) < 0; });
    }
    if (arcs.length) g.push({ tipo: arcs.length >= 8 ? 'radial' : 'arcos', marks: arcs, ws: arcs.map(u.areaOf) });
    if (rects.length) {
      var dist = function (f) { return new Set(rects.map(function (r) { return Math.round(f(r)); })).size; };
      var ws = dist(function (r) { return num(r, 'width'); }), hs = dist(function (r) { return num(r, 'height'); });
      var bottoms = dist(function (r) { return num(r, 'y') + num(r, 'height'); }), lefts = dist(function (r) { return num(r, 'x'); });
      var conns = [].filter.call(svg.querySelectorAll('line, path'), function (e) { if (e.closest('.lifeL')) return false; var st = e.getAttribute('stroke'); if (!st || st === 'none') return false; return e.tagName === 'line' || !!e.getAttribute('stroke-dasharray'); }).length;
      var ordenados = rects.slice().sort(function (a, b) { return num(a, 'x') - num(b, 'x'); });
      var huecoMax = 0; for (var i = 0; i + 1 < ordenados.length; i++) huecoMax = Math.max(huecoMax, num(ordenados[i + 1], 'x') - (num(ordenados[i], 'x') + num(ordenados[i], 'width')));
      var esHistograma = rects.length >= 4 && ws <= 2 && bottoms <= 2 && hs > 2 && huecoMax <= 2;
      var tipo;
      if (esHistograma) tipo = 'histograma';
      else if (rects.length >= 20 && ws <= 2 && hs <= 2) tipo = 'calor';
      else if (rects.length >= 4 && ws <= 2 && hs > 2 && bottoms > 2 && conns >= 2) tipo = 'cascada';
      else if (!ls.length && rects.length >= 3 && bottoms > 2 && lefts > 1 && hs > 2 && rects.filter(function (r) { return num(r, 'height') > 28 && num(r, 'width') > 28; }).length >= rects.length * 0.4) tipo = 'treemap';
      else if (hs <= 2 && rects.filter(function (r) { return num(r, 'width') > num(r, 'height'); }).length >= rects.length / 2) tipo = 'barras-h';
      else tipo = 'barras-v';
      var w = tipo === 'calor' ? rects.map(function (r) { var o = parseFloat(r.getAttribute('fill-opacity')); return isFinite(o) ? o * o : 0.3; })
        : tipo === 'barras-h' ? rects.map(function (r) { return num(r, 'width'); }) : (tipo === 'barras-v' || tipo === 'cascada' || tipo === 'histograma') ? rects.map(function (r) { return num(r, 'height'); }) : rects.map(u.areaOf);
      g.push({ tipo: tipo, marks: rects, ws: w });
    }
    if (circs.length) g.push({ tipo: 'burbujas', marks: circs, ws: circs.map(function (c) { var r = num(c, 'r'); return r * r; }) });
    var polys = marks.filter(function (e) { return e.tagName === 'polygon' && medidorPaths.indexOf(e) < 0; });
    if (polys.length) g.push({ tipo: 'radar', marks: polys, ws: polys.map(u.areaOf) });
    if (pequenos.length >= 10) g.push({ tipo: 'dispersion', marks: pequenos, ws: pequenos.map(function (c) { var r = num(c, 'r'); return r * r; }) });
    // Embudo: trapecios (path o polygon) apilados, centrados, de ancho estrictamente decreciente.
    var funnel = marks.filter(function (e) { return e.tagName === 'path' && arcs.indexOf(e) < 0; }).concat([].filter.call(svg.querySelectorAll('polygon.hit, polygon[data-fx-mark]'), function (e) { var f = e.getAttribute('fill') || 'none'; return !e.closest('.lifeL') && f !== 'none' && f !== 'transparent' && f !== '#fff' && f !== '#ffffff'; }));
    funnel.sort(function (a, b) { try { return a.getBBox().y - b.getBBox().y; } catch (x) { return 0; } });
    var esEmbudo = funnel.length >= 3;
    if (esEmbudo) {
      var fb = funnel.map(function (e) { try { return e.getBBox(); } catch (x) { return { x: 0, y: 0, width: 0, height: 0 }; } });
      var cxm = fb.reduce(function (a, b) { return a + b.x + b.width / 2; }, 0) / fb.length, wmax = Math.max.apply(null, fb.map(function (b) { return b.width; }));
      for (var fi = 0; fi < fb.length; fi++) {
        if (fb[fi].width < 8 || fb[fi].height < 6) { esEmbudo = false; break; }
        if (Math.abs(fb[fi].x + fb[fi].width / 2 - cxm) > wmax * 0.1) { esEmbudo = false; break; }
        if (fi && (fb[fi].width > fb[fi - 1].width * 0.97 || fb[fi].y - (fb[fi - 1].y + fb[fi - 1].height) < -2 || fb[fi].y - (fb[fi - 1].y + fb[fi - 1].height) > 14)) { esEmbudo = false; break; }
      }
      // Decisión 3 (2026-11-24): el embudo temporal puro (recibidas → atendidas → a tiempo)
      // termina en 74,4 %, no en un resto pequeño. Lo que define un embudo es el
      // estrechamiento monótono y centrado (ya exigido arriba: cada etapa ≥3 % más
      // angosta que la anterior), no un resto final pequeño: basta con que la última
      // etapa sea ≤85 % de la primera (antes ≤60 %, regla pensada para embudos
      // anidados que terminan en un subconjunto pequeño). Los datos no se tocaron:
      // 12.963/15.618 = 83,0 % y 11.614/15.618 = 74,4 %. Un apilado casi plano
      // (p. ej. 100 → 98 → 97) sigue sin clasificar.
      if (esEmbudo && fb[fb.length - 1].width > fb[0].width * 0.85) esEmbudo = false;
    }
    if (esEmbudo) g.push({ tipo: 'embudo', marks: funnel, ws: funnel.map(function (e) { try { return e.getBBox().width; } catch (x) { return 1; } }) });
    if (ls.length) g.push({ tipo: 'lineas', marks: ls.slice(0, 3), ws: [] });
    return g;
  };

  // data-fx en el panel o en el svg: "liquido" (todo el panel), "barras-v:franjas; lineas:no" (por tipo) o "no".
  function override(svg) {
    var host = svg.closest('[data-fx]'); if (!host) return null;
    var v = host.getAttribute('data-fx').trim(); if (v === 'no') return { todo: 'no' };
    if (v.indexOf(':') < 0) return { todo: v };
    var o = {}; v.split(';').forEach(function (p) { var kv = p.split(':'); if (kv.length === 2) o[kv[0].trim()] = kv[1].trim(); }); return o;
  }
  function aplicar(nombre, grupo, svg) {
    [].concat(nombre).forEach(function (n) {
      if (!n || n === 'no') return; var ef = FX.efectos[n]; if (!ef) return;
      try { ef.aplicar({ svg: svg, tipo: grupo.tipo, marks: grupo.marks, ws: grupo.ws, shares: u.shares(grupo.ws.length ? grupo.ws : grupo.marks.map(function () { return 1; })), u: u, FX: FX }); }
      catch (e) { if (window.console) console.warn('LifeFX ' + n + ': ' + e.message); }
    });
  }
  FX.decorar = function (svg) {
    if (svg.__fx || !u.vis(svg) || u.num(svg, 'width') < 120) return; svg.__fx = 1;
    var ov = override(svg); if (ov && ov.todo === 'no') return;
    FX.clasificar(svg).forEach(function (gr) {
      var n = ov ? (ov.todo || ov[gr.tipo] || FX.mapa[gr.tipo]) : FX.mapa[gr.tipo];
      if (gr.tipo === 'flujo') svg.__fxFlow = n === 'particulas-flujo' ? 1 : 0;
      aplicar(n, gr, svg);
    });
  };
  FX.motor = { emisores: emit, particulas: parts };

  // ---------- Estilos compartidos ----------
  var css = document.createElement('style');
  css.textContent =
    '.lifePulse{transform-box:fill-box;transform-origin:center;animation:lifePulse 1.8s ease-out infinite}@keyframes lifePulse{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(3.6)}}' +
    '.lifeSpot{animation:lifeSpot .9s ease-out}@keyframes lifeSpot{0%{filter:none}30%{filter:brightness(1.35) saturate(1.3) drop-shadow(0 0 8px rgba(255,255,255,.95))}100%{filter:none}}' +
    '.lifeRipple{transform-box:fill-box;transform-origin:center;animation:lifeRipple 1.5s ease-out forwards}@keyframes lifeRipple{0%{opacity:.85;transform:scale(1)}100%{opacity:0;transform:scale(1.9)}}' +
    '.lifeComet{filter:drop-shadow(0 0 5px rgba(42,120,214,1))}' +
    '.panel svg path[stroke-dasharray]:not([data-flow]){animation:lifeAnts 1.2s linear infinite}@keyframes lifeAnts{to{stroke-dashoffset:-18}}' +
    '@keyframes lifeFloat{0%,100%{transform:translate(0,0)}33%{transform:translate(3px,-4px)}66%{transform:translate(-3px,2.5px)}}' +
    '@keyframes lifeBand{0%,100%{opacity:1}50%{opacity:.45}}' +
    'body.noanim .lifeL{display:none}' +
    // Sin movimiento: se detiene TODA animación CSS (life* y an* de entrada). animation:none
    // resuelve las entradas con fill both a su estado final (el dato queda visible, no desaparece).
    'body.noanim *{animation:none!important}' +
    // anDraw deja stroke-dashoffset=len en línea: sin esto la línea quedaría invisible.
    'body.noanim *{stroke-dashoffset:0!important}' +
    // El odómetro rueda con transition: sin esto seguiría rodando; así salta a su valor final.
    'body.noanim .odoS{transition:none!important}';
  document.head.appendChild(css);

  // ---------- Ciclo ----------
  var last = 0;
  function loop(ts) {
    var dt = last ? Math.min(0.05, (ts - last) / 1000) : 0; last = ts;
    if (!document.hidden && !document.body.classList.contains('noanim')) { spawnFlows(dt); spawnEmit(dt); stepParts(dt); FX.tickers.forEach(function (f) { try { f(dt); } catch (e) { /* un efecto no detiene a los demás */ } }); }
    requestAnimationFrame(loop);
  }
  FX.arrancar = function () {
    if (FX.reducido || FX.__on) return; FX.__on = 1;
    Object.keys(FX.globales).forEach(function (k) { try { FX.globales[k].iniciar(FX); } catch (e) { /* global opcional */ } });
    setInterval(function () { [].forEach.call(document.querySelectorAll(FX.selector), FX.decorar); }, 1200);
    requestAnimationFrame(loop);
  };
})();

// ---- efectos/aguja-medidor.js ----
// Aguja del medidor: barre desde 0 hasta el valor con sobreimpulso y el arco de valor se ilumina.
// El sobreimpulso (≈10% del recorrido, easeOutBack) es ∝ al valor: a más valor, más rebasa la
// aguja antes de asentarse. El valor se lee de data-valor en el arco (si no hay, del ángulo dibujado).
(function () {
  var medidores = [];
  function easeOutBack(p) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); }
  LifeFX.efecto('aguja-medidor', { titulo: 'Aguja del medidor', para: ['medidor'], costo: 'bajo', descripcion: 'La aguja barre hasta el valor con un pequeño sobreimpulso y el arco se ilumina; el sobreimpulso crece con el valor.', aplicar: function (c) {
    var u = c.u, aguja = null, arco = null;
    c.marks.forEach(function (m) { if (m.hasAttribute('data-fx-aguja')) aguja = m; else if (m.tagName === 'path' && /A/.test(m.getAttribute('d') || '')) arco = m; });
    if (!aguja || !arco) return;
    var pts = [], piv = null, tip = null, b;
    if (aguja.tagName === 'polygon') { (aguja.getAttribute('points') || '').trim().split(/\s+/).forEach(function (s) { var q = s.split(','); if (q.length === 2) pts.push([+q[0], +q[1]]); }); if (pts.length >= 3) { tip = pts[0]; piv = [(pts[1][0] + pts[2][0]) / 2, (pts[1][1] + pts[2][1]) / 2]; } }
    else if (aguja.tagName === 'line') { tip = [+aguja.getAttribute('x1'), +aguja.getAttribute('y1')]; piv = [+aguja.getAttribute('x2'), +aguja.getAttribute('y2')]; }
    if (!piv || !tip) { b = aguja.getBBox(); piv = [b.x + b.width / 2, b.y + b.height]; tip = [b.x + b.width / 2, b.y]; }
    var f = parseFloat(arco.getAttribute('data-valor'));
    var aT = isFinite(f) ? Math.PI * (1 - Math.max(0, Math.min(1, f))) : Math.atan2(-(tip[1] - piv[1]), tip[0] - piv[0]);
    var aD = Math.atan2(-(tip[1] - piv[1]), tip[0] - piv[0]);
    var val = isFinite(f) ? Math.max(0, Math.min(1, f)) : Math.max(0, Math.min(1, (Math.PI - aT) / Math.PI));
    var glow = u.mk('path', { d: arco.getAttribute('d'), fill: arco.getAttribute('fill'), opacity: 0, 'pointer-events': 'none' });
    u.layer(c.svg).appendChild(glow);
    medidores.push({ aguja: aguja, glow: glow, cx: piv[0], cy: piv[1], a0: Math.PI, aT: aT, aD: aD, val: val, t: Math.random() * 3.4 });
  } });
  LifeFX.tick(function (dt) {
    for (var i = medidores.length - 1; i >= 0; i--) {
      var m = medidores[i];
      if (!m.aguja.isConnected || !m.glow.isConnected) { if (m.glow.parentNode) m.glow.parentNode.removeChild(m.glow); medidores.splice(i, 1); continue; }
      m.t += dt; var T = 3.4, t = m.t % T, a, A = 0.12 * Math.abs(m.aT - m.a0);
      if (t < 1.3) { var p = t / 1.3; a = m.a0 + (m.aT - m.a0) * easeOutBack(p); }
      else if (t < 2.0) { var q = t - 1.3; a = m.aT + A * 0.35 * Math.sin(q * 9) * Math.exp(-q * 2.5); }
      else if (t < 2.9) { var r = (t - 2.0) / 0.9, e = r * r * (3 - 2 * r); a = m.aT + (m.a0 - m.aT) * e; }
      else a = m.a0;
      m.aguja.setAttribute('transform', 'rotate(' + ((m.aD - a) * 180 / Math.PI).toFixed(2) + ' ' + m.cx.toFixed(1) + ' ' + m.cy.toFixed(1) + ')');
      m.glow.setAttribute('opacity', (0.08 + 0.30 * m.val * (0.5 + 0.5 * Math.sin(m.t * 2.5)) * (t < 1.3 ? 1 : 0.4) + (t < 1.3 ? 0.12 : 0)).toFixed(3));
    }
  });
})();

// ---- efectos/alarma-numero.js ----
// NUEVO · Alarma de número: la cifra en rojo late con un resplandor pulsante (glow que crece y se apaga).
// La intensidad del pulso es proporcional al valor del número: a mayor valor, glow más grande y pulso más rápido.
// Activar con LifeFX.config({ mapa: { cifras: 'alarma-numero' } }) o por elemento con data-fx-num="alarma-numero".
LifeFX.esRojoCifra = LifeFX.esRojoCifra || function (el) {
  if (!el) return false;
  if (el.getAttribute && el.getAttribute('data-rojo') === '1') return true;
  var cls = (el.getAttribute && el.getAttribute('class')) || '';
  if (/(rojo|neg|mal|danger)/i.test(cls)) return true;
  try { var c = window.getComputedStyle(el).color.match(/\d+(\.\d+)?/g); if (c && +c[0] > 150 && +c[1] < 110 && +c[2] < 110) return true; } catch (e) { /* sin color computable */ }
  return false;
};
// Formato español de cifras (decisión 5): miles con punto, decimal con coma.
// parseES entiende "15.618" (= 15618) y "89,6" (= 89.6) y, por compatibilidad, el
// anglosajón heredado "89.6" / "15,618.4" (último separador = decimal; con un solo punto,
// 3 dígitos tras él = miles, 1-2 = decimal; la coma sola siempre es decimal).
function parseES(raw) {
  if (raw == null) return null;
  var s = String(raw).trim(), mm = s.match(/-?[\d.,]*\d/);
  if (!mm) return null; s = mm[0];
  var neg = s.charAt(0) === '-'; if (neg || s.charAt(0) === '+') s = s.slice(1);
  var ld = s.lastIndexOf('.'), lc = s.lastIndexOf(','), decSep = null, ent;
  if (ld >= 0 && lc >= 0) decSep = ld > lc ? '.' : ',';
  else if (lc >= 0) decSep = ',';
  else if (ld >= 0) { var tras = s.length - ld - 1; if (!(s.split('.').length > 2 || (tras === 3 && s.slice(0, ld) !== '0'))) decSep = '.'; }
  if (decSep) { var pp = s.split(decSep); ent = pp[0].replace(/[.,]/g, '') + '.' + (pp[1] || ''); }
  else ent = s.replace(/[.,]/g, '');
  var val = parseFloat((neg ? '-' : '') + ent);
  return isFinite(val) ? { val: val } : null;
}
LifeFX.alarma = function (el) {
  if (!el || el.__fxAlarma || (window.LifeFX && LifeFX.reducido)) return;
  if (!LifeFX.esRojoCifra(el)) return;
  var m = (el.textContent || '').match(/-?\d(?:[\d.,]*\d)?/);
  var p = m ? parseES(m[0]) : null;
  var v = p ? Math.abs(p.val) : 0;
  var inten = Math.max(0.15, Math.min(1, Math.log10(v + 1) / 5)); // intensidad ∝ valor (escala logarítmica: 8,1 → 0,19; 15.534 → 0,84)
  el.__fxAlarma = 1;
  el.style.setProperty('--la0', (2 + 4 * inten).toFixed(1) + 'px');
  el.style.setProperty('--la1', (8 + 18 * inten).toFixed(1) + 'px');
  el.style.setProperty('--la2', (14 + 30 * inten).toFixed(1) + 'px');
  el.style.animationDuration = (1.9 - inten).toFixed(2) + 's';
  el.classList.add('lifeAlarma');
};
LifeFX.efecto('alarma-numero', { titulo: 'Alarma de número', para: ['cifras'], costo: 'muy bajo', descripcion: 'La cifra en rojo late con un resplandor pulsante; cuanto mayor es el valor, más intenso y rápido es el pulso.', aplicar: function (c) {
  var root = (c && c.svg && c.svg.closest) ? (c.svg.closest('.panel') || document) : document;
  [].forEach.call(root.querySelectorAll('.kpi .v, .scv, .gv .v, .big, .kv'), function (el) { LifeFX.alarma(el); });
} });
(function () { var s = document.createElement('style'); s.textContent = '.lifeAlarma{animation:lifeAlarma 1.6s ease-in-out infinite}@keyframes lifeAlarma{0%,100%{text-shadow:0 0 var(--la0,2px) rgba(227,73,72,.3)}50%{text-shadow:0 0 var(--la1,14px) rgba(227,73,72,.85),0 0 var(--la2,26px) rgba(227,73,72,.45)}}'; document.head.appendChild(s); })();

// ---- efectos/brillo-barrido.js ----
// Destello diagonal que barre toda la gráfica cada pocos segundos.
LifeFX.efecto('brillo-barrido', { titulo: 'Barrido de brillo', para: ['barras-h', 'barras-v', 'treemap'], costo: 'muy bajo', descripcion: 'Un brillo cruza la gráfica de lado a lado cada pocos segundos.', aplicar: function (c) {
  var u = c.u, w = u.num(c.svg, 'width'), h = u.num(c.svg, 'height'), id = u.id('sh'), g = u.mk('linearGradient', { id: id, x1: 0, x2: 1, y1: 0, y2: 0 });
  [['0', 0], ['0.5', 0.6], ['1', 0]].forEach(function (s) { g.appendChild(u.mk('stop', { offset: s[0], 'stop-color': '#fff', 'stop-opacity': s[1] })); }); u.defs(c.svg).appendChild(g);
  var cp = u.id('cp'), clip = u.mk('clipPath', { id: cp }); c.marks.forEach(function (m) { clip.appendChild(m.cloneNode(false)); }); u.defs(c.svg).appendChild(clip);
  var grp = u.mk('g', { 'clip-path': 'url(#' + cp + ')' }), r = u.mk('rect', { x: -w * 0.3, y: 0, width: w * 0.22, height: h, fill: 'url(#' + id + ')' });
  r.appendChild(u.mk('animate', { attributeName: 'x', values: [-w * 0.3, -w * 0.3, w * 1.05].join(';'), keyTimes: '0;0.7;1', dur: (6 + Math.random() * 3).toFixed(1) + 's', repeatCount: 'indefinite' }));
  grp.appendChild(r); u.layer(c.svg).appendChild(grp);
} });

// ---- efectos/brillo-numero.js ----
// NUEVO · Brillo de número: un barrido de brillo cruza la cifra cada cierto tiempo; en los números en rojo el barrido es más frecuente.
// El barrido es una banda diagonal luminosa (pseudo-elemento) que atraviesa el número sin tocar su texto ni su layout.
// Activar con LifeFX.config({ mapa: { cifras: 'brillo-numero' } }) o por elemento con data-fx-num="brillo-numero".
LifeFX.esRojoCifra = LifeFX.esRojoCifra || function (el) {
  if (!el) return false;
  if (el.getAttribute && el.getAttribute('data-rojo') === '1') return true;
  var cls = (el.getAttribute && el.getAttribute('class')) || '';
  if (/(rojo|neg|mal|danger)/i.test(cls)) return true;
  try { var c = window.getComputedStyle(el).color.match(/\d+(\.\d+)?/g); if (c && +c[0] > 150 && +c[1] < 110 && +c[2] < 110) return true; } catch (e) { /* sin color computable */ }
  return false;
};
LifeFX.brilloNum = function (el) {
  if (!el || el.__fxBrilloNum || (window.LifeFX && LifeFX.reducido)) return;
  if (!/\d/.test(el.textContent || '')) return;
  el.__fxBrilloNum = 1;
  if (window.getComputedStyle(el).display === 'inline') el.style.display = 'inline-block'; // el ::after necesita caja; a bloque no se le toca el layout
  el.style.position = 'relative';
  el.style.overflow = 'hidden';
  el.style.setProperty('--lbDur', LifeFX.esRojoCifra(el) ? '1.6s' : '4.5s'); // en rojo el barrido es más frecuente
  el.classList.add('lifeBrilloNum');
};
LifeFX.efecto('brillo-numero', { titulo: 'Brillo de número', para: ['cifras'], costo: 'muy bajo', descripcion: 'Un barrido de brillo cruza la cifra cada cierto tiempo; en los números en rojo el barrido es más frecuente.', aplicar: function (c) {
  var root = (c && c.svg && c.svg.closest) ? (c.svg.closest('.panel') || document) : document;
  [].forEach.call(root.querySelectorAll('.kpi .v, .scv, .gv .v, .big, .kv'), function (el) { LifeFX.brilloNum(el); });
} });
(function () { var s = document.createElement('style'); s.textContent = '.lifeBrilloNum::after{content:"";position:absolute;top:0;bottom:0;left:0;width:45%;background:linear-gradient(100deg,transparent,rgba(255,255,255,.85),transparent);transform:translateX(-160%);animation:lifeBrilloNum var(--lbDur,4.5s) linear infinite;pointer-events:none}@keyframes lifeBrilloNum{0%{transform:translateX(-160%);opacity:0}8%{opacity:1}35%{transform:translateX(340%);opacity:1}45%,100%{transform:translateX(340%);opacity:0}}'; document.head.appendChild(s); })();

// ---- efectos/burbujas-barra.js ----
// Burbujas que suben dentro de cada barra vertical (efervescencia). Tasa ∝ altura de la barra.
LifeFX.efecto('burbujas-barra', { titulo: 'Efervescencia', para: ['barras-v'], costo: 'medio', descripcion: 'Burbujas suben dentro de cada barra; las altas burbujean más.', aplicar: function (c) {
  c.marks.forEach(function (m, i) { var em = c.u.emisor(c.svg, m, 'rise', { col: '#ffffff' }); if (em) em.rate = 0.4 + 9 * c.shares[i]; });
} });

// ---- efectos/calor-onda.js ----
// NUEVO · Mapa de calor: una onda diagonal recorre las celdas; brillan más las celdas de mayor intensidad.
LifeFX.efecto('calor-onda', { titulo: 'Onda de calor', para: ['calor'], costo: 'muy bajo', descripcion: 'Onda diagonal de brillo; las celdas más intensas brillan más.', aplicar: function (c) {
  var u = c.u, mx = 0, wmax = Math.max.apply(null, c.ws.concat([1e-6]));
  c.marks.forEach(function (r) { mx = Math.max(mx, u.num(r, 'x') + u.num(r, 'y')); });
  c.marks.forEach(function (r, i) {
    r.style.setProperty('--fxg', (1.08 + 0.5 * c.ws[i] / wmax).toFixed(2));
    r.style.animation = 'lifeHeat 5s ease-in-out ' + (((u.num(r, 'x') + u.num(r, 'y')) / (mx || 1)) * 1.8).toFixed(2) + 's infinite';
  });
} });
(function () { var s = document.createElement('style'); s.textContent = '@keyframes lifeHeat{0%,78%,100%{filter:none}88%{filter:brightness(var(--fxg,1.2)) saturate(1.25)}}'; document.head.appendChild(s); })();

// ---- efectos/celebracion.js ----
// NUEVO global · Tarjetas en verde (en meta) sueltan destellos de celebración de vez en cuando.
LifeFX.global('celebracion', { descripcion: 'Las tarjetas que cumplen la meta (clase ok) sueltan destellos cada pocos segundos.', iniciar: function () {
  var s = document.createElement('style'); s.textContent = '.fxConf{position:absolute;width:6px;height:6px;border-radius:2px;pointer-events:none;animation:fxConf 1.1s ease-out forwards}@keyframes fxConf{0%{opacity:1;transform:translate(0,0) rotate(0)}100%{opacity:0;transform:translate(var(--dx),var(--dy)) rotate(260deg)}}.scc.ok,.kpi.ok{position:relative;overflow:visible}'; document.head.appendChild(s);
  var cols = ['#1baf7a', '#2a78d6', '#eda100', '#5fcca0'];
  setInterval(function () {
    if (document.hidden || document.body.classList.contains('noanim')) return;
    var ok = [].filter.call(document.querySelectorAll('.scc.ok, .kpi.ok'), function (e) { return e.getClientRects().length && !e.closest('[hidden]'); }); if (!ok.length) return;
    var card = ok[Math.floor(Math.random() * ok.length)];
    for (var i = 0; i < 12; i++) { var d = document.createElement('span'); d.className = 'fxConf'; d.style.left = (20 + Math.random() * 60) + '%'; d.style.top = '30%'; d.style.background = cols[i % 4]; d.style.setProperty('--dx', (Math.random() * 80 - 40) + 'px'); d.style.setProperty('--dy', (-30 - Math.random() * 40) + 'px'); card.appendChild(d); setTimeout(function (x) { return function () { x.remove(); }; }(d), 1200); }
  }, 4500);
} });

// ---- efectos/chispas.js ----
// Chispas que aparecen y se desvanecen dentro de cada bloque; cantidad ∝ área o intensidad.
LifeFX.efecto('chispas', { titulo: 'Chispas', para: ['treemap', 'calor'], costo: 'medio', descripcion: 'Destellos diminutos dentro de cada bloque; más donde hay más peso.', aplicar: function (c) {
  c.marks.forEach(function (m, i) { var em = c.u.emisor(c.svg, m, 'spark', { col: '#ffffff' }); if (em) em.rate = 0.3 + 10 * c.shares[i]; });
} });

// ---- efectos/coche-barras.js ----
// Un coche recorre cada barra horizontal hasta su extremo, espera un instante y vuelve al inicio; la barra más larga va más rápido (duración ∝ 1/participación).
(function () {
  var coches = [];
  LifeFX.efecto('coche-barras', { titulo: 'Coche a la meta', para: ['barras-h'], costo: 'bajo', descripcion: 'Un coche avanza por cada barra hasta su valor; la barra más larga va más rápido.', aplicar: function (c) {
    var u = c.u;
    c.marks.forEach(function (r, i) {
      var x = u.num(r, 'x'), y = u.num(r, 'y'), w = u.num(r, 'width'), h = u.num(r, 'height');
      if (w < 30 || h < 8) return;
      var share = c.shares[i], ch = Math.min(11, h * 0.62), cw = ch * 1.9, wr = Math.max(1.6, ch * 0.17);
      var cy = y + h / 2, g = u.mk('g', { 'pointer-events': 'none' });
      var body = u.mk('rect', { x: 1, y: -ch * 0.62, width: cw - 2, height: ch * 0.55, rx: 2.5, fill: '#ffffff', stroke: '#22303c', 'stroke-width': 1 });
      var cab = u.mk('rect', { x: cw * 0.30, y: -ch, width: cw * 0.42, height: ch * 0.46, rx: 2, fill: '#ffffff', stroke: '#22303c', 'stroke-width': 1 });
      var win = u.mk('rect', { x: cw * 0.34, y: -ch * 0.92, width: cw * 0.34, height: ch * 0.3, rx: 1, fill: '#7fb2e0' });
      g.appendChild(body); g.appendChild(cab); g.appendChild(win);
      var ruedas = [];
      [cw * 0.24, cw * 0.76].forEach(function (wx) {
        var wg = u.mk('g', {});
        wg.appendChild(u.mk('circle', { cx: wx, cy: -ch * 0.02, r: wr, fill: '#22303c' }));
        wg.appendChild(u.mk('line', { x1: wx, y1: -ch * 0.02 - wr * 0.7, x2: wx, y2: -ch * 0.02 + wr * 0.7, stroke: '#ffffff', 'stroke-width': 0.8 }));
        g.appendChild(wg); ruedas.push({ g: wg, cx: wx, cy: -ch * 0.02 });
      });
      u.layer(c.svg).appendChild(g);
      var d = Math.max(0.8, Math.min(3, 0.35 / Math.max(0.05, share)));
      var T = d + 0.45 + d * 0.9 + 0.2;
      coches.push({ svg: c.svg, g: g, ruedas: ruedas, wr: wr, x0: x, y: cy, w: w, cw: cw, d: d, T: T, p: Math.random() * T, ang: 0, u: u });
    });
  } });
  LifeFX.tick(function (dt) {
    for (var i = coches.length - 1; i >= 0; i--) {
      var q = coches[i]; if (!q.g.isConnected) { coches.splice(i, 1); continue; } if (!q.u.vis(q.svg)) continue;
      q.p += dt; if (q.p >= q.T) q.p -= q.T;
      var px = q.x0, dir = 1, vel = 0, rec = q.w - q.cw;
      if (q.p < q.d) { var k = q.p / q.d; px = q.x0 + rec * k; dir = 1; vel = rec / q.d; }
      else if (q.p < q.d + 0.45) { px = q.x0 + rec; dir = 1; vel = 0; }
      else if (q.p < q.d + 0.45 + q.d * 0.9) { var k2 = (q.p - q.d - 0.45) / (q.d * 0.9); px = q.x0 + rec * (1 - k2); dir = -1; vel = -rec / (q.d * 0.9); }
      else { px = q.x0; dir = -1; vel = 0; }
      q.ang += vel * dt / q.wr;
      var bob = vel !== 0 ? Math.sin(q.p * 22) * 0.4 : 0;
      if (dir === 1) q.g.setAttribute('transform', 'translate(' + px.toFixed(1) + ' ' + (q.y + bob).toFixed(1) + ')');
      else q.g.setAttribute('transform', 'translate(' + (px + q.cw).toFixed(1) + ' ' + (q.y + bob).toFixed(1) + ') scale(-1 1)');
      q.ruedas.forEach(function (ru) { ru.g.setAttribute('transform', 'rotate(' + (q.ang * 57.3).toFixed(1) + ' ' + ru.cx.toFixed(1) + ' ' + ru.cy.toFixed(1) + ')'); });
    }
  });
})();

// ---- efectos/cometa.js ----
// Cometa con estela que recorre cada línea + pulso en el último punto.
(function () {
  var comets = [];
  LifeFX.efecto('cometa', { titulo: 'Cometa', para: ['lineas'], costo: 'bajo', descripcion: 'Punto de luz con estela que recorre la serie; el último dato late.', aplicar: function (c) {
    var u = c.u;
    c.marks.forEach(function (p, k) {
      var L = p.getTotalLength(), e = p.getPointAtLength(L), col = p.getAttribute('stroke'), tail = [];
      u.layer(c.svg).appendChild(u.mk('circle', { cx: e.x, cy: e.y, r: 5, fill: 'none', stroke: col, 'stroke-width': 2.5, class: 'lifePulse' }));
      for (var j = 0; j < 7; j++) { var t = u.mk('circle', { r: (4.2 - j * 0.45).toFixed(1), fill: j ? col : '#fff', stroke: col, 'stroke-width': j ? 0 : 2.5, opacity: 0 }); u.layer(c.svg).appendChild(t); tail.push(t); }
      tail[0].setAttribute('class', 'lifeComet');
      comets.push({ p: p, tail: tail, L: L, t: -k * 0.45, d: 2.2 + Math.random() * 0.6 });
    });
  } });
  LifeFX.tick(function (dt) {
    for (var i = comets.length - 1; i >= 0; i--) {
      var q = comets[i]; if (!q.p.isConnected || !q.tail[0].isConnected) { comets.splice(i, 1); continue; }
      q.t += dt / q.d; if (q.t > 1.15) q.t = -0.15;
      q.tail.forEach(function (c, j) {
        var s = q.t - j * 0.018; if (s < 0 || s > 1) { c.setAttribute('opacity', 0); return; }
        var pt = q.p.getPointAtLength(q.L * s); c.setAttribute('cx', pt.x.toFixed(1)); c.setAttribute('cy', pt.y.toFixed(1));
        c.setAttribute('opacity', ((1 - j / 7) * Math.min(1, s * 10, (1 - s) * 10)).toFixed(2));
      });
    }
  });
})();

// ---- efectos/conteo-histograma.js ----
// Histograma: un resaltado barre los bins de izquierda a derecha; el brillo de cada bin dura ∝ su conteo.
(function () {
  var histos = [], CICLO = 4.4, BARRIDO = 3.2;
  LifeFX.efecto('conteo-histograma', { titulo: 'Barrido de conteo', para: ['histograma'], costo: 'bajo', descripcion: 'Un resaltado barre los bins; los de más llamadas brillan más tiempo.', aplicar: function (c) {
    var u = c.u, L = u.layer(c.svg);
    var bins = c.marks.map(function (m, i) { return { m: m, w: c.ws[i] || 0 }; }).sort(function (a, b) { return u.num(a.m, 'x') - u.num(b.m, 'x'); });
    if (!bins.length) return;
    var wmax = Math.max.apply(null, bins.map(function (b) { return b.w; }).concat([1e-6]));
    var x0 = u.num(bins[0].m, 'x'), x1 = u.num(bins[bins.length - 1].m, 'x') + u.num(bins[bins.length - 1].m, 'width');
    var y0 = Math.min.apply(null, bins.map(function (b) { return u.num(b.m, 'y'); })), y1 = u.num(bins[0].m, 'y') + u.num(bins[0].m, 'height');
    var items = bins.map(function (b) {
      var ov = u.mk('rect', { x: u.num(b.m, 'x'), y: u.num(b.m, 'y'), width: u.num(b.m, 'width'), height: u.num(b.m, 'height'), fill: '#ffffff', opacity: 0, 'pointer-events': 'none' });
      L.appendChild(ov);
      return { cx: u.num(b.m, 'x') + u.num(b.m, 'width') / 2, ov: ov, dur: 2.2 * b.w / wmax, on: -1 };
    });
    var linea = u.mk('line', { x1: x0, y1: y0, x2: x0, y2: y1, stroke: '#0f7f86', 'stroke-width': 2, opacity: 0, 'pointer-events': 'none' });
    L.appendChild(linea);
    histos.push({ svg: c.svg, items: items, linea: linea, x0: x0, x1: x1, t: 0, prev: 0, u: u });
  } });
  LifeFX.tick(function (dt) {
    for (var i = histos.length - 1; i >= 0; i--) {
      var q = histos[i]; if (!q.items[0].ov.isConnected) { histos.splice(i, 1); continue; } if (!q.u.vis(q.svg)) continue;
      q.t += dt; var tc = q.t % CICLO;
      if (tc < q.prev) q.items.forEach(function (it) { it.on = -1; });
      q.prev = tc;
      var barriendo = tc < BARRIDO, sx = barriendo ? q.x0 + (q.x1 - q.x0) * (tc / BARRIDO) : q.x1;
      q.linea.setAttribute('x1', sx.toFixed(1)); q.linea.setAttribute('x2', sx.toFixed(1)); q.linea.setAttribute('opacity', barriendo ? 0.9 : 0);
      q.items.forEach(function (it) {
        if (it.on < 0 && sx >= it.cx) it.on = tc;
        var op = 0;
        if (it.on >= 0) { var el = tc - it.on; if (el >= 0 && el < it.dur) op = 0.5 * Math.min(1, el / 0.1) * (1 - el / it.dur); }
        it.ov.setAttribute('opacity', op.toFixed(2));
      });
    }
  });
})();

// ---- efectos/contorno-vivo.js ----
// Un trazo de luz corre por el contorno de cada parte; velocidad ∝ participación.
LifeFX.efecto('contorno-vivo', { titulo: 'Contorno vivo', para: ['arcos', 'radial', 'treemap', 'burbujas'], costo: 'bajo', descripcion: 'Un hilo de luz recorre el borde de cada parte; las grandes corren más rápido.', aplicar: function (c) {
  var u = c.u; c.marks.forEach(function (m, i) {
    var o = m.cloneNode(false); ['class', 'role', 'tabindex', 'aria-label', 'style'].forEach(function (a) { o.removeAttribute(a); });
    o.setAttribute('fill', 'none'); o.setAttribute('stroke', '#fff'); o.setAttribute('stroke-width', 2); o.setAttribute('stroke-opacity', 0.9);
    o.setAttribute('pathLength', 100); o.setAttribute('stroke-dasharray', '12 88'); o.setAttribute('class', 'fxEdge'); o.style.animationDuration = Math.max(0.9, 4 - c.shares[i] * 9).toFixed(2) + 's';
    var m0 = u.toLocal(m, c.svg); if (m0 && (m0.a !== 1 || m0.e || m0.f)) o.setAttribute('transform', 'matrix(' + [m0.a, m0.b, m0.c, m0.d, m0.e, m0.f].join(',') + ')');
    u.layer(c.svg).appendChild(o);
  });
} });
(function () { var s = document.createElement('style'); s.textContent = '.fxEdge{animation:fxEdge 2s linear infinite}@keyframes fxEdge{to{stroke-dashoffset:-100}}'; document.head.appendChild(s); })();

// ---- efectos/crece-bloque.js ----
// Crece-bloque: los bloques crecen desde su centro hasta su tamaño real en
// oleadas ordenadas por tamaño (el más grande primero). La velocidad de
// crecimiento es proporcional a la participación: el bloque más grande parte
// de una escala menor y recorre más distancia en la misma ventana, así que
// crece más rápido; los chicos parten casi de su tamaño y apenas se mueven.
// Mecanismo: animación CSS de transform scale (transform-box fill-box,
// transform-origin center) con retardo negativo por rango de tamaño, de modo
// que la oleada ordenada se repite cada ciclo sin desfasarse. La escala nunca
// supera 1, así que ningún bloque tapa a sus vecinos ni al texto.
LifeFX.efecto('crece-bloque', { titulo: 'Crece por tamaño', para: ['treemap'], costo: 'bajo', descripcion: 'Los bloques crecen desde su centro en oleadas, el más grande primero y más rápido.', aplicar: function (c) {
  var u = c.u, T = 6, paso = 0.5;
  var orden = c.marks.map(function (r, i) { return i; }).sort(function (a, b) { return c.ws[b] - c.ws[a]; });
  var wm = Math.max.apply(null, c.ws.concat([1e-6]));
  orden.forEach(function (i, rango) {
    var r = c.marks[i], k = c.ws[i] / wm;
    r.style.setProperty('--fxs', (1 - 0.6 * k).toFixed(2));
    r.style.transformBox = 'fill-box'; r.style.transformOrigin = 'center';
    r.style.animation = 'lifeCreceBloque ' + T + 's cubic-bezier(.22,.9,.3,1) ' + (rango * paso - T).toFixed(2) + 's infinite';
  });
} });
(function () { var s = document.createElement('style'); s.textContent = '@keyframes lifeCreceBloque{0%{transform:scale(var(--fxs,.5))}16%{transform:scale(1)}100%{transform:scale(1)}}'; document.head.appendChild(s); })();

// ---- efectos/cursor-luz.js ----
// NUEVO global · Luz que sigue al cursor sobre cada panel (efecto linterna), sin tapar el dato.
LifeFX.global('cursor-luz', { descripcion: 'Halo de luz que sigue al cursor dentro de cada panel.', iniciar: function () {
  var s = document.createElement('style'); s.textContent = '.panel{position:relative}.panel::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;background:radial-gradient(240px circle at var(--mx,-999px) var(--my,-999px),rgba(42,120,214,.10),transparent 60%);transition:opacity .3s}'; document.head.appendChild(s);
  document.addEventListener('mousemove', function (e) { var p = e.target.closest && e.target.closest('.panel'); if (!p) return; var r = p.getBoundingClientRect(); p.style.setProperty('--mx', (e.clientX - r.left) + 'px'); p.style.setProperty('--my', (e.clientY - r.top) + 'px'); }, { passive: true });
} });

// ---- efectos/datos-vivo.js ----
// Global · Datos en vivo con hora y aviso de dato viejo (pieza 2 del TOP 3).
// MECANISMO, no valores fijos: lee un JSON con el contrato documentado en el
// README (actualizadoISO, fuente, cadenciaMinutos, kpis[]), pinta los valores
// en el DOM y calcula la antigüedad. Soporta JSON incrustado (galería estática
// y paquetes Tableau sin red) y fetch de una URL (producción), con la misma
// función de render. NO duplica 'en-vivo': ese global es solo el punto
// decorativo "consultado HH:MM" del encabezado; este es por panel, con datos
// reales, sello de hora y aviso de desactualizado.
// Uso en producción:
//   <article class="panel" data-vivo-src="/api/inter-atc.json" data-vivo-max="60">
//     <div class="vivo-sello" data-vivo-sello></div>
//     <div class="kpis vivo-kpis" data-vivo-kpis></div>
//     <div class="vivo-fuente" data-vivo-fuente></div>
//   </article>
//   o JSON incrustado: <script type="application/json" data-vivo-json>{...}</script>
//   dentro del panel. O directo: LifeFX.vivo.render(panel, datos);
//   LifeFX.vivo.cargar('/api/inter-atc.json', panel);
//   Config: LifeFX.config({ vivo: { maxMinutos: 60, intervaloMs: 60000 } }).
LifeFX.global('datos-vivo', { descripcion: 'Sello "Actualizado HH:MM · hace X min" por panel y aviso ámbar DESACTUALIZADO cuando el dato supera el máximo configurable.', iniciar: function (FX) {
  'use strict';
  // No se cachea FX.reducido: se consulta en cada render/tick y el CSS se
  // apaga con body.noanim, así un cambio a mitad de sesión también vale.
  function cfg() { return (FX.vivo && typeof FX.vivo === 'object') ? FX.vivo : { maxMinutos: 60, intervaloMs: 60000 }; }
  function maxMinutos(datos, panel) {
    if (datos && isFinite(+datos.maxMinutos) && +datos.maxMinutos > 0) return +datos.maxMinutos;
    if (panel && panel.getAttribute) { var m = parseFloat(panel.getAttribute('data-vivo-max')); if (isFinite(m) && m > 0) return m; }
    var c = cfg().maxMinutos; return (isFinite(+c) && +c > 0) ? +c : 60;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hhmm(d) { return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  // Antigüedad en minutos enteros; null si el timestamp no es válido.
  function antiguedadMin(iso, ahora) {
    if (!iso) return null;
    var t = new Date(iso).getTime(); if (!isFinite(t)) return null;
    return Math.max(0, Math.floor(((ahora || new Date()).getTime() - t) / 60000));
  }
  function haceTxt(min) {
    if (min == null) return 'sin hora registrada';
    if (min < 1) return 'hace menos de 1 min';
    if (min < 60) return 'hace ' + min + ' min';
    return 'hace ' + Math.floor(min / 60) + ' h ' + (min % 60) + ' min';
  }
  // Formato español de cifras (decisión 5): miles con punto, decimal con coma.
  // (Intl 'es-MX' formatea anglosajón — "15,618.4" — así que no se usa.)
  function fmtES(n, dec) {
    var neg = n < 0, a = Math.abs(n), f = a.toFixed(dec == null ? 1 : dec), p = f.split('.');
    var ent = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + ent + (p[1] ? ',' + p[1] : '');
  }
  function fmtES01(n) { var r = Math.round(n * 10) / 10; return fmtES(r, (r % 1 === 0) ? 0 : 1); } // 0-1 decimales: 90 → "90", 89,6 → "89,6", 99,96 → "100" (como el Intl anterior)
  function formatear(kpi) {
    var v = kpi.valor;
    if (kpi.formato === 'texto') return String(v == null ? '' : v);
    if (kpi.formato === 'tiempo-mmss') {
      if (typeof v === 'string') return v;
      var s = Math.round(+v || 0); return Math.floor(s / 60) + ':' + pad(s % 60);
    }
    if (kpi.formato === 'porcentaje1') return fmtES01(+v) + ' %';
    if (kpi.formato === 'porcentaje0') return fmtES(+v, 0) + ' %';
    if (kpi.formato === 'decimal1') return fmtES01(+v);
    return fmtES(+v, 0); // 'entero' (por defecto)
  }
  function metaCumplida(kpi) {
    if (kpi.meta == null || !isFinite(+kpi.valor) || !isFinite(+kpi.meta)) return false;
    return +kpi.valor >= +kpi.meta;
  }
  function selloTexto(datos, ahora) {
    if (!datos || !datos.actualizadoISO) return 'Actualizado — · sin hora registrada';
    var d = new Date(datos.actualizadoISO);
    if (!isFinite(d.getTime())) return 'Actualizado — · sin hora registrada';
    return 'Actualizado ' + hhmm(d) + ' · ' + haceTxt(antiguedadMin(datos.actualizadoISO, ahora));
  }
  function actualizarSello(panel) {
    var datos = panel.__vivoDatos; if (!datos) return;
    var ahora = new Date(), min = antiguedadMin(datos.actualizadoISO, ahora);
    var viejo = min == null || min > maxMinutos(datos, panel);
    var sello = panel.querySelector('[data-vivo-sello]');
    if (sello) { sello.textContent = selloTexto(datos, ahora); sello.classList.toggle('vivo-viejo-txt', viejo); }
    var badge = panel.querySelector('[data-vivo-badge]');
    if (badge) badge.hidden = !viejo;
    panel.classList.toggle('vivo-viejo', viejo);
    panel.classList.toggle('vivo-fresco', !viejo);
    panel.setAttribute('aria-live', 'off');
  }
  function render(panel, datos) {
    if (!panel || !datos) return;
    panel.__vivoDatos = datos;
    var kpis = panel.querySelector('[data-vivo-kpis]');
    if (kpis) {
      kpis.textContent = '';
      (datos.kpis || []).forEach(function (kpi) {
        var card = document.createElement('div');
        card.className = 'kpi' + (metaCumplida(kpi) ? ' ok' : '');
        var l = document.createElement('div'); l.className = 'l'; l.textContent = kpi.titulo || kpi.id || '';
        var v = document.createElement('div'); v.className = 'v vivo-valor'; v.textContent = formatear(kpi);
        card.appendChild(l); card.appendChild(v);
        if (kpi.meta != null) { var m = document.createElement('div'); m.className = 'vivo-meta'; m.textContent = 'meta ' + formatear({ valor: kpi.meta, formato: kpi.formato }); card.appendChild(m); }
        kpis.appendChild(card);
      });
    }
    var fu = panel.querySelector('[data-vivo-fuente]');
    if (fu) fu.textContent = (datos.fuente ? 'Fuente: ' + datos.fuente : '') + (datos.cadenciaMinutos ? ' · refresco cada ' + datos.cadenciaMinutos + ' min' : '');
    actualizarSello(panel);
    if (panel.__vivoTimer == null) {
      var iv = cfg().intervaloMs; iv = (isFinite(+iv) && +iv >= 10000) ? +iv : 60000;
      panel.__vivoTimer = setInterval(function () { if (!panel.isConnected) { clearInterval(panel.__vivoTimer); panel.__vivoTimer = null; return; } actualizarSello(panel); }, iv);
    }
  }
  function cargar(url, panel) {
    if (!panel) return;
    return fetch(url).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (datos) { panel.classList.remove('vivo-error'); render(panel, datos); return datos; })
      .catch(function () {
        panel.classList.add('vivo-error');
        var sello = panel.querySelector('[data-vivo-sello]');
        if (sello) sello.textContent = panel.__vivoDatos ? 'No se pudo actualizar · ' + selloTexto(panel.__vivoDatos, new Date()) : 'No se pudo cargar el dato';
        if (panel.__vivoDatos) actualizarSello(panel);
      });
  }
  // API pública: el mismo render para JSON incrustado y para fetch.
  // Se asigna sobre el objeto existente (no se reemplaza): un LifeFX.config({ vivo: {...} })
  // llamado antes de iniciar no debe perderse.
  var _vivoPrev = (FX.vivo && typeof FX.vivo === 'object') ? FX.vivo : {};
  FX.vivo = { render: render, cargar: cargar, refrescar: actualizarSello, antiguedadMin: antiguedadMin, formatear: formatear, selloTexto: selloTexto, haceTxt: haceTxt,
    esViejo: function (datos, panel, ahora) { var min = antiguedadMin(datos && datos.actualizadoISO, ahora); return min == null || min > maxMinutos(datos, panel); } };
  if (isFinite(+_vivoPrev.maxMinutos)) FX.vivo.maxMinutos = +_vivoPrev.maxMinutos;
  if (isFinite(+_vivoPrev.intervaloMs)) FX.vivo.intervaloMs = +_vivoPrev.intervaloMs;
  function scan(node) {
    if (!node || node.nodeType !== 1) return;
    var panels = [];
    if (node.matches && node.matches('[data-vivo-src], [data-vivo-json]')) panels.push(node);
    if (node.querySelectorAll) panels = panels.concat([].slice.call(node.querySelectorAll('[data-vivo-src], [data-vivo-json]')));
    panels.forEach(function (el) {
      var panel = el.closest ? (el.closest('.panel') || el) : el;
      if (panel.__vivoInit) return; panel.__vivoInit = 1;
      if (panel.getAttribute && panel.getAttribute('data-vivo-src')) { cargar(panel.getAttribute('data-vivo-src'), panel); return; }
      var js = panel.querySelector ? panel.querySelector('script[data-vivo-json]') : (el.tagName === 'SCRIPT' ? el : null);
      if (!js && el.tagName === 'SCRIPT') js = el;
      if (!js) return;
      try { render(panel, JSON.parse(js.textContent)); }
      catch (e) { panel.classList.add('vivo-error'); var s = panel.querySelector('[data-vivo-sello]'); if (s) s.textContent = 'Dato en vivo: JSON inválido'; }
    });
  }
  var css = document.createElement('style'); css.textContent =
    '.vivo-sello{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;color:#0f8a5f;white-space:nowrap}' +
    '.vivo-sello::before{content:"";width:8px;height:8px;border-radius:50%;background:#1baf7a;animation:lifeVivoDot 1.6s ease-in-out infinite}' +
    '@keyframes lifeVivoDot{0%,100%{box-shadow:0 0 0 0 rgba(27,175,122,.6)}50%{box-shadow:0 0 0 6px rgba(27,175,122,0)}}' +
    '.vivo-badge{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#92400e;background:#fef3c7;border:1px solid #f59e0b;border-radius:999px;padding:2px 8px}' +
    '.vivo-panel.vivo-viejo{border-color:#d97706;box-shadow:0 0 0 1px #d97706 inset}' +
    '.vivo-panel.vivo-viejo .vivo-sello{color:#92400e}' +
    '.vivo-panel.vivo-viejo .vivo-sello::before{background:#d97706;animation:none;box-shadow:none}' +
    '.vivo-panel.vivo-viejo .vivo-valor{animation:none}' +
    '.vivo-panel.vivo-fresco .vivo-valor{animation:lifeVivoLatido 2.4s ease-in-out infinite}' +
    '@keyframes lifeVivoLatido{0%,100%{transform:scale(1)}50%{transform:scale(1.02)}}' +
    '.vivo-meta{font-size:11px;color:#586579}' +
    '.vivo-fuente{font-size:11px;color:#586579;padding:0 14px 12px}' +
    '.vivo-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 14px 0}' +
    '.vivo-panel.vivo-error{border-color:#e34948}' +
    'body.noanim .vivo-sello::before,body.noanim .vivo-valor{animation:none!important}' +
    '@media (prefers-reduced-motion: reduce){.vivo-sello::before,.vivo-valor{animation:none!important}}';
  document.head.appendChild(css);
  scan(document.body);
  new MutationObserver(function (list) { list.forEach(function (mu) { [].forEach.call(mu.addedNodes, scan); }); })
    .observe(document.body, { childList: true, subtree: true });
} });

// ---- efectos/direccion.js ----
// NUEVO · Paquete para Dirección (pieza 3 del TOP 3): delta y meta bajo la cifra, ranking por
// contribución al problema y narrativa automática determinista. NUNCA un modelo de lenguaje calcula
// cifras: todo número sale de las funciones de abajo (aritmética explícita) y la narrativa solo
// inserta esos números en plantillas. Uso en la app: LifeFX.direccion.renderizar(host, datos).
// En la galería cada subpieza tiene su tarjeta: direccion-delta, direccion-ranking, direccion-narrativa.
//
// FÓRMULAS (documentadas; el ejemplo INTER ATC las cumple exactamente, ver EJEMPLO_INTER_ATC):
//   NS global = atendidas a tiempo / ofrecidas * 100. Demoradas = ofrecidas − atendidas a tiempo.
//   Delta en puntos = NS actual − NS anterior (puntos porcentuales, no % relativo).
//   Faltan N para la meta M: N = ceil(M/100 * ofrecidas − atendidas a tiempo); si N ≤ 0, "meta alcanzada".
//   Aporte de la cartera i (puntos del NS global) = demoradas_i / ofrecidas_global * 100.
//     ⇒ la suma de los aportes de TODAS las carteras = demoradas_global / ofrecidas_global * 100
//        = 100 − NS global (exacto; con redondeo a 2 decimales la suma puede diferir ≤ 0,02 pts).
//   Peso de la cartera i en el problema = demoradas_i / demoradas_global * 100.
//   Ranking: se ordena por APORTE (volumen × brecha), NO por el NS peor. Una cartera pequeña con
//     NS muy bajo aporta poco; una grande con NS mediocre aporta mucho (ver JAC en el ejemplo).
//   Causa identificada solo si alguna cartera concentra ≥ 50 % de las demoradas; si no, la
//     narrativa dice literalmente "causa no identificada".
//
// CONTRATO DE DATOS (la fuente debe entregar): dos periodos (actual + anterior) por KPI
//   (NS, abandono, NPS, recibidas, atendidas) y datos por cartera con ofrecidas y atendidas a
//   tiempo (las demoradas se derivan). Historia de NS de los últimos 6 periodos para el sparkline.
//   OJO: las cifras titulares de recibidas (15.618) y atendidas (12.963) son OTRO corte y NO
//   derivan el NS: 12.963/15.618 = 83,0 %, no 89,6 %. El NS se calcula solo con ofrecidas/atendidas
//   a tiempo de la base NS (13.000 / 11.651 en el ejemplo).
(function () {
  'use strict';

  // ---------- Formato español determinista (miles con punto, decimales con coma) ----------
  function fmt(n, dec) {
    var neg = n < 0, a = Math.abs(n), f = a.toFixed(dec == null ? 1 : dec), p = f.split('.');
    var ent = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + ent + (p[1] ? ',' + p[1] : '');
  }
  function fmtPts(d) { return (d > 0 ? '+' : d < 0 ? '-' : '') + fmt(Math.abs(d), 1); } // "+0,6" / "-0,4" / "0,0"
  function fmtPct(n, dec) { return fmt(n, dec) + ' %'; }
  function fmtCorto(n) { return fmt(n, 1).replace(/,0$/, ''); } // 5,0 → 5; 4,7 → 4,7

  // ---------- Cálculo determinista ----------
  function calcular(d) {
    var meta = d.meta, act = d.actual, ant = d.anterior || {};
    var O = act.ofrecidas, A = act.aTiempo, D = O - A;
    var ns = A / O * 100; // exacto, sin redondear: 11.651/13.000*100 = 89,623… %
    var nsAnt = ant.ns;
    var faltan = Math.ceil(meta / 100 * O - A); // ceil(0,90*13.000 − 11.651) = ceil(49) = 49
    var carteras = (d.carteras || []).map(function (c) {
      var dem = c.ofrecidas - c.aTiempo;
      return { nombre: c.nombre, ofrecidas: c.ofrecidas, aTiempo: c.aTiempo, demoradas: dem,
        // NS de la cartera a 1 decimal con redondeo decimal exacto: 3182/4000 = 79,55 % → 79,6 %;
        // el float 79,5499… daría 79,5 % con toFixed. (El NS global sí va sin redondear.)
        ns: Math.round(c.aTiempo * 1000 / c.ofrecidas) / 10, peso: D ? dem / D * 100 : 0, aporte: dem / O * 100 };
    });
    var ranking = carteras.slice().sort(function (a, b) { return b.aporte - a.aporte; });
    var sumaAportes = carteras.reduce(function (s, c) { return s + c.aporte; }, 0); // = 100 − ns exacto
    var avisos = [];
    var sO = carteras.reduce(function (s, c) { return s + c.ofrecidas; }, 0);
    var sA = carteras.reduce(function (s, c) { return s + c.aTiempo; }, 0);
    if (carteras.length && (sO !== O || sA !== A)) avisos.push('Las carteras no suman el global (ofrecidas ' + sO + ' vs ' + O + '; a tiempo ' + sA + ' vs ' + A + ').');
    if (Math.abs(ns - act.ns) > 0.05) avisos.push('El NS titular (' + fmt(act.ns, 1) + ' %) no coincide con aTiempo/ofrecidas (' + fmt(ns, 1) + ' %).');
    return { meta: meta, ofrecidas: O, aTiempo: A, demoradas: D, ns: ns, nsTitular: act.ns,
      deltaNs: nsAnt == null ? null : ns - nsAnt, nsAnterior: nsAnt, faltan: faltan,
      abandono: act.abandono, abandonoAnterior: ant.abandono, limiteAbandono: d.limiteAbandono,
      nps: act.nps, npsAnterior: ant.nps, historiaNs: d.historiaNs || [],
      carteras: carteras, ranking: ranking, sumaAportes: sumaAportes,
      brechaGlobal: 100 - ns, // = sumaAportes exacto
      top: ranking[0] || null, avisos: avisos };
  }

  // ---------- Narrativa determinista: 3 frases, plantillas + números ya calculados ----------
  var UMBRAL_CONCENTRACION = 50; // % de las demoradas: solo por encima hay causa identificada
  function narrativa(r, d) {
    var f1, f2, f3, delta = r.deltaNs, mesAnt = d.mesAnterior || 'el periodo anterior';
    var dir = delta == null ? '' : (delta > 0.005 ? 'subió ' + fmtPts(delta) + ' pts contra ' + mesAnt + ', a ' :
      delta < -0.005 ? 'bajó ' + fmtPts(delta) + ' pts contra ' + mesAnt + ', a ' : 'se mantuvo en ');
    var metaTxt = r.ns >= r.meta ? 'sobre la meta del ' + fmt(r.meta, 0) + ' %.' : 'aún bajo la meta del ' + fmt(r.meta, 0) + ' %.';
    f1 = delta == null ? 'El NS está en ' + fmtPct(r.ns, 1) + ', ' + metaTxt
      : 'El NS ' + dir + fmtPct(r.ns, 1) + ', ' + metaTxt;
    if (!r.carteras.length) {
      f2 = 'Causa no identificada: no hay datos por cartera para localizar la causa.';
    } else if (r.top.peso < UMBRAL_CONCENTRACION) {
      f2 = 'Causa no identificada: ninguna cartera concentra la mitad o más de las demoradas (la mayor, ' + r.top.nombre + ', concentra ' + fmt(r.top.peso, 1) + ' %).';
    } else {
      f2 = r.top.nombre + ' concentra ' + fmt(r.top.demoradas, 0) + ' de ' + fmt(r.demoradas, 0) + ' demoradas (' + fmt(r.top.peso, 1) + ' %).';
    }
    if (r.abandono >= r.limiteAbandono) {
      f3 = 'El abandono >5 s está en ' + fmtPct(r.abandono, 1) + ', sobre el límite del ' + fmtCorto(r.limiteAbandono) + ' %.';
    } else if (r.abandono >= r.limiteAbandono - 0.5) {
      f3 = 'El abandono >5 s está en ' + fmtPct(r.abandono, 1) + ', cerca del límite del ' + fmtCorto(r.limiteAbandono) + ' %.';
    } else if (r.faltan > 0) {
      f3 = 'Faltan ' + fmt(r.faltan, 0) + ' llamadas atendidas a tiempo para llegar a la meta del ' + fmt(r.meta, 0) + ' %.';
    } else {
      f3 = 'Meta del ' + fmt(r.meta, 0) + ' % alcanzada; el abandono >5 s está en ' + fmtPct(r.abandono, 1) + ', dentro del límite.';
    }
    return [f1, f2, f3];
  }

  // ---------- Sparkline SVG (patrón de dibujo de líneas del proyecto, sin librerías) ----------
  function sparkline(valores, meta, w, h) {
    w = w || 120; h = h || 36;
    var min = Math.min.apply(null, valores.concat([meta])), max = Math.max.apply(null, valores.concat([meta]));
    if (max - min < 0.5) { max = min + 0.5; }
    function X(i) { return (4 + i * (w - 8) / (valores.length - 1)).toFixed(1); }
    function Y(v) { return (h - 4 - (v - min) / (max - min) * (h - 8)).toFixed(1); }
    var pts = valores.map(function (v, i) { return X(i) + ',' + Y(v); }).join(' ');
    var yMeta = Y(meta), ultimo = valores[valores.length - 1];
    return '<svg class="lifeDirSpark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Tendencia del NS: ' +
      valores.map(function (v) { return fmt(v, 1); }).join(', ') + '">' +
      '<line x1="0" y1="' + yMeta + '" x2="' + w + '" y2="' + yMeta + '" stroke="#eda100" stroke-width="1" stroke-dasharray="3 3"/>' +
      '<polyline points="' + pts + '" fill="none" stroke="#2a78d6" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
      '<circle cx="' + X(valores.length - 1) + '" cy="' + Y(ultimo) + '" r="3" fill="#2a78d6"/></svg>';
  }

  // ---------- Datos de ejemplo (INTER ATC, nov 2026; titulares reales, base NS de ejemplo) ----------
  // Base NS: ofrecidas 13.000, a tiempo 11.651, demoradas 1.349 → NS 89,623 % → 89,6 %; faltan ceil(11.700−11.651)=49.
  // Recibidas 15.618 / atendidas 12.963 son OTRO corte (12.963/15.618 = 83,0 %) y NO entran en el NS.
  var EJEMPLO_INTER_ATC = {
    titulo: 'INTER ATC · nov 2026', meta: 90, mesAnterior: 'octubre', limiteAbandono: 5,
    actual: { ns: 89.6, ofrecidas: 13000, aTiempo: 11651, abandono: 4.7, nps: 34.1, recibidas: 15618, atendidas: 12963 },
    anterior: { ns: 89.0, abandono: 5.1, nps: 31.8, recibidas: 15204, atendidas: 12540 },
    historiaNs: [88.4, 88.9, 89.2, 88.7, 89.0, 89.6],
    carteras: [
      { nombre: 'BRADESCARD ASISTENCIAS', ofrecidas: 4000, aTiempo: 3182 }, // D 818, NS 79,6 %, peso 60,6 %, aporte 6,29
      { nombre: 'Coppel', ofrecidas: 3500, aTiempo: 3255 },   // D 245, NS 93,0 %, peso 18,2 %, aporte 1,88
      { nombre: 'Liverpool', ofrecidas: 2500, aTiempo: 2350 }, // D 150, NS 94,0 %, peso 11,1 %, aporte 1,15
      { nombre: 'Crediauto', ofrecidas: 1500, aTiempo: 1425 }, // D 75, NS 95,0 %, peso 5,6 %, aporte 0,58
      { nombre: 'JAC', ofrecidas: 500, aTiempo: 450 },        // D 50, NS 90,0 % (2.º peor) pero aporte solo 0,38: queda FUERA del top 3
      { nombre: 'Empleados', ofrecidas: 1000, aTiempo: 989 }  // D 11, NS 98,9 %, peso 0,8 %, aporte 0,08
    ] // Sumas: ofrecidas 13.000, a tiempo 11.651, demoradas 1.349; aportes 6,29+1,88+1,15+0,58+0,38+0,08 = 10,36 redondeado (exacto 10,38 = 100−89,62; 0,02 pts de redondeo).
  };
  var EJEMPLO_SIN_CONCENTRACION = {
    titulo: 'Ejemplo sin concentración · nov 2026', meta: 90, mesAnterior: 'octubre', limiteAbandono: 5,
    actual: { ns: 90.0, ofrecidas: 12000, aTiempo: 10800, abandono: 3.9, nps: 30.5, recibidas: 14200, atendidas: 12780 },
    anterior: { ns: 89.0, abandono: 4.2, nps: 29.0, recibidas: 13900, atendidas: 12400 },
    historiaNs: [88.1, 88.6, 88.9, 88.5, 89.0, 90.0],
    carteras: [
      { nombre: 'Cartera A', ofrecidas: 3000, aTiempo: 2664 }, // D 336, peso 28,0 %
      { nombre: 'Cartera B', ofrecidas: 2800, aTiempo: 2500 }, // D 300, peso 25,0 %
      { nombre: 'Cartera C', ofrecidas: 2600, aTiempo: 2336 }, // D 264, peso 22,0 %
      { nombre: 'Cartera D', ofrecidas: 2000, aTiempo: 1820 }, // D 180, peso 15,0 %
      { nombre: 'Cartera E', ofrecidas: 1600, aTiempo: 1480 }  // D 120, peso 10,0 %
    ] // Demoradas 1.200; la mayor concentra 28,0 % < 50 % → causa no identificada. Meta alcanzada (N = 0).
  };

  // ---------- Render (DOM; consulta LifeFX.reducido en cada render, nunca lo cachea) ----------
  function reducido() {
    try { if (typeof LifeFX !== 'undefined' && LifeFX.reducido) return true; } catch (e) { /* sin LifeFX */ }
    try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function filaDelta(host, etiqueta, valorTxt, deltaTxt, sube, bueno, anteriorTxt) {
    var f = el('div', 'lifeDirFila'); f.appendChild(el('span', 'lifeDirEtiq', etiqueta));
    var v = el('span', 'lifeDirV', valorTxt); f.appendChild(v);
    var d = el('span', 'lifeDirDelta ' + (bueno == null ? '' : bueno ? 'lifeDirBien' : 'lifeDirMal'), (sube == null ? '' : sube ? '↑ ' : '↓ ') + deltaTxt);
    f.appendChild(d); f.appendChild(el('span', 'lifeDirAnt', anteriorTxt)); host.appendChild(f);
  }
  function mostrarDelta(host, d) {
    var r = calcular(d);
    host.appendChild(el('div', 'lifeDirTit', d.titulo + ' · NS y meta'));
    var kpi = el('div', 'lifeDirKpi');
    kpi.appendChild(el('div', 'lifeDirL', 'Nivel de servicio'));
    var big = el('div', 'lifeDirBig', fmtPct(r.ns, 1)); kpi.appendChild(big);
    var sub = el('div', 'lifeDirSub');
    var flecha = r.deltaNs > 0.005 ? '↑' : r.deltaNs < -0.005 ? '↓' : '→';
    var cls = r.deltaNs > 0.005 ? 'lifeDirBien' : r.deltaNs < -0.005 ? 'lifeDirMal' : '';
    sub.appendChild(el('span', 'lifeDirDelta ' + cls, flecha + ' ' + fmtPts(r.deltaNs) + ' pts'));
    sub.appendChild(el('span', 'lifeDirAnt', ' anterior: ' + fmtPct(r.nsAnterior, 1) + ' (' + (d.mesAnterior || '') + ')'));
    kpi.appendChild(sub);
    var sp = document.createElement('div'); sp.className = 'lifeDirSparkWrap'; sp.innerHTML = sparkline(r.historiaNs, r.meta, 220, 40); kpi.appendChild(sp);
    kpi.appendChild(el('div', 'lifeDirMeses', 'jun  jul  ago  sep  oct  nov · línea punteada: meta 90 %'));
    var cierre = el('div', 'lifeDirCierre' + (reducido() ? '' : ' lifeDirPulso'),
      r.faltan > 0 ? 'Faltan ' + fmt(r.faltan, 0) + ' llamadas atendidas a tiempo para llegar al ' + fmt(r.meta, 0) + ' %.' : 'Meta del ' + fmt(r.meta, 0) + ' % alcanzada.');
    kpi.appendChild(cierre);
    host.appendChild(kpi);
    var mini = el('div', 'lifeDirMini');
    filaDelta(mini, 'Abandono >5 s', fmtPct(r.abandono, 1), fmtPts(r.abandono - r.abandonoAnterior) + ' pts', r.abandono > r.abandonoAnterior, r.abandono < r.abandonoAnterior, ' anterior: ' + fmtPct(r.abandonoAnterior, 1));
    filaDelta(mini, 'NPS', '+' + fmt(r.nps, 1), fmtPts(r.nps - r.npsAnterior) + ' pts', r.nps > r.npsAnterior, r.nps > r.npsAnterior, ' anterior: +' + fmt(r.npsAnterior, 1));
    host.appendChild(mini);
    if (r.avisos.length) host.appendChild(el('div', 'lifeDirAviso', r.avisos.join(' ')));
  }
  function mostrarRanking(host, d) {
    var r = calcular(d);
    host.appendChild(el('div', 'lifeDirTit', d.titulo + ' · top 3 por contribución'));
    var t = el('table', 'lifeDirTabla');
    t.innerHTML = '<thead><tr><th>#</th><th>Cartera</th><th>NS</th><th>Demoradas (peso)</th><th>Aporte</th></tr></thead>';
    var tb = document.createElement('tbody');
    r.ranking.slice(0, 3).forEach(function (c, i) {
      var tr = document.createElement('tr');
      [[String(i + 1)], [c.nombre], [fmtPct(c.ns, 1)], [fmt(c.demoradas, 0) + ' (' + fmt(c.peso, 1) + ' %)'], [fmt(c.aporte, 2) + ' pts']].forEach(function (cell, j) {
        var td = document.createElement(j === 1 ? 'th' : 'td'); td.textContent = cell[0]; tr.appendChild(td);
      });
      tb.appendChild(tr);
    });
    t.appendChild(tb); host.appendChild(t);
    host.appendChild(el('div', 'lifeDirNota', 'Aporte i = demoradas_i / ofrecidas_global × 100. Suma de las 6 carteras: ' + fmt(r.sumaAportes, 2) + ' pts = 100 − ' + fmt(r.ns, 2) + ' (redondeo a 2 decimales: ±0,02 pts). Ordenado por aporte, no por NS: JAC tiene el 2.º peor NS (90,0 %) pero solo 500 ofrecidas y aporte 0,38, así que queda fuera del top 3.'));
  }
  function mostrarNarrativa(host, d, segundo) {
    var r = calcular(d), frases = narrativa(r, d);
    host.appendChild(el('div', 'lifeDirTit', d.titulo + ' · narrativa automática'));
    var ol = el('ol', 'lifeDirFrases');
    frases.forEach(function (f) { var li = document.createElement('li'); li.textContent = f; ol.appendChild(li); });
    host.appendChild(ol);
    if (segundo) {
      var r2 = calcular(segundo), f2 = narrativa(r2, segundo);
      host.appendChild(el('div', 'lifeDirTit', segundo.titulo + ' · rama sin concentración'));
      var ol2 = el('ol', 'lifeDirFrases');
      f2.forEach(function (f) { var li = document.createElement('li'); li.textContent = f; ol2.appendChild(li); });
      host.appendChild(ol2);
    }
  }
  function mostrar(host, cual, d) {
    if (!host || typeof document === 'undefined') return;
    host.textContent = '';
    var datos = d || EJEMPLO_INTER_ATC;
    if (cual === 'direccion-ranking') mostrarRanking(host, datos);
    else if (cual === 'direccion-narrativa') mostrarNarrativa(host, datos, EJEMPLO_SIN_CONCENTRACION);
    else mostrarDelta(host, datos);
  }
  // Paquete completo en un host (uso en la app real): delta + ranking + narrativa.
  function renderizar(host, d) {
    if (!host || typeof document === 'undefined') return;
    host.textContent = '';
    ['direccion-delta', 'direccion-ranking', 'direccion-narrativa'].forEach(function (cual) {
      var sec = document.createElement('section'); sec.className = 'lifeDirSec'; mostrar(sec, cual, d || EJEMPLO_INTER_ATC); host.appendChild(sec);
    });
  }

  var API = { calcular: calcular, narrativa: narrativa, ranking: function (d) { return calcular(d).ranking; },
    sparkline: sparkline, mostrar: mostrar, renderizar: renderizar, fmt: fmt,
    ejemplos: { interAtc: EJEMPLO_INTER_ATC, sinConcentracion: EJEMPLO_SIN_CONCENTRACION },
    UMBRAL_CONCENTRACION: UMBRAL_CONCENTRACION };
  if (typeof LifeFX !== 'undefined') LifeFX.direccion = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;

  // Registro en el catálogo (titulo/para/costo/descripcion en la misma línea del registro).
  if (typeof LifeFX !== 'undefined' && LifeFX.efecto) {
    LifeFX.efecto('direccion-delta', { titulo: 'Dirección: delta y meta bajo la cifra', para: ['direccion'], costo: 'muy bajo', descripcion: 'Flecha y cambio en puntos contra el periodo anterior, valor anterior, mini-tendencia y cuántas llamadas faltan para la meta.', aplicar: function (c) {
      var root = (c && c.svg && c.svg.closest) ? (c.svg.closest('.panel') || document) : document;
      [].forEach.call(root.querySelectorAll('[data-direccion]'), function (host) {
        try { var d = JSON.parse(host.getAttribute('data-direccion') || 'null') || EJEMPLO_INTER_ATC; mostrar(host, 'direccion-delta', d); } catch (e) { /* JSON inválido: no se renderiza */ }
      });
    } });
    LifeFX.efecto('direccion-ranking', { titulo: 'Dirección: ranking por contribución', para: ['direccion'], costo: 'muy bajo', descripcion: 'Top 3 de carteras por aporte en puntos al NS global (volumen × brecha), no por el NS peor; los aportes suman 100 − NS.', aplicar: function (c) {
      var root = (c && c.svg && c.svg.closest) ? (c.svg.closest('.panel') || document) : document;
      [].forEach.call(root.querySelectorAll('[data-direccion]'), function (host) {
        try { var d = JSON.parse(host.getAttribute('data-direccion') || 'null') || EJEMPLO_INTER_ATC; mostrar(host, 'direccion-ranking', d); } catch (e) { /* JSON inválido: no se renderiza */ }
      });
    } });
    LifeFX.efecto('direccion-narrativa', { titulo: 'Dirección: narrativa automática', para: ['direccion'], costo: 'muy bajo', descripcion: 'Tres frases deterministas con plantillas y números ya calculados; si ninguna cartera concentra la mitad de las demoradas dice causa no identificada.', aplicar: function (c) {
      var root = (c && c.svg && c.svg.closest) ? (c.svg.closest('.panel') || document) : document;
      [].forEach.call(root.querySelectorAll('[data-direccion]'), function (host) {
        try { var d = JSON.parse(host.getAttribute('data-direccion') || 'null') || EJEMPLO_INTER_ATC; mostrar(host, 'direccion-narrativa', d, EJEMPLO_SIN_CONCENTRACION); } catch (e) { /* JSON inválido: no se renderiza */ }
      });
    } });
  }
  if (typeof document !== 'undefined') {
    var s = document.createElement('style');
    s.textContent =
      '.lifeDirTit{font:600 12px Inter,system-ui,sans-serif;color:#586579;text-transform:uppercase;letter-spacing:.05em;margin:2px 0 8px}' +
      '.lifeDirKpi{border:1px solid #dde3ea;border-radius:10px;padding:10px 12px}' +
      '.lifeDirL{font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:#586579}' +
      '.lifeDirBig{font-family:"Space Grotesk",system-ui,sans-serif;font-size:30px;font-weight:700;font-variant-numeric:tabular-nums}' +
      '.lifeDirSub{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}' +
      '.lifeDirDelta{font-weight:600}.lifeDirBien{color:#0f8a5f}.lifeDirMal{color:#e34948}' +
      '.lifeDirAnt{font-size:12px;color:#586579}.lifeDirSparkWrap{margin-top:6px}.lifeDirSpark{max-width:100%}' +
      '.lifeDirMeses{font-size:10.5px;color:#586579;margin-top:2px}' +
      '.lifeDirCierre{margin-top:8px;font-weight:600;font-size:13px}' +
      '.lifeDirPulso{animation:lifeDirPulso 2.4s ease-in-out infinite}@keyframes lifeDirPulso{0%,100%{opacity:1}50%{opacity:.55}}' +
      '.lifeDirMini{margin-top:10px;display:flex;flex-direction:column;gap:6px}' +
      '.lifeDirFila{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;font-size:13px}' +
      '.lifeDirEtiq{color:#586579}.lifeDirV{font-weight:700;font-variant-numeric:tabular-nums}' +
      '.lifeDirTabla{width:100%;border-collapse:collapse;font-size:12.5px}.lifeDirTabla th,.lifeDirTabla td{padding:5px 6px;text-align:left;border-bottom:1px solid #dde3ea;font-variant-numeric:tabular-nums;white-space:nowrap}.lifeDirTabla th:nth-child(2),.lifeDirTabla td:nth-child(2){white-space:normal}.lifeDirTabla thead th{color:#586579;font-size:11px;text-transform:uppercase;letter-spacing:.04em}' +
      '.lifeDirNota{margin-top:8px;font-size:12px;color:#586579}' +
      '.lifeDirFrases{margin:0;padding-left:20px;font-size:13.5px;display:flex;flex-direction:column;gap:6px}' +
      '.lifeDirAviso{margin-top:8px;font-size:12px;color:#a35b00}' +
      '.lifeDirSec{margin-bottom:14px}' +
      'body.noanim .lifeDirPulso,body.noanim .lifeDirSpark{animation:none!important}';
    document.head.appendChild(s);
  }
})();

// ---- efectos/eco-linea.js ----
// Ecos fantasma de la línea: copias tenues de un tramo de la serie aparecen y se
// apagan en secuencia, derivando levemente hacia arriba. Las zonas de mayor valor
// generan ecos con más frecuencia, más largos y que duran más. La línea se muestrea
// una sola vez al aplicar (nunca getPointAtLength por cuadro) para no lastrar fps.
(function () {
  var ecos = [];
  LifeFX.efecto('eco-linea', { titulo: 'Eco de la línea', para: ['lineas'], costo: 'bajo', descripcion: 'Copias fantasma de tramos de la línea aparecen y se desvanecen; las zonas de mayor valor generan ecos más a menudo y más largos.', aplicar: function (c) {
    var u = c.u;
    c.marks.forEach(function (p) {
      var L = 0; try { L = p.getTotalLength(); } catch (e) { return; }
      if (L < 60) return;
      var N = 120, xs = [], ys = [], i, pt, yMin = 1e9, yMax = -1e9;
      for (i = 0; i <= N; i++) { pt = p.getPointAtLength(L * i / N); xs.push(pt.x); ys.push(pt.y); if (pt.y < yMin) yMin = pt.y; if (pt.y > yMax) yMax = pt.y; }
      var span = Math.max(1, yMax - yMin);
      var M = 28, ws = [];
      for (i = 0; i < M; i++) { var q = ys[Math.round(i / (M - 1) * N)]; ws.push(0.15 + (yMax - q) / span); }
      ecos.push({ svg: c.svg, p: p, L: L, N: N, xs: xs, ys: ys, ws: ws, yMax: yMax, span: span, col: p.getAttribute('stroke') || '#2a78d6', w: (+p.getAttribute('stroke-width') || 2) + 0.6, acc: Math.random() * 0.5, list: [], layer: u.layer(c.svg) });
    });
  } });
  LifeFX.tick(function (dt) {
    for (var i = ecos.length - 1; i >= 0; i--) {
      var q = ecos[i];
      if (!q.p.isConnected) { ecos.splice(i, 1); continue; }
      if (!LifeFX.u.vis(q.svg)) continue;
      q.acc += dt;
      if (q.acc >= 0.85 && q.list.length < 6) {
        q.acc = 0;
        var k = LifeFX.u.wpick(q.ws);
        var fi = Math.round(k / 27 * q.N), v = Math.max(0, Math.min(1, (q.yMax - q.ys[fi]) / q.span));
        var half = Math.round(q.N * (0.05 + 0.10 * v));
        var a = Math.max(0, fi - half), b = Math.min(q.N, fi + half);
        var d = '', j;
        for (j = a; j <= b; j += 2) { d += (j === a ? 'M' : ' L') + q.xs[j].toFixed(1) + ' ' + q.ys[j].toFixed(1); }
        var el = LifeFX.u.mk('path', { d: d, fill: 'none', stroke: q.col, 'stroke-width': q.w, 'stroke-linecap': 'round', opacity: 0.45 });
        q.layer.appendChild(el);
        q.list.push({ el: el, t: 0, life: 0.9 + 0.7 * v });
      }
      for (var m = q.list.length - 1; m >= 0; m--) {
        var e = q.list[m]; e.t += dt;
        if (e.t >= e.life) { if (e.el.parentNode) e.el.parentNode.removeChild(e.el); q.list.splice(m, 1); continue; }
        var f = e.t / e.life;
        e.el.setAttribute('opacity', (0.45 * (1 - f)).toFixed(2));
        e.el.setAttribute('transform', 'translate(0 ' + (-e.t * 9).toFixed(1) + ')');
        e.el.setAttribute('stroke-width', (q.w + f * 1.6).toFixed(1));
      }
    }
  });
})();

// ---- efectos/en-vivo.js ----
// Indicador "EN VIVO · consultado HH:MM (hace N min)" junto al subtítulo (#sub). Los datos no se refrescan solos.
LifeFX.global('en-vivo', { descripcion: 'Punto verde que late con la hora de la consulta.', iniciar: function () {
  var t0 = new Date();
  function tick() { var b = document.getElementById('liveB'); if (!b) return; var m = Math.floor((new Date() - t0) / 60000), hh = t0.getHours(), mm = t0.getMinutes(); b.textContent = 'EN VIVO · consultado ' + (hh < 10 ? '0' : '') + hh + ':' + (mm < 10 ? '0' : '') + mm + (m ? ' (hace ' + m + ' min)' : ''); }
  var sub = document.getElementById('sub'); if (!sub || document.getElementById('liveB')) return;
  var b = document.createElement('span'); b.id = 'liveB'; b.className = 'liveB'; b.setAttribute('aria-hidden', 'true'); sub.parentNode.insertBefore(b, sub.nextSibling); tick(); setInterval(tick, 30000);
  var s = document.createElement('style'); s.textContent =
    '.liveB{display:inline-flex;align-items:center;gap:6px;margin-left:10px;font-size:11px;font-weight:700;color:#0f8a5f;letter-spacing:.02em;white-space:nowrap}' +
    '.liveB::before{content:"";width:8px;height:8px;border-radius:50%;background:#1baf7a;animation:lifeDot 1.6s ease-in-out infinite}@keyframes lifeDot{0%,100%{box-shadow:0 0 0 0 rgba(27,175,122,.6)}50%{box-shadow:0 0 0 6px rgba(27,175,122,0)}}' +
    '.kpi .spark circle,.scc .scsp circle{transform-box:fill-box;transform-origin:center;animation:lifeBeat 1.6s ease-in-out infinite}@keyframes lifeBeat{0%,100%{transform:scale(1)}50%{transform:scale(1.8)}}';
  document.head.appendChild(s);
} });

// ---- efectos/entrada.js ----
// Animaciones de entrada para todas las gráficas SVG y cifras del data app.
// Módulo independiente: observa lo que la app dibuja y lo anima; no cambia datos ni lógica.
// Entrada: al cargar y al filtrar, barras crecen desde su eje, líneas se dibujan, puntos rebotan, gajos giran y cifras cuentan.
// Contador: el conteo de cifras vive aquí (countUp, dentro del global 'entrada') y se expone
// como LifeFX.contador cuando el global arranca. El registro existe para que el catálogo sea
// veraz: FX.decorar nunca lo invoca (solo corre sobre SVG); en vivo el conteo corre por el
// scan de este mismo archivo y el hook de cifras de la galería.
LifeFX.efecto('contador', { titulo: 'Contador', para: ['cifras'], costo: 'muy bajo', descripcion: 'Anima la parte numérica de una cifra conservando su formato.', aplicar: function (c) {
  var root = (c && c.svg && c.svg.closest) ? (c.svg.closest('.panel') || document) : document;
  [].forEach.call(root.querySelectorAll('.kpi .v, .scv, .gv .v, .big, .kv'), function (el) { if (LifeFX.contador) LifeFX.contador(el); });
} });
LifeFX.global('entrada', { descripcion: 'Animación de entrada de cada gráfica y conteo de cifras.', iniciar: function (FX) {
  'use strict';
  var RM = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NS = 'http://www.w3.org/2000/svg', first = true, MAXD = 0.7;
  setTimeout(function () { first = false; }, 3500);
  function quiet() { return document.body.classList.contains('noanim') || document.getElementById('gOverlay'); }
  function dur(a, b) { return first ? a : b; }

  function animSvg(svg) {
    if (svg.__an || !svg.closest || !svg.closest('.panel') || svg.closest('.tip')) return;
    svg.__an = 1;
    var marks = svg.querySelectorAll('rect,path,circle,line,polyline,polygon,text');
    var n = 0, bars = 0, k = Math.max(1, marks.length);
    var step = Math.min(0.035, MAXD / k);
    [].forEach.call(marks, function (m) {
      var tag = m.tagName.toLowerCase(), st = m.style, d = (n++ * step).toFixed(3) + 's';
      if (m.getAttribute('stroke') === '#e8ecf2' || m.classList.contains('noan')) return; // cuadrícula: fija
      if (tag === 'rect') {
        var w = +m.getAttribute('width') || 0, h = +m.getAttribute('height') || 0;
        if (w <= 0 || h <= 0) return;
        bars++;
        var horiz = w > h * 1.6 && h < 40;
        st.transformBox = 'fill-box'; st.transformOrigin = horiz ? 'left center' : 'center bottom';
        st.animation = (horiz ? 'anGrowX ' : 'anGrowY ') + dur(0.7, 0.4) + 's cubic-bezier(.2,.9,.25,1.15) ' + d + ' both';
      } else if (tag === 'circle') {
        st.transformBox = 'fill-box'; st.transformOrigin = 'center';
        st.animation = 'anPop ' + dur(0.55, 0.35) + 's cubic-bezier(.3,1.6,.5,1) ' + d + ' both';
      } else if (tag === 'path' || tag === 'polyline' || tag === 'line') {
        var fill = m.getAttribute('fill'), stroke = m.getAttribute('stroke');
        if ((fill === 'none' || tag === 'line') && stroke && stroke !== 'none' && !m.getAttribute('stroke-dasharray')) {
          var len = 0; try { len = m.getTotalLength ? m.getTotalLength() : 0; } catch (e) { len = 0; }
          if (len > 4) { st.strokeDasharray = len; st.strokeDashoffset = len; st.animation = 'anDraw ' + dur(1.1, 0.6) + 's ease-out ' + d + ' forwards'; return; }
        }
        if (/A[\d.]/.test(m.getAttribute('d') || '')) { // gajos de dona / radial
          st.transformBox = 'view-box'; var c = center(m.ownerSVGElement);
          st.transformOrigin = c; st.animation = 'anSpin ' + dur(0.8, 0.45) + 's cubic-bezier(.2,.8,.2,1) ' + d + ' both';
        } else st.animation = 'anFade ' + dur(0.7, 0.35) + 's ease-out ' + d + ' both';
      } else if (tag === 'text') {
        st.animation = 'anFade ' + dur(0.5, 0.3) + 's ease-out ' + (parseFloat(d) + 0.25).toFixed(2) + 's both';
      } else st.animation = 'anFade .5s ease-out ' + d + ' both';
    });
  }
  function center(svg) { var w = +svg.getAttribute('width') || 200, h = +svg.getAttribute('height') || 200; return (w / 2) + 'px ' + (h / 2) + 'px'; }

  // Formato español de cifras (decisión 5): miles con punto, decimal con coma.
  // parseES entiende "15.618" (= 15618) y "89,6" (= 89.6) y, por compatibilidad con
  // textos heredados, el anglosajón "15,618" / "89.6": con los dos separadores el último
  // es el decimal; con uno solo, 3 dígitos tras punto = miles ("15.618"), 1-2 = decimal
  // ("89.6"); la coma sola siempre es decimal ("89,6"). Devuelve { val, dec, miles } o null.
  function parseES(raw) {
    if (raw == null) return null;
    var s = String(raw).trim(), mm = s.match(/-?[\d.,]*\d/);
    if (!mm) return null; s = mm[0];
    var neg = s.charAt(0) === '-'; if (neg || s.charAt(0) === '+') s = s.slice(1);
    var ld = s.lastIndexOf('.'), lc = s.lastIndexOf(','), decSep = null, miles = false, dec = 0, ent;
    if (ld >= 0 && lc >= 0) { decSep = ld > lc ? '.' : ','; miles = true; }
    else if (lc >= 0) { decSep = ','; }
    else if (ld >= 0) {
      var tras = s.length - ld - 1;
      if (s.split('.').length > 2 || (tras === 3 && s.slice(0, ld) !== '0')) miles = true; // miles: "15.618", "1.234.567"
      else decSep = '.'; // decimal heredado: "89.6", "1.25"
    }
    if (decSep) { var pp = s.split(decSep); dec = (pp[1] || '').length; ent = pp[0].replace(/[.,]/g, '') + '.' + (pp[1] || ''); }
    else ent = s.replace(/[.,]/g, '');
    var val = parseFloat((neg ? '-' : '') + ent);
    if (!isFinite(val)) return null;
    return { val: val, dec: dec, miles: miles };
  }
  // fmtES: número → texto español con `dec` decimales; `group` pone punto de miles.
  function fmtES(n, dec, group) {
    var neg = n < 0, a = Math.abs(n), f = a.toFixed(dec == null ? 1 : dec), p = f.split('.');
    var ent = group ? p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') : p[0];
    return (neg ? '-' : '') + ent + (p[1] ? ',' + p[1] : '');
  }

  // Contador: anima la parte numérica de una cifra conservando su formato ("$42 K", "89,6 %", "15.618").
  function countUp(elm) {
    if (FX.mapa.cifras === 'odometro' || (elm.getAttribute && elm.getAttribute('data-fx-num') === 'odometro')) { if (FX.odometro) FX.odometro(elm); return; }
    if (FX.mapa.cifras === 'numero-tiembla' || (elm.getAttribute && elm.getAttribute('data-fx-num') === 'numero-tiembla')) { if (FX.tiembla) FX.tiembla(elm); return; }
    if (FX.mapa.cifras === 'alarma-numero' || (elm.getAttribute && elm.getAttribute('data-fx-num') === 'alarma-numero')) { if (FX.alarma) FX.alarma(elm); return; }
    if (FX.mapa.cifras === 'brillo-numero' || (elm.getAttribute && elm.getAttribute('data-fx-num') === 'brillo-numero')) { if (FX.brilloNum) FX.brilloNum(elm); return; }
    if (FX.mapa.cifras === 'semaforo' || (elm.getAttribute && elm.getAttribute('data-fx-num') === 'semaforo')) { if (FX.semaforo) FX.semaforo(elm.closest('[data-semaforo]') || elm.closest('.kpis') || elm.parentNode); return; }
    if (FX.mapa.cifras === 'no') return;
    if (elm.__cu) return; var txt = elm.textContent;
    if (/\d+:\d{2}/.test(txt)) return; // tiempo ("8:52"): no se cuenta, se queda como tiempo
    var m = txt.match(/-?\d(?:[\d.,]*\d)?/);
    if (!m) return; elm.__cu = 1;
    var raw = m[0], par = parseES(raw);
    if (!par || !isFinite(par.val) || par.val === 0) return;
    var val = par.val, dec = par.dec, group = par.miles || Math.abs(val) >= 10000;
    var pre = txt.slice(0, m.index), post = txt.slice(m.index + raw.length), t0 = null, D = dur(900, 450);
    function f(now) {
      if (!elm.isConnected || elm.textContent.indexOf(pre) !== 0) return; // la app ya lo redibujó
      if (document.body.classList.contains('noanim')) { elm.textContent = txt; return; } // reducir movimiento (también en vivo): salta al valor final
      if (t0 == null) t0 = now; var p = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - p, 3);
      elm.textContent = pre + fmtES(val * e, dec, group) + post;
      if (p < 1) requestAnimationFrame(f); else elm.textContent = txt;
    }
    requestAnimationFrame(f);
  }
  FX.contador = countUp; // expone el conteo como LifeFX.contador (lo usa el efecto 'contador')

  var CNT = '.kpi .v,.scv,.gv .v,.big,.kv';
  function scan(node) {
    if (node.nodeType !== 1 || quiet()) return;
    if (node.namespaceURI === NS && node.tagName.toLowerCase() === 'svg') animSvg(node);
    if (node.querySelectorAll) {
      [].forEach.call(node.querySelectorAll('svg'), animSvg);
      if (node.matches && node.matches(CNT)) countUp(node);
      [].forEach.call(node.querySelectorAll(CNT), countUp);
    }
  }
  var css = document.createElement('style');
  css.textContent =
    '@keyframes anGrowY{from{transform:scaleY(0)}to{transform:scaleY(1)}}' +
    '@keyframes anGrowX{from{transform:scaleX(0)}to{transform:scaleX(1)}}' +
    '@keyframes anPop{0%{transform:scale(0);opacity:0}60%{opacity:1}100%{transform:scale(1)}}' +
    '@keyframes anDraw{to{stroke-dashoffset:0}}' +
    '@keyframes anFade{from{opacity:0}to{opacity:1}}' +
    '@keyframes anSpin{from{transform:rotate(-40deg) scale(.6);opacity:0}to{transform:none;opacity:1}}' +
    '.panel .body>svg rect:not(.hit),.panel .body>svg circle,.panel .body>svg path,.panel .body>svg{animation:none}' +
    '.sc .scc,.np,.kpi{animation:anRise .5s cubic-bezier(.2,.8,.2,1) both}' +
    '.sc .scc:nth-child(2),.np:nth-child(2){animation-delay:.06s}.sc .scc:nth-child(3),.np:nth-child(3){animation-delay:.12s}.sc .scc:nth-child(4),.np:nth-child(4){animation-delay:.18s}' +
    '@keyframes anRise{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}' +
    '.panel{transition:box-shadow .2s,transform .2s}.panel:hover{box-shadow:0 6px 18px rgba(22,32,58,.10)}' +
    'svg .hit,svg .kb{transition:filter .15s,opacity .2s}svg .hit:hover,svg .kb:hover{filter:brightness(1.08) drop-shadow(0 2px 3px rgba(0,0,0,.18))}' +
    'body.noanim *{animation:none!important}';
  document.head.appendChild(css);

  function start() {
    var root = document.getElementById('app') || document.body;
    new MutationObserver(function (list) { list.forEach(function (mu) { [].forEach.call(mu.addedNodes, scan); }); })
      .observe(root, { childList: true, subtree: true });
    scan(root);
  }
  start();
} });

// ---- efectos/escaner.js ----
// Línea de escaneo que barre la gráfica de izquierda a derecha e ilumina la barra que toca.
(function () {
  var sc = [];
  LifeFX.efecto('escaner', { titulo: 'Escáner', para: ['barras-v', 'barras-h'], costo: 'bajo', descripcion: 'Una línea de luz recorre la gráfica e ilumina cada barra al pasar.', aplicar: function (c) {
    var u = c.u, w = u.num(c.svg, 'width'), h = u.num(c.svg, 'height'), id = u.id('sc'), g = u.mk('linearGradient', { id: id });
    [['0', 0], ['0.5', 0.5], ['1', 0]].forEach(function (s) { g.appendChild(u.mk('stop', { offset: s[0], 'stop-color': '#2a78d6', 'stop-opacity': s[1] })); }); u.defs(c.svg).appendChild(g);
    var bar = u.mk('rect', { x: -30, y: 0, width: 30, height: h, fill: 'url(#' + id + ')' }); u.layer(c.svg).appendChild(bar);
    sc.push({ svg: c.svg, bar: bar, marks: c.marks, w: w, x: -30, u: u });
  } });
  LifeFX.tick(function (dt) {
    for (var i = sc.length - 1; i >= 0; i--) {
      var s = sc[i]; if (!s.bar.isConnected) { sc.splice(i, 1); continue; } if (!s.u.vis(s.svg)) continue;
      s.x += dt * s.w / 3.2; if (s.x > s.w + 40) s.x = -60; s.bar.setAttribute('x', s.x.toFixed(1));
      s.marks.forEach(function (m) { var x = s.u.num(m, 'x'), w = s.u.num(m, 'width'); var on = s.x + 15 >= x && s.x + 15 <= x + w; if (on !== !!m.__sc) { m.__sc = on; m.style.filter = on ? 'brightness(1.3) drop-shadow(0 0 6px rgba(42,120,214,.8))' : ''; } });
    }
  });
})();

// ---- efectos/estalla-burbuja.js ----
// Las burbujas destellan por turnos: un brillo crece dentro de la burbuja y se apaga.
// Mecanismo: cada cierto tiempo se elige una burbuja con probabilidad ∝ su peso
// (c.u.wpick sobre c.ws) y se dispara un destello: un círculo de relleno blanco dentro
// de la burbuja que crece (animación CSS lifeBurst) y se desvanece sin salir de ella.
(function () {
  var grupos = [];
  var st = document.createElement('style');
  st.textContent = '@keyframes lifeBurst{0%{opacity:0;transform:scale(.12)}30%{opacity:.55;transform:scale(.62)}100%{opacity:0;transform:scale(1)}}';
  document.head.appendChild(st);
  LifeFX.efecto('estalla-burbuja', { titulo: 'Estalla burbuja', para: ['burbujas'], costo: 'bajo', descripcion: 'Destellos por turnos dentro de las burbujas; las grandes destellan más seguido.', aplicar: function (c) {
    grupos.push({ svg: c.svg, cs: c.marks, ws: c.ws, t: 0.2, u: c.u, vivos: 0 });
  } });
  LifeFX.tick(function (dt) {
    for (var i = grupos.length - 1; i >= 0; i--) {
      var q = grupos[i], u = q.u; if (!q.cs[0].isConnected) { grupos.splice(i, 1); continue; } if (!u.vis(q.svg)) continue;
      q.t -= dt; if (q.t > 0 || q.vivos >= 3) continue; q.t = 0.55 + Math.random() * 0.5;
      var c = q.cs[u.wpick(q.ws)], m = u.toLocal(c, q.svg) || q.svg.createSVGMatrix(), p = new DOMPoint(u.num(c, 'cx'), u.num(c, 'cy')).matrixTransform(m);
      var g = u.mk('circle', { cx: p.x, cy: p.y, r: (u.num(c, 'r') * 0.95).toFixed(1), fill: '#fff', opacity: 0 });
      g.style.transformBox = 'fill-box'; g.style.transformOrigin = 'center'; g.style.animation = 'lifeBurst 0.9s ease-out forwards';
      u.layer(q.svg).appendChild(g); q.vivos++;
      setTimeout(function () { if (g.parentNode) g.parentNode.removeChild(g); q.vivos--; }, 950);
    }
  });
})();

// ---- efectos/fiebre-calor.js ----
// Fiebre de calor: un velo luminoso pulsa sobre cada celda; las más calientes laten más fuerte y más rápido.
// Mecanismo distinto a los demás de calor: no toca el filtro ni la opacidad de la celda de datos; dibuja
// un rectángulo gemelo en la capa g.lifeL y anima solo SU opacidad (brillo por velo, no por filtro).
LifeFX.efecto('fiebre-calor', { titulo: 'Fiebre de calor', para: ['calor'], costo: 'bajo', descripcion: 'Las celdas calientes laten con un velo luminoso; más peso, latido más fuerte y rápido.', aplicar: function (c) {
  var u = c.u, layer = u.layer(c.svg), wm = Math.max.apply(null, c.ws.concat([1e-6]));
  c.marks.forEach(function (r, i) {
    var k = c.ws[i] / wm;
    var velo = u.mk('rect', { x: u.num(r, 'x'), y: u.num(r, 'y'), width: u.num(r, 'width'), height: u.num(r, 'height'), rx: r.getAttribute('rx') || 0, fill: '#ffffff', opacity: 0 });
    velo.style.setProperty('--fxa', (0.06 + 0.38 * k).toFixed(2));
    velo.style.animation = 'lifeFiebre ' + (2.6 - 1.7 * k).toFixed(2) + 's ease-in-out ' + (-Math.random() * 2.6).toFixed(2) + 's infinite';
    layer.appendChild(velo);
  });
} });
(function () { var s = document.createElement('style'); s.textContent = '@keyframes lifeFiebre{0%,100%{opacity:0}50%{opacity:var(--fxa,.2)}}'; document.head.appendChild(s); })();

// ---- efectos/flota-burbuja.js ----
// Cada burbuja flota: sube y baja con deriva lateral suave; la amplitud ∝ su tamaño (r²).
// Mecanismo: LifeFX.tick mueve cx/cy (y la etiqueta que lleva dentro) con senos desfasados
// por burbuja; no toca el radio ni usa CSS sobre la marca, así que el dato no cambia de tamaño.
(function () {
  var grupos = [];
  LifeFX.efecto('flota-burbuja', { titulo: 'Flota burbuja', para: ['burbujas'], costo: 'bajo', descripcion: 'Las burbujas flotan arriba y abajo con deriva lateral; las grandes flotan más.', aplicar: function (c) {
    var u = c.u, W = u.num(c.svg, 'width') || 0, H = u.num(c.svg, 'height') || 0;
    var bs = c.marks.map(function (m, i) {
      var r = u.num(m, 'r'), sh = c.shares[i] || 0;
      var mtx = u.toLocal(m, c.svg), p0 = mtx ? new DOMPoint(u.num(m, 'cx'), u.num(m, 'cy')).matrixTransform(mtx) : { x: u.num(m, 'cx'), y: u.num(m, 'cy') };
      var sx = mtx ? Math.hypot(mtx.a, mtx.b) || 1 : 1, sy = mtx ? Math.hypot(mtx.c, mtx.d) || 1 : 1;
      var ampY = 2 + sh * 16, ampX = ampY * 0.55;
      if (W > 0 && H > 0) {
        ampX = Math.min(ampX, Math.max(0, Math.min(p0.x - r - 1, W - r - 1 - p0.x)) / sx);
        ampY = Math.min(ampY, Math.max(0, Math.min(p0.y - r - 1, H - r - 1 - p0.y)) / sy);
      }
      // Etiqueta dentro de la burbuja: se mueve con ella para no quedar fuera ni tapada.
      var labels = [].filter.call(c.svg.querySelectorAll('text'), function (t) {
        var dx = u.num(t, 'x') - p0.x, dy = u.num(t, 'y') - p0.y;
        return dx * dx + dy * dy < r * r * 0.64;
      }).map(function (t) { return { el: t, x0: u.num(t, 'x'), y0: u.num(t, 'y') }; });
      return { m: m, cx0: u.num(m, 'cx'), cy0: u.num(m, 'cy'), ampX: ampX, ampY: ampY, wX: 6.283 / (3.4 + sh * 1.4), wY: 6.283 / (2.6 + sh * 1.2), phX: i * 2.1 + 0.7, phY: i * 1.3, labels: labels };
    });
    grupos.push({ svg: c.svg, bs: bs, t: Math.random() * 6, u: u });
  } });
  LifeFX.tick(function (dt) {
    for (var i = grupos.length - 1; i >= 0; i--) {
      var q = grupos[i]; if (!q.bs.length || !q.bs[0].m.isConnected) { grupos.splice(i, 1); continue; } if (!q.u.vis(q.svg)) continue;
      q.t += dt;
      q.bs.forEach(function (b) {
        var dx = b.ampX * Math.sin(q.t * b.wX + b.phX), dy = b.ampY * Math.sin(q.t * b.wY + b.phY);
        b.m.setAttribute('cx', (b.cx0 + dx).toFixed(1)); b.m.setAttribute('cy', (b.cy0 + dy).toFixed(1));
        b.labels.forEach(function (L) { L.el.setAttribute('x', (L.x0 + dx).toFixed(1)); L.el.setAttribute('y', (L.y0 + dy).toFixed(1)); });
      });
    }
  });
})();

// ---- efectos/franjas.js ----
// Franjas diagonales que avanzan dentro de cada barra horizontal (barra de progreso). Velocidad ∝ participación.
LifeFX.efecto('franjas', { titulo: 'Franjas', para: ['barras-h'], costo: 'bajo', descripcion: 'Franjas en movimiento; la barra más larga avanza más rápido.', aplicar: function (c) {
  var u = c.u, defs = u.defs(c.svg);
  c.marks.forEach(function (r, i) {
    var share = c.shares[i], id = u.id('st');
    var pat = u.mk('pattern', { id: id, width: 14, height: 14, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    pat.appendChild(u.mk('rect', { width: 6, height: 14, fill: '#fff', 'fill-opacity': 0.38 }));
    pat.appendChild(u.mk('animateTransform', { attributeName: 'patternTransform', type: 'translate', additive: 'sum', from: '0 0', to: '14 0', dur: Math.max(0.35, 1.8 - share * 4).toFixed(2) + 's', repeatCount: 'indefinite' }));
    defs.appendChild(pat);
    u.layer(c.svg).appendChild(u.mk('rect', { x: r.getAttribute('x'), y: r.getAttribute('y'), width: r.getAttribute('width'), height: r.getAttribute('height'), rx: r.getAttribute('rx') || 0, fill: 'url(#' + id + ')' }));
  });
} });

// ---- efectos/giro-dona.js ----
// La dona gira lentamente en vaivén y cada rebanada se inclina levemente al pasar por arriba; la ondulación es mayor en la rebanada más grande.
// Mecanismo: rotación global de vaivén (±6°, nunca da la vuelta: el dato no se oculta) con el atributo transform,
// más una inclinación propia de cada rebanada (rotación sobre su propio centro) cuya amplitud ∝ participación
// y que solo actúa cuando la rebanada está cerca de la parte superior.
// Distinto de respirar (escala), rebanada-dona (traslación radial), orbita (partículas) y ondas-radiales (anillos).
(function () {
  var spins = [];
  LifeFX.efecto('giro-dona', { titulo: 'Giro en vaivén', para: ['arcos'], costo: 'bajo', descripcion: 'La dona gira unos grados y vuelve; cada rebanada se inclina al pasar por arriba, más la grande.', aplicar: function (c) {
    var u = c.u, ctr = u.center(c.marks, c.svg), cx = ctr[0], cy = ctr[1];
    var slices = c.marks.map(function (m, i) {
      var ml = u.toLocal(m, c.svg), b = m.getBBox(), bx = b.x + b.width / 2, by = b.y + b.height / 2;
      var q = ml ? new DOMPoint(bx, by).matrixTransform(ml) : { x: bx, y: by };
      // La entrada global (anSpin … both) deja una animación CSS sobre el gajo que anula el atributo
      // transform; se quita (su estado final es el natural) y se fija el origen en 0 para que los
      // rotate(cx, cy) no se desplacen por el transform-origin heredado.
      m.style.animation = 'none'; m.style.transformOrigin = '0 0';
      return { m: m, bx: q.x, by: q.y, ang: Math.atan2(q.y - cy, q.x - cx), share: c.shares[i] || 0, orig: m.getAttribute('transform') || '' };
    });
    if (slices.length) spins.push({ svg: c.svg, slices: slices, cx: cx, cy: cy, t: Math.random() * 6, u: u });
  } });
  LifeFX.tick(function (dt) {
    for (var i = spins.length - 1; i >= 0; i--) {
      var p = spins[i]; if (!p.slices[0].m.isConnected) { spins.splice(i, 1); continue; } if (!p.u.vis(p.svg)) continue;
      p.t += dt;
      var g = 6 * Math.sin(p.t * 0.55); // vaivén global ±6°
      p.slices.forEach(function (s) {
        if (s.m.style.animation !== 'none') { s.m.style.animation = 'none'; s.m.style.transformOrigin = '0 0'; } // por si la entrada re-aplicó anSpin
        var a = s.ang + g * Math.PI / 180;
        var prox = Math.max(0, Math.cos(a + Math.PI / 2)); // 1 en la parte superior, 0 abajo
        var wob = (0.6 + s.share * 4.5) * prox * Math.sin(p.t * 2.2 + s.ang * 2); // inclinación ∝ participación
        s.m.setAttribute('transform', 'rotate(' + g.toFixed(2) + ' ' + p.cx.toFixed(1) + ' ' + p.cy.toFixed(1) + ') rotate(' + wob.toFixed(2) + ' ' + s.bx.toFixed(1) + ' ' + s.by.toFixed(1) + ')' + (s.orig ? ' ' + s.orig : ''));
      });
    }
  });
})();

// ---- efectos/gota-cascada.js ----
// Gotas que caen desde cada escalón de la cascada y salpican en el siguiente; la frecuencia es ∝ al tamaño del escalón.
(function () {
  var barras = [], gotas = [];
  LifeFX.efecto('gota-cascada', { titulo: 'Gotas de cascada', para: ['cascada'], costo: 'bajo', descripcion: 'Gotas caen de cada escalón y salpican en el siguiente; el escalón más grande gotea más.', aplicar: function (c) {
    var u = c.u, layer = u.layer(c.svg);
    c.marks.forEach(function (r, i) {
      var x = u.num(r, 'x'), y = u.num(r, 'y'), w = u.num(r, 'width'), h = u.num(r, 'height');
      if (w < 3 || h < 2) return;
      barras.push({ svg: c.svg, el: r, layer: layer, x: x, y: y, w: w, h: h, share: c.shares[i] || 0, acc: Math.random() * 0.8 });
    });
  } });
  function salpicar(b, x, y) {
    for (var k = 0; k < 3; k++) {
      var m = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      m.setAttribute('cx', x.toFixed(1)); m.setAttribute('cy', y.toFixed(1)); m.setAttribute('r', (1 + Math.random() * 0.8).toFixed(1));
      m.setAttribute('fill', '#eaf6ff'); m.setAttribute('opacity', 0.9);
      b.layer.appendChild(m);
      gotas.push({ c: m, svg: b.svg, mini: true, x: x, y: y, vx: (Math.random() < 0.5 ? -1 : 1) * (12 + Math.random() * 30), vy: -(18 + Math.random() * 42), t: 0, vida: 0.32 + Math.random() * 0.12 });
    }
  }
  LifeFX.tick(function (dt) {
    var i, b, q;
    for (i = barras.length - 1; i >= 0; i--) {
      b = barras[i];
      if (!b.el.isConnected || !b.svg.isConnected) { barras.splice(i, 1); continue; }
      b.acc += (0.25 + 7 * b.share) * dt;
      while (b.acc >= 1 && gotas.length < 48) {
        b.acc -= 1;
        var d = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        var x = b.x + b.w * (0.2 + Math.random() * 0.6);
        d.setAttribute('cx', x.toFixed(1)); d.setAttribute('cy', (b.y + 1).toFixed(1));
        d.setAttribute('r', (1.8 + Math.random() * 0.9).toFixed(1)); d.setAttribute('fill', '#eaf6ff'); d.setAttribute('opacity', 0.9);
        b.layer.appendChild(d);
        gotas.push({ c: d, svg: b.svg, bar: b, mini: false, x: x, y: b.y + 1, vy: 30 + Math.random() * 25, t: 0 });
      }
    }
    for (i = gotas.length - 1; i >= 0; i--) {
      q = gotas[i];
      if (!q.c.isConnected || !q.svg.isConnected) { gotas.splice(i, 1); continue; }
      q.t += dt;
      if (q.mini) {
        if (q.t > q.vida) { if (q.c.parentNode) q.c.parentNode.removeChild(q.c); gotas.splice(i, 1); continue; }
        q.vy += 220 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
        q.c.setAttribute('cx', q.x.toFixed(1)); q.c.setAttribute('cy', q.y.toFixed(1));
        q.c.setAttribute('opacity', (0.9 * (1 - q.t / q.vida)).toFixed(2));
        continue;
      }
      if (!q.bar.el.isConnected) { if (q.c.parentNode) q.c.parentNode.removeChild(q.c); gotas.splice(i, 1); continue; }
      q.vy += 300 * dt; q.y += q.vy * dt;
      var fondo = q.bar.y + q.bar.h - 1;
      if (q.y >= fondo) { salpicar(q.bar, q.x, fondo); if (q.c.parentNode) q.c.parentNode.removeChild(q.c); gotas.splice(i, 1); continue; }
      q.c.setAttribute('cy', q.y.toFixed(1));
    }
  });
})();

// ---- efectos/gota-flujo.js ----
// Gotas grandes que viajan por cada banda del flujo y crecen al avanzar, como si acumularan caudal.
// Proporción: la gota de la banda más ancha nace más grande, crece más y aparece con más frecuencia (todo ∝ h de data-flow).
// Mecanismo distinto a particulas-flujo (muchas bolitas pequeñas de tamaño fijo) y a pulso-banda (degradado):
// aquí son pocas gotas grandes (máx. 2 por banda) con radio que crece con el avance y brillo propio.
(function () {
  var bandas = [], cssOk = false;
  LifeFX.efecto('gota-flujo', { titulo: 'Gota de flujo', para: ['flujo'], costo: 'bajo', descripcion: 'Gotas grandes que recorren cada banda y crecen al avanzar; las anchas, más grandes y más frecuentes.', aplicar: function (c) {
    var u = c.u;
    if (!cssOk) { cssOk = true; var st = document.createElement('style'); st.textContent = '@keyframes lifeGota{0%,100%{opacity:.9}50%{opacity:.45}} .lifeGota{animation:lifeGota 1.6s ease-in-out infinite}'; document.head.appendChild(st); }
    var tot = 0; c.marks.forEach(function (p) { tot += +(p.getAttribute('data-flow') || '0,0,0,0,0').split(',')[4] || 0; });
    if (!(tot > 0)) return;
    c.marks.forEach(function (p, bi) {
      var f = (p.getAttribute('data-flow') || '').split(',').map(Number), h = f[4]; if (!(h > 2)) return;
      var share = h / tot;
      var bd = { svg: c.svg, f: f, h: h, share: share, col: p.getAttribute('fill') || '#2a78d6', u: u,
        timer: -Math.random() * 1.5, intervalo: 2.6 - share * 1.6, dur: 2.6 - share * 1.2,
        max: 2, r0: Math.max(2.5, h * 0.06), rMax: Math.min(h * 0.3, 16), gotas: [] };
      bandas.push(bd);
      // Una gota ya en camino desde el inicio (escalonada por banda) para que el panel no arranque vacío.
      soltar(bd); bd.gotas[0].t = bi * 0.3;
    });
  } });
  function soltar(b) {
    var u = b.u, g = u.mk('g', { 'pointer-events': 'none' });
    var cuerpo = u.mk('circle', { fill: b.col, stroke: '#fff', 'stroke-width': 1.2, opacity: 0 });
    var brillo = u.mk('circle', { fill: '#fff', class: 'lifeGota', opacity: 0.9 });
    g.appendChild(cuerpo); g.appendChild(brillo); u.layer(b.svg).appendChild(g);
    var margen = Math.max(0, (b.h - 2 * b.rMax) / 2);
    b.gotas.push({ g: g, cuerpo: cuerpo, brillo: brillo, t: 0, o: (Math.random() * 2 - 1) * margen });
  }
  LifeFX.tick(function (dt) {
    for (var i = bandas.length - 1; i >= 0; i--) {
      var b = bandas[i];
      if (!b.svg.isConnected) { bandas.splice(i, 1); continue; }
      if (!b.u.vis(b.svg)) continue;
      b.timer += dt;
      if (b.timer >= b.intervalo && b.gotas.length < b.max) { b.timer = 0; soltar(b); }
      for (var j = b.gotas.length - 1; j >= 0; j--) {
        var g = b.gotas[j]; g.t += dt / b.dur;
        if (g.t >= 1 || !g.g.isConnected) { if (g.g.parentNode) g.g.parentNode.removeChild(g.g); b.gotas.splice(j, 1); continue; }
        var t = g.t, mx = (b.f[0] + b.f[2]) / 2, r = b.r0 + (b.rMax - b.r0) * t;
        var x = b.u.bez(b.f[0], mx, mx, b.f[2], t), y = b.u.bez(b.f[1] + b.h / 2 + g.o, b.f[1] + b.h / 2 + g.o, b.f[3] + b.h / 2 + g.o, b.f[3] + b.h / 2 + g.o, t);
        g.cuerpo.setAttribute('cx', x.toFixed(1)); g.cuerpo.setAttribute('cy', y.toFixed(1));
        g.cuerpo.setAttribute('r', r.toFixed(1));
        g.cuerpo.setAttribute('opacity', (Math.min(1, t * 8, (1 - t) * 5) * 0.85).toFixed(2));
        g.brillo.setAttribute('cx', (x - r * 0.35).toFixed(1)); g.brillo.setAttribute('cy', (y - r * 0.35).toFixed(1));
        g.brillo.setAttribute('r', Math.max(0.8, r * 0.28).toFixed(1));
      }
    }
  });
})();

// ---- efectos/goteo-embudo.js ----
// Un flujo gotea por las etapas del embudo estrechándose; la velocidad es ∝ al ancho de cada etapa.
(function () {
  var embudos = [], gotas = [];
  LifeFX.efecto('goteo-embudo', { titulo: 'Goteo de embudo', para: ['embudo'], costo: 'bajo', descripcion: 'Un flujo gotea por las etapas estrechándose; en la etapa más ancha cae más rápido.', aplicar: function (c) {
    var list = [];
    c.marks.forEach(function (m, i) {
      var b; try { b = m.getBBox(); } catch (e) { return; }
      if (b.width < 8 || b.height < 6) return;
      list.push({ el: m, x: b.x, y: b.y, w: b.width, h: b.height, cx: b.x + b.width / 2, share: c.shares[i] || 0 });
    });
    list.sort(function (a, b) { return a.y - b.y; });
    if (list.length < 2) return;
    embudos.push({ svg: c.svg, layer: c.u.layer(c.svg), list: list, acc: Math.random() * 0.5 });
  } });
  function salpicar(f, x, y) {
    for (var k = 0; k < 3; k++) {
      var m = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      m.setAttribute('cx', x.toFixed(1)); m.setAttribute('cy', y.toFixed(1)); m.setAttribute('r', (1 + Math.random() * 0.8).toFixed(1));
      m.setAttribute('fill', '#ffffff'); m.setAttribute('opacity', 0.9);
      f.layer.appendChild(m);
      gotas.push({ c: m, svg: f.svg, mini: true, x: x, y: y, vx: (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 26), vy: -(15 + Math.random() * 35), t: 0, vida: 0.3 + Math.random() * 0.12 });
    }
  }
  LifeFX.tick(function (dt) {
    var i, f, q;
    for (i = embudos.length - 1; i >= 0; i--) {
      f = embudos[i];
      if (!f.svg.isConnected || !f.list.every(function (s) { return s.el.isConnected; })) { embudos.splice(i, 1); continue; }
      f.acc += (1 + 3 * f.list[0].share) * dt;
      while (f.acc >= 1 && gotas.length < 48) {
        f.acc -= 1;
        var s0 = f.list[0];
        var d = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        d.setAttribute('cx', s0.cx.toFixed(1)); d.setAttribute('cy', (s0.y + 1).toFixed(1));
        d.setAttribute('r', (2 + 2.5 * s0.share).toFixed(1)); d.setAttribute('fill', '#ffffff'); d.setAttribute('opacity', 0.9);
        f.layer.appendChild(d);
        gotas.push({ c: d, svg: f.svg, fun: f, mini: false, etapa: 0, x: s0.cx, y: s0.y + 1, t: 0, ph: Math.random() * 6.28 });
      }
    }
    for (i = gotas.length - 1; i >= 0; i--) {
      q = gotas[i];
      if (!q.c.isConnected || !q.svg.isConnected) { gotas.splice(i, 1); continue; }
      q.t += dt;
      if (q.mini) {
        if (q.t > q.vida) { if (q.c.parentNode) q.c.parentNode.removeChild(q.c); gotas.splice(i, 1); continue; }
        q.vy += 200 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
        q.c.setAttribute('cx', q.x.toFixed(1)); q.c.setAttribute('cy', q.y.toFixed(1));
        q.c.setAttribute('opacity', (0.9 * (1 - q.t / q.vida)).toFixed(2));
        continue;
      }
      if (!q.fun.list.every(function (s) { return s.el.isConnected; })) { if (q.c.parentNode) q.c.parentNode.removeChild(q.c); gotas.splice(i, 1); continue; }
      var s = q.fun.list[q.etapa], vy = 26 + 170 * s.share;
      q.y += vy * dt;
      q.x = s.cx + Math.sin(q.t * 3 + q.ph) * Math.min(4, s.w * 0.06);
      if (q.y >= s.y + s.h - 1) {
        q.etapa++;
        if (q.etapa >= q.fun.list.length) { salpicar(q.fun, q.x, s.y + s.h - 1); if (q.c.parentNode) q.c.parentNode.removeChild(q.c); gotas.splice(i, 1); continue; }
        var sn = q.fun.list[q.etapa];
        q.y = sn.y + 1; q.x = sn.cx;
        q.c.setAttribute('r', (2 + 2.5 * sn.share).toFixed(1));
      }
      q.c.setAttribute('cx', q.x.toFixed(1)); q.c.setAttribute('cy', q.y.toFixed(1));
    }
  });
})();

// ---- efectos/latido.js ----
// Latido doble tipo corazón; frecuencia ∝ tamaño de la burbuja o del punto.
LifeFX.efecto('latido', { titulo: 'Latido', para: ['burbujas'], costo: 'muy bajo', descripcion: 'Laten como corazón; las más grandes laten más seguido.', aplicar: function (c) {
  c.marks.forEach(function (m, i) { m.style.transformBox = 'fill-box'; m.style.transformOrigin = 'center'; m.style.animation = 'fxLatido ' + Math.max(0.7, 2.6 - c.shares[i] * 6).toFixed(2) + 's ease-in-out infinite'; });
} });
(function () { var s = document.createElement('style'); s.textContent = '@keyframes fxLatido{0%,40%,100%{transform:scale(1)}10%{transform:scale(1.08)}20%{transform:scale(.98)}30%{transform:scale(1.05)}}'; document.head.appendChild(s); })();

// ---- efectos/linea-meta.js ----
// NUEVO · Línea de meta: dibuja la meta como línea de referencia con la zona de pico sombreada y marca máximo/mínimo.
// La meta viene de la MISMA configuración que el semáforo (nunca fija en el código):
//   en el SVG/panel: data-meta="90" data-min="88" data-max="100" data-direccion="mayor" data-kpi="ns"
//   o en JS: LifeFX.config({ umbrales: { ns: { meta: 90, direccion: 'mayor' } } }) y data-kpi="ns" en el panel.
//   o directa en píxeles: data-meta-y="62" (y en el SVG). Sin escala ni data-meta-y, reutiliza la línea ámbar
//   punteada existente (patrón de meta-pulso) como meta. Solo dibuja en la capa g.lifeL: nunca mueve ni tapa el dato
//   (a salvo de la lección de entrada: no toca transform de las marcas).
// Formato español de cifras (decisión 5): miles con punto, decimal con coma.
// (toLocaleString('es-MX') formatea anglosajón — "98.6" — así que no se usa.)
function fmtES01(n) {
  var r = Math.round(n * 10) / 10, neg = r < 0, a = Math.abs(r), dec = (r % 1 === 0) ? 0 : 1, f = a.toFixed(dec), p = f.split('.');
  return (neg ? '-' : '') + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (p[1] ? ',' + p[1] : '');
} // 0-1 decimales: 90 → "90", 98,6 → "98,6", 99,96 → "100" (como el toLocaleString anterior)
LifeFX.efecto('linea-meta', { titulo: 'Línea de meta', para: ['lineas', 'barras-v', 'barras-h'], costo: 'muy bajo', descripcion: 'Dibuja la línea de meta con la zona de pico sombreada y marca el máximo y el mínimo.', aplicar: function (c) {
  var u = c.u, svg = c.svg;
  if (svg.querySelector(':scope > g.lifeL [data-life-meta]')) return; // ya dibujada
  var host = svg.closest('[data-meta], [data-meta-y], [data-kpi]') || svg;
  function attr(k) { return svg.getAttribute('data-' + k) || (host !== svg && host.getAttribute ? host.getAttribute('data-' + k) : null); }
  var kpi = attr('kpi'), cfg = (kpi && LifeFX.umbrales && LifeFX.umbrales[kpi]) || {};
  var meta = attr('meta') != null ? +attr('meta') : (cfg.meta != null ? +cfg.meta : NaN);
  var min = attr('min') != null ? +attr('min') : NaN, max = attr('max') != null ? +attr('max') : NaN;
  var mayor = (attr('direccion') || cfg.direccion || 'mayor') !== 'menor';
  var W = u.num(svg, 'width') || svg.viewBox.baseVal.width || 300, H = u.num(svg, 'height') || svg.viewBox.baseVal.height || 190;
  // Caja del área de dibujo: unión de las marcas (sin la capa lifeL).
  var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  c.marks.forEach(function (m) { try { var b = m.getBBox(), mm = u.toLocal(m, svg); if (!mm) return; [[b.x, b.y], [b.x + b.width, b.y + b.height]].forEach(function (p) { var q = new DOMPoint(p[0], p[1]).matrixTransform(mm); x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }); } catch (e) { /* marca sin caja */ } });
  if (x0 > x1) { x0 = 8; x1 = W - 8; y0 = 8; y1 = H - 8; }
  var horizontal = c.tipo === 'barras-h';
  var pos = null; // coordenada de la meta (y en vertical, x en horizontal)
  if (attr('meta-y') != null) pos = +attr('meta-y');
  else if (attr('meta-x') != null) pos = +attr('meta-x');
  else if (isFinite(meta) && isFinite(min) && isFinite(max) && max > min) pos = horizontal ? x0 + (meta - min) / (max - min) * (x1 - x0) : y1 - (meta - min) / (max - min) * (y1 - y0);
  else { // sin escala: reutiliza la línea ámbar punteada existente como meta (patrón meta-pulso)
    [].forEach.call(svg.querySelectorAll('[data-meta], line[stroke-dasharray]'), function (l) {
      if (pos != null) return;
      if (l.hasAttribute('data-meta')) { pos = horizontal ? u.num(l, 'x1') : u.num(l, 'y1'); return; }
      if ((l.getAttribute('stroke') || '').toLowerCase() === '#eda100' && Math.abs(u.num(l, 'y1') - u.num(l, 'y2')) < 0.5) pos = u.num(l, 'y1');
    });
  }
  if (pos == null || !isFinite(pos)) return;
  var L = u.layer(svg);
  var shade, line, label;
  if (horizontal) {
    shade = u.mk('rect', { x: mayor ? pos : x0, y: y0, width: mayor ? Math.max(0, x1 - pos) : Math.max(0, pos - x0), height: y1 - y0, fill: '#1baf7a', 'fill-opacity': 0.08, 'data-life-meta': 'zona' });
    line = u.mk('line', { x1: pos, y1: y0, x2: pos, y2: y1, stroke: '#eda100', 'stroke-width': 1.5, 'stroke-dasharray': '5 4', 'data-life-meta': 'linea' });
    label = u.mk('text', { x: Math.min(pos + 4, x1 - 4), y: y0 + 12, 'font-size': 10.5, fill: '#a35b00', 'data-life-meta': 'etiqueta' });
  } else {
    shade = u.mk('rect', { x: x0, y: mayor ? y0 : pos, width: x1 - x0, height: mayor ? Math.max(0, pos - y0) : Math.max(0, y1 - pos), fill: '#1baf7a', 'fill-opacity': 0.08, 'data-life-meta': 'zona' });
    line = u.mk('line', { x1: x0, y1: pos, x2: x1, y2: pos, stroke: '#eda100', 'stroke-width': 1.5, 'stroke-dasharray': '5 4', 'data-life-meta': 'linea' });
    label = u.mk('text', { x: x1, y: Math.max(11, pos - 5), 'text-anchor': 'end', 'font-size': 10.5, fill: '#a35b00', 'data-life-meta': 'etiqueta' });
  }
  label.textContent = 'Meta ' + (isFinite(meta) ? fmtES01(meta) + (attr('unidad') || (attr('formato') === 'pct' || cfg.formato === 'pct' ? ' %' : '')) : '');
  L.appendChild(shade); L.appendChild(line); L.appendChild(label);
  // La línea de meta respira suave (patrón meta-pulso) para que el ojo la encuentre sin tapar el dato;
  // la zona y las marcas quedan fijas. body.noanim (reducir movimiento) apaga la animación por CSS.
  line.style.animation = 'lifeMetaPulso 2.4s ease-in-out infinite';
  line.classList.add('lifeMetaPulso');
  // Máximo y mínimo: en líneas se muestrean los puntos del trazo; en barras, la más alta y la más baja.
  function marca(px, py, txt, color) {
    var d = u.mk('circle', { cx: px.toFixed(1), cy: py.toFixed(1), r: 4, fill: color, stroke: '#fff', 'stroke-width': 1.5, 'data-life-meta': 'extremo' });
    L.appendChild(d);
    if (txt) { var t = u.mk('text', { x: (px + 7).toFixed(1), y: (py - 6).toFixed(1), 'font-size': 10, fill: color, 'data-life-meta': 'extremo' }); t.textContent = txt; L.appendChild(t); }
  }
  function valAt(y) { return isFinite(min) && isFinite(max) && max > min ? min + (y1 - y) / (y1 - y0) * (max - min) : null; }
  if (c.tipo === 'lineas') {
    var paths = c.marks.filter(function (m) { return m.tagName === 'path' || m.tagName === 'polyline'; });
    var pMax = null, pMin = null;
    paths.forEach(function (p) {
      var len = 0; try { len = p.getTotalLength(); } catch (e) { return; }
      for (var d = 0; d <= len; d += Math.max(2, len / 80)) { var pt; try { pt = p.getPointAtLength(d); } catch (e) { continue; } if (!pMax || pt.y < pMax.y) pMax = pt; if (!pMin || pt.y > pMin.y) pMin = pt; }
    });
    if (pMax) { var v = valAt(pMax.y); marca(pMax.x, pMax.y, v != null ? 'máx ' + fmtES01(v) + ' %' : 'máx', '#1baf7a'); }
    if (pMin && (!pMax || Math.abs(pMin.x - pMax.x) > 12 || Math.abs(pMin.y - pMax.y) > 12)) { var v2 = valAt(pMin.y); marca(pMin.x, pMin.y, v2 != null ? 'mín ' + fmtES01(v2) + ' %' : 'mín', '#e34948'); }
  } else if (c.tipo === 'barras-v' || c.tipo === 'barras-h') {
    var best = null, worst = null;
    c.marks.forEach(function (r) {
      var s = horizontal ? u.num(r, 'width') : u.num(r, 'height');
      if (!best || s > best.s) best = { s: s, r: r }; if (!worst || s < worst.s) worst = { s: s, r: r };
    });
    if (best) { var cx = u.num(best.r, 'x') + u.num(best.r, 'width') / 2; marca(cx, horizontal ? u.num(best.r, 'y') + u.num(best.r, 'height') / 2 : u.num(best.r, 'y'), 'máx', '#1baf7a'); }
    if (worst && worst !== best) { var cx2 = u.num(worst.r, 'x') + u.num(worst.r, 'width') / 2; marca(cx2, horizontal ? u.num(worst.r, 'y') + u.num(worst.r, 'height') / 2 : u.num(worst.r, 'y'), 'mín', '#e34948'); }
  }
} });
(function () { var s = document.createElement('style'); s.textContent = '@keyframes lifeMetaPulso{0%,100%{opacity:1}50%{opacity:.55}}'; document.head.appendChild(s); })();

// ---- efectos/liquido.js ----
// Superficie de líquido ondulando en la punta de cada barra vertical. Amplitud y velocidad ∝ participación.
LifeFX.efecto('liquido', { titulo: 'Líquido', para: ['barras-v'], costo: 'bajo', descripcion: 'Ola en la punta de cada barra; la barra con más peso ondula más.', aplicar: function (c) {
  var u = c.u, defs = u.defs(c.svg);
  c.marks.forEach(function (r, i) {
    var x = u.num(r, 'x'), y = u.num(r, 'y'), w = u.num(r, 'width'), h = u.num(r, 'height'); if (w < 4 || h < 6) return;
    var share = c.shares[i], amp = Math.min(h * 0.25, 1.5 + share * 22), id = u.id('cl');
    var cp = u.mk('clipPath', { id: id }); cp.appendChild(u.mk('rect', { x: x, y: y, width: w, height: h })); defs.appendChild(cp);
    var g = u.mk('g', { 'clip-path': 'url(#' + id + ')' }), L = w * 2, d = 'M' + (x - L) + ',' + (y + amp * 2.2);
    for (var k = 0; k <= 8; k++) d += ' Q' + (x - L + (k + 0.25) * L / 4) + ',' + (y + (k % 2 ? amp * 3.4 : amp)) + ' ' + (x - L + (k + 0.5) * L / 4) + ',' + (y + amp * 2.2);
    d += ' L' + (x + L * 2) + ',' + (y - 2) + ' L' + (x - L) + ',' + (y - 2) + ' Z';
    var wave = u.mk('path', { d: d, fill: '#fff', 'fill-opacity': 0.55 });
    wave.appendChild(u.mk('animateTransform', { attributeName: 'transform', type: 'translate', from: '0 0', to: (L / 2) + ' 0', dur: Math.max(0.6, 2.6 - share * 8).toFixed(2) + 's', repeatCount: 'indefinite' }));
    g.appendChild(wave); u.layer(c.svg).appendChild(g);
  });
} });

// ---- efectos/llenado.js ----
// Las barras se vuelven a llenar desde la base cada cierto tiempo; la más alta se llena más rápido.
LifeFX.efecto('llenado', { titulo: 'Llenado', para: ['barras-v'], costo: 'bajo', descripcion: 'Cada barra se rellena desde la base en ciclos; más peso, ciclo más rápido.', aplicar: function (c) {
  var u = c.u, defs = u.defs(c.svg);
  c.marks.forEach(function (r, i) {
    var x = u.num(r, 'x'), y = u.num(r, 'y'), w = u.num(r, 'width'), h = u.num(r, 'height'); if (w < 3 || h < 4) return;
    var id = u.id('fl'), g = u.mk('linearGradient', { id: id, x1: 0, y1: 1, x2: 0, y2: 0 });
    g.appendChild(u.mk('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': 0 })); g.appendChild(u.mk('stop', { offset: '0.85', 'stop-color': '#fff', 'stop-opacity': 0.5 })); g.appendChild(u.mk('stop', { offset: '1', 'stop-color': '#fff', 'stop-opacity': 0 })); defs.appendChild(g);
    var o = u.mk('rect', { x: x, y: y + h, width: w, height: 0, fill: 'url(#' + id + ')' }), dur = Math.max(1.2, 4 - c.shares[i] * 14).toFixed(2) + 's';
    o.appendChild(u.mk('animate', { attributeName: 'height', values: '0;' + h + ';' + h, keyTimes: '0;0.7;1', dur: dur, repeatCount: 'indefinite' }));
    o.appendChild(u.mk('animate', { attributeName: 'y', values: (y + h) + ';' + y + ';' + y, keyTimes: '0;0.7;1', dur: dur, repeatCount: 'indefinite' }));
    u.layer(c.svg).appendChild(o);
  });
} });

// ---- efectos/lluvia-linea.js ----
// Lluvia ligera que cae sobre la línea y salpica más donde el valor es más alto.
// Gotas finas caen verticalmente desde arriba del SVG hasta la línea; al tocarla
// estalla una salpicadura (anillo que se expande y se desvanece). La frecuencia de
// gotas en cada punto es proporcional al valor de la línea ahí (punto más alto =
// valor mayor = más salpicaduras y salpicaduras más grandes).
(function () {
  var lluvias = [];
  LifeFX.efecto('lluvia-linea', { titulo: 'Lluvia sobre la línea', para: ['lineas'], costo: 'bajo', descripcion: 'Gotas caen sobre la línea y salpican; donde el valor es mayor caen más gotas y las salpicaduras son más grandes.', aplicar: function (c) {
    var u = c.u;
    c.marks.forEach(function (p) {
      var L = 0; try { L = p.getTotalLength(); } catch (e) { return; }
      if (L < 60) return;
      var N = 28, pts = [], ys = [], i, pt;
      for (i = 0; i < N; i++) { pt = p.getPointAtLength(L * i / (N - 1)); pts.push(pt); ys.push(pt.y); }
      var yMax = Math.max.apply(null, ys), yMin = Math.min.apply(null, ys), span = Math.max(1, yMax - yMin);
      var ws = pts.map(function (q) { return 0.15 + (yMax - q.y) / span; });
      var col = p.getAttribute('stroke') || '#2a78d6';
      lluvias.push({ svg: c.svg, p: p, L: L, pts: pts, ws: ws, yMax: yMax, span: span, col: col, acc: Math.random(), drops: [], spl: [], layer: u.layer(c.svg) });
    });
  } });
  LifeFX.tick(function (dt) {
    for (var i = lluvias.length - 1; i >= 0; i--) {
      var q = lluvias[i];
      if (!q.p.isConnected) { lluvias.splice(i, 1); continue; }
      if (!LifeFX.u.vis(q.svg)) continue;
      // Generar gotas: frecuencia ∝ valor medio de la línea (más alta = más lluvia).
      q.acc += dt * 7;
      while (q.acc >= 1 && q.drops.length < 28) {
        q.acc -= 1;
        var k = LifeFX.u.wpick(q.ws), pt = q.pts[k], v = (q.yMax - pt.y) / q.span;
        var y0 = Math.max(2, pt.y - 110 - Math.random() * 60);
        var g = LifeFX.u.mk('line', { x1: pt.x.toFixed(1), x2: pt.x.toFixed(1), y1: y0.toFixed(1), y2: (y0 + 7).toFixed(1), stroke: '#8fb8e8', 'stroke-width': 1.2, opacity: 0.75 });
        q.layer.appendChild(g);
        q.drops.push({ el: g, x: pt.x, y: y0, ty: pt.y, vy: 200 + Math.random() * 90, v: v });
      }
      for (var j = q.drops.length - 1; j >= 0; j--) {
        var d = q.drops[j];
        d.y += d.vy * dt;
        if (d.y >= d.ty) {
          if (d.el.parentNode) d.el.parentNode.removeChild(d.el);
          q.drops.splice(j, 1);
          if (q.spl.length < 14) {
            var r0 = LifeFX.u.mk('circle', { cx: d.x.toFixed(1), cy: d.ty.toFixed(1), r: 1, fill: 'none', stroke: q.col, 'stroke-width': 1.4, opacity: 0.8 });
            q.layer.appendChild(r0);
            q.spl.push({ el: r0, t: 0, life: 0.45, maxR: 3 + 6 * d.v });
          }
          continue;
        }
        d.el.setAttribute('y1', d.y.toFixed(1)); d.el.setAttribute('y2', (d.y + 7).toFixed(1));
      }
      for (var m = q.spl.length - 1; m >= 0; m--) {
        var s = q.spl[m]; s.t += dt;
        if (s.t >= s.life) { if (s.el.parentNode) s.el.parentNode.removeChild(s.el); q.spl.splice(m, 1); continue; }
        var f = s.t / s.life;
        s.el.setAttribute('r', (1 + f * s.maxR).toFixed(1));
        s.el.setAttribute('opacity', (0.8 * (1 - f)).toFixed(2));
      }
    }
  });
})();

// ---- efectos/marea-dona.js ----
// Una marea luminosa barre el anillo; su velocidad y su grosor son ∝ al % de la rebanada por la que pasa.
// Mecanismo: un arco brillante (path en la capa lifeL) recorre el anillo; al cruzar cada rebanada cambia su
// velocidad angular y su stroke-width según la participación de esa rebanada.
// Distinto de contorno-vivo (dash por el borde de cada parte), orbita (partículas), ondas-radiales (anillos que se expanden)
// y reflector (iluminar una parte fija).
(function () {
  var tides = [];
  LifeFX.efecto('marea-dona', { titulo: 'Marea luminosa', para: ['arcos'], costo: 'bajo', descripcion: 'Un arco brillante barre el anillo; sobre la rebanada grande corre más rápido y más grueso.', aplicar: function (c) {
    var u = c.u, ctr = u.center(c.marks, c.svg), cx = ctr[0], cy = ctr[1], R = ctr[2], mid = R * 0.8;
    var halo = u.mk('path', { fill: 'none', stroke: '#ffffff', 'stroke-width': 14, 'stroke-linecap': 'round', class: 'lifeMareaHalo' });
    var arc = u.mk('path', { fill: 'none', stroke: '#ffffff', 'stroke-width': 6, 'stroke-linecap': 'round', class: 'lifeMarea' });
    u.layer(c.svg).appendChild(halo); u.layer(c.svg).appendChild(arc);
    var spans = [], a = -Math.PI / 2; // rangos angulares acumulados por participación, desde arriba
    c.shares.forEach(function (s) { spans.push([a, a + s * Math.PI * 2]); a += s * Math.PI * 2; });
    tides.push({ svg: c.svg, arc: arc, halo: halo, cx: cx, cy: cy, mid: mid, R: R, spans: spans, shares: c.shares.slice(), th: -Math.PI / 2, u: u });
  } });
  function arcD(cx, cy, r, a0, a1) {
    return 'M' + (cx + r * Math.cos(a0)).toFixed(1) + ' ' + (cy + r * Math.sin(a0)).toFixed(1) +
      ' A' + r.toFixed(1) + ' ' + r.toFixed(1) + ' 0 0 1 ' + (cx + r * Math.cos(a1)).toFixed(1) + ' ' + (cy + r * Math.sin(a1)).toFixed(1);
  }
  LifeFX.tick(function (dt) {
    for (var i = tides.length - 1; i >= 0; i--) {
      var t = tides[i]; if (!t.arc.isConnected) { tides.splice(i, 1); continue; } if (!t.u.vis(t.svg)) continue;
      var th = ((t.th % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), sh = 0.1, j;
      for (j = 0; j < t.spans.length; j++) {
        var s0 = ((t.spans[j][0] % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), s1 = s0 + (t.spans[j][1] - t.spans[j][0]);
        var tt = th < s0 ? th + Math.PI * 2 : th;
        if (tt >= s0 && tt < s1) { sh = t.shares[j]; break; }
      }
      t.th += dt * (0.35 + sh * 2.2); // velocidad ∝ participación de la rebanada que cruza
      var w = t.R * (0.10 + sh * 0.38), d = arcD(t.cx, t.cy, t.mid, t.th, t.th + 0.55); // grosor ∝ participación
      t.arc.setAttribute('d', d); t.arc.setAttribute('stroke-width', w.toFixed(1));
      t.halo.setAttribute('d', d); t.halo.setAttribute('stroke-width', (w * 2.2).toFixed(1));
    }
  });
})();
(function () { var s = document.createElement('style'); s.textContent = '.lifeMarea{animation:lifeMarea 1.6s ease-in-out infinite}@keyframes lifeMarea{0%,100%{opacity:.55}50%{opacity:.95}}.lifeMareaHalo{animation:lifeMareaHalo 1.6s ease-in-out infinite}@keyframes lifeMareaHalo{0%,100%{opacity:.12}50%{opacity:.3}}'; document.head.appendChild(s); })();

// ---- efectos/meta-pulso.js ----
// NUEVO · Barras contra la meta: las que quedan debajo de la línea de meta laten en rojo; las que la superan destellan en verde.
// La meta se detecta como una línea horizontal punteada ámbar (#eda100) o un elemento con data-meta.
LifeFX.efecto('meta-pulso', { titulo: 'Barras contra la meta', para: ['barras-v'], costo: 'muy bajo', descripcion: 'Debajo de la meta laten en rojo; arriba destellan en verde.', aplicar: function (c) {
  var u = c.u, gy = null;
  [].forEach.call(c.svg.querySelectorAll('[data-meta], line[stroke-dasharray]'), function (l) {
    if (gy != null) return;
    if (l.hasAttribute('data-meta')) { gy = +l.getAttribute('data-meta') || u.num(l, 'y1'); return; }
    if ((l.getAttribute('stroke') || '').toLowerCase() === '#eda100' && Math.abs(u.num(l, 'y1') - u.num(l, 'y2')) < 0.5) gy = u.num(l, 'y1');
  });
  if (gy == null) return;
  c.marks.forEach(function (r, i) {
    var top = u.num(r, 'y'), d = ((i * 0.13) % 1.2).toFixed(2) + 's';
    r.classList.add(top > gy + 1 ? 'lifeBajo' : 'lifeArriba'); r.style.animationDelay = d;
  });
} });
(function () { var s = document.createElement('style'); s.textContent =
  '.lifeBajo{animation:lifeBajo 1.8s ease-in-out infinite}@keyframes lifeBajo{0%,100%{filter:none}50%{filter:drop-shadow(0 0 6px rgba(227,73,72,.95)) saturate(1.3)}}' +
  '.lifeArriba{animation:lifeArriba 4s ease-in-out infinite}@keyframes lifeArriba{0%,85%,100%{filter:none}92%{filter:brightness(1.25) drop-shadow(0 0 6px rgba(27,175,122,.95))}}';
  document.head.appendChild(s); })();

// ---- efectos/mosaico-ola.js ----
// Ola de brillo que recorre los bloques del treemap según su posición; brillo ∝ área.
LifeFX.efecto('mosaico-ola', { titulo: 'Ola de mosaico', para: ['treemap', 'calor'], costo: 'muy bajo', descripcion: 'Una ola de luz cruza los bloques; los grandes brillan más.', aplicar: function (c) {
  var u = c.u, mx = 0, wm = Math.max.apply(null, c.ws.concat([1e-6]));
  c.marks.forEach(function (r) { mx = Math.max(mx, u.num(r, 'x')); });
  c.marks.forEach(function (r, i) { r.style.setProperty('--fxg', (1.1 + 0.35 * c.ws[i] / wm).toFixed(2)); r.style.animation = 'lifeHeat 4.5s ease-in-out ' + ((u.num(r, 'x') / (mx || 1)) * 1.5).toFixed(2) + 's infinite'; });
} });
(function () { var s = document.createElement('style'); s.textContent = '@keyframes lifeHeat{0%,78%,100%{filter:none}88%{filter:brightness(var(--fxg,1.2)) saturate(1.25)}}'; document.head.appendChild(s); })();

// ---- efectos/nube-dispersion.js ----
// Nube de dispersión: los puntos derivan suavemente; la deriva es ∝ al radio del punto.
// OJO: la entrada global deja 'anPop ... both' en cada círculo y su fotograma final
// (transform:scale(1)) taparía cualquier translate; por eso aplicar pone animation:'none'
// (igual que ondas/latido sustituyen la animación de entrada) y el tick mueve el punto.
(function () {
  var nubes = [];
  LifeFX.efecto('nube-dispersion', { titulo: 'Nube a la deriva', para: ['dispersion'], costo: 'bajo', descripcion: 'Los puntos derivan suavemente; los más grandes derivan más.', aplicar: function (c) {
    var u = c.u, pts = [];
    c.marks.forEach(function (m) { var r = u.num(m, 'r') || 3; m.style.animation = 'none'; pts.push({ m: m, amp: 0.55 * r, wx: 0.5 + Math.random() * 0.5, wy: 0.45 + Math.random() * 0.5, px: Math.random() * 6.28, py: Math.random() * 6.28 }); });
    if (pts.length) nubes.push({ svg: c.svg, pts: pts, t: Math.random() * 10, u: u });
  } });
  LifeFX.tick(function (dt) {
    for (var i = nubes.length - 1; i >= 0; i--) {
      var q = nubes[i]; if (!q.pts[0].m.isConnected) { nubes.splice(i, 1); continue; } if (!q.u.vis(q.svg)) continue;
      q.t += dt;
      q.pts.forEach(function (p) { p.m.style.transform = 'translate(' + (p.amp * Math.sin(q.t * p.wx + p.px)).toFixed(2) + 'px,' + (p.amp * Math.cos(q.t * p.wy + p.py)).toFixed(2) + 'px)'; });
    }
  });
})();

// ---- efectos/numero-tiembla.js ----
// NUEVO · Número tiembla: la cifra en rojo tiembla sin parar (temblor continuo de 1-2 px, sin cambiar el layout).
// Solo actúa sobre números en rojo; los demás quedan quietos. Respeta "reducir movimiento".
// Activar con LifeFX.config({ mapa: { cifras: 'numero-tiembla' } }) o por elemento con data-fx-num="numero-tiembla".
LifeFX.esRojoCifra = LifeFX.esRojoCifra || function (el) {
  if (!el) return false;
  if (el.getAttribute && el.getAttribute('data-rojo') === '1') return true;
  var cls = (el.getAttribute && el.getAttribute('class')) || '';
  if (/(rojo|neg|mal|danger)/i.test(cls)) return true;
  try { var c = window.getComputedStyle(el).color.match(/\d+(\.\d+)?/g); if (c && +c[0] > 150 && +c[1] < 110 && +c[2] < 110) return true; } catch (e) { /* sin color computable */ }
  return false;
};
LifeFX.tiembla = function (el) {
  if (!el || el.__fxTiembla || (window.LifeFX && LifeFX.reducido)) return;
  if (!LifeFX.esRojoCifra(el)) return;
  el.__fxTiembla = 1;
  if (window.getComputedStyle(el).display === 'inline') el.style.display = 'inline-block'; // el transform no aplica a inline; a bloque no se le toca el layout
  el.classList.add('lifeTiembla');
};
LifeFX.efecto('numero-tiembla', { titulo: 'Número tiembla', para: ['cifras'], costo: 'muy bajo', descripcion: 'La cifra en rojo tiembla sin parar; si no está en rojo, no se mueve.', aplicar: function (c) {
  var root = (c && c.svg && c.svg.closest) ? (c.svg.closest('.panel') || document) : document;
  [].forEach.call(root.querySelectorAll('.kpi .v, .scv, .gv .v, .big, .kv'), function (el, i) { el.style.animationDelay = (i * 0.13).toFixed(2) + 's'; LifeFX.tiembla(el); });
} });
(function () { var s = document.createElement('style'); s.textContent = '.lifeTiembla{animation:lifeTiembla .18s linear infinite}@keyframes lifeTiembla{0%{transform:translate(0,0)}20%{transform:translate(-1.5px,.5px)}40%{transform:translate(1.5px,-1px)}60%{transform:translate(-1px,-.5px)}80%{transform:translate(1px,1px)}100%{transform:translate(0,0)}}'; document.head.appendChild(s); })();

// ---- efectos/odometro.js ----
// NUEVO · Odómetro: los dígitos de una cifra ruedan hasta su valor (alternativa al contador). Activar con LifeFX.config({ mapa: { cifras: 'odometro' } })
// o por elemento con data-fx-num="odometro". Conserva el texto final exacto para lectores de pantalla.
LifeFX.odometro = function (el) {
  if (el.__odo) return; var txt = el.textContent; if (!/\d/.test(txt)) return; el.__odo = 1;
  el.setAttribute('aria-label', txt); el.textContent = '';
  var wrap = document.createElement('span'); wrap.className = 'odo'; wrap.setAttribute('aria-hidden', 'true');
  txt.split('').forEach(function (ch, i) {
    if (!/\d/.test(ch)) { var s = document.createElement('span'); s.textContent = ch; wrap.appendChild(s); return; }
    var col = document.createElement('span'); col.className = 'odoC'; var strip = document.createElement('span'); strip.className = 'odoS';
    for (var d = 0; d <= 9; d++) { var x = document.createElement('span'); x.textContent = d; strip.appendChild(x); }
    col.appendChild(strip); wrap.appendChild(col);
    strip.style.transform = 'translateY(0)'; setTimeout(function () { strip.style.transition = 'transform ' + (0.9 + i * 0.07).toFixed(2) + 's cubic-bezier(.2,.9,.25,1.05)'; strip.style.transform = 'translateY(-' + (+ch) + '0%)'; }, 30);
  });
  el.appendChild(wrap);
};
LifeFX.efecto('odometro', { titulo: 'Odómetro', para: ['cifras'], costo: 'muy bajo', descripcion: 'Los dígitos ruedan hasta su valor. Se activa con data-fx-num="odometro" o mapa.cifras.', aplicar: function (c) {
  // Nota: FX.decorar solo corre sobre SVG, así que este aplicar casi nunca se invoca por decorar;
  // el registro existe para que el catálogo sea veraz. En vivo el odómetro corre por el scan de
  // entrada.js (countUp → LifeFX.odometro) y el hook de cifras de la galería.
  var root = (c && c.svg && c.svg.closest) ? (c.svg.closest('.panel') || document) : document;
  [].forEach.call(root.querySelectorAll('.kpi .v, .scv, .gv .v, .big, .kv'), function (el) { LifeFX.odometro(el); });
} });
(function () { var s = document.createElement('style'); s.textContent = '.odo{display:inline-flex}.odoC{display:inline-block;height:1.15em;overflow:hidden;line-height:1.15em}.odoS{display:flex;flex-direction:column}.odoS span{height:1.15em}'; document.head.appendChild(s); })();

// ---- efectos/ola-bloque.js ----
// Ola-bloque: una ola de brillo recorre los bloques en orden de tamaño (del
// más grande al más chico) y cada bloque se ilumina al paso de la ola. El
// pico de brillo es proporcional a la participación: los bloques grandes
// brillan más. Mecanismo: LifeFX.tick mueve un frente gaussiano por el rango
// de tamaño y escribe style.filter (brightness + saturate) en cada cuadro;
// distinto de mosaico-ola (animación CSS ordenada por posición x) y de
// reflector (un solo bloque al azar). El filtro actúa solo sobre el rect del
// bloque, nunca sobre su texto, y se retira cuando la ola ya pasó.
(function () {
  var olas = [];
  LifeFX.efecto('ola-bloque', { titulo: 'Ola de bloque', para: ['treemap'], costo: 'bajo', descripcion: 'Una ola de brillo recorre los bloques del más grande al más chico; los grandes brillan más.', aplicar: function (c) {
    var wm = Math.max.apply(null, c.ws.concat([1e-6]));
    var orden = c.marks.map(function (r, i) { return i; }).sort(function (a, b) { return c.ws[b] - c.ws[a]; });
    olas.push({ svg: c.svg, marks: orden.map(function (i) { return c.marks[i]; }), k: orden.map(function (i) { return c.ws[i] / wm; }), t: Math.random() * 2, u: c.u });
  } });
  LifeFX.tick(function (dt) {
    for (var i = olas.length - 1; i >= 0; i--) {
      var o = olas[i]; if (!o.marks[0].isConnected) { olas.splice(i, 1); continue; } if (!o.u.vis(o.svg)) continue;
      o.t += dt; var n = o.marks.length, pos = ((o.t % 5) / 5) * (n + 1) - 0.5;
      o.marks.forEach(function (r, rango) {
        var d = pos - rango, g = Math.exp(-(d * d) / (2 * 0.55 * 0.55));
        if (g < 0.02) { if (r.style.filter) r.style.filter = ''; return; }
        var pico = 0.55 * (0.55 + 0.45 * o.k[rango]);
        r.style.filter = 'brightness(' + (1 + pico * g).toFixed(3) + ') saturate(' + (1 + 0.25 * g).toFixed(3) + ')';
      });
    }
  });
})();

// ---- efectos/ondas-radiales.js ----
// Anillos concéntricos que salen del centro de una gráfica radial, como sonar.
(function () {
  var rs = [];
  LifeFX.efecto('ondas-radiales', { titulo: 'Sonar', para: ['radial', 'arcos'], costo: 'muy bajo', descripcion: 'Anillos que salen del centro como un sonar.', aplicar: function (c) { var k = c.u.center(c.marks, c.svg); rs.push({ svg: c.svg, c: k, t: 0, u: c.u, m: c.marks[0] }); } });
  LifeFX.tick(function (dt) {
    for (var i = rs.length - 1; i >= 0; i--) {
      var s = rs[i]; if (!s.m.isConnected) { rs.splice(i, 1); continue; } if (!s.u.vis(s.svg)) continue; s.t -= dt; if (s.t > 0) continue; s.t = 1.1;
      var ring = s.u.mk('circle', { cx: s.c[0], cy: s.c[1], r: s.c[2] * 0.25, fill: 'none', stroke: '#2a78d6', 'stroke-width': 2, class: 'fxSonar' }); s.u.layer(s.svg).appendChild(ring); setTimeout(function () { if (ring.parentNode) ring.parentNode.removeChild(ring); }, 2200);
    }
  });
})();
(function () { var s = document.createElement('style'); s.textContent = '.fxSonar{transform-box:fill-box;transform-origin:center;animation:fxSonar 2.1s ease-out forwards}@keyframes fxSonar{0%{opacity:.7;transform:scale(1)}100%{opacity:0;transform:scale(4.2)}}'; document.head.appendChild(s); })();

// ---- efectos/ondas.js ----
// Ondas que salen de las burbujas, como gotas en agua; la frecuencia de cada burbuja ∝ su área. Además flotan.
(function () {
  var grupos = [];
  LifeFX.efecto('ondas', { titulo: 'Ondas', para: ['burbujas'], costo: 'bajo', descripcion: 'Ondas desde las burbujas; las grandes emiten más. Flotan suavemente.', aplicar: function (c) {
    grupos.push({ svg: c.svg, cs: c.marks, ws: c.ws, t: 0, u: c.u });
    c.marks.forEach(function (m) { m.style.transformBox = 'fill-box'; m.style.transformOrigin = 'center'; m.style.animation = 'lifeFloat ' + (2.6 + Math.random() * 2).toFixed(1) + 's ease-in-out ' + (-Math.random() * 3).toFixed(1) + 's infinite'; });
  } });
  LifeFX.tick(function (dt) {
    for (var i = grupos.length - 1; i >= 0; i--) {
      var q = grupos[i], u = q.u; if (!q.cs[0].isConnected) { grupos.splice(i, 1); continue; } if (!u.vis(q.svg)) continue;
      q.t -= dt; if (q.t > 0) continue; q.t = 0.35;
      var c = q.cs[u.wpick(q.ws)], m = u.toLocal(c, q.svg) || q.svg.createSVGMatrix(), p = new DOMPoint(u.num(c, 'cx'), u.num(c, 'cy')).matrixTransform(m);
      var ring = u.mk('circle', { cx: p.x, cy: p.y, r: u.num(c, 'r'), fill: 'none', stroke: c.getAttribute('fill') || '#2a78d6', 'stroke-width': 2.5, class: 'lifeRipple' });
      u.layer(q.svg).appendChild(ring); setTimeout(function () { if (ring.parentNode) ring.parentNode.removeChild(ring); }, 1600);
    }
  });
})();

// ---- efectos/orbita.js ----
// Partículas que orbitan por cada gajo/anillo; cantidad ∝ participación.
LifeFX.efecto('orbita', { titulo: 'Órbita', para: ['arcos', 'radial'], costo: 'medio', descripcion: 'Partículas giran dentro de cada gajo; el gajo grande lleva más.', aplicar: function (c) {
  var ctr = c.u.center(c.marks, c.svg); c.marks.forEach(function (m, i) { var em = c.u.emisor(c.svg, m, 'orbit', { ctr: ctr }); if (em) em.rate = 0.3 + 8 * c.shares[i]; });
} });

// ---- efectos/parpadeo.js ----
// Celdas que parpadean como estrellas; cuanto más intensa la celda, más seguido parpadea.
LifeFX.efecto('parpadeo', { titulo: 'Titileo', para: ['calor', 'treemap'], costo: 'muy bajo', descripcion: 'Las celdas titilan como estrellas; las intensas, más seguido.', aplicar: function (c) {
  var wm = Math.max.apply(null, c.ws.concat([1e-6]));
  c.marks.forEach(function (r, i) { var k = c.ws[i] / wm; r.style.animation = 'fxTit ' + (1.6 + (1 - k) * 5).toFixed(2) + 's ease-in-out ' + (-Math.random() * 5).toFixed(2) + 's infinite'; });
} });
(function () { var s = document.createElement('style'); s.textContent = '@keyframes fxTit{0%,70%,100%{filter:none}80%{filter:brightness(1.45) drop-shadow(0 0 4px rgba(255,255,255,.9))}}'; document.head.appendChild(s); })();

// ---- efectos/particulas-flujo.js ----
// Partículas por cada banda de un flujo (sankey). La gráfica marca cada banda con data-flow="xa,ya,xb,yb,h".
// Proporción: la tasa de partículas crece con el grosor (volumen) de la banda.
LifeFX.efecto('particulas-flujo', { titulo: 'Partículas de flujo', para: ['flujo'], costo: 'medio', descripcion: 'Bolitas que recorren cada banda; más volumen, más bolitas.', aplicar: function () { /* el motor del núcleo las genera */ } });

// ---- efectos/pulso-banda.js ----
// Las bandas del flujo laten con un degradado que viaja de origen a destino; alternativa sin partículas.
LifeFX.efecto('pulso-banda', { titulo: 'Pulso de banda', para: ['flujo'], costo: 'bajo', descripcion: 'Un brillo viaja por cada banda del origen al destino; las gruesas, más intenso.', aplicar: function (c) {
  var u = c.u, w = u.num(c.svg, 'width'), tot = 0; c.marks.forEach(function (p) { tot += +(p.getAttribute('data-flow') || '0,0,0,0,0').split(',')[4]; });
  c.marks.forEach(function (p) {
    var f = (p.getAttribute('data-flow') || '').split(',').map(Number), id = u.id('pb'), g = u.mk('linearGradient', { id: id, gradientUnits: 'userSpaceOnUse', x1: f[0] - 120, x2: f[0], y1: 0, y2: 0 }), op = (0.25 + 0.6 * f[4] / (tot || 1)).toFixed(2);
    [['0', 0], ['0.5', op], ['1', 0]].forEach(function (s) { g.appendChild(u.mk('stop', { offset: s[0], 'stop-color': '#fff', 'stop-opacity': s[1] })); });
    g.appendChild(u.mk('animateTransform', { attributeName: 'gradientTransform', type: 'translate', from: '0 0', to: (f[2] - f[0] + 120) + ' 0', dur: '2.4s', repeatCount: 'indefinite' }));
    u.defs(c.svg).appendChild(g); u.layer(c.svg).appendChild(u.mk('path', { d: p.getAttribute('d'), fill: 'url(#' + id + ')' }));
  });
} });

// ---- efectos/pulso-cola.js ----
// Un punto de luz recorre cada barra horizontal hasta su extremo y estalla; velocidad ∝ participación.
(function () {
  var ps = [];
  LifeFX.efecto('pulso-cola', { titulo: 'Pulso a la meta', para: ['barras-h'], costo: 'bajo', descripcion: 'Un destello corre por la barra y estalla al final; las largas corren más rápido.', aplicar: function (c) {
    var u = c.u; c.marks.forEach(function (r, i) {
      var x = u.num(r, 'x'), y = u.num(r, 'y') + u.num(r, 'height') / 2, w = u.num(r, 'width'); if (w < 10) return;
      var dot = u.mk('circle', { cx: x, cy: y, r: Math.min(5, u.num(r, 'height') / 2.5), fill: '#fff', opacity: 0, class: 'lifeComet' }); u.layer(c.svg).appendChild(dot);
      ps.push({ svg: c.svg, dot: dot, x: x, y: y, w: w, t: -Math.random(), d: Math.max(0.6, 2.4 - c.shares[i] * 6), u: u });
    });
  } });
  LifeFX.tick(function (dt) {
    for (var i = ps.length - 1; i >= 0; i--) {
      var p = ps[i]; if (!p.dot.isConnected) { ps.splice(i, 1); continue; } if (!p.u.vis(p.svg)) continue;
      p.t += dt / p.d; if (p.t > 1.4) p.t = -0.3;
      var k = Math.max(0, Math.min(1, p.t)); p.dot.setAttribute('cx', (p.x + p.w * k).toFixed(1));
      p.dot.setAttribute('opacity', p.t < 0 ? 0 : (p.t <= 1 ? 0.95 : Math.max(0, 1 - (p.t - 1) * 3)).toFixed(2));
      p.dot.setAttribute('r', (p.t > 1 ? 4 + (p.t - 1) * 18 : 4).toFixed(1));
    }
  });
})();

// ---- efectos/puntos-salto.js ----
// Los puntos de la serie saltan uno tras otro como una ola (útil en líneas con marcadores).
LifeFX.efecto('puntos-salto', { titulo: 'Ola de puntos', para: ['lineas'], costo: 'muy bajo', descripcion: 'Los marcadores de la serie saltan en secuencia, de izquierda a derecha.', aplicar: function (c) {
  var pts = [].slice.call(c.svg.querySelectorAll('circle')).filter(function (k) { return !k.closest('.lifeL') && +k.getAttribute('r') <= 7; }).sort(function (a, b) { return a.getAttribute('cx') - b.getAttribute('cx'); });
  pts.forEach(function (k, i) { k.style.transformBox = 'fill-box'; k.style.transformOrigin = 'center'; k.style.animation = 'fxSalto 3s ease-in-out ' + (i * 0.12).toFixed(2) + 's infinite'; });
} });
(function () { var s = document.createElement('style'); s.textContent = '@keyframes fxSalto{0%,30%,100%{transform:translateY(0) scale(1)}12%{transform:translateY(-7px) scale(1.25)}}'; document.head.appendChild(s); })();

// ---- efectos/radar.js ----
// Barrido tipo radar que gira sobre gráficas radiales (reloj, anillos).
LifeFX.efecto('radar', { titulo: 'Radar', para: ['radial'], costo: 'muy bajo', descripcion: 'Haz de luz que gira sobre el centro de la gráfica radial.', aplicar: function (c) {
  var u = c.u, ctr = u.center(c.marks, c.svg), cx = ctr[0], cy = ctr[1], R = ctr[2], id = u.id('rd');
  var g = u.mk('radialGradient', { id: id }); g.appendChild(u.mk('stop', { offset: '0', 'stop-color': '#2a78d6', 'stop-opacity': 0 })); g.appendChild(u.mk('stop', { offset: '1', 'stop-color': '#2a78d6', 'stop-opacity': 0.35 })); u.defs(c.svg).appendChild(g);
  var a = 0.6, wedge = u.mk('path', { d: 'M' + cx + ',' + cy + ' L' + (cx + R) + ',' + cy + ' A' + R + ',' + R + ' 0 0 1 ' + (cx + R * Math.cos(a)) + ',' + (cy + R * Math.sin(a)) + ' Z', fill: 'url(#' + id + ')' });
  wedge.appendChild(u.mk('animateTransform', { attributeName: 'transform', type: 'rotate', from: '0 ' + cx + ' ' + cy, to: '360 ' + cx + ' ' + cy, dur: '5s', repeatCount: 'indefinite' }));
  u.layer(c.svg).appendChild(wedge);
} });

// ---- efectos/rebanada-dona.js ----
// La rebanada más grande se separa del centro un momento, como si la jalaran, en turnos según su %.
// Mecanismo: animación CSS propia por rebanada (style.animation, keyframes lifeRebanada) con la dirección
// y la distancia de cada tirón en custom properties --fxdx/--fxdy; frecuencia y distancia ∝ participación.
// Se usa CSS y no el atributo transform porque la entrada global (anSpin … both) deja una animación sobre
// el gajo que pisa para siempre cualquier transform movido por tick; al poner nuestra propia animación
// la reemplazamos. Distinto de respirar (escala), reflector (iluminar), orbita (partículas),
// contorno-vivo (dash) y ondas-radiales (anillos).
(function () {
  LifeFX.efecto('rebanada-dona', { titulo: 'Rebanada que se separa', para: ['arcos'], costo: 'bajo', descripcion: 'Cada rebanada se separa del centro por turnos; la más grande sale más seguido y más lejos.', aplicar: function (c) {
    var u = c.u, ctr = u.center(c.marks, c.svg), cx = ctr[0], cy = ctr[1];
    c.marks.forEach(function (m, i) {
      var ml = u.toLocal(m, c.svg), b = m.getBBox(), bx = b.x + b.width / 2, by = b.y + b.height / 2;
      var q = ml ? new DOMPoint(bx, by).matrixTransform(ml) : { x: bx, y: by };
      var dx = q.x - cx, dy = q.y - cy, L = Math.sqrt(dx * dx + dy * dy) || 1, sh = c.shares[i] || 0;
      var d = 4 + sh * 22; // distancia del tirón ∝ participación (máx. ~20 px, mín. ~5 px)
      m.style.setProperty('--fxdx', (dx / L * d).toFixed(2) + 'px');
      m.style.setProperty('--fxdy', (dy / L * d).toFixed(2) + 'px');
      m.style.transformOrigin = '0 0';
      m.style.animation = 'lifeRebanada ' + (6.5 - sh * 5).toFixed(2) + 's ease-in-out ' + (i * 1.1).toFixed(2) + 's infinite'; // duración ∝ 1/participación: la grande sale más seguido
    });
  } });
})();
(function () { var s = document.createElement('style'); s.textContent = '@keyframes lifeRebanada{0%{transform:translate(0,0)}22%{transform:translate(var(--fxdx,0px),var(--fxdy,0px))}44%{transform:translate(0,0)}100%{transform:translate(0,0)}}'; document.head.appendChild(s); })();

// ---- efectos/rebote.js ----
// Las barras rebotan suavemente desde su base; amplitud ∝ participación.
LifeFX.efecto('rebote', { titulo: 'Rebote', para: ['barras-v'], costo: 'muy bajo', descripcion: 'Rebote suave desde la base; la barra con más peso rebota más.', aplicar: function (c) {
  c.marks.forEach(function (r, i) { r.style.transformBox = 'fill-box'; r.style.transformOrigin = 'center bottom'; r.style.setProperty('--fxa', (1 + 0.02 + c.shares[i] * 0.5).toFixed(3)); r.style.animation = 'fxRebote 2.4s ease-in-out ' + (i * 0.12).toFixed(2) + 's infinite'; });
} });
(function () { var s = document.createElement('style'); s.textContent = '@keyframes fxRebote{0%,60%,100%{transform:scaleY(1)}75%{transform:scaleY(var(--fxa,1.04))}88%{transform:scaleY(.99)}}'; document.head.appendChild(s); })();

// ---- efectos/reflector.js ----
// Reflector: ilumina una parte a la vez. La probabilidad de cada parte es su participación (área o intensidad).
(function () {
  var spots = [];
  LifeFX.efecto('reflector', { titulo: 'Reflector', para: ['arcos', 'radial', 'treemap', 'calor'], costo: 'muy bajo', descripcion: 'Ilumina una parte a la vez; un 70% se ilumina el 70% de las veces.', aplicar: function (c) { spots.push({ svg: c.svg, marks: c.marks, ws: c.ws, t: Math.random(), u: c.u }); } });
  LifeFX.tick(function (dt) {
    for (var i = spots.length - 1; i >= 0; i--) {
      var s = spots[i]; if (!s.marks[0].isConnected) { spots.splice(i, 1); continue; } if (!s.u.vis(s.svg)) continue;
      s.t -= dt; if (s.t > 0) continue; s.t = 0.9;
      var m = s.marks[s.u.wpick(s.ws)]; m.classList.remove('lifeSpot'); void m.getBBox(); m.classList.add('lifeSpot');
    }
  });
})();

// ---- efectos/resorte-barra.js ----
// Cada barra vertical vuelve a crecer desde su eje con un resorte: sobreimpulso y asentamiento en ciclos; el sobreimpulso ∝ participación.
LifeFX.efecto('resorte-barra', { titulo: 'Resorte', para: ['barras-v'], costo: 'bajo', descripcion: 'Cada barra crece desde su eje con sobreimpulso de resorte; la más pesada rebota más.', aplicar: function (c) {
  c.marks.forEach(function (r, i) {
    var h = c.u.num(r, 'height'); if (h < 6) return;
    r.style.transformBox = 'fill-box'; r.style.transformOrigin = 'center bottom';
    r.style.setProperty('--fxo', (0.12 + c.shares[i] * 1.4).toFixed(3));
    r.style.animation = 'lifeResorte 3.6s ease-in-out ' + (-i * 0.3).toFixed(2) + 's infinite';
  });
} });
(function () { var s = document.createElement('style'); s.textContent = '@keyframes lifeResorte{0%{transform:scaleY(0)}16%{transform:scaleY(calc(1 + var(--fxo,.25)))}32%{transform:scaleY(calc(1 - var(--fxo,.25)*.45))}48%{transform:scaleY(calc(1 + var(--fxo,.25)*.18))}64%,100%{transform:scaleY(1)}}'; document.head.appendChild(s); })();

// ---- efectos/respira-calor.js ----
// Respira calor: cada celda respira escalando desde su propio centro; las más calientes respiran más
// profundo y más rápido. Mecanismo distinto a los demás de calor (ninguno escala): transform con
// transform-box fill-box sobre la propia celda, con duración y amplitud ∝ peso (no un ritmo fijo común).
LifeFX.efecto('respira-calor', { titulo: 'Respiración de calor', para: ['calor'], costo: 'bajo', descripcion: 'Las celdas respiran desde su centro; más peso, respiración más amplia y más rápida.', aplicar: function (c) {
  var wm = Math.max.apply(null, c.ws.concat([1e-6]));
  c.marks.forEach(function (r, i) {
    var k = c.ws[i] / wm;
    r.style.transformBox = 'fill-box'; r.style.transformOrigin = 'center';
    r.style.setProperty('--fxb', (1.015 + 0.075 * k).toFixed(3));
    r.style.animation = 'lifeRespiraCalor ' + (3.8 - 2.2 * k).toFixed(2) + 's ease-in-out ' + (-Math.random() * 3.8).toFixed(2) + 's infinite';
  });
} });
(function () { var s = document.createElement('style'); s.textContent = '@keyframes lifeRespiraCalor{0%,100%{transform:scale(1)}45%{transform:scale(var(--fxb,1.05))}}'; document.head.appendChild(s); })();

// ---- efectos/respirar.js ----
// Cada gajo "respira" (se expande y contrae); amplitud ∝ participación.
LifeFX.efecto('respirar', { titulo: 'Respiración', para: ['arcos', 'radial', 'burbujas'], costo: 'muy bajo', descripcion: 'Las partes se expanden y contraen; las de más peso respiran más.', aplicar: function (c) {
  var u = c.u, ctr = u.center(c.marks, c.svg);
  c.marks.forEach(function (m, i) {
    if (m.tagName === 'circle') { m.style.transformBox = 'fill-box'; m.style.transformOrigin = 'center'; }
    else { m.style.transformBox = 'view-box'; m.style.transformOrigin = ctr[0] + 'px ' + ctr[1] + 'px'; }
    m.style.setProperty('--fxb', (1.01 + c.shares[i] * 0.07).toFixed(3)); m.style.animation = 'fxResp 3.2s ease-in-out ' + (i * 0.2).toFixed(2) + 's infinite';
  });
} });
(function () { var s = document.createElement('style'); s.textContent = '@keyframes fxResp{0%,100%{transform:scale(1)}50%{transform:scale(var(--fxb,1.03))}}'; document.head.appendChild(s); })();

// ---- efectos/rio-flujo.js ----
// Ondas que corren por cada banda del flujo como un río: líneas onduladas que avanzan por la banda.
// Proporción: la banda más ancha lleva más líneas de onda, más ondas por línea y mayor velocidad (todo ∝ h de data-flow).
// Mecanismo distinto a particulas-flujo (bolitas) y a pulso-banda (degradado que viaja): aquí la forma de onda
// (sinusoide sobre la curva de Bézier de la banda) se redibuja cada cuadro con su fase avanzando.
(function () {
  var rios = [], cssOk = false;
  LifeFX.efecto('rio-flujo', { titulo: 'Río de flujo', para: ['flujo'], costo: 'bajo', descripcion: 'Ondas que corren por cada banda como un río; las anchas llevan más ondas y más rápidas.', aplicar: function (c) {
    var u = c.u;
    if (!cssOk) { cssOk = true; var st = document.createElement('style'); st.textContent = '@keyframes lifeRio{0%,100%{opacity:.55}50%{opacity:.28}} .lifeRio{animation:lifeRio 2.2s ease-in-out infinite}'; document.head.appendChild(st); }
    var tot = 0; c.marks.forEach(function (p) { tot += +(p.getAttribute('data-flow') || '0,0,0,0,0').split(',')[4] || 0; });
    if (!(tot > 0)) return;
    c.marks.forEach(function (p) {
      var f = (p.getAttribute('data-flow') || '').split(',').map(Number), h = f[4]; if (!(h > 2)) return;
      var share = h / tot, mx = (f[0] + f[2]) / 2;
      var y0 = f[1] + h / 2, y1 = f[3] + h / 2;
      var nWaves = 1 + Math.round(share * 3); // 62% -> 3 lineas, 23% -> 2, 15% -> 1
      var freq = Math.max(1, Math.round(share * 5)); // ondas por linea: 3, 1, 1
      var amp = Math.min(h * 0.22, 7), wdt = (1.2 + share * 1.6).toFixed(1);
      for (var k = 0; k < nWaves; k++) {
        var path = u.mk('path', { fill: 'none', stroke: '#fff', 'stroke-width': wdt, 'stroke-linecap': 'round', opacity: 0.55, class: 'lifeRio' });
        u.layer(c.svg).appendChild(path);
        rios.push({ svg: c.svg, path: path, f: f, mx: mx, y0: y0, y1: y1, h: h, share: share, freq: freq, amp: amp, phase: (k / nWaves) * 2 * Math.PI + Math.random() * 0.6, speed: 0.35 + share * 1.1, u: u });
      }
    });
  } });
  function punto(q, t) {
    var u = q.u, v = 1 - t;
    var x = u.bez(q.f[0], q.mx, q.mx, q.f[2], t), y = u.bez(q.y0, q.y0, q.y1, q.y1, t);
    // Tangente de la cúbica (P0,P1,P2,P3) para la normal perpendicular.
    var dx = 3 * v * v * (q.mx - q.f[0]) + 6 * v * t * (q.mx - q.mx) + 3 * t * t * (q.f[2] - q.mx);
    var dy = 3 * v * v * (q.y0 - q.y0) + 6 * v * t * (q.y1 - q.y0) + 3 * t * t * (q.y1 - q.y1);
    var L = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / L, ny = dx / L;
    var off = q.amp * Math.sin(2 * Math.PI * q.freq * t - q.phase);
    return [x + nx * off, y + ny * off];
  }
  LifeFX.tick(function (dt) {
    for (var i = rios.length - 1; i >= 0; i--) {
      var q = rios[i];
      if (!q.path.isConnected) { rios.splice(i, 1); continue; }
      if (!q.u.vis(q.svg)) continue;
      q.phase += dt * q.speed * 2 * Math.PI;
      var N = 36, d = '';
      for (var j = 0; j <= N; j++) { var pt = punto(q, j / N); d += (j ? ' L' : 'M') + pt[0].toFixed(1) + ',' + pt[1].toFixed(1); }
      q.path.setAttribute('d', d);
    }
  });
})();

// ---- efectos/satelites.js ----
// Pequeños satélites orbitan alrededor de cada burbuja; número ∝ tamaño.
(function () {
  var sats = [];
  LifeFX.efecto('satelites', { titulo: 'Satélites', para: ['burbujas'], costo: 'bajo', descripcion: 'Puntos que orbitan alrededor de cada burbuja; las grandes tienen más.', aplicar: function (c) {
    var u = c.u; c.marks.forEach(function (m, i) {
      var n = Math.max(1, Math.round(c.shares[i] * 12)), cx = u.num(m, 'cx'), cy = u.num(m, 'cy'), r = u.num(m, 'r'), M = u.toLocal(m, c.svg); var p = M ? new DOMPoint(cx, cy).matrixTransform(M) : { x: cx, y: cy };
      for (var k = 0; k < n; k++) { var d = u.mk('circle', { r: 2.2, fill: m.getAttribute('fill') || '#2a78d6' }); u.layer(c.svg).appendChild(d); sats.push({ svg: c.svg, m: m, d: d, x: p.x, y: p.y, R: r + 6, a: k / n * 6.283, w: 1.2 + Math.random(), u: u }); }
    });
  } });
  LifeFX.tick(function (dt) {
    for (var i = sats.length - 1; i >= 0; i--) { var s = sats[i]; if (!s.d.isConnected || !s.m.isConnected) { sats.splice(i, 1); continue; } s.a += s.w * dt; s.d.setAttribute('cx', (s.x + s.R * Math.cos(s.a)).toFixed(1)); s.d.setAttribute('cy', (s.y + s.R * 0.85 * Math.sin(s.a)).toFixed(1)); }
  });
})();

// ---- efectos/semaforo.js ----
// NUEVO · Semáforo de umbrales: una banda única "En meta / Vigilar / Actuar" que resume el tablero.
// Umbrales OFICIALES (Decisión 2, Jonathan 2026-11-24): viven como DEFAULTS en
// nucleo.js (LifeFX.umbrales); LifeFX.config({ umbrales: {...} }) los cambia por
// KPI (fusión por campo: un parcial conserva el resto del default) y los data-*
// por tarjeta mandan sobre la config. Contrato de configuración:
//   LifeFX.config({ umbrales: { ns: { valor: 89.6, meta: 90, vigilar: 89.8, actuar: 88, direccion: 'mayor', formato: 'pct', nombre: 'NS' } } })
//   o por KPI en el HTML: <div class="kpi" data-kpi="ns" data-valor="89.6" data-meta="90" data-vigilar="89.8" data-actuar="88" data-direccion="mayor" data-formato="pct" data-nombre="NS">
// Valores oficiales: NS vigilar 89.8 / actuar 88 (mayor, meta 90); abandono vigilar 5.2 / actuar 6
// (menor, meta 5); TMO vigilar 550 s = 9:10 / actuar 580 s = 9:40 (menor, meta 540 s = 9:00);
// NPS vigilar 25 / actuar 10 (mayor, meta 30). Revisión de dirección 2026-11-24: ninguna
// corrección — en NS/NPS lo malo es bajar (vigilar > actuar) y en abandono/TMO lo malo es
// subir (vigilar < actuar); TMO 550/580 s está por encima del actual 532 s = 8:52, con sentido.
// Reglas de estado (vigilar = frontera verde/ámbar, actuar = frontera ámbar/rojo; meta = objetivo, solo para el texto de distancia):
//   direccion 'mayor': valor >= vigilar → En meta; valor >= actuar → Vigilar; si no → Actuar.
//   direccion 'menor': valor <= vigilar → En meta; valor <= actuar → Vigilar; si no → Actuar.
//   (Para NS: meta 90, vigilar 89.8, actuar 88 → 89.6 es Vigilar, a 0,4 pts de la meta. Para abandono: meta 5, vigilar 5.2, actuar 6 → 4.7 es En meta. Para TMO: meta 540 s, vigilar 550, actuar 580 → 532 s es En meta. Para NPS: meta 30, vigilar 25, actuar 10 → 34.1 es En meta.)
// La banda muestra SOLO el peor estado y el KPI culpable con su distancia a la meta. Solo el número culpable va en rojo
// y late (reutiliza LifeFX.alarma de alarma-numero); nada más pulsa. No cachea reduced-motion: lo consulta en cada evaluación.
LifeFX.umbrales = LifeFX.umbrales || {};
(function () {
  // Fusión por campo (igual que nucleo.js): un config parcial conserva el resto
  // del default oficial. Sin esto, reemplazar el objeto entero perdería los
  // campos no mencionados (p. ej. config({ umbrales: { ns: { valor: 91 } } })
  // borraría vigilar/actuar/direccion del default).
  var _cfg = LifeFX.config;
  LifeFX.config = function (o) {
    if (o && o.umbrales) { for (var k in o.umbrales) LifeFX.umbrales[k] = Object.assign({}, LifeFX.umbrales[k] || {}, o.umbrales[k]); }
    return _cfg(o);
  };
})();
LifeFX.reducidoAhora = function () {
  return !!((window.LifeFX && LifeFX.reducido) || document.body.classList.contains('noanim') ||
    (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches));
};
// Formato español de cifras (decisión 5): miles con punto, decimal con coma.
// (toLocaleString('es-MX') formatea anglosajón — "89.6", "15,618" — así que no se usa.)
function fmtES(n, dec) {
  var neg = n < 0, a = Math.abs(n), f = a.toFixed(dec == null ? 1 : dec), p = f.split('.');
  var ent = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '-' : '') + ent + (p[1] ? ',' + p[1] : '');
}
function fmtES01(n) { var r = Math.round(n * 10) / 10; return fmtES(r, (r % 1 === 0) ? 0 : 1); } // 0-1 decimales: 90 → "90", 89,6 → "89,6", 99,96 → "100" (como el toLocaleString anterior)
// parseES: entiende "89,6" (= 89.6) y "15.618" (= 15618) y, por compatibilidad, el
// anglosajón heredado "89.6" / "15,618.4" (último separador = decimal; con un solo punto,
// 3 dígitos tras él = miles, 1-2 = decimal; la coma sola siempre es decimal).
function parseES(raw) {
  if (raw == null) return null;
  var s = String(raw).trim(), mm = s.match(/-?[\d.,]*\d/);
  if (!mm) return null; s = mm[0];
  var neg = s.charAt(0) === '-'; if (neg || s.charAt(0) === '+') s = s.slice(1);
  var ld = s.lastIndexOf('.'), lc = s.lastIndexOf(','), decSep = null, dec = 0, ent;
  if (ld >= 0 && lc >= 0) decSep = ld > lc ? '.' : ',';
  else if (lc >= 0) decSep = ',';
  else if (ld >= 0) { var tras = s.length - ld - 1; if (!(s.split('.').length > 2 || (tras === 3 && s.slice(0, ld) !== '0'))) decSep = '.'; }
  if (decSep) { var pp = s.split(decSep); dec = (pp[1] || '').length; ent = pp[0].replace(/[.,]/g, '') + '.' + (pp[1] || ''); }
  else ent = s.replace(/[.,]/g, '');
  var val = parseFloat((neg ? '-' : '') + ent);
  if (!isFinite(val)) return null;
  return { val: val, dec: dec };
}
// numES: número tal cual; texto ("89,6", "15.618", "89.6") parseado en español.
function numES(x) { if (typeof x === 'number') return x; if (x == null) return NaN; var p = parseES(x); return p ? p.val : NaN; }
function semFmt(v, formato) {
  if (formato === 'mmss') { var s = Math.round(v); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  if (formato === 'pct') return fmtES01(v) + ' %';
  return fmtES01(v);
}
function semDist(v, formato) {
  if (formato === 'mmss') return Math.round(v) + ' s';
  if (formato === 'pct') return fmtES(v, 1) + ' pts';
  return fmtES01(v);
}
LifeFX.evaluarKpi = function (cfg) {
  var v = numES(cfg.valor), meta = numES(cfg.meta), vig = numES(cfg.vigilar), act = numES(cfg.actuar);
  if (!isFinite(v) || !isFinite(meta) || !isFinite(vig) || !isFinite(act)) return null;
  var mayor = (cfg.direccion || 'mayor') !== 'menor';
  var estado = mayor ? (v >= vig ? 'meta' : (v >= act ? 'vigilar' : 'actuar')) : (v <= vig ? 'meta' : (v <= act ? 'vigilar' : 'actuar'));
  var dist = mayor ? meta - v : v - meta;
  return { estado: estado, distancia: dist, nombre: cfg.nombre || cfg.kpi || 'KPI', valor: v, meta: meta, formato: cfg.formato || 'pct' };
};
LifeFX.leerKpi = function (el) {
  var d = el.dataset || {}, cfg = LifeFX.umbrales[d.kpi] || {};
  function pick(k) { return d[k] != null && d[k] !== '' ? d[k] : cfg[k]; }
  var valor = pick('valor');
  if (valor == null) { var m = (el.textContent || '').match(/-?\d(?:[\d.,]*\d)?/); valor = m ? (parseES(m[0]) || {}).val : null; }
  return { kpi: d.kpi || '', nombre: pick('nombre') || d.kpi || '', valor: valor, meta: pick('meta'), vigilar: pick('vigilar'), actuar: pick('actuar'), direccion: pick('direccion') || 'mayor', formato: pick('formato') || 'pct' };
};
LifeFX.semaforo = function (root) {
  if (!root) return null;
  var cont = root.hasAttribute && root.hasAttribute('data-semaforo') ? root : (root.querySelector ? root.querySelector('[data-semaforo]') : null);
  if (!cont) return null;
  var kpis = [].slice.call(cont.querySelectorAll('.kpi[data-valor], .kpi[data-kpi]'));
  if (!kpis.length) kpis = [].slice.call(cont.querySelectorAll('.kpi'));
  var sev = { meta: 0, vigilar: 1, actuar: 2 }, peor = null, peorEl = null;
  var res = kpis.map(function (el) { var r = LifeFX.evaluarKpi(LifeFX.leerKpi(el)); return r ? { r: r, el: el } : null; }).filter(Boolean);
  res.forEach(function (x) { if (!peor || sev[x.r.estado] > sev[peor.r.estado] || (sev[x.r.estado] === sev[peor.r.estado] && Math.abs(x.r.distancia) > Math.abs(peor.r.distancia))) { peor = x; peorEl = x.el; } });
  // Limpia el culpable anterior: solo UN número late a la vez.
  if (cont.__fxCulpable && cont.__fxCulpable !== peorEl) {
    var prev = cont.__fxCulpable.querySelector('.v') || cont.__fxCulpable;
    prev.classList.remove('lifeAlarma', 'lifeSemaforoRojo'); prev.removeAttribute('data-rojo'); delete prev.__fxAlarma;
  }
  var banda = cont.querySelector(':scope > .lifeBanda');
  if (!banda) { banda = document.createElement('div'); banda.className = 'lifeBanda'; banda.setAttribute('role', 'status'); cont.insertBefore(banda, cont.firstChild); }
  var estado = peor ? peor.r.estado : 'meta';
  // En meta, "el más justo" es el KPI con MENOR distancia a su meta (el más ajustado),
  // no el de mayor distancia: ese es el más seguro, no el más justo.
  var justo = peor;
  if (estado === 'meta') { res.forEach(function (x) { if (Math.abs(x.r.distancia) < Math.abs(justo.r.distancia)) justo = x; }); }
  banda.className = 'lifeBanda lifeBanda--' + estado;
  var etiqueta = estado === 'meta' ? 'En meta' : estado === 'vigilar' ? 'Vigilar' : 'Actuar';
  banda.innerHTML = '';
  var dot = document.createElement('span'); dot.className = 'lifeBandaDot'; dot.setAttribute('aria-hidden', 'true'); banda.appendChild(dot);
  var txt = document.createElement('span');
  if (peor && estado !== 'meta') txt.textContent = etiqueta + ' — ' + peor.r.nombre + ' ' + semFmt(peor.r.valor, peor.r.formato) + ', a ' + semDist(Math.abs(peor.r.distancia), peor.r.formato) + ' de la meta ' + semFmt(peor.r.meta, peor.r.formato);
  else if (justo) txt.textContent = 'En meta — ' + res.length + (res.length === 1 ? ' KPI en meta' : ' KPI en meta') + ' · el más justo: ' + justo.r.nombre + ' ' + semFmt(justo.r.valor, justo.r.formato);
  else txt.textContent = 'En meta';
  banda.appendChild(txt);
  // Solo el número culpable en rojo y latiendo (reutiliza alarma-numero).
  if (peorEl && estado !== 'meta') {
    var num = peorEl.querySelector('.v') || peorEl;
    num.classList.add('lifeSemaforoRojo'); num.setAttribute('data-rojo', '1');
    cont.__fxCulpable = peorEl;
    if (!LifeFX.reducidoAhora() && LifeFX.alarma) { delete num.__fxAlarma; LifeFX.alarma(num); }
  } else cont.__fxCulpable = null;
  return estado;
};
LifeFX.efecto('semaforo', { titulo: 'Semáforo de umbrales', para: ['cifras'], costo: 'muy bajo', descripcion: 'Banda única En meta / Vigilar / Actuar con el KPI culpable y su distancia a la meta; solo el número culpable late en rojo.', aplicar: function (c) {
  var root = (c && c.svg && c.svg.closest) ? (c.svg.closest('.panel') || document) : document;
  [].forEach.call(root.querySelectorAll('[data-semaforo]'), function (el) { LifeFX.semaforo(el); });
} });
(function () { var s = document.createElement('style'); s.textContent =
  '.lifeBanda{display:flex;gap:8px;align-items:center;border-radius:10px;padding:10px 12px;font-weight:600;font-size:13px;border:1px solid;margin-bottom:10px}' +
  '.lifeBandaDot{flex:none;width:10px;height:10px;border-radius:50%;background:currentColor}' +
  '.lifeBanda--meta{background:#e7f6ee;border-color:#1baf7a;color:#0f6b4a}' +
  '.lifeBanda--vigilar{background:#fff4d6;border-color:#eda100;color:#7a5200}' +
  '.lifeBanda--actuar{background:#fdecea;border-color:#e34948;color:#a02c2c}' +
  '.lifeSemaforoRojo{color:#e34948!important}' +
  'body.noanim .lifeBanda,body.noanim .lifeAlarma{animation:none!important}';
  document.head.appendChild(s); })();

// ---- efectos/serpiente-linea.js ----
// Serpiente que ondula por la línea: un segmento resaltado viaja por la serie
// deformado por una onda sinusoidal perpendicular a la línea. La amplitud de la
// ondulación es proporcional al valor local (donde el valor es mayor, la serpiente
// se retuerce más; donde es menor, casi sigue la línea recta). La línea se muestrea
// una sola vez al aplicar (nunca getPointAtLength por cuadro) para no lastrar fps.
(function () {
  var snakes = [];
  LifeFX.efecto('serpiente-linea', { titulo: 'Serpiente de la línea', para: ['lineas'], costo: 'bajo', descripcion: 'Una onda serpenteante recorre la línea; su ondulación es mayor donde el valor es más alto.', aplicar: function (c) {
    var u = c.u;
    c.marks.forEach(function (p) {
      var L = 0; try { L = p.getTotalLength(); } catch (e) { return; }
      if (L < 60) return;
      var col = p.getAttribute('stroke') || '#2a78d6';
      var w = (+p.getAttribute('stroke-width') || 2) + 1.4;
      var path = u.mk('path', { d: '', fill: 'none', stroke: '#ffffff', 'stroke-width': w, 'stroke-linecap': 'round', opacity: 0.9 });
      u.layer(c.svg).appendChild(path);
      var head = u.mk('circle', { r: 3.4, fill: '#ffffff', stroke: col, 'stroke-width': 1.5, opacity: 0.95 });
      u.layer(c.svg).appendChild(head);
      var N = 120, xs = [], ys = [], nxs = [], nys = [], vs = [], yMin = 1e9, yMax = -1e9, i, pt;
      for (i = 0; i <= N; i++) { pt = p.getPointAtLength(L * i / N); xs.push(pt.x); ys.push(pt.y); if (pt.y < yMin) yMin = pt.y; if (pt.y > yMax) yMax = pt.y; }
      var span = Math.max(1, yMax - yMin);
      for (i = 0; i <= N; i++) {
        var a = p.getPointAtLength(L * i / N), b = p.getPointAtLength(Math.min(L, L * i / N + 1.5));
        var dx = b.x - a.x, dy = b.y - a.y, nl = Math.sqrt(dx * dx + dy * dy) || 1;
        nxs.push(-dy / nl); nys.push(dx / nl); vs.push(Math.max(0, Math.min(1, (yMax - ys[i]) / span)));
      }
      snakes.push({ svg: c.svg, p: p, L: L, N: N, xs: xs, ys: ys, nxs: nxs, nys: nys, vs: vs, path: path, head: head, t: -Math.random() * 0.5, d: 3.4 });
    });
  } });
  LifeFX.tick(function (dt) {
    for (var i = snakes.length - 1; i >= 0; i--) {
      var q = snakes[i];
      if (!q.p.isConnected || !q.path.isConnected) { snakes.splice(i, 1); continue; }
      if (!LifeFX.u.vis(q.svg)) continue;
      q.t += dt / q.d; if (q.t > 1.35) q.t = -0.35;
      var win = q.L * 0.30, c0 = q.t * q.L - win / 2, s0 = Math.max(0, c0), s1 = Math.min(q.L, c0 + win);
      if (s1 - s0 < 8) { q.path.setAttribute('d', ''); q.head.setAttribute('opacity', 0); continue; }
      var i0 = Math.max(0, Math.floor(s0 / q.L * q.N)), i1 = Math.min(q.N, Math.ceil(s1 / q.L * q.N));
      var step = Math.max(1, Math.floor((i1 - i0) / 30)), d = '', j, k = 0, n = Math.ceil((i1 - i0) / step);
      for (j = i0; j <= i1; j += step, k++) {
        var env = Math.sin(Math.PI * k / n);
        var amp = (1.5 + 8 * q.vs[j]) * env;
        var off = amp * Math.sin((q.L * j / q.N) * 0.11 - q.t * 22);
        var x = q.xs[j] + q.nxs[j] * off, y = q.ys[j] + q.nys[j] * off;
        d += (k ? ' L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
        if (j + step > i1) { q.head.setAttribute('cx', x.toFixed(1)); q.head.setAttribute('cy', y.toFixed(1)); q.head.setAttribute('opacity', 0.95); }
      }
      q.path.setAttribute('d', d);
    }
  });
})();

// ---- efectos/telarana.js ----
// Telaraña: pulsos que salen del centro y recorren los vértices del polígono de datos.
// La velocidad y el número de pulsos son ∝ a la participación del polígono (c.shares);
// el tamaño y el brillo de cada pulso son ∝ al valor del vértice (su distancia al centro).
(function () {
  var redes = [];
  function puntos(m, svg, u) {
    var raw = (m.getAttribute('points') || '').trim().split(/\s+/), pts = [], i, q;
    for (i = 0; i < raw.length; i++) { q = raw[i].split(','); if (q.length === 2) pts.push([+q[0], +q[1]]); }
    var mx = u.toLocal(m, svg);
    if (mx) pts = pts.map(function (p) { var d = new DOMPoint(p[0], p[1]).matrixTransform(mx); return [d.x, d.y]; });
    return pts;
  }
  LifeFX.efecto('telarana', { titulo: 'Telaraña', para: ['radar'], costo: 'bajo', descripcion: 'Pulsos salen del centro y recorren los vértices; el vértice con más valor brilla más y el polígono grande lleva más pulsos.', aplicar: function (c) {
    var u = c.u, layer = u.layer(c.svg);
    c.marks.forEach(function (m, i) {
      var pts = puntos(m, c.svg, u); if (pts.length < 3) return;
      var cx = 0, cy = 0; pts.forEach(function (p) { cx += p[0]; cy += p[1]; }); cx /= pts.length; cy /= pts.length;
      var R = 0; pts.forEach(function (p) { R = Math.max(R, Math.hypot(p[0] - cx, p[1] - cy)); }); if (!R) return;
      var col = m.getAttribute('fill') || '#2a78d6';
      var g = u.mk('g', { opacity: 0.9 }); layer.appendChild(g);
      pts.forEach(function (p) { g.appendChild(u.mk('line', { x1: cx.toFixed(1), y1: cy.toFixed(1), x2: p[0].toFixed(1), y2: p[1].toFixed(1), stroke: col, 'stroke-width': 1, opacity: 0.22 })); });
      // Ruta del pulso: centro → vértices en orden → centro. Valor en cada punto = distancia al centro / R.
      var ruta = [[cx, cy]].concat(pts).concat([[cx, cy]]), segs = [], total = 0, k;
      for (k = 0; k < ruta.length - 1; k++) { var a = ruta[k], b = ruta[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); segs.push({ x0: a[0], y0: a[1], x1: b[0], y1: b[1], len: L, f0: Math.hypot(a[0] - cx, a[1] - cy) / R, f1: Math.hypot(b[0] - cx, b[1] - cy) / R, acc: total }); total += L; }
      if (!total) return;
      var n = Math.max(1, Math.round(1 + 2 * c.shares[i])), pulsos = [];
      for (k = 0; k < n; k++) { var d = u.mk('circle', { r: 3, fill: col, stroke: '#fff', 'stroke-width': 1, opacity: 0 }); g.appendChild(d); pulsos.push({ d: d, s: -k * 90 }); }
      redes.push({ m: m, g: g, segs: segs, total: total, pulsos: pulsos, vel: 130 + 260 * c.shares[i] });
    });
  } });
  LifeFX.tick(function (dt) {
    for (var i = redes.length - 1; i >= 0; i--) {
      var r = redes[i];
      if (!r.m.isConnected) { if (r.g.parentNode) r.g.parentNode.removeChild(r.g); redes.splice(i, 1); continue; }
      r.pulsos.forEach(function (p) {
        p.s += dt * r.vel;
        if (p.s < 0) { p.d.setAttribute('opacity', 0); return; }
        var s = p.s % r.total, sg = r.segs[0], j;
        for (j = 0; j < r.segs.length; j++) { if (s >= r.segs[j].acc) sg = r.segs[j]; }
        var t = sg.len ? (s - sg.acc) / sg.len : 0, f = sg.f0 + (sg.f1 - sg.f0) * t;
        p.d.setAttribute('cx', (sg.x0 + (sg.x1 - sg.x0) * t).toFixed(1));
        p.d.setAttribute('cy', (sg.y0 + (sg.y1 - sg.y0) * t).toFixed(1));
        p.d.setAttribute('r', (2 + 4.5 * f).toFixed(1));
        p.d.setAttribute('opacity', (0.35 + 0.6 * f).toFixed(2));
      });
    }
  });
})();

// ---- efectos/transicion-vista.js ----
// NUEVO · Transición entre vistas: al cambiar de pestaña, los paneles entran en cascada (de abajo hacia arriba con desvanecido).
LifeFX.global('transicion-vista', { descripcion: 'Paneles que entran en cascada al cambiar de vista.', iniciar: function () {
  var s = document.createElement('style'); s.textContent = '.lifeIn{animation:lifeIn .55s cubic-bezier(.2,.8,.2,1) both}@keyframes lifeIn{from{opacity:0;transform:translateY(14px) scale(.985)}to{opacity:1;transform:none}}'; document.head.appendChild(s);
  new MutationObserver(function (list) {
    list.forEach(function (mu) {
      var v = mu.target; if (mu.attributeName !== 'hidden' || v.hidden || !v.classList.contains('view')) return;
      [].forEach.call(v.querySelectorAll('.panel'), function (p, i) { p.classList.remove('lifeIn'); void p.offsetWidth; p.style.animationDelay = (i * 0.06).toFixed(2) + 's'; p.classList.add('lifeIn'); });
    });
  }).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['hidden'] });
} });

// ---- efectos/trazo-vivo.js ----
// La línea parece fluir: segmentos de luz avanzan a lo largo de la serie sin parar.
LifeFX.efecto('trazo-vivo', { titulo: 'Trazo vivo', para: ['lineas'], costo: 'muy bajo', descripcion: 'Pulsos de luz fluyen a lo largo de la línea, como corriente.', aplicar: function (c) {
  var u = c.u; c.marks.forEach(function (p) {
    var o = u.mk('path', { d: p.getAttribute('d'), fill: 'none', stroke: '#fff', 'stroke-width': Math.max(1.5, (+p.getAttribute('stroke-width') || 2) - 0.6), 'stroke-linecap': 'round', pathLength: 100, 'stroke-dasharray': '4 16', class: 'fxFlujoL' });
    u.layer(c.svg).appendChild(o);
  });
} });
(function () { var s = document.createElement('style'); s.textContent = '.fxFlujoL{animation:fxFlujoL 1.6s linear infinite;opacity:.85}@keyframes fxFlujoL{to{stroke-dashoffset:-20}}'; document.head.appendChild(s); })();

// ---- efectos/vibra-barra.js ----
// Cada barra horizontal vibra lateralmente 1-2 px; la amplitud (y un poco la frecuencia) ∝ participación.
LifeFX.efecto('vibra-barra', { titulo: 'Vibración', para: ['barras-h'], costo: 'bajo', descripcion: 'Cada barra vibra de lado a lado; la más larga vibra más.', aplicar: function (c) {
  c.marks.forEach(function (r, i) {
    var w = c.u.num(r, 'width'); if (w < 10) return;
    r.style.setProperty('--fxa', Math.min(2, 0.5 + c.shares[i] * 7).toFixed(2) + 'px');
    r.style.animation = 'lifeVibra ' + (1 / (6 + c.shares[i] * 8)).toFixed(3) + 's linear ' + (-Math.random() * 0.13).toFixed(3) + 's infinite';
  });
} });
(function () { var s = document.createElement('style'); s.textContent = '@keyframes lifeVibra{0%,100%{transform:translateX(0)}25%{transform:translateX(var(--fxa,1px))}75%{transform:translateX(calc(-1 * var(--fxa,1px)))}}'; document.head.appendChild(s); })();

(function () { function go() { LifeFX.arrancar(); } if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go(); })();
