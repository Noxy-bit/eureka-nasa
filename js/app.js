/* =====================================================================
   EUREKA — application logic
   Risk engine (3 dimensions) · Leaflet satellite map · alerts · scenario
   comparator · AI assistant · i18n
   ===================================================================== */
(() => {
  'use strict';
  const D = window.EUREKA_DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const mean = arr => arr.reduce((a, b) => a + b, 0) / (arr.length || 1);
  const fmt1 = v => (Math.round(v * 10) / 10).toFixed(1);
  const pct = v => Math.round(v) + '%';

  // ------------------------------------------------------------------
  // State
  // ------------------------------------------------------------------
  const state = {
    lang: 'es', view: 'map', opId: 'OP-2026-0417', window: 'today', alertFilter: 'all',
    layers: { gpm: true, firms: true, modis: true, eco: true, sedac: true, smap: false, dem: true },
    alerts: D.alerts.map(a => ({ ...a })), streamIdx: 0, shownAlt: null, mixed: false,
    operations: D.operations.map(o => ({ ...o, cargo: [...o.cargo], sheet: { ...o.sheet } })),
    icons: () => window.lucide && lucide.createIcons(),
  };
  const t = k => (D.i18n[state.lang] && D.i18n[state.lang][k]) ?? D.i18n.es[k] ?? k;
  const L_ = (obj) => obj[state.lang] ?? obj.es;
  const activeOp = () => state.operations.find(o => o.id === state.opId);
  const srcById = id => D.sources.find(s => s.id === id);
  const cargoById = id => D.cargoProfiles.find(c => c.id === id);

  // ------------------------------------------------------------------
  // Risk engine
  // ------------------------------------------------------------------
  const WIN = {
    today:    { rain: 1.0,  fire: 1.0,  heat: 1.0,  snow: 1.0,  unc: 0 },
    tomorrow: { rain: 1.25, fire: 1.12, heat: 1.05, snow: 1.2,  unc: 0.1 },
    week:     { rain: 1.45, fire: 1.3,  heat: 1.15, snow: 1.35, unc: 0.25 },
  };

  function effectiveProfile(op) {
    const cats = op.cargo.map(cargoById).filter(Boolean);
    const base = {
      heat: Math.max(...cats.map(c => c.heat)), cold: Math.max(...cats.map(c => c.cold)),
      humidity: Math.max(...cats.map(c => c.humidity)), water: Math.max(...cats.map(c => c.water)),
      fragility: Math.max(...cats.map(c => c.fragility)), maxDelayH: Math.min(...cats.map(c => c.maxDelayH)),
      tMin: Math.max(...cats.map(c => c.tMin)), tMax: Math.min(...cats.map(c => c.tMax)),
      refrigerated: cats.some(c => c.refrigerated), frozen: cats.some(c => c.frozen),
    };
    const s = op.sheet || {};
    const p = { ...base, ...Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined && v !== null && v !== '')) };
    // derive thermal sensitivity from the data-sheet temperature range
    p.heat = Math.max(p.heat, clamp((45 - p.tMax) / 40));
    p.cold = p.frozen ? Math.min(p.cold, 0.15) : Math.max(p.cold, clamp((p.tMin + 10) / 20));
    return p;
  }

  function factors(h, win, heatFactor = 1) {
    const m = WIN[win];
    const rain = clamp((h.rain * m.rain) / 15);
    const flood = clamp(rain * (0.6 + 0.8 * h.soil));
    const fire = clamp(h.fire * m.fire);
    const heat = clamp((h.lst - 30) / 22) * m.heat * heatFactor;
    const cold = clamp((2 - h.lst) / 14);
    const snow = clamp(h.snow * m.snow);
    const alt = clamp((h.elev - 3000) / 2000);
    return { rain, flood, fire, heat: clamp(heat), cold, snow, alt };
  }

  function territorial(f, report) {
    const core = Math.max(f.flood, f.fire, f.heat, f.snow, f.cold * 0.8, f.alt * 0.6);
    let v = 10 * clamp(0.75 * core + 0.25 * mean([f.flood, f.fire, f.heat, f.snow, f.cold]));
    if (report === 'incident') v = Math.min(10, v + 0.8);
    if (report === 'closure') v = Math.max(v, 9.2);
    return v;
  }

  function vulnerability(f, p) {
    const heatExp = f.heat * p.heat * (p.refrigerated ? 1.05 : 1);
    const coldExp = f.cold * p.cold;
    const waterExp = Math.max(f.rain, f.flood) * (0.5 * p.water + 0.5 * p.humidity);
    const fireExp = f.fire * (0.5 + 0.5 * p.heat);
    const fragExp = (f.flood * 0.4 + f.snow * 0.5 + f.alt * 0.3) * p.fragility;
    const arr = [heatExp, coldExp, waterExp, fireExp, fragExp];
    return { value: 10 * clamp(Math.max(...arr) * 0.7 + mean(arr) * 0.3), parts: { heat: heatExp, cold: coldExp, water: waterExp, fire: fireExp, fragility: fragExp } };
  }

  function evaluatePath(op, path, isMain, mainRef) {
    const route = D.routes[op.routeId];
    const wps = path.waypoints || route.waypoints;
    const heatFactor = path.heatFactor || 1;
    const p = effectiveProfile(op);
    const m = WIN[state.window];
    const pts = wps.map(w => {
      const f = factors(w.h, state.window, heatFactor);
      const terr = territorial(f, w.report);
      const vul = vulnerability(f, p);
      return { w, f, terr, vuln: vul.value, vparts: vul.parts, score: 0.6 * terr + 0.4 * vul.value };
    });
    const segs = pts.slice(1).map((pt, i) => ({ from: pts[i], to: pt, score: Math.max(pts[i].score, pt.score), terr: Math.max(pts[i].terr, pt.terr) }));
    const maxTerr = Math.max(...pts.map(x => x.terr));
    const avgTerr = mean(pts.map(x => x.terr));
    const maxVuln = Math.max(...pts.map(x => x.vuln));
    const avgVuln = mean(pts.map(x => x.vuln));
    const reports = wps.filter(w => w.report).map(w => ({ name: w.name, type: w.report }));
    const closure = reports.some(r => r.type === 'closure');
    const incident = reports.some(r => r.type === 'incident');
    const delayPct = Math.round((6 + avgTerr * 2.2 + maxTerr * 1.8 + (closure ? 12 : 0) + (incident ? 4 : 0)) * (1 + m.unc * 0.6));
    const baseH = path.baseHours;
    const adjH = baseH * (1 + delayPct / 100);
    const delayH = adjH - baseH;
    const tol = clamp(delayH / p.maxDelayH);
    const alts = route.alternatives.length;
    const crit = 1 - Math.min(1, alts / 3) * 0.5;
    const popMax = Math.max(...wps.map(w => w.h.pop));
    const popF = clamp(Math.log10(popMax + 1) / 4);
    const expo = 10 * clamp(0.45 * tol + 0.2 * crit + 0.2 * popF + 0.15 * (closure ? 1 : incident ? 0.5 : 0)) + (op.essential ? 0.5 : 0);
    const terr = 0.6 * maxTerr + 0.4 * avgTerr;
    const vuln = 0.6 * maxVuln + 0.4 * avgVuln;
    const overall = 0.4 * terr + 0.35 * vuln + 0.25 * Math.min(10, expo);
    const integrity = Math.round(clamp(100 - vuln * 7 - Math.max(0, tol - 0.4) * 40, 5, 99));
    const dep = new Date(op.departure);
    const eta = new Date(dep.getTime() + adjH * 3600e3);
    const popExposed = pts.filter(x => x.terr >= 4).reduce((a, x) => a + x.w.h.pop * 120, 0);
    return { id: path.id || route.id, name: path.name, isMain, path, wps, pts, segs, maxTerr, avgTerr, maxVuln, terr, vuln, expo: Math.min(10, expo), overall, delayPct, baseH, adjH, delayH, tol, eta, integrity, reports, closure, incident, popExposed, mode: path.mode || op.mode, distanceKm: path.distanceKm, profile: p };
  }

  function evaluateOperation(op) {
    const route = D.routes[op.routeId];
    const main = evaluatePath(op, route, true);
    const alts = route.alternatives.map(a => evaluatePath(op, a, false, main));
    const cost = r => r.overall + 5 * Math.max(0, r.adjH / main.adjH - 1) + (r.closure ? 5 : 0) + (r.isMain ? 0 : 0.3);
    const cands = [main, ...alts];
    let best = cands.reduce((b, r) => (cost(r) < cost(b) ? r : b), main);
    if (!best.isMain && cost(main) - cost(best) < 0.5) best = main;
    cands.forEach(r => { r.recommended = r === best; r.delta = r.adjH - main.adjH; });
    const impact = main.overall >= 6.2 ? 'high' : main.overall >= 3.8 ? 'med' : 'low';
    const alerts = state.alerts.filter(a => a.routeId === op.routeId);
    return { op, route, main, alts, best, impact, alerts };
  }

  const evalCache = {};
  function ev(op) {
    const key = [op.id, state.window, JSON.stringify(op.sheet), op.cargo.join(), state.alerts.length].join('|');
    if (!evalCache[key]) evalCache[key] = evaluateOperation(op);
    return evalCache[key];
  }
  const evAll = () => state.operations.map(ev);

  const impactBadge = imp => `<span class="badge badge-${imp}">${t('impact_' + imp)}</span>`;
  const riskColor = v => (v >= 6.2 ? '#fb7185' : v >= 3.8 ? '#fbbf24' : '#34d399');
  const riskClass = v => (v >= 6.2 ? 'high' : v >= 3.8 ? 'med' : 'low');
  const bar = (v, max = 10) => `<div class="risk-bar w-20"><i style="width:${(v / max) * 100}%;background:${riskColor(v)}"></i></div>`;
  const fmtDT = d => new Date(d).toLocaleString(state.lang === 'es' ? 'es-BO' : 'en-US', { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const fmtPop = n => (n >= 1e6 ? (n / 1e6).toFixed(1) + ' M' : n >= 1e3 ? Math.round(n / 1e3) + ' k' : Math.round(n));
  const cargoName = op => op.cargo.map(id => L_(cargoById(id)).replace(/ \/.*$/, '')).join(' + ');
  const stateBadge = s => `<span class="badge badge-state-${s}" title="${t('state_' + s)}">${s === 'satellite' ? '<i data-lucide="satellite" class="w-3 h-3"></i>' : s === 'reported' ? '<i data-lucide="message-square-warning" class="w-3 h-3"></i>' : '<i data-lucide="octagon-x" class="w-3 h-3"></i>'}${t('state_' + s + '_s')}</span>`;
  const ago = a => (a.minsAgo < 60 ? `${a.minsAgo} ${t('min_ago')}` : `${fmt1(a.minsAgo / 60)} ${t('h_ago')}`);
  const obsTime = a => { const d = new Date(Date.now() - a.minsAgo * 60e3); return d.toISOString().slice(11, 16) + ' UTC'; };

  // ------------------------------------------------------------------
  // Map
  // ------------------------------------------------------------------
  let map, routeGroup, nodeGroup, hazardGroups = {}, altGroup, othersGroup, basemaps;
  function initMap() {
    map = L.map('map', { zoomControl: true, attributionControl: true, worldCopyJump: true, preferCanvas: false }).setView([-17.8, -64.5], 5);
    const attr = 'Tiles &copy; Esri · <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a> · &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> · NASA GPM · FIRMS · MODIS · ECOSTRESS · SEDAC (simulated feed)';
    basemaps = {
      dark: L.layerGroup([
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}', { attribution: attr, maxZoom: 16 }),
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, opacity: 0.8 }),
      ]),
      night: L.layerGroup([
        L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_CityLights_2012/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpg', { attribution: attr, maxNativeZoom: 8, maxZoom: 16 }),
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, opacity: 0.7 }),
      ]),
      marble: L.layerGroup([
        L.tileLayer('https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg', { attribution: attr, maxNativeZoom: 8, maxZoom: 16, className: 'tiles-dim' }),
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, opacity: 0.8 }),
      ]),
      sat: L.layerGroup([
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: attr, maxZoom: 18, className: 'tiles-dim' }),
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, opacity: 0.8 }),
      ]),
    };
    basemaps.dark.addTo(map);
    $$('#basemap-seg button').forEach(b => b.onclick = () => { Object.values(basemaps).forEach(g => map.removeLayer(g)); basemaps[b.dataset.bm].addTo(map); $$('#basemap-seg button').forEach(x => x.classList.toggle('active', x === b)); });
    othersGroup = L.layerGroup().addTo(map);
    altGroup = L.layerGroup().addTo(map);
    routeGroup = L.layerGroup().addTo(map);
    nodeGroup = L.layerGroup().addTo(map);
    D.sources.forEach(s => { hazardGroups[s.id] = L.layerGroup(); if (state.layers[s.id]) hazardGroups[s.id].addTo(map); });
    map.on('mousemove', e => { $('#map-coords').textContent = `lat ${e.latlng.lat.toFixed(3)} · lng ${e.latlng.lng.toFixed(3)}`; });
    $('#btn-fit').onclick = fitAll;
    $('#btn-focus').onclick = focusRoute;
  }
  const latlngs = wps => wps.map(w => [w.lat, w.lng]);

  function drawMap() {
    const r = ev(activeOp());
    routeGroup.clearLayers(); nodeGroup.clearLayers(); altGroup.clearLayers(); othersGroup.clearLayers();
    Object.values(hazardGroups).forEach(g => g.clearLayers());
    // other operations (faint)
    evAll().filter(x => x.op.id !== state.opId).forEach(x => {
      const ll = latlngs(x.main.wps);
      L.polyline(ll, { color: '#64748b', weight: 2, opacity: 0.35, dashArray: '4 8' }).addTo(othersGroup);
      L.polyline(ll, { color: 'transparent', weight: 14, opacity: 0 }).bindTooltip(`${x.op.id} · ${x.route.origin} → ${x.route.destination}`, { sticky: true }).on('click', () => selectOp(x.op.id)).addTo(othersGroup);
      [ll[0], ll[ll.length - 1]].forEach(p => L.circleMarker(p, { radius: 4, color: '#64748b', fillColor: '#0B0F19', fillOpacity: 1, weight: 1.5 }).addTo(othersGroup));
    });
    // alternatives
    r.alts.forEach(a => {
      const shown = state.shownAlt === a.id;
      const ll = latlngs(a.wps);
      if (a.path.waypoints === null) return;
      L.polyline(ll, { color: shown ? '#67e8f9' : '#94a3b8', weight: shown ? 4 : 2, opacity: shown ? 0.9 : 0.45, dashArray: shown ? null : '6 8', className: shown ? 'route-glow' : '' }).bindTooltip(`${t('alt')}: ${a.name}<br>${fmt1(a.adjH)} h · ${t('col_risk')} ${fmt1(a.maxTerr)}`, { sticky: true }).addTo(altGroup);
      if (shown) L.polyline(ll, { color: '#ecfeff', weight: 2, opacity: 0.9, className: 'route-anim-slow' }).addTo(altGroup);
    });
    // main route, per segment
    r.main.segs.forEach(s => {
      const ll = [[s.from.w.lat, s.from.w.lng], [s.to.w.lat, s.to.w.lng]];
      const c = riskColor(s.score);
      L.polyline(ll, { color: c, weight: 9, opacity: 0.18 }).addTo(routeGroup);
      L.polyline(ll, { color: c, weight: 4, opacity: 0.95, className: 'route-glow' }).bindTooltip(`<b>${s.from.w.name} → ${s.to.w.name}</b><br>${t('dim_terr')}: ${fmt1(s.terr)}/10 · ${t('dim_vuln')}: ${fmt1(Math.max(s.from.vuln, s.to.vuln))}/10`, { sticky: true }).addTo(routeGroup);
      L.polyline(ll, { color: '#ffffff', weight: 1.5, opacity: 0.7, className: 'route-anim' }).addTo(routeGroup);
    });
    // nodes
    r.main.pts.forEach((pt, i) => {
      const kind = pt.w.kind || '';
      const icon = L.divIcon({ className: '', html: `<div class="node-marker ${kind}"></div>`, iconSize: [14, 14], iconAnchor: [7, 7] });
      const mk = L.marker([pt.w.lat, pt.w.lng], { icon, zIndexOffset: 400 }).addTo(nodeGroup);
      mk.bindPopup(nodePopup(pt));
      if (kind || i === 0 || i === r.main.pts.length - 1) mk.bindTooltip(pt.w.name, { permanent: true, direction: 'right', offset: [8, 0], className: 'node-label' });
      if (pt.terr >= 6.2) L.circleMarker([pt.w.lat, pt.w.lng], { radius: 18, color: riskColor(pt.terr), weight: 1, fillOpacity: 0.12 }).addTo(nodeGroup);
    });
    // hazard markers from alerts
    state.alerts.forEach(a => {
      const s = srcById(a.source);
      const g = hazardGroups[a.source]; if (!g) return;
      const sev = a.severity;
      const icon = L.divIcon({ className: '', html: `<div class="hz-marker state-${a.state}" style="--c:${s.color}"><div class="pulse" style="${sev === 'low' ? 'display:none' : ''}"></div><div class="core"><i data-lucide="${s.icon}"></i></div></div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
      L.marker([a.lat, a.lng], { icon, zIndexOffset: a.routeId === state.opId ? 800 : 600 }).bindPopup(alertPopup(a)).addTo(g);
    });
    // SEDAC population circles for hubs
    Object.values(D.routes).forEach(rt => rt.waypoints.filter(w => w.h.pop >= 1000).forEach(w => {
      L.circle([w.lat, w.lng], { radius: Math.sqrt(w.h.pop) * 650, color: '#a78bfa', weight: 1, opacity: 0.5, fillColor: '#a78bfa', fillOpacity: 0.12 }).bindTooltip(`<b>SEDAC GPW v4.11</b><br>${w.name}: ~${w.h.pop.toLocaleString()} hab/km²<br><span style="color:#94a3b8">${t('obs_ts')}: 2020 (ref.)</span>`, { sticky: true }).addTo(hazardGroups.sedac);
    }));
    // ECOSTRESS hubs (70 m scenes) — one per logistics hub of the active route
    r.main.wps.filter(w => w.kind === 'hub' || w.kind === 'port').forEach(w => {
      const icon = L.divIcon({ className: '', html: '<div class="eco-marker"></div>', iconSize: [16, 16], iconAnchor: [8, 8] });
      L.marker([w.lat + 0.045, w.lng + 0.05], { icon }).bindTooltip(`<b>ECOSTRESS ECO_L2T_LSTE</b> · 70 m<br>${w.name} (${state.lang === 'es' ? 'zona logística' : 'logistics zone'}): LST ${fmt1(w.h.lst + 2.8)} °C<br><span style="color:#94a3b8">${state.lang === 'es' ? 'Paso ISS' : 'ISS pass'} 11:42 UTC · ${t('tooltip_lst')}</span>`, { sticky: true }).addTo(hazardGroups.eco);
    });
    setTimeout(() => state.icons(), 0);
    map.on('popupopen', () => state.icons());
    renderLegend();
  }
  function nodePopup(pt) {
    const h = pt.w.h; const f = pt.f;
    const row = (lbl, val, src) => `<div class="flex justify-between gap-3"><span class="text-slate-400">${lbl}</span><span class="font-mono">${val} <span class="text-slate-500">${src}</span></span></div>`;
    return `<div class="space-y-1 min-w-[230px]"><div class="font-semibold text-sm text-white">${pt.w.name}</div>
      <div class="flex gap-1 flex-wrap">${pt.w.report ? stateBadge(pt.w.report === 'closure' ? 'confirmed' : 'reported') : stateBadge('satellite')}</div>
      ${row(t('hz_rain'), `${fmt1(h.rain)} mm/h`, 'GPM')}${row(t('hz_heat'), `${fmt1(h.lst)} °C`, 'MODIS')}${h.fire ? row(t('hz_fire'), `${Math.round(h.fire * 100)}%`, 'FIRMS') : ''}${row(t('hz_soil'), `${h.soil.toFixed(2)} m³/m³`, 'SMAP')}${row('Elev.', `${h.elev} m`, 'NASADEM')}${row(t('hz_pop'), `${h.pop.toLocaleString()} hab/km²`, 'SEDAC')}
      <div class="pt-1 mt-1 border-t border-white/10 flex justify-between"><span>${t('dim_terr')}</span><b style="color:${riskColor(pt.terr)}">${fmt1(pt.terr)}/10</b></div>
      <div class="flex justify-between"><span>${t('dim_vuln')}</span><b style="color:${riskColor(pt.vuln)}">${fmt1(pt.vuln)}/10</b></div></div>`;
  }
  function alertPopup(a) {
    const s = srcById(a.source);
    return `<div class="space-y-1.5 min-w-[240px]"><div class="flex items-center gap-2"><span class="dot" style="background:${s.color}"></span><b class="text-white">${s.name}</b><span class="badge badge-${a.severity === 'medium' ? 'med' : a.severity} ml-auto">${a.severity.toUpperCase()}</span></div>
      <div class="text-[.68rem] text-slate-400 font-mono">${s.product} · ${t('resolution')} ${s.res}</div>
      <div>${stateBadge(a.state)}</div>
      <div class="font-semibold">${a.place}</div><div class="font-mono text-cyan-200">${a.value}</div>
      <div class="text-slate-300">${L_(a)}</div>
      <div class="text-[.65rem] text-slate-500 font-mono pt-1 border-t border-white/10">${t('obs_ts')}: ${obsTime(a)} (${ago(a)}) · ${a.lat.toFixed(3)}, ${a.lng.toFixed(3)}</div></div>`;
  }
  function renderLegend() {
    $('#map-legend').innerHTML = `<div class="label mb-1">${t('legend')}</div>
      <div class="flex items-center gap-2"><span class="w-5 h-1 rounded" style="background:#34d399"></span>${t('seg_low')}</div>
      <div class="flex items-center gap-2"><span class="w-5 h-1 rounded" style="background:#fbbf24"></span>${t('seg_med')}</div>
      <div class="flex items-center gap-2"><span class="w-5 h-1 rounded" style="background:#fb7185"></span>${t('seg_high')}</div>
      <div class="flex items-center gap-2"><span class="w-5 border-t border-dashed border-slate-400"></span>${t('alt')}</div>
      <div class="flex items-center gap-2 pt-1 border-t border-white/10 mt-1">${D.sources.filter(s => state.layers[s.id]).map(s => `<span class="dot" style="background:${s.color}" title="${s.name}"></span>`).join('')}<span class="text-slate-500">NASA</span></div>`;
  }
  function focusRoute() { const r = ev(activeOp()); map.flyToBounds(L.latLngBounds(latlngs(r.main.wps)).pad(0.25), { duration: 1.2 }); }
  function fitAll() { const all = []; Object.values(D.routes).forEach(r => all.push(...latlngs(r.waypoints))); map.flyToBounds(L.latLngBounds(all).pad(0.08), { duration: 1.4 }); }

  // ------------------------------------------------------------------
  // Charts
  // ------------------------------------------------------------------
  const charts = {};
  Chart.defaults.color = '#94a3b8'; Chart.defaults.font.family = 'Inter'; Chart.defaults.font.size = 10; Chart.defaults.borderColor = 'rgba(148,163,184,.12)';
  function lineDataset(label, r, color, dashed) {
    return { label, data: r.pts.map(p => +fmt1(p.terr)), borderColor: color, backgroundColor: color + '22', fill: !dashed, tension: 0.35, pointRadius: 3, borderWidth: 2, borderDash: dashed ? [5, 5] : [], pointBackgroundColor: r.pts.map(p => riskColor(p.terr)) };
  }
  function renderCharts() {
    const r = ev(activeOp());
    const best = r.best.isMain ? r.alts[0] : r.best;
    const labels = r.main.pts.map(p => p.w.name.split(' (')[0].split(',')[0].slice(0, 14));
    const ds = [lineDataset(t('primary'), r.main, '#22d3ee', false)];
    if (best) ds.push({ ...lineDataset(`${t('alt')}: ${best.name.slice(0, 28)}`, best, '#34d399', true), data: resample(best.pts.map(p => p.terr), labels.length) });
    const opts = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { boxWidth: 10, font: { size: 9 } } }, tooltip: { backgroundColor: 'rgba(11,15,25,.95)', borderColor: 'rgba(34,211,238,.3)', borderWidth: 1 } }, scales: { y: { min: 0, max: 10, grid: { color: 'rgba(148,163,184,.08)' } }, x: { ticks: { maxRotation: 45, font: { size: 8 } }, grid: { display: false } } } };
    ['chart-profile', 'chart-compare'].forEach(id => {
      if (charts[id]) charts[id].destroy();
      charts[id] = new Chart($('#' + id), { type: 'line', data: { labels, datasets: ds }, options: opts });
    });
    if (charts.radar) charts.radar.destroy();
    const rd = x => [fmt1(x.terr), fmt1(x.vuln), fmt1(x.expo)];
    const radarDs = [{ label: t('primary'), data: rd(r.main), borderColor: '#22d3ee', backgroundColor: 'rgba(34,211,238,.15)', pointBackgroundColor: '#22d3ee' }];
    if (best) radarDs.push({ label: `${t('alt')}: ${best.name.slice(0, 24)}`, data: rd(best), borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,.15)', pointBackgroundColor: '#34d399' });
    charts.radar = new Chart($('#chart-radar'), { type: 'radar', data: { labels: [t('dim_terr'), t('dim_vuln'), t('dim_expo')], datasets: radarDs }, options: { responsive: true, maintainAspectRatio: false, scales: { r: { min: 0, max: 10, ticks: { display: false }, grid: { color: 'rgba(148,163,184,.15)' }, angleLines: { color: 'rgba(148,163,184,.15)' }, pointLabels: { color: '#cbd5e1', font: { size: 10 } } } }, plugins: { legend: { labels: { boxWidth: 10, font: { size: 9 } } } } } });
  }
  function resample(arr, n) { if (arr.length === n) return arr.map(v => +fmt1(v)); const out = []; for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * (arr.length - 1); const a = Math.floor(x), b = Math.min(arr.length - 1, a + 1); out.push(+fmt1(arr[a] + (arr[b] - arr[a]) * (x - a))); } return out; }

  // ------------------------------------------------------------------
  // Renderers — sidebar
  // ------------------------------------------------------------------
  function renderSidebar() {
    const r = ev(activeOp()); const op = r.op; const p = r.main.profile;
    $('#sb-op-id').textContent = op.id;
    $('#sb-op-select').innerHTML = state.operations.map(o => `<option value="${o.id}" ${o.id === state.opId ? 'selected' : ''}>${o.id} · ${D.routes[o.routeId].origin.split(' (')[0]} → ${D.routes[o.routeId].destination.split(' (')[0]}</option>`).join('');
    $('#sb-op-summary').innerHTML = `
      <div class="font-semibold text-slate-100 leading-snug">${op.product}</div>
      <div class="text-slate-400">${op.company} · ${t('type_' + op.type)}</div>
      <div class="flex items-center gap-2 pt-1"><i data-lucide="map-pin" class="w-3.5 h-3.5 text-cyan-300"></i><span>${r.route.origin}</span></div>
      <div class="flex items-center gap-2"><i data-lucide="flag" class="w-3.5 h-3.5 text-emerald-300"></i><span>${r.route.destination}</span></div>
      <div class="flex items-center gap-2"><i data-lucide="calendar-clock" class="w-3.5 h-3.5 text-slate-400"></i><span class="font-mono">${fmtDT(op.departure)}</span><span class="text-slate-500">→ ETA</span><span class="font-mono text-amber-200">${fmtDT(r.main.eta)}</span></div>
      <div class="grid grid-cols-3 gap-2 pt-2">
        ${[['dim_terr', r.main.terr], ['dim_vuln', r.main.vuln], ['dim_expo', r.main.expo]].map(([k, v]) => `<div class="rounded-lg bg-space-900/60 border border-white/5 p-2 text-center"><div class="num text-base font-bold" style="color:${riskColor(v)}">${fmt1(v)}</div><div class="text-[.55rem] uppercase tracking-wider text-slate-500 leading-tight">${t(k + '_s')}</div></div>`).join('')}
      </div>
      <div class="flex items-center justify-between pt-1"><span class="text-slate-400">${t('col_impact')}</span>${impactBadge(r.impact)}</div>
      <div class="flex items-center justify-between"><span class="text-slate-400">${t('col_slow')}</span><span class="num text-rose-300">+${r.main.delayPct}% (${fmt1(r.main.delayH)} h)</span></div>
      <div class="flex items-center justify-between"><span class="text-slate-400">${t('integrity')}</span><span class="num" style="color:${r.main.integrity > 70 ? '#34d399' : r.main.integrity > 45 ? '#fbbf24' : '#fb7185'}">${r.main.integrity}/100</span></div>`;
    // cargo
    $('#sb-cargo').innerHTML = `
      <div class="flex items-center gap-2 mb-2">${op.cargo.map(id => `<span class="badge badge-slate"><i data-lucide="${cargoById(id).icon}" class="w-3 h-3"></i>${L_(cargoById(id)).split(' /')[0]}</span>`).join('')}${op.mixed || op.cargo.length > 1 ? `<span class="badge badge-cyan">${t('f_mixed')}</span>` : ''}</div>
      <div class="flex items-center justify-between text-xs mb-2"><span class="text-slate-400">${state.lang === 'es' ? 'Rango' : 'Range'}</span><span class="font-mono text-cyan-200">${p.tMin} °C … ${p.tMax} °C</span>${p.frozen ? '<i data-lucide="snowflake" class="w-3.5 h-3.5 text-cyan-300"></i>' : p.refrigerated ? '<i data-lucide="thermometer-snowflake" class="w-3.5 h-3.5 text-cyan-300"></i>' : ''}</div>
      ${thresholdBars(p)}`;
    // layers
    $('#layer-toggles').innerHTML = D.sources.map(s => `<div class="flex items-center gap-2.5 text-xs"><span class="toggle ${state.layers[s.id] ? 'on' : ''}" data-layer="${s.id}"></span><span class="dot" style="background:${s.color}"></span><span class="flex-1">${s.name}</span><span class="text-[.6rem] text-slate-500 font-mono">${s.res}</span></div>`).join('');
    $$('#layer-toggles .toggle').forEach(el => el.onclick = () => { const id = el.dataset.layer; state.layers[id] = !state.layers[id]; el.classList.toggle('on'); state.layers[id] ? hazardGroups[id].addTo(map) : map.removeLayer(hazardGroups[id]); renderLegend(); });
    // source status
    $('#source-status').innerHTML = D.sources.map(s => { const d = s.latencyMin == null ? (s.id === 'sedac' ? '2020 ref.' : 'static') : (s.latencyMin < 60 ? `${s.latencyMin} min` : `${fmt1(s.latencyMin / 60)} h`); return `<div class="flex items-center gap-2 text-[.7rem]"><span class="live-dot" style="--tw:1;background:${s.latencyMin != null && s.latencyMin > 400 ? '#fbbf24' : '#34d399'}"></span><span class="flex-1 text-slate-300">${s.name}</span><span class="font-mono text-slate-500">${s.cadence}</span><span class="font-mono text-cyan-200/80 w-14 text-right">${d}</span></div>`; }).join('');
    $('#validation-layers').innerHTML = `<span class="text-slate-400 font-semibold">${state.lang === 'es' ? 'Capas de validación' : 'Validation layers'}:</span> ${D.validationLayers.join(' · ')}`;
    state.icons();
  }
  function thresholdBars(p) {
    const rows = [['thr_heat', p.heat], ['thr_cold', p.cold], ['thr_hum', p.humidity], ['thr_water', p.water], ['thr_frag', p.fragility], ['thr_delay', 1 - clamp(p.maxDelayH / 240)]];
    return `<div class="space-y-1.5">${rows.map(([k, v]) => `<div class="flex items-center gap-2 text-[.68rem]"><span class="w-16 text-slate-400">${t(k)}</span><div class="threshold-bar flex-1"><i style="width:${Math.round(v * 100)}%"></i></div><span class="num w-8 text-right text-slate-300">${Math.round(v * 100)}</span></div>`).join('')}</div>`;
  }

  // ------------------------------------------------------------------
  // Renderers — map view (KPIs, feed, route table)
  // ------------------------------------------------------------------
  function renderKPIs() {
    const all = evAll();
    const impactedRoutes = all.filter(x => x.main.overall >= 3.8).length;
    const places = new Map(); all.forEach(x => x.main.pts.forEach(p => places.set(p.w.name, Math.max(places.get(p.w.name) || 0, p.terr))));
    const impactedPlaces = [...places.values()].filter(v => v >= 3.8).length;
    const pop = all.reduce((a, x) => a + x.main.popExposed, 0);
    const ess = all.filter(x => x.op.essential && x.main.overall >= 3.8).length; const essTot = all.filter(x => x.op.essential).length;
    const ring = (p, c, txt) => `<div class="ring" style="--p:${p};--c:${c}"><span>${txt}</span></div>`;
    const card = (title, ringHtml, sub, icon) => `<div class="glass p-3.5 flex items-center gap-3 card-hover"><div>${ringHtml}</div><div class="min-w-0"><div class="label">${title}</div><div class="text-xs text-slate-300 mt-0.5 leading-snug">${sub}</div></div><i data-lucide="${icon}" class="w-4 h-4 text-slate-600 ml-auto shrink-0"></i></div>`;
    $('#kpi-row').innerHTML = [
      card(t('kpi_routes'), ring((impactedRoutes / all.length) * 100, '#22d3ee', pct((impactedRoutes / all.length) * 100)), `${impactedRoutes}/${all.length} ${t('ops_total')}`, 'route'),
      card(t('kpi_places'), ring((impactedPlaces / places.size) * 100, '#fbbf24', pct((impactedPlaces / places.size) * 100)), `${impactedPlaces}/${places.size} · ${t('win_' + state.window)}`, 'map-pinned'),
      card(t('kpi_pop'), ring(clamp(pop / 3e6) * 100, '#a78bfa', fmtPop(pop)), 'SEDAC GPW v4.11 · 2020', 'users'),
      card(t('kpi_essential'), ring((ess / Math.max(1, essTot)) * 100, '#fb7185', `${ess}/${essTot}`), `${state.lang === 'es' ? 'medicamentos · alimentos' : 'medicines · food'}`, 'heart-pulse'),
    ].join('');
    $('#src-ok').textContent = `${D.sources.length}/${D.sources.length}`;
    state.icons();
  }
  function alertCard(a, compact) {
    const s = srcById(a.source); const mine = a.routeId === activeOp().routeId;
    return `<div class="alert-item sev-${a.severity} glass rounded-lg p-2.5 ${a.isNew ? 'new' : ''} ${mine ? '' : 'opacity-70'}" data-alert="${a.id}">
      <div class="flex items-center gap-2 mb-1"><span class="dot" style="background:${s.color}"></span><span class="font-mono text-[.65rem] text-slate-300">${s.name}</span>${mine ? `<span class="badge badge-cyan !py-0">${a.routeId}</span>` : `<span class="text-[.6rem] text-slate-500 font-mono">${a.routeId}</span>`}<span class="ml-auto text-[.6rem] font-mono text-slate-500">${ago(a)}</span></div>
      <div class="font-semibold text-xs text-slate-100">${a.place}</div>
      <div class="font-mono text-[.68rem] text-cyan-200 my-0.5">${a.value}</div>
      ${compact ? '' : `<div class="text-[.72rem] text-slate-300 leading-relaxed">${L_(a)}</div>`}
      <div class="flex items-center gap-1.5 mt-1.5 flex-wrap">${stateBadge(a.state)}<span class="badge badge-${a.severity === 'medium' ? 'med' : a.severity}">${a.severity.toUpperCase()}</span>${compact ? '' : `<button class="btn btn-ghost btn-xs ml-auto" data-fly="${a.lat},${a.lng}"><i data-lucide="crosshair" class="w-3 h-3"></i>${t('apply')}</button>`}</div></div>`;
  }
  function renderFeed() {
    const list = [...state.alerts].sort((a, b) => a.minsAgo - b.minsAgo);
    $('#feed-compact').innerHTML = list.slice(0, 12).map(a => alertCard(a, true)).join('');
    $$('#feed-compact [data-alert]').forEach(el => el.onclick = () => { const a = state.alerts.find(x => x.id === el.dataset.alert); map.flyTo([a.lat, a.lng], 8, { duration: 1 }); hazardGroups[a.source].eachLayer(l => { if (l.getLatLng && Math.abs(l.getLatLng().lat - a.lat) < 1e-6) setTimeout(() => l.openPopup(), 1100); }); });
    const high = state.alerts.filter(a => a.severity === 'high').length;
    $('#nav-alert-count').textContent = high; $$('#nav-tabs-mobile .nav-alert-count').forEach(e => e.textContent = high);
    state.icons();
  }
  function renderRouteTable() {
    const all = evAll();
    const head = `<thead><tr><th></th><th>${t('col_op')}</th><th>${t('col_route')}</th><th>${t('col_dep')}</th><th>${t('col_impact')}</th><th>${t('col_slow')}</th><th>${t('col_eta')}</th><th>${t('col_risk')}</th><th>${t('col_alerts')}</th></tr></thead>`;
    const rows = all.map(x => {
      const sel = x.op.id === state.opId;
      const main = `<tr class="row-main ${sel ? 'selected' : ''}" data-op="${x.op.id}">
        <td><i data-lucide="${sel ? 'chevron-down' : 'chevron-right'}" class="w-3.5 h-3.5 text-slate-500"></i></td>
        <td><div class="font-mono text-[.7rem] text-cyan-200">${x.op.id}</div><div class="text-[.65rem] text-slate-500">${cargoName(x.op)}</div></td>
        <td><div class="font-medium">${x.route.origin}</div><div class="text-[.65rem] text-slate-500">→ ${x.route.destination}</div></td>
        <td class="num text-slate-300">${fmtDT(x.op.departure)}</td>
        <td>${impactBadge(x.impact)}</td>
        <td><span class="num ${x.main.delayPct >= 30 ? 'text-rose-300' : x.main.delayPct >= 18 ? 'text-amber-300' : 'text-emerald-300'}">+${x.main.delayPct}%</span></td>
        <td class="num">${fmtDT(x.main.eta)}</td>
        <td><div class="flex items-center gap-2">${bar(x.main.maxTerr)}<span class="num">${fmt1(x.main.maxTerr)}</span>${x.main.closure ? '<i data-lucide="octagon-x" class="w-3.5 h-3.5 text-rose-400"></i>' : x.main.incident ? '<i data-lucide="triangle-alert" class="w-3.5 h-3.5 text-amber-400"></i>' : ''}</div></td>
        <td>${hazardIcons(x.main)}</td></tr>`;
      if (!sel) return main;
      const alts = x.alts.map(a => `<tr class="row-alt"><td></td><td colspan="2"><div class="flex items-center gap-2"><i data-lucide="corner-down-right" class="w-3.5 h-3.5 text-slate-500"></i><span>${a.name}</span>${a.recommended ? `<span class="badge badge-low"><i data-lucide="sparkles" class="w-3 h-3"></i>${t('recommended')}</span>` : ''}</div></td>
        <td class="num text-slate-400">${a.distanceKm} km</td><td>${impactBadge(riskClass(a.overall))}</td>
        <td><span class="num ${a.delayPct >= 30 ? 'text-rose-300' : a.delayPct >= 18 ? 'text-amber-300' : 'text-emerald-300'}">+${a.delayPct}%</span></td>
        <td class="num">${fmtDT(a.eta)} <span class="text-[.62rem] ${a.delta > 0 ? 'text-rose-300' : 'text-emerald-300'}">(${a.delta > 0 ? '+' : ''}${fmt1(a.delta)} h)</span></td>
        <td><div class="flex items-center gap-2">${bar(a.maxTerr)}<span class="num">${fmt1(a.maxTerr)}</span></div></td>
        <td>${a.path.waypoints === null ? '' : `<button class="btn btn-ghost btn-xs ${state.shownAlt === a.id ? '!border-cyan-400/60 text-cyan-200' : ''}" data-showalt="${a.id}"><i data-lucide="eye" class="w-3 h-3"></i>${state.shownAlt === a.id ? t('applied') : t('apply')}</button>`}</td></tr>`).join('');
      const keep = x.best.isMain ? `<tr class="row-alt"><td></td><td colspan="8" class="text-emerald-300 text-[.72rem]"><i data-lucide="check-circle-2" class="w-3.5 h-3.5 inline mr-1"></i>${t('keep')} — ${state.lang === 'es' ? 'la ruta prevista mantiene la menor exposición ponderada.' : 'the planned route keeps the lowest weighted exposure.'}</td></tr>` : '';
      return main + (alts || `<tr class="row-alt"><td></td><td colspan="8" class="text-slate-500">${t('no_alt')}</td></tr>`) + keep;
    }).join('');
    $('#route-table').innerHTML = head + `<tbody>${rows}</tbody>`;
    bindTableActions('#route-table');
    state.icons();
  }
  function hazardIcons(r) {
    const mx = k => Math.max(...r.pts.map(p => p.f[k]));
    const items = [['flood', 'cloud-rain', '#38bdf8', 'hz_rain'], ['fire', 'flame', '#fb923c', 'hz_fire'], ['heat', 'thermometer-sun', '#f43f5e', 'hz_heat'], ['snow', 'snowflake', '#a5f3fc', 'hz_snow'], ['cold', 'thermometer-snowflake', '#67e8f9', 'hz_cold']];
    return `<div class="flex items-center gap-1">${items.filter(([k]) => mx(k) >= 0.3).map(([k, ic, c, lbl]) => `<span title="${t(lbl)} ${Math.round(mx(k) * 100)}%" class="w-6 h-6 rounded-md grid place-items-center" style="background:${c}22;color:${c}"><i data-lucide="${ic}" class="w-3.5 h-3.5"></i></span>`).join('') || '<span class="text-slate-600">—</span>'}</div>`;
  }
  function bindTableActions(sel) {
    $$(sel + ' tr.row-main').forEach(tr => tr.onclick = () => selectOp(tr.dataset.op));
    $$(sel + ' [data-showalt]').forEach(b => b.onclick = e => { e.stopPropagation(); state.shownAlt = state.shownAlt === b.dataset.showalt ? null : b.dataset.showalt; renderAll(); if (state.view !== 'map') setView('map'); const r = ev(activeOp()); const a = r.alts.find(x => x.id === state.shownAlt); if (a) map.flyToBounds(L.latLngBounds(latlngs(a.wps)).pad(0.2), { duration: 1 }); });
  }

  // ------------------------------------------------------------------
  // Module 1 — Operations
  // ------------------------------------------------------------------
  function renderOps() {
    const all = evAll();
    const high = all.filter(x => x.impact === 'high').length, ess = all.filter(x => x.op.essential).length, pend = all.filter(x => x.op.status === 'pending').length;
    const k = (icon, v, l, c) => `<div class="glass p-3.5 flex items-center gap-3 card-hover"><div class="w-10 h-10 rounded-xl grid place-items-center" style="background:${c}22;color:${c}"><i data-lucide="${icon}" class="w-5 h-5"></i></div><div><div class="num text-xl font-bold text-white">${v}</div><div class="text-[.65rem] text-slate-400">${l}</div></div></div>`;
    $('#ops-kpis').innerHTML = k('briefcase', all.length, t('ops_total'), '#22d3ee') + k('siren', high, t('ops_high'), '#fb7185') + k('heart-pulse', ess, t('ops_essential'), '#a78bfa') + k('hourglass', pend, t('status_pending'), '#fbbf24');
    $('#ops-subtitle').textContent = state.lang === 'es' ? 'Registro y seguimiento de operaciones de importación, exportación y tránsito internacional.' : 'Register and track import, export and international transit operations.';
    const head = `<thead><tr><th>${t('col_op')}</th><th>${t('f_type')}</th><th>${t('col_route')}</th><th>${t('f_route')}</th><th>${t('col_dep')}</th><th>${t('col_cargo')}</th><th>${t('col_impact')}</th><th>${t('col_slow')}</th><th>${t('col_eta')}</th><th>${t('col_status')}</th></tr></thead>`;
    const rows = all.sort((a, b) => b.main.overall - a.main.overall).map(x => `<tr class="row-main ${x.op.id === state.opId ? 'selected' : ''}" data-op="${x.op.id}">
      <td><div class="font-mono text-[.7rem] text-cyan-200">${x.op.id}</div><div class="text-[.65rem] text-slate-500">${x.op.company}</div></td>
      <td><span class="badge badge-slate">${t('type_' + x.op.type)}</span>${x.op.essential ? '<i data-lucide="heart-pulse" class="w-3.5 h-3.5 text-rose-300 inline ml-1" title="Esencial"></i>' : ''}</td>
      <td><div class="font-medium">${x.route.origin}</div><div class="text-[.65rem] text-slate-500">→ ${x.route.destination}</div></td>
      <td class="text-[.7rem] text-slate-400">${x.route.corridor}<div class="font-mono text-[.62rem]">${x.route.distanceKm} km · ${x.main.mode}</div></td>
      <td class="num text-slate-300">${fmtDT(x.op.departure)}</td>
      <td><div class="text-xs">${x.op.product}</div><div class="text-[.65rem] text-slate-500">${cargoName(x.op)}${x.op.mixed ? ' · ' + t('f_mixed') : ''}</div></td>
      <td>${impactBadge(x.impact)}<div class="num text-[.62rem] text-slate-500 mt-0.5">${fmt1(x.main.overall)}/10</div></td>
      <td class="num">+${x.main.delayPct}%</td><td class="num">${fmtDT(x.main.eta)}</td>
      <td><span class="badge ${x.op.status === 'analyzed' ? 'badge-low' : 'badge-med'}">${t('status_' + x.op.status)}</span></td></tr>`).join('');
    $('#ops-table').innerHTML = head + `<tbody>${rows}</tbody>`;
    $$('#ops-table tr.row-main').forEach(tr => tr.onclick = () => { selectOp(tr.dataset.op); setView('map'); });
    $('#f-route').innerHTML = Object.values(D.routes).map(r => `<option value="${r.id}">${r.origin} → ${r.destination} · ${r.corridor}</option>`).join('');
    $('#f-cargo').innerHTML = D.cargoProfiles.map(c => `<option value="${c.id}">${L_(c)}</option>`).join('');
    state.icons();
  }
  function setupOpsForm() {
    $('#btn-new-op').onclick = () => { $('#op-form').classList.toggle('hidden'); };
    $('#btn-cancel-op').onclick = () => $('#op-form').classList.add('hidden');
    $('#f-essential').onclick = e => e.target.classList.toggle('on');
    $('#btn-save-op').onclick = () => {
      const cat = cargoById($('#f-cargo').value);
      const id = 'OP-2026-0' + (450 + state.operations.length);
      const op = { id, type: $('#f-type').value, routeId: $('#f-route').value, cargo: [cat.id], product: $('#f-product').value || cat.example, company: $('#f-company').value || '—', departure: $('#f-date').value || '2026-11-13T06:00', mode: $('#f-mode').value, status: 'analyzed', essential: $('#f-essential').classList.contains('on'),
        sheet: { tMin: cat.tMin, tMax: cat.tMax, humidity: cat.humidity, water: cat.water, fragility: cat.fragility, maxDelayH: cat.maxDelayH } };
      state.operations.push(op); state.opId = id; state.shownAlt = null; $('#op-form').classList.add('hidden');
      toast(t('op_created') + ` · ${id}`); renderAll(); setView('map'); setTimeout(focusRoute, 300);
    };
  }

  // ------------------------------------------------------------------
  // Module 2 — Cargo
  // ------------------------------------------------------------------
  function renderCargo() {
    const op = activeOp(); const p = effectiveProfile(op);
    $('#cargo-subtitle').textContent = `${op.id} · ${op.product}`;
    $('#mixed-toggle').classList.toggle('on', state.mixed);
    $('#cargo-cards').innerHTML = D.cargoProfiles.map(c => `<div class="glass p-3.5 cargo-card card-hover cursor-pointer ${op.cargo.includes(c.id) ? 'active' : ''}" data-cargo="${c.id}">
      <div class="flex items-center justify-between mb-2"><div class="w-9 h-9 rounded-lg grid place-items-center bg-space-900/70 border border-white/5"><i data-lucide="${c.icon}" class="w-4.5 h-4.5 text-emerald-300"></i></div>${c.refrigerated ? `<span class="badge badge-cyan">${c.frozen ? '❄ ' + c.tMin + '…' + c.tMax + ' °C' : c.tMin + '…' + c.tMax + ' °C'}</span>` : `<span class="badge badge-slate">${c.tMin}…${c.tMax} °C</span>`}</div>
      <div class="font-semibold text-xs leading-snug">${L_(c)}</div><div class="text-[.62rem] text-slate-500 mt-0.5 leading-snug">${c.example}</div>
      <div class="grid grid-cols-3 gap-1 mt-2 text-[.58rem] text-slate-400"><span>${t('thr_heat')} <b class="text-slate-200">${Math.round(c.heat * 100)}</b></span><span>${t('thr_water')} <b class="text-slate-200">${Math.round(c.water * 100)}</b></span><span>${t('thr_frag')} <b class="text-slate-200">${Math.round(c.fragility * 100)}</b></span></div></div>`).join('');
    $$('#cargo-cards [data-cargo]').forEach(el => el.onclick = () => {
      const id = el.dataset.cargo;
      if (state.mixed) { op.cargo.includes(id) ? (op.cargo.length > 1 && op.cargo.splice(op.cargo.indexOf(id), 1)) : op.cargo.push(id); op.mixed = op.cargo.length > 1; }
      else { op.cargo = [id]; op.mixed = false; }
      const c = cargoById(op.cargo[0]); const ep = effectiveProfile({ ...op, sheet: {} });
      op.sheet = { tMin: ep.tMin, tMax: ep.tMax, humidity: ep.humidity, water: ep.water, fragility: ep.fragility, maxDelayH: ep.maxDelayH };
      if (!state.mixed) op.product = op.product || c.example;
      renderAll();
    });
    const s = op.sheet;
    $('#s-product').value = op.product; $('#s-tmin').value = s.tMin; $('#s-tmax').value = s.tMax; $('#s-delay').value = s.maxDelayH; $('#s-hum').value = s.humidity; $('#s-water').value = s.water; $('#s-frag').value = s.fragility;
    $('#s-refrig').classList.toggle('on', !!p.refrigerated); $('#s-frozen').classList.toggle('on', !!p.frozen);
    const r = ev(op);
    const vp = r.main.pts.reduce((acc, pt) => { Object.entries(pt.vparts).forEach(([k, v]) => acc[k] = Math.max(acc[k] || 0, v)); return acc; }, {});
    $('#cargo-threshold-panel').innerHTML = `<div class="flex items-center gap-2 mb-3"><i data-lucide="shield-alert" class="w-4 h-4 text-amber-300"></i><span class="font-semibold text-sm">${t('dim_vuln')}</span><span class="badge badge-${riskClass(r.main.vuln)} ml-auto">${fmt1(r.main.vuln)}/10</span></div>
      <div class="text-[.68rem] text-slate-400 mb-3">${t('dim_vuln_d')}</div>${thresholdBars(p)}
      <div class="label mt-4 mb-2">${state.lang === 'es' ? 'Exposición por amenaza en ruta' : 'Exposure by threat on route'}</div>
      <div class="space-y-1.5">${[['heat', 'thermometer-sun', 'hz_heat'], ['cold', 'thermometer-snowflake', 'hz_cold'], ['water', 'cloud-rain', 'hz_rain'], ['fire', 'flame', 'hz_fire'], ['fragility', 'package-open', 'thr_frag']].map(([k, ic, l]) => `<div class="flex items-center gap-2 text-[.7rem]"><i data-lucide="${ic}" class="w-3.5 h-3.5 text-slate-400"></i><span class="w-20 text-slate-300">${t(l)}</span><div class="risk-bar flex-1"><i style="width:${Math.round((vp[k] || 0) * 100)}%;background:${riskColor((vp[k] || 0) * 10)}"></i></div><span class="num w-8 text-right">${Math.round((vp[k] || 0) * 100)}</span></div>`).join('')}</div>
      <div class="mt-4 pt-3 border-t border-white/5 text-[.65rem] text-slate-500 leading-relaxed">${t('alert_note')}</div>`;
    state.icons();
  }
  function setupCargo() {
    $('#mixed-toggle').onclick = () => { state.mixed = !state.mixed; renderCargo(); };
    $('#s-refrig').onclick = e => e.target.classList.toggle('on'); $('#s-frozen').onclick = e => e.target.classList.toggle('on');
    $('#btn-save-sheet').onclick = () => {
      const op = activeOp();
      op.product = $('#s-product').value || op.product;
      op.sheet = { tMin: +$('#s-tmin').value, tMax: +$('#s-tmax').value, maxDelayH: +$('#s-delay').value, humidity: +$('#s-hum').value, water: +$('#s-water').value, fragility: +$('#s-frag').value, refrigerated: $('#s-refrig').classList.contains('on'), frozen: $('#s-frozen').classList.contains('on') };
      toast(state.lang === 'es' ? 'Ficha técnica guardada · análisis recalculado' : 'Technical sheet saved · analysis recalculated'); renderAll();
    };
  }

  // ------------------------------------------------------------------
  // Module 4 — Alerts
  // ------------------------------------------------------------------
  function renderAlerts() {
    const op = activeOp(); const r = ev(op);
    const counts = { satellite: 0, reported: 0, confirmed: 0 }; state.alerts.forEach(a => counts[a.state]++);
    const desc = { satellite: state.lang === 'es' ? 'Observación satelital NASA. Indica condiciones potenciales; no confirma afectación de la vía.' : 'NASA satellite observation. Indicates potential conditions; does not confirm road impact.', reported: state.lang === 'es' ? 'Reporte de transportistas, medios u operadores. Pendiente de confirmación oficial.' : 'Report from carriers, media or operators. Pending official confirmation.', confirmed: state.lang === 'es' ? 'Cierre o restricción confirmada por autoridad competente (ABC, DOT, Caltrans…).' : 'Closure or restriction confirmed by competent authority (ABC, DOT, Caltrans…).' };
    const ic = { satellite: 'satellite', reported: 'message-square-warning', confirmed: 'octagon-x' }; const col = { satellite: '#22d3ee', reported: '#fbbf24', confirmed: '#fb7185' };
    $('#alert-states').innerHTML = ['satellite', 'reported', 'confirmed'].map(s => `<div class="glass p-4 card-hover cursor-pointer ${state.alertFilter === s ? 'glow-cyan' : ''}" data-f="${s}"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-xl grid place-items-center" style="background:${col[s]}22;color:${col[s]}"><i data-lucide="${ic[s]}" class="w-5 h-5"></i></div><div class="flex-1"><div class="font-semibold text-xs">${t('state_' + s)}</div><div class="text-[.62rem] text-slate-400 leading-snug mt-0.5">${desc[s]}</div></div><div class="num text-2xl font-bold" style="color:${col[s]}">${counts[s]}</div></div></div>`).join('');
    $$('#alert-states [data-f]').forEach(el => el.onclick = () => { state.alertFilter = state.alertFilter === el.dataset.f ? 'all' : el.dataset.f; $$('#alert-filter button').forEach(b => b.classList.toggle('active', b.dataset.f === state.alertFilter)); renderAlerts(); });
    const list = [...state.alerts].filter(a => state.alertFilter === 'all' || a.state === state.alertFilter).sort((a, b) => (a.routeId === op.routeId ? -1 : 1) - (b.routeId === op.routeId ? -1 : 1) || a.minsAgo - b.minsAgo);
    $('#alert-list').innerHTML = list.map(a => alertCard(a, false)).join('');
    $$('#alert-list [data-fly]').forEach(b => b.onclick = () => { const [la, ln] = b.dataset.fly.split(',').map(Number); setView('map'); setTimeout(() => map.flyTo([la, ln], 9, { duration: 1.2 }), 150); });
    // exposure panel for active operation
    const rel = r.alerts.map(a => ({ a, rel: relevance(a, r.main.profile) })).sort((x, y) => y.rel - x.rel);
    $('#exposure-panel').innerHTML = `<div class="flex items-center gap-2 mb-1"><i data-lucide="crosshair" class="w-4 h-4 text-cyan-300"></i><span class="font-semibold text-sm">${t('dim_expo')} · ${op.id}</span></div><div class="text-[.65rem] text-slate-400 mb-3">${cargoName(op)} · ${state.lang === 'es' ? 'relevancia según vulnerabilidad de la mercancía' : 'relevance by cargo vulnerability'}</div>
      <div class="space-y-2">${rel.map(({ a, rel }) => `<div class="flex items-center gap-2 text-[.7rem]"><span class="dot" style="background:${srcById(a.source).color}"></span><span class="flex-1 truncate">${a.place}</span><div class="risk-bar w-16"><i style="width:${Math.round(rel * 100)}%;background:${riskColor(rel * 10)}"></i></div><span class="num w-7 text-right">${Math.round(rel * 100)}</span></div>`).join('') || `<div class="text-slate-500 text-xs">—</div>`}</div>
      <div class="grid grid-cols-3 gap-2 mt-4">${[['dim_terr', r.main.terr], ['dim_vuln', r.main.vuln], ['dim_expo', r.main.expo]].map(([k, v]) => `<div class="rounded-lg bg-space-900/60 border border-white/5 p-2 text-center"><div class="num text-lg font-bold" style="color:${riskColor(v)}">${fmt1(v)}</div><div class="text-[.55rem] uppercase tracking-wider text-slate-500 leading-tight">${t(k)}</div></div>`).join('')}</div>`;
    const popPts = r.main.pts.filter(p => p.w.h.pop >= 100).sort((a, b) => b.w.h.pop - a.w.h.pop).slice(0, 5);
    $('#pop-panel').innerHTML = `<div class="flex items-center gap-2 mb-1"><i data-lucide="users" class="w-4 h-4 text-violet-300"></i><span class="font-semibold text-sm">${t('kpi_pop')}</span></div><div class="text-[.65rem] text-slate-400 mb-3">SEDAC GPW v4.11 · ${state.lang === 'es' ? 'localidades que dependen del corredor' : 'towns depending on the corridor'} ${r.route.corridor}</div>
      <div class="space-y-2">${popPts.map(p => `<div class="flex items-center gap-2 text-[.7rem]"><span class="flex-1">${p.w.name}</span><span class="num text-slate-400">${p.w.h.pop.toLocaleString()} hab/km²</span>${p.terr >= 3.8 ? `<span class="badge badge-${riskClass(p.terr)}">${fmt1(p.terr)}</span>` : '<span class="badge badge-low">ok</span>'}</div>`).join('')}</div>
      <div class="mt-3 pt-3 border-t border-white/5 text-xs flex justify-between"><span class="text-slate-400">${state.lang === 'es' ? 'Población expuesta (est.)' : 'Exposed population (est.)'}</span><span class="num text-violet-200">${fmtPop(r.main.popExposed)}</span></div>
      ${op.essential ? `<div class="mt-2 text-[.65rem] text-rose-300 flex items-start gap-1"><i data-lucide="heart-pulse" class="w-3.5 h-3.5 shrink-0"></i><span>${state.lang === 'es' ? 'Operación esencial: una interrupción prolongada afecta la disponibilidad de productos críticos para la población.' : 'Essential operation: a prolonged disruption affects availability of critical goods for the population.'}</span></div>` : ''}`;
    state.icons();
  }
  function relevance(a, p) {
    const base = a.severity === 'high' ? 0.9 : a.severity === 'medium' ? 0.6 : 0.3;
    const sens = { gpm: Math.max(p.water, p.humidity), smap: p.water, firms: 0.5 + 0.5 * p.heat, modis: p.heat, eco: p.heat, dem: Math.max(p.cold, p.fragility), sedac: 0.6 }[a.source] ?? 0.5;
    const st = a.state === 'confirmed' ? 1 : a.state === 'reported' ? 0.85 : 0.7;
    return clamp(base * (0.4 + 0.6 * sens) * st);
  }

  // ------------------------------------------------------------------
  // Module 5 — Comparator
  // ------------------------------------------------------------------
  function renderCompare() {
    const r = ev(activeOp());
    $('#compare-subtitle').textContent = `${r.op.id} · ${r.route.origin} → ${r.route.destination} · ${cargoName(r.op)} · ${t('win_' + state.window)}`;
    const dims = [['dim_terr', 'dim_terr_d', r.main.terr, 'mountain-snow', '#22d3ee'], ['dim_vuln', 'dim_vuln_d', r.main.vuln, 'package-check', '#34d399'], ['dim_expo', 'dim_expo_d', r.main.expo, 'network', '#a78bfa']];
    $('#dims-row').innerHTML = dims.map(([k, d, v, ic, c], i) => `<div class="glass p-4 card-hover"><div class="flex items-center gap-3"><div class="w-10 h-10 rounded-xl grid place-items-center" style="background:${c}22;color:${c}"><i data-lucide="${ic}" class="w-5 h-5"></i></div><div class="flex-1"><div class="label">${i + 1}. ${t(k)}</div><div class="text-[.65rem] text-slate-400 leading-snug mt-0.5">${t(d)}</div></div><div class="num text-2xl font-bold" style="color:${riskColor(v)}">${fmt1(v)}</div></div><div class="risk-bar mt-3"><i style="width:${v * 10}%;background:${riskColor(v)}"></i></div></div>`).join('');
    const cands = [r.main, ...r.alts];
    const head = `<thead><tr><th>${t('f_route')}</th><th>${t('col_dist')}</th><th>${t('col_time')}</th><th>${t('col_slow')}</th><th>${t('col_eta')}</th><th>1. ${t('col_terr')}</th><th>2. ${t('col_vuln')}</th><th>3. ${t('col_expo')}</th><th>${t('col_alerts')}</th><th>${t('col_reports')}</th><th>${t('integrity')}</th><th></th></tr></thead>`;
    const cell = v => `<div class="flex items-center gap-2">${bar(v)}<span class="num">${fmt1(v)}</span></div>`;
    const rows = cands.map(c => `<tr class="${c.isMain ? 'row-main selected' : 'row-main'}">
      <td><div class="flex items-center gap-2">${c.isMain ? '<i data-lucide="navigation" class="w-3.5 h-3.5 text-cyan-300"></i>' : '<i data-lucide="corner-down-right" class="w-3.5 h-3.5 text-slate-500"></i>'}<div><div class="font-medium text-xs">${c.isMain ? t('primary') : c.name}</div><div class="text-[.62rem] text-slate-500">${c.isMain ? r.route.corridor : (c.mode === 'rail' ? 'Rail · intermodal' : t('alt'))}</div></div>${c.recommended ? `<span class="badge badge-low ml-1"><i data-lucide="sparkles" class="w-3 h-3"></i>${t('recommended')}</span>` : ''}</div></td>
      <td class="num">${c.distanceKm} km</td><td class="num">${fmt1(c.adjH)} h <span class="text-[.62rem] text-slate-500">(${c.baseH} ${t('base')})</span></td>
      <td><span class="num ${c.delayPct >= 30 ? 'text-rose-300' : c.delayPct >= 18 ? 'text-amber-300' : 'text-emerald-300'}">+${c.delayPct}%</span></td>
      <td class="num">${fmtDT(c.eta)}${c.isMain ? '' : ` <span class="text-[.62rem] ${c.delta > 0 ? 'text-rose-300' : 'text-emerald-300'}">${c.delta > 0 ? '+' : ''}${fmt1(c.delta)} h</span>`}</td>
      <td>${cell(c.terr)}</td><td>${cell(c.vuln)}</td><td>${cell(c.expo)}</td>
      <td>${hazardIcons(c)}</td>
      <td>${c.reports.length ? c.reports.map(x => stateBadge(x.type === 'closure' ? 'confirmed' : 'reported')).join(' ') : '<span class="text-slate-600">—</span>'}</td>
      <td><span class="num" style="color:${c.integrity > 70 ? '#34d399' : c.integrity > 45 ? '#fbbf24' : '#fb7185'}">${c.integrity}</span></td>
      <td>${c.isMain || c.path.waypoints === null ? '' : `<button class="btn btn-ghost btn-xs" data-showalt="${c.id}"><i data-lucide="eye" class="w-3 h-3"></i>${state.shownAlt === c.id ? t('applied') : t('apply')}</button>`}</td></tr>`).join('');
    const verify = `<tr><td colspan="12" class="text-[.68rem] text-slate-400"><b class="text-slate-300">${t('col_verify')}:</b> ${t('verify_items').join(' · ')}</td></tr>`;
    $('#compare-table').innerHTML = head + `<tbody>${rows}${verify}</tbody>`;
    $$('#compare-table tr.row-main').forEach(tr => tr.onclick = null);
    $$('#compare-table [data-showalt]').forEach(b => b.onclick = () => { state.shownAlt = b.dataset.showalt; renderAll(); setView('map'); const a = r.alts.find(x => x.id === state.shownAlt); setTimeout(() => map.flyToBounds(L.latLngBounds(latlngs(a.wps)).pad(0.2), { duration: 1 }), 150); });
    state.icons();
  }

  // ------------------------------------------------------------------
  // Module 6 — AI assistant (rule-based, grounded on computed data)
  // ------------------------------------------------------------------
  const es = () => state.lang === 'es';
  const tag = s => `<span class="tag badge-state-${s}">${t('state_' + s + '_s')}</span>`;
  function aiAnswer(intent) {
    const r = ev(activeOp()); const op = r.op; const m = r.main; const p = m.profile;
    const hot = m.pts.filter(x => x.terr >= 3.8).sort((a, b) => b.terr - a.terr);
    const sat = r.alerts.filter(a => a.state === 'satellite'), rep = r.alerts.filter(a => a.state === 'reported'), con = r.alerts.filter(a => a.state === 'confirmed');
    const cargo = cargoName(op);
    switch (intent) {
      case 'q1': {
        const all = evAll().sort((a, b) => b.main.overall - a.main.overall);
        return `<h4>${t('q1')}</h4><ul>${all.slice(0, 4).map(x => `<li><b>${x.op.id}</b> ${x.route.origin} → ${x.route.destination} · ${cargoName(x.op)} — ${t('col_impact')} <b style="color:${riskColor(x.main.overall)}">${fmt1(x.main.overall)}/10</b>, +${x.main.delayPct}% ${es() ? 'demora' : 'delay'}${x.main.closure ? ' · ' + tag('confirmed') : x.main.incident ? ' · ' + tag('reported') : ''}${x.op.essential ? (es() ? ' · <i>esencial</i>' : ' · <i>essential</i>') : ''}</li>`).join('')}</ul>
          <p class="mt-2 text-slate-400">${es() ? `Ventana: ${t('win_' + state.window)}. Prioridad sugerida: operaciones esenciales con cadena de frío y reportes confirmados.` : `Window: ${t('win_' + state.window)}. Suggested priority: essential cold-chain operations with confirmed reports.`}</p>`;
      }
      case 'q2':
        return `<h4>${t('q2')} — ${op.id}</h4>${hot.length ? `<ul>${hot.map(x => `<li><b>${x.w.name}</b>: ${t('dim_terr')} <b style="color:${riskColor(x.terr)}">${fmt1(x.terr)}/10</b> — ${hazardText(x)} ${x.w.report ? tag(x.w.report === 'closure' ? 'confirmed' : 'reported') : tag('satellite')}</li>`).join('')}</ul>` : `<p>${es() ? 'Ningún tramo supera el umbral de atención (3.8/10).' : 'No segment exceeds the attention threshold (3.8/10).'}</p>`}
          <p class="mt-2 text-slate-400">${es() ? `Demora estimada +${m.delayPct}% (${fmt1(m.delayH)} h). ETA ajustada ${fmtDT(m.eta)}.` : `Estimated delay +${m.delayPct}% (${fmt1(m.delayH)} h). Adjusted ETA ${fmtDT(m.eta)}.`}</p>`;
      case 'q3': {
        const vp = m.pts.reduce((acc, pt) => { Object.entries(pt.vparts).forEach(([k, v]) => acc[k] = Math.max(acc[k] || 0, v)); return acc; }, {});
        const items = Object.entries(vp).filter(([, v]) => v >= 0.2).sort((a, b) => b[1] - a[1]);
        const name = { heat: es() ? 'Exposición térmica (calor)' : 'Thermal exposure (heat)', cold: es() ? 'Exposición a frío fuera de rango' : 'Cold exposure out of range', water: es() ? 'Humedad / contacto con agua' : 'Humidity / water contact', fire: es() ? 'Incendio próximo (humo, bloqueo, calor)' : 'Nearby fire (smoke, blockage, heat)', fragility: es() ? 'Vibraciones / desvíos (fragilidad)' : 'Vibration / detours (fragility)' };
        return `<h4>${t('q3')}</h4><p>${es() ? `Mercancía: <b>${cargo}</b> · rango ${p.tMin}…${p.tMax} °C · tolerancia a retraso ${p.maxDelayH} h${p.refrigerated ? ' · cadena de frío' : ''}.` : `Cargo: <b>${cargo}</b> · range ${p.tMin}…${p.tMax} °C · delay tolerance ${p.maxDelayH} h${p.refrigerated ? ' · cold chain' : ''}.`}</p>
          <ul>${items.map(([k, v]) => `<li><b>${name[k]}</b>: ${Math.round(v * 100)}% ${es() ? 'de exposición relativa' : 'relative exposure'}</li>`).join('')}</ul>
          <p class="mt-2">${es() ? `Demora estimada ${fmt1(m.delayH)} h frente a tolerancia ${p.maxDelayH} h → ${m.tol >= 1 ? '<b class="text-rose-300">supera la tolerancia</b>' : m.tol >= 0.6 ? '<b class="text-amber-300">consume ' + Math.round(m.tol * 100) + '% de la tolerancia</b>' : '<b class="text-emerald-300">dentro de tolerancia</b>'}. ${t('integrity')}: ${m.integrity}/100.` : `Estimated delay ${fmt1(m.delayH)} h vs tolerance ${p.maxDelayH} h → ${m.tol >= 1 ? '<b class="text-rose-300">exceeds tolerance</b>' : m.tol >= 0.6 ? '<b class="text-amber-300">uses ' + Math.round(m.tol * 100) + '% of tolerance</b>' : '<b class="text-emerald-300">within tolerance</b>'}. ${t('integrity')}: ${m.integrity}/100.`}</p>
          <p class="mt-2 text-slate-400">${t('alert_note')}</p>`;
      }
      case 'q4': {
        const pts = m.pts.filter(x => x.w.h.pop >= 100).sort((a, b) => b.w.h.pop - a.w.h.pop).slice(0, 4);
        return `<h4>${t('q4')}</h4><p>${es() ? 'Según SEDAC GPW v4.11 (referencia 2020, no es un registro en tiempo real):' : 'According to SEDAC GPW v4.11 (2020 reference, not a real-time record):'}</p><ul>${pts.map(x => `<li><b>${x.w.name}</b> — ${x.w.h.pop.toLocaleString()} hab/km² ${x.terr >= 3.8 ? `· ${es() ? 'tramo con riesgo' : 'segment at risk'} ${fmt1(x.terr)}` : ''}</li>`).join('')}</ul>
          <p class="mt-2">${es() ? `Población estimada en área de servicio expuesta: <b>${fmtPop(m.popExposed)}</b>.` : `Estimated population in exposed service area: <b>${fmtPop(m.popExposed)}</b>.`} ${op.essential ? (es() ? 'Al tratarse de una operación esencial, una interrupción > ' + p.maxDelayH + ' h tiene relevancia humana directa (desabastecimiento).' : 'As an essential operation, a disruption > ' + p.maxDelayH + ' h has direct human relevance (shortage).') : ''}</p>`;
      }
      case 'q5':
        return `<h4>${t('q5')}</h4>${r.alts.length ? `<ul>${r.alts.map(a => `<li><b>${a.name}</b> — ${a.distanceKm} km · ${fmt1(a.adjH)} h (${a.delta > 0 ? '+' : ''}${fmt1(a.delta)} h) · ${t('col_risk')} ${fmt1(a.maxTerr)} · ${t('dim_vuln')} ${fmt1(a.vuln)}${a.recommended ? ' · <b class="text-emerald-300">' + t('recommended') + '</b>' : ''}</li>`).join('')}</ul>` : `<p>${t('no_alt')}</p>`}
          <p class="mt-2">${r.best.isMain ? (es() ? 'EUREKA sugiere <b>mantener la ruta prevista</b>: las alternativas no reducen la exposición ponderada.' : 'EUREKA suggests <b>keeping the planned route</b>: alternatives do not reduce weighted exposure.') : (es() ? `EUREKA sugiere evaluar <b>${r.best.name}</b>: reduce el riesgo máximo de ${fmt1(m.maxTerr)} a ${fmt1(r.best.maxTerr)} y la vulnerabilidad de ${fmt1(m.vuln)} a ${fmt1(r.best.vuln)}${r.best.delta > 0 ? `, con +${fmt1(r.best.delta)} h adicionales` : ''}. Una ruta más corta no es necesariamente la mejor si expone más a la mercancía.` : `EUREKA suggests evaluating <b>${r.best.name}</b>: max risk drops from ${fmt1(m.maxTerr)} to ${fmt1(r.best.maxTerr)} and vulnerability from ${fmt1(m.vuln)} to ${fmt1(r.best.vuln)}${r.best.delta > 0 ? `, with +${fmt1(r.best.delta)} h extra` : ''}. A shorter route is not necessarily the best if it exposes the cargo more.`)}</p>
          <p class="mt-2 text-slate-400">${es() ? 'EUREKA no ordena modificar la ruta ni garantiza que la alternativa esté habilitada.' : 'EUREKA does not order a route change nor guarantee the alternative is enabled.'}</p>`;
      case 'q6':
        return `<h4>${t('q6')}</h4><ul>${t('verify_items').map(v => `<li>${v}</li>`).join('')}</ul>
          <p class="mt-2">${es() ? 'Estado actual de la información:' : 'Current information status:'} ${tag('satellite')} ${sat.length} · ${tag('reported')} ${rep.length} · ${tag('confirmed')} ${con.length}.</p>
          <p class="mt-1 text-slate-400">${es() ? 'Las observaciones satelitales (GPM, FIRMS, MODIS, ECOSTRESS) indican condiciones potenciales; no confirman por sí mismas que una vía esté inundada, bloqueada o cerrada.' : 'Satellite observations (GPM, FIRMS, MODIS, ECOSTRESS) indicate potential conditions; they do not by themselves confirm a road is flooded, blocked or closed.'}</p>`;
      case 'report': return executiveReport(r);
      default:
        return `<p>${es() ? 'Puedo responder sobre exposición de operaciones, tramos de riesgo, vulnerabilidad de la mercancía, población afectada (SEDAC), rutas alternativas y verificaciones previas. Usa los accesos rápidos o pregunta en lenguaje natural.' : 'I can answer about operation exposure, risky segments, cargo vulnerability, affected population (SEDAC), alternative routes and pre-checks. Use the quick prompts or ask in natural language.'}</p>`;
    }
  }
  function hazardText(x) {
    const f = x.f; const h = x.w.h; const out = [];
    if (f.flood >= 0.3) out.push(`GPM ${fmt1(h.rain)} mm/h · SMAP ${h.soil.toFixed(2)}`);
    if (f.fire >= 0.3) out.push(`FIRMS ${Math.round(h.fire * 100)}%`);
    if (f.heat >= 0.3) out.push(`MODIS LST ${fmt1(h.lst)} °C`);
    if (f.snow >= 0.3 || f.alt >= 0.5) out.push(`NASADEM ${h.elev} m${f.snow >= 0.3 ? ' · ' + (es() ? 'nieve' : 'snow') + ' ' + Math.round(h.snow * 100) + '%' : ''}`);
    if (f.cold >= 0.3) out.push(`LST ${fmt1(h.lst)} °C`);
    return out.join(' · ');
  }
  function executiveReport(r) {
    const op = r.op, m = r.main, p = m.profile;
    const hot = m.pts.filter(x => x.terr >= 3.8).sort((a, b) => b.terr - a.terr);
    const con = r.alerts.filter(a => a.state === 'confirmed'), rep = r.alerts.filter(a => a.state === 'reported');
    const now = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
    return `<h4>${es() ? 'Informe ejecutivo EUREKA' : 'EUREKA executive report'} · ${op.id}</h4>
      <p class="text-slate-400 text-[.7rem] font-mono">${now} · ${t('win_' + state.window)} · ${r.route.origin} → ${r.route.destination} · ${cargoName(op)} (${p.tMin}…${p.tMax} °C)</p>
      <h4>1. ${t('dim_terr')} — ${fmt1(m.terr)}/10</h4><ul>${hot.slice(0, 4).map(x => `<li><b>${x.w.name}</b> (${fmt1(x.terr)}): ${hazardText(x)} ${x.w.report ? tag(x.w.report === 'closure' ? 'confirmed' : 'reported') : tag('satellite')}</li>`).join('') || `<li>${es() ? 'Sin tramos sobre umbral.' : 'No segments above threshold.'}</li>`}</ul>
      <h4>2. ${t('dim_vuln')} — ${fmt1(m.vuln)}/10</h4><p>${es() ? `La mercancía declarada (${cargoName(op)}) ${p.refrigerated ? 'requiere conservación refrigerada; ' : ''}se recomienda verificar continuidad de la cadena de frío, condiciones del transporte y disponibilidad de almacenamiento adecuado. ${t('integrity')}: ${m.integrity}/100.` : `Declared cargo (${cargoName(op)}) ${p.refrigerated ? 'requires refrigerated storage; ' : ''}verify cold-chain continuity, transport conditions and adequate storage availability. ${t('integrity')}: ${m.integrity}/100.`}</p>
      <h4>3. ${t('dim_expo')} — ${fmt1(m.expo)}/10</h4><p>${es() ? `Demora estimada +${m.delayPct}% (${fmt1(m.delayH)} h; tolerancia ${p.maxDelayH} h). ETA ajustada ${fmtDT(m.eta)}. Población en área expuesta (SEDAC): ${fmtPop(m.popExposed)}.` : `Estimated delay +${m.delayPct}% (${fmt1(m.delayH)} h; tolerance ${p.maxDelayH} h). Adjusted ETA ${fmtDT(m.eta)}. Population in exposed area (SEDAC): ${fmtPop(m.popExposed)}.`}</p>
      <h4>${es() ? 'Estado de verificación' : 'Verification status'}</h4><p>${con.length ? `${tag('confirmed')} ${con.map(a => a.place).join('; ')}. ` : (es() ? `${tag('confirmed')} No se dispone de confirmación oficial de cierre de carretera. ` : `${tag('confirmed')} No official road closure confirmation available. `)}${rep.length ? `${tag('reported')} ${rep.map(a => a.place).join('; ')}. ` : ''}${es() ? 'No se dispone de medición de temperatura interna de la carga.' : 'No internal cargo temperature measurement is available.'}</p>
      <h4>${es() ? 'Recomendación' : 'Recommendation'}</h4><p>${r.best.isMain ? (es() ? 'Mantener la ruta prevista y monitorear las actualizaciones de GPM IMERG (30 min) y FIRMS (<3 h).' : 'Keep the planned route and monitor GPM IMERG (30 min) and FIRMS (<3 h) updates.') : (es() ? `Evaluar la alternativa <b>${r.best.name}</b> (${fmt1(r.best.adjH)} h, riesgo máx. ${fmt1(r.best.maxTerr)}, vulnerabilidad ${fmt1(r.best.vuln)}).` : `Evaluate alternative <b>${r.best.name}</b> (${fmt1(r.best.adjH)} h, max risk ${fmt1(r.best.maxTerr)}, vulnerability ${fmt1(r.best.vuln)}).`)} ${es() ? 'Se recomienda consultar los reportes oficiales y evaluar las alternativas logísticas disponibles antes de tomar una decisión.' : 'Consult official reports and evaluate available logistics alternatives before deciding.'}</p>`;
  }
  function detectIntent(q) {
    q = q.toLowerCase();
    if (/informe|report|resumen|summary/.test(q)) return 'report';
    if (/pobla|sedac|popul|comunidad|communit/.test(q)) return 'q4';
    if (/alternativ|otra ruta|other route|desv[ií]o|detour/.test(q)) return 'q5';
    if (/verific|verify|confirm|modific|change|cambiar/.test(q)) return 'q6';
    if (/mercanc|cargo|producto|product|caracter|comprom|vacuna|vaccine|fr[ií]o|cold|temperat/.test(q)) return 'q3';
    if (/tramo|segment|riesgo|risk|amenaza|threat|corredor|corridor|lluvia|rain|incendio|fire|calor|heat/.test(q)) return 'q2';
    if (/operaci|operation|exposici|exposure|cu[aá]l|which/.test(q)) return 'q1';
    return 'default';
  }
  function pushMsg(html, who) { const el = document.createElement('div'); el.className = `msg msg-${who}`; el.innerHTML = html; $('#chat').appendChild(el); $('#chat').scrollTop = $('#chat').scrollHeight; state.icons(); return el; }
  function ask(text, intent) {
    pushMsg(text, 'user');
    const typing = pushMsg('<div class="typing"><span></span><span></span><span></span></div>', 'ai');
    setTimeout(() => { typing.innerHTML = aiAnswer(intent || detectIntent(text)); $('#chat').scrollTop = $('#chat').scrollHeight; state.icons(); }, 700 + Math.random() * 500);
  }
  function renderAI() {
    const r = ev(activeOp());
    $('#chips').innerHTML = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6'].map(k => `<button class="chip" data-q="${k}"><i data-lucide="zap" class="w-3 h-3"></i>${t(k)}</button>`).join('');
    $$('#chips .chip').forEach(c => c.onclick = () => ask(t(c.dataset.q), c.dataset.q));
    $('#ai-context').innerHTML = `<div class="label mb-2">${es() ? 'Contexto del análisis' : 'Analysis context'}</div>
      <div class="space-y-1.5 text-xs"><div class="flex justify-between"><span class="text-slate-400">${t('col_op')}</span><span class="font-mono text-cyan-200">${r.op.id}</span></div><div class="flex justify-between"><span class="text-slate-400">${t('col_cargo')}</span><span>${cargoName(r.op)}</span></div><div class="flex justify-between"><span class="text-slate-400">${t('sb_window')}</span><span>${t('win_' + state.window)}</span></div><div class="flex justify-between"><span class="text-slate-400">${t('col_impact')}</span>${impactBadge(r.impact)}</div></div>
      <div class="label mt-4 mb-2">${es() ? 'Fuentes consultadas' : 'Sources queried'}</div><div class="flex flex-wrap gap-1">${D.sources.map(s => `<span class="badge badge-slate"><span class="dot" style="background:${s.color}"></span>${s.name}</span>`).join('')}</div>
      <div class="mt-4 text-[.65rem] text-slate-500 leading-relaxed">${es() ? 'El asistente no presenta como hechos confirmados situaciones que únicamente representan riesgos potenciales. Próxima etapa: sensores IoT en contenedores para temperatura interna real.' : 'The assistant does not present as confirmed facts situations that only represent potential risks. Next stage: IoT container sensors for real internal temperature.'}</div>`;
    if (!$('#chat').children.length) pushMsg(aiAnswer('report'), 'ai');
    state.icons();
  }
  function setupAI() {
    $('#chat-form').onsubmit = e => { e.preventDefault(); const v = $('#chat-input').value.trim(); if (!v) return; $('#chat-input').value = ''; ask(v); };
    $('#btn-report').onclick = () => { setView('ai'); ask(t('ai_report'), 'report'); };
  }

  // ------------------------------------------------------------------
  // Ticker · clock · stars · live stream
  // ------------------------------------------------------------------
  function renderTicker() {
    const items = [];
    state.alerts.slice().sort((a, b) => a.minsAgo - b.minsAgo).forEach(a => { const s = srcById(a.source); items.push(`<span class="ticker-item"><span class="dot" style="background:${s.color}"></span><b>${s.name}</b> ${a.place}: <span style="color:${s.color}">${a.value}</span> · ${t('state_' + a.state + '_s')}</span>`); });
    D.sources.forEach(s => items.push(`<span class="ticker-item"><i data-lucide="${s.icon}" class="w-3 h-3" style="color:${s.color}"></i><b>${s.name}</b> ${s.product} · ${s.cadence} · ${s.res}</span>`));
    $('#ticker').innerHTML = `<span class="ticker-item text-cyan-300"><b>${t('ticker_prefix')}</b></span>` + items.join('') + items.join('');
    state.icons();
  }
  function clock() { const d = new Date(); $('#clock').textContent = d.toISOString().slice(11, 19) + ' UTC'; }
  function stars() {
    const c = $('#stars'), ctx = c.getContext('2d'); let pts = [];
    const resize = () => { c.width = innerWidth; c.height = innerHeight; pts = Array.from({ length: Math.min(260, innerWidth / 5) }, () => ({ x: Math.random() * c.width, y: Math.random() * c.height, r: Math.random() * 1.3 + .2, a: Math.random(), s: Math.random() * .02 + .004 })); };
    resize(); addEventListener('resize', resize);
    (function loop() { ctx.clearRect(0, 0, c.width, c.height); pts.forEach(p => { p.a += p.s; const al = .35 + .5 * Math.abs(Math.sin(p.a)); ctx.fillStyle = `rgba(190,230,255,${al})`; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }); requestAnimationFrame(loop); })();
  }
  function startStream() {
    setInterval(() => {
      state.alerts.forEach(a => a.minsAgo += 0.5);
      if (state.streamIdx < D.streamAlerts.length && Math.random() < 0.6) {
        const a = { ...D.streamAlerts[state.streamIdx++], isNew: true };
        state.alerts.unshift(a); Object.keys(evalCache).forEach(k => delete evalCache[k]);
        toast(`<span class="dot" style="background:${srcById(a.source).color}"></span> ${srcById(a.source).name} · ${a.place}`);
        if (a.state === 'confirmed' && a.routeId === 'ARI-SCZ') D.routes['ARI-SCZ'].waypoints.find(w => w.name.startsWith('Villa Tunari')).report = 'closure';
        renderAll();
      } else { renderFeed(); if (state.view === 'alerts') renderAlerts(); }
    }, 14000);
  }
  function toast(html) { const el = document.createElement('div'); el.className = 'toast glass-strong glass px-4 py-2.5 text-xs flex items-center gap-2 !rounded-xl border-cyan-400/30'; el.innerHTML = `<i data-lucide="bell-ring" class="w-3.5 h-3.5 text-cyan-300"></i>${html}`; $('#toast-root').appendChild(el); state.icons(); setTimeout(() => { el.style.opacity = 0; el.style.transition = 'opacity .5s'; setTimeout(() => el.remove(), 600); }, 4200); }

  // ------------------------------------------------------------------
  // Navigation · i18n · orchestration
  // ------------------------------------------------------------------
  function setView(v) {
    state.view = v;
    $$('.view').forEach(el => el.classList.toggle('active', el.id === 'view-' + v));
    $$('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.view === v));
    if (v === 'map') setTimeout(() => { map.invalidateSize(); }, 60);
    if (v === 'ai') renderAI(); if (v === 'compare') { renderCompare(); renderCharts(); } if (v === 'alerts') renderAlerts(); if (v === 'cargo') renderCargo(); if (v === 'ops') renderOps();
    $('#sidebar').classList.remove('open'); $('#sidebar-backdrop').classList.remove('show');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function selectOp(id) { state.opId = id; state.shownAlt = null; renderAll(); if (state.view === 'map') setTimeout(focusRoute, 100); }
  function applyI18n() {
    document.documentElement.lang = state.lang;
    $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    $$('[data-i18n-ph]').forEach(el => { el.placeholder = t(el.dataset.i18nPh); });
    $('#lang-es').classList.toggle('active', state.lang === 'es'); $('#lang-en').classList.toggle('active', state.lang === 'en');
    $('#map-subtitle').textContent = es() ? 'Corredores logísticos + capas NASA (GPM IMERG · FIRMS · MODIS LST · ECOSTRESS 70 m · SEDAC GPW). Cada observación muestra fuente y fecha.' : 'Logistics corridors + NASA layers (GPM IMERG · FIRMS · MODIS LST · ECOSTRESS 70 m · SEDAC GPW). Every observation shows source and timestamp.';
    $('#nav-tabs-mobile').innerHTML = $('#nav-tabs').innerHTML.replace(/id="nav-alert-count"/g, 'class="badge badge-high !py-0 !px-1.5 ml-1 nav-alert-count"');
    $$('.nav-tab').forEach(b => b.onclick = () => setView(b.dataset.view));
  }
  function renderAll() {
    renderSidebar(); renderKPIs(); renderFeed(); renderRouteTable(); renderTicker(); drawMap(); renderCharts();
    if (state.view === 'ops') renderOps(); if (state.view === 'cargo') renderCargo(); if (state.view === 'alerts') renderAlerts(); if (state.view === 'compare') renderCompare(); if (state.view === 'ai') renderAI();
    $$('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
  }
  function init() {
    stars(); clock(); setInterval(clock, 1000);
    initMap(); applyI18n(); setupOpsForm(); setupCargo(); setupAI();
    renderAll(); renderOps(); renderCargo(); renderAlerts(); renderCompare();
    $('#sb-op-select').onchange = e => selectOp(e.target.value);
    $$('#window-seg button').forEach(b => b.onclick = () => { state.window = b.dataset.win; $$('#window-seg button').forEach(x => x.classList.toggle('active', x === b)); renderAll(); });
    $$('#alert-filter button').forEach(b => b.onclick = () => { state.alertFilter = b.dataset.f; $$('#alert-filter button').forEach(x => x.classList.toggle('active', x === b)); renderAlerts(); });
    $$('[data-goto]').forEach(b => b.onclick = () => setView(b.dataset.goto));
    $('#lang-es').onclick = () => { state.lang = 'es'; applyI18n(); $('#chat').innerHTML = ''; renderAll(); renderOps(); renderCargo(); renderAlerts(); renderCompare(); };
    $('#lang-en').onclick = () => { state.lang = 'en'; applyI18n(); $('#chat').innerHTML = ''; renderAll(); renderOps(); renderCargo(); renderAlerts(); renderCompare(); };
    $('#btn-sidebar').onclick = () => { const sb = $('#sidebar'); if (innerWidth < 1024) { sb.classList.toggle('open'); $('#sidebar-backdrop').classList.toggle('show', sb.classList.contains('open')); } else { sb.classList.toggle('collapsed'); setTimeout(() => map.invalidateSize(), 320); } };
    $('#sidebar-backdrop').onclick = () => { $('#sidebar').classList.remove('open'); $('#sidebar-backdrop').classList.remove('show'); };
    setTimeout(focusRoute, 600);
    startStream();
    state.icons();
  }
  document.addEventListener('DOMContentLoaded', init);
})();
