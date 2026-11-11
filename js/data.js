/* =====================================================================
   EUREKA — Static demo dataset (simulated NASA observations)
   All values are illustrative and modelled on real product characteristics:
   GPM IMERG (30 min, ~10 km) · FIRMS (MODIS/VIIRS, <3 h) · MODIS LST ·
   ECOSTRESS (~70 m) · SEDAC GPW v4 · NASADEM
   ===================================================================== */
window.EUREKA_DATA = (() => {
  // ------------------------------------------------------------------
  // NASA + complementary sources
  // ------------------------------------------------------------------
  const sources = [
    { id: 'gpm',   name: 'GPM IMERG',  product: 'IMERG Early Run V07', cadence: '30 min', res: '~10 km', unit: 'mm/h', color: '#38bdf8', icon: 'cloud-rain', latencyMin: 42 },
    { id: 'firms', name: 'FIRMS',      product: 'VIIRS NOAA-21 / MODIS C6.1 NRT', cadence: '< 3 h', res: '375 m / 1 km', unit: 'FRP MW', color: '#fb923c', icon: 'flame', latencyMin: 118 },
    { id: 'modis', name: 'MODIS LST',  product: 'MOD11A1 / MYD11A1 (Terra & Aqua)', cadence: 'Daily', res: '1 km', unit: '°C', color: '#f43f5e', icon: 'thermometer-sun', latencyMin: 260 },
    { id: 'eco',   name: 'ECOSTRESS',  product: 'ECO_L2T_LSTE (ISS)', cadence: 'Variable (ISS pass)', res: '~70 m', unit: '°C', color: '#e879f9', icon: 'scan-eye', latencyMin: 540 },
    { id: 'sedac', name: 'SEDAC GPW',  product: 'GPW v4.11 Population Density', cadence: 'Reference 2020', res: '~1 km', unit: 'hab/km²', color: '#a78bfa', icon: 'users', latencyMin: null },
    { id: 'smap',  name: 'SMAP',       product: 'SPL3SMP_E Soil Moisture', cadence: '2–3 days', res: '9 km', unit: 'm³/m³', color: '#34d399', icon: 'droplets', latencyMin: 1380 },
    { id: 'dem',   name: 'NASADEM',    product: 'NASADEM_HGT v001', cadence: 'Static', res: '30 m', unit: 'm', color: '#fbbf24', icon: 'mountain', latencyMin: null },
  ];

  const validationLayers = ['NASA Worldview', 'NASA Earthdata Search', 'OpenStreetMap', 'Google Earth Engine', 'ABC Bolivia / Reportes viales', 'SENAMHI / NWS (meteo)'];

  // ------------------------------------------------------------------
  // Cargo categories (Módulo 2) — thresholds per manufacturer data-sheet
  // sensitivities are 0..1
  // ------------------------------------------------------------------
  const cargoProfiles = [
    { id: 'pharma',   icon: 'syringe',      es: 'Medicamentos / Vacunas',          en: 'Pharmaceuticals / Vaccines',    tMin: 2,   tMax: 8,   refrigerated: true,  frozen: false, heat: 0.95, cold: 0.75, humidity: 0.6, water: 0.65, fragility: 0.45, maxDelayH: 12,  essential: true,  example: 'Vacunas mRNA (cadena de frío 2–8 °C)' },
    { id: 'fresh',    icon: 'apple',        es: 'Alimentos frescos / Perecederos',  en: 'Fresh / Perishable foods',      tMin: 0,   tMax: 4,   refrigerated: true,  frozen: false, heat: 0.85, cold: 0.5,  humidity: 0.5, water: 0.4,  fragility: 0.35, maxDelayH: 18,  essential: true,  example: 'Carne fresca, lácteos, frutas' },
    { id: 'frozen',   icon: 'snowflake',    es: 'Productos congelados',             en: 'Frozen goods',                  tMin: -25, tMax: -18, refrigerated: true,  frozen: true,  heat: 0.9,  cold: 0.1,  humidity: 0.3, water: 0.3,  fragility: 0.2,  maxDelayH: 10,  essential: true,  example: 'Carne congelada, mariscos' },
    { id: 'choco',    icon: 'candy',        es: 'Chocolates / Sensibles al calor',  en: 'Chocolate / Heat-sensitive',    tMin: 12,  tMax: 20,  refrigerated: false, frozen: false, heat: 0.9,  cold: 0.3,  humidity: 0.6, water: 0.5,  fragility: 0.3,  maxDelayH: 48,  essential: false, example: 'Chocolate fino, confitería' },
    { id: 'chem',     icon: 'flask-conical',es: 'Productos químicos',               en: 'Chemicals',                     tMin: 5,   tMax: 35,  refrigerated: false, frozen: false, heat: 0.6,  cold: 0.4,  humidity: 0.5, water: 0.75, fragility: 0.55, maxDelayH: 72,  essential: false, example: 'Reactivos, insumos agroindustriales' },
    { id: 'electro',  icon: 'cpu',          es: 'Equipos electrónicos',             en: 'Electronics',                   tMin: -10, tMax: 45,  refrigerated: false, frozen: false, heat: 0.4,  cold: 0.3,  humidity: 0.8, water: 0.95, fragility: 0.6,  maxDelayH: 120, essential: false, example: 'Servidores, módulos fotovoltaicos' },
    { id: 'fragile',  icon: 'wine',         es: 'Vidrio / Cerámica / Frágil',       en: 'Glass / Ceramics / Fragile',    tMin: -20, tMax: 50,  refrigerated: false, frozen: false, heat: 0.1,  cold: 0.1,  humidity: 0.2, water: 0.3,  fragility: 0.95, maxDelayH: 168, essential: false, example: 'Vidrio templado, cerámica fina' },
    { id: 'raw',      icon: 'package',      es: 'Materias primas / Industrial',     en: 'Industrial raw materials',      tMin: -30, tMax: 60,  refrigerated: false, frozen: false, heat: 0.1,  cold: 0.05, humidity: 0.2, water: 0.25, fragility: 0.1,  maxDelayH: 240, essential: false, example: 'Acero, soya a granel, cemento' },
  ];

  // ------------------------------------------------------------------
  // Helper to build waypoints: [name, lat, lng, hazards]
  // hazards: rain mm/h · fire 0..1 · lst °C · soil 0..1 · elev m · snow 0..1 · pop hab/km²
  //          report: null | 'incident' | 'closure'
  // ------------------------------------------------------------------
  const W = (name, lat, lng, h = {}, extra = {}) => ({
    name, lat, lng,
    h: Object.assign({ rain: 0.4, fire: 0, lst: 24, soil: 0.2, elev: 400, snow: 0, pop: 40 }, h),
    ...extra,
  });

  // ------------------------------------------------------------------
  // Routes & alternatives
  // ------------------------------------------------------------------
  const routes = {
    // ---------- Flagship: Arica (CL) → Santa Cruz de la Sierra (BO) ----------
    'ARI-SCZ': {
      id: 'ARI-SCZ', corridor: 'Corredor Bioceánico Central · Ruta 4 / CH-11', countries: 'CL → BO',
      origin: 'Arica (CL)', destination: 'Santa Cruz de la Sierra (BO)',
      distanceKm: 1420, baseHours: 32,
      waypoints: [
        W('Puerto de Arica', -18.478, -70.312, { rain: 0, lst: 27, elev: 10, pop: 2300 }, { kind: 'port' }),
        W('Putre / Chungará', -18.20, -69.25, { rain: 0.6, lst: 9, elev: 4200, snow: 0.3, pop: 3 }),
        W('Tambo Quemado (frontera)', -18.27, -69.07, { rain: 1.1, lst: 4, elev: 4660, snow: 0.55, pop: 2 }, { kind: 'border' }),
        W('Patacamaya', -17.23, -67.92, { rain: 2.4, lst: 15, elev: 3800, soil: 0.35, pop: 60 }),
        W('Oruro', -17.97, -67.11, { rain: 1.8, lst: 17, elev: 3700, soil: 0.3, pop: 1400 }, { kind: 'hub' }),
        W('Cochabamba', -17.39, -66.16, { rain: 3.2, lst: 31, elev: 2550, soil: 0.45, pop: 3100 }, { kind: 'hub' }),
        W('Villa Tunari (Chapare)', -16.97, -65.42, { rain: 14.8, lst: 33, elev: 300, soil: 0.82, pop: 120 }, { report: 'incident' }),
        W('Yapacaní', -17.40, -63.88, { rain: 9.6, lst: 36, elev: 280, soil: 0.74, pop: 150 }),
        W('Santa Cruz de la Sierra', -17.78, -63.18, { rain: 2.1, lst: 38.5, elev: 416, soil: 0.4, pop: 4800 }, { kind: 'hub' }),
      ],
      alternatives: [
        { id: 'ARI-SCZ-B', name: 'Cochabamba → Epizana → Samaipata (Ruta 7 antigua)', distanceKm: 1465, baseHours: 35,
          waypoints: [
            W('Puerto de Arica', -18.478, -70.312, { rain: 0, lst: 27, elev: 10, pop: 2300 }, { kind: 'port' }),
            W('Tambo Quemado (frontera)', -18.27, -69.07, { rain: 1.1, lst: 4, elev: 4660, snow: 0.55, pop: 2 }, { kind: 'border' }),
            W('Patacamaya', -17.23, -67.92, { rain: 2.4, lst: 15, elev: 3800, soil: 0.35, pop: 60 }),
            W('Oruro', -17.97, -67.11, { rain: 1.8, lst: 17, elev: 3700, soil: 0.3, pop: 1400 }, { kind: 'hub' }),
            W('Cochabamba', -17.39, -66.16, { rain: 3.2, lst: 31, elev: 2550, soil: 0.45, pop: 3100 }, { kind: 'hub' }),
            W('Epizana', -17.83, -65.08, { rain: 2.6, lst: 24, elev: 2900, soil: 0.38, pop: 20 }),
            W('Samaipata', -18.18, -63.87, { rain: 3.4, lst: 29, elev: 1650, soil: 0.42, pop: 45 }),
            W('Santa Cruz de la Sierra', -17.78, -63.18, { rain: 2.1, lst: 38.5, elev: 416, soil: 0.4, pop: 4800 }, { kind: 'hub' }),
          ] },
        { id: 'ARI-SCZ-C', name: 'Puerto Iquique → Colchane/Pisiga → Oruro (puerto alternativo)', distanceKm: 1510, baseHours: 36,
          waypoints: [
            W('Puerto de Iquique', -20.21, -70.15, { rain: 0, lst: 26, elev: 5, pop: 1900 }, { kind: 'port' }),
            W('Colchane / Pisiga (frontera)', -19.28, -68.63, { rain: 0.9, lst: 8, elev: 3730, snow: 0.2, pop: 4 }, { kind: 'border' }),
            W('Oruro', -17.97, -67.11, { rain: 1.8, lst: 17, elev: 3700, soil: 0.3, pop: 1400 }, { kind: 'hub' }),
            W('Cochabamba', -17.39, -66.16, { rain: 3.2, lst: 31, elev: 2550, soil: 0.45, pop: 3100 }, { kind: 'hub' }),
            W('Epizana', -17.83, -65.08, { rain: 2.6, lst: 24, elev: 2900, soil: 0.38, pop: 20 }),
            W('Samaipata', -18.18, -63.87, { rain: 3.4, lst: 29, elev: 1650, soil: 0.42, pop: 45 }),
            W('Santa Cruz de la Sierra', -17.78, -63.18, { rain: 2.1, lst: 38.5, elev: 416, soil: 0.4, pop: 4800 }, { kind: 'hub' }),
          ] },
      ],
    },

    // ---------- Santa Cruz → Corumbá (BR) bioceanic east ----------
    'SCZ-COR': {
      id: 'SCZ-COR', corridor: 'Corredor Bioceánico Este · Ruta 4 / BR-262', countries: 'BO → BR',
      origin: 'Santa Cruz de la Sierra (BO)', destination: 'Corumbá (BR)',
      distanceKm: 650, baseHours: 11,
      waypoints: [
        W('Santa Cruz de la Sierra', -17.78, -63.18, { rain: 2.1, lst: 38.5, elev: 416, soil: 0.4, pop: 4800 }, { kind: 'hub' }),
        W('Pailón', -17.65, -62.75, { rain: 1.2, lst: 39, elev: 300, soil: 0.3, pop: 90 }),
        W('San José de Chiquitos', -17.85, -60.75, { rain: 0.2, fire: 0.55, lst: 42, elev: 290, soil: 0.12, pop: 25 }),
        W('Roboré', -18.33, -59.76, { rain: 0, fire: 0.92, lst: 44.5, elev: 280, soil: 0.08, pop: 18 }, { report: 'closure' }),
        W('Puerto Suárez / Puerto Quijarro', -18.96, -57.80, { rain: 0.3, fire: 0.25, lst: 40, elev: 100, soil: 0.2, pop: 160 }, { kind: 'border' }),
        W('Corumbá', -19.01, -57.65, { rain: 0.4, fire: 0.1, lst: 38, elev: 120, soil: 0.25, pop: 1700 }, { kind: 'hub' }),
      ],
      alternatives: [
        { id: 'SCZ-COR-B', name: 'Ferroviaria Oriental (intermodal) SCZ → Puerto Quijarro', distanceKm: 640, baseHours: 19, mode: 'rail',
          waypoints: [
            W('Santa Cruz de la Sierra', -17.78, -63.18, { rain: 2.1, lst: 38.5, elev: 416, soil: 0.4, pop: 4800 }, { kind: 'hub' }),
            W('Pailón', -17.65, -62.75, { rain: 1.2, lst: 39, elev: 300, soil: 0.3, pop: 90 }),
            W('San José de Chiquitos', -17.85, -60.75, { rain: 0.2, fire: 0.3, lst: 42, elev: 290, soil: 0.12, pop: 25 }),
            W('Roboré (estación)', -18.33, -59.70, { rain: 0, fire: 0.45, lst: 44, elev: 280, soil: 0.08, pop: 18 }),
            W('Puerto Quijarro', -17.78, -57.77, { rain: 0.3, fire: 0.1, lst: 40, elev: 100, soil: 0.2, pop: 160 }, { kind: 'border' }),
            W('Corumbá', -19.01, -57.65, { rain: 0.4, fire: 0.1, lst: 38, elev: 120, soil: 0.25, pop: 1700 }, { kind: 'hub' }),
          ] },
        { id: 'SCZ-COR-C', name: 'Desvío norte San Ignacio de Velasco → San Matías', distanceKm: 1010, baseHours: 21,
          waypoints: [
            W('Santa Cruz de la Sierra', -17.78, -63.18, { rain: 2.1, lst: 38.5, elev: 416, soil: 0.4, pop: 4800 }, { kind: 'hub' }),
            W('San Ramón', -16.60, -62.70, { rain: 1.0, lst: 37, elev: 320, soil: 0.3, pop: 30 }),
            W('San Ignacio de Velasco', -16.37, -60.95, { rain: 0.6, fire: 0.18, lst: 39, elev: 410, soil: 0.2, pop: 35 }),
            W('San Matías (frontera)', -16.37, -58.40, { rain: 0.8, fire: 0.12, lst: 38, elev: 130, soil: 0.3, pop: 10 }, { kind: 'border' }),
            W('Cáceres (BR)', -16.07, -57.68, { rain: 1.1, lst: 36, elev: 120, soil: 0.35, pop: 90 }),
            W('Corumbá', -19.01, -57.65, { rain: 0.4, fire: 0.1, lst: 38, elev: 120, soil: 0.25, pop: 1700 }, { kind: 'hub' }),
          ] },
      ],
    },

    // ---------- Chicago → Memphis (US Midwest, from pitch deck) ----------
    'CHI-MEM': {
      id: 'CHI-MEM', corridor: 'I-57 / I-55 Corridor', countries: 'US',
      origin: 'Chicago, IL', destination: 'Memphis, TN',
      distanceKm: 860, baseHours: 9,
      waypoints: [
        W('Chicago, IL', 41.88, -87.63, { rain: 3.1, lst: 4, elev: 180, soil: 0.5, snow: 0.3, pop: 4600 }, { kind: 'hub' }),
        W('Kankakee, IL', 41.12, -87.86, { rain: 4.0, lst: 3, elev: 200, soil: 0.55, snow: 0.35, pop: 300 }),
        W('Champaign, IL', 40.12, -88.24, { rain: 5.2, lst: 5, elev: 220, soil: 0.6, snow: 0.2, pop: 700 }),
        W('Effingham, IL', 39.12, -88.54, { rain: 7.4, lst: 7, elev: 180, soil: 0.68, pop: 150 }),
        W('Mt. Vernon, IL', 38.32, -88.90, { rain: 9.8, lst: 8, elev: 150, soil: 0.75, pop: 200 }),
        W('Sikeston, MO', 36.88, -89.59, { rain: 18.2, lst: 9, elev: 95, soil: 0.9, pop: 180 }, { report: 'incident' }),
        W('Blytheville, AR', 35.93, -89.92, { rain: 12.1, lst: 11, elev: 78, soil: 0.86, pop: 120 }),
        W('Memphis, TN', 35.15, -90.05, { rain: 6.3, lst: 12, elev: 80, soil: 0.7, pop: 1100 }, { kind: 'hub' }),
      ],
      alternatives: [
        { id: 'CHI-MEM-B', name: 'I-55 vía St. Louis', distanceKm: 915, baseHours: 10,
          waypoints: [
            W('Chicago, IL', 41.88, -87.63, { rain: 3.1, lst: 4, elev: 180, soil: 0.5, snow: 0.3, pop: 4600 }, { kind: 'hub' }),
            W('Bloomington, IL', 40.48, -88.99, { rain: 3.6, lst: 4, elev: 240, soil: 0.5, snow: 0.2, pop: 450 }),
            W('Springfield, IL', 39.80, -89.65, { rain: 4.1, lst: 6, elev: 180, soil: 0.52, pop: 500 }),
            W('St. Louis, MO', 38.63, -90.20, { rain: 5.0, lst: 8, elev: 140, soil: 0.58, pop: 2000 }, { kind: 'hub' }),
            W('Cape Girardeau, MO', 37.31, -89.52, { rain: 8.9, lst: 9, elev: 110, soil: 0.7, pop: 300 }),
            W('Blytheville, AR', 35.93, -89.92, { rain: 12.1, lst: 11, elev: 78, soil: 0.86, pop: 120 }),
            W('Memphis, TN', 35.15, -90.05, { rain: 6.3, lst: 12, elev: 80, soil: 0.7, pop: 1100 }, { kind: 'hub' }),
          ] },
        { id: 'CHI-MEM-C', name: 'I-65 / I-24 vía Indianápolis – Nashville', distanceKm: 1070, baseHours: 12,
          waypoints: [
            W('Chicago, IL', 41.88, -87.63, { rain: 3.1, lst: 4, elev: 180, soil: 0.5, snow: 0.3, pop: 4600 }, { kind: 'hub' }),
            W('Lafayette, IN', 40.42, -86.88, { rain: 2.8, lst: 4, elev: 170, soil: 0.45, snow: 0.2, pop: 400 }),
            W('Indianapolis, IN', 39.77, -86.16, { rain: 2.2, lst: 5, elev: 220, soil: 0.4, pop: 900 }, { kind: 'hub' }),
            W('Louisville, KY', 38.25, -85.76, { rain: 2.5, lst: 7, elev: 140, soil: 0.42, pop: 800 }),
            W('Nashville, TN', 36.16, -86.78, { rain: 3.0, lst: 10, elev: 170, soil: 0.45, pop: 700 }, { kind: 'hub' }),
            W('Jackson, TN', 35.61, -88.81, { rain: 4.6, lst: 11, elev: 130, soil: 0.55, pop: 250 }),
            W('Memphis, TN', 35.15, -90.05, { rain: 6.3, lst: 12, elev: 80, soil: 0.7, pop: 1100 }, { kind: 'hub' }),
          ] },
      ],
    },

    // ---------- Los Angeles → Phoenix (heat / fire) ----------
    'LAX-PHX': {
      id: 'LAX-PHX', corridor: 'I-10 Sun Corridor', countries: 'US',
      origin: 'Los Angeles, CA', destination: 'Phoenix, AZ',
      distanceKm: 600, baseHours: 6.5,
      waypoints: [
        W('Los Angeles, CA', 34.05, -118.24, { rain: 0, lst: 34, elev: 90, soil: 0.1, pop: 3200 }, { kind: 'hub' }),
        W('Riverside, CA', 33.95, -117.40, { rain: 0, lst: 39, elev: 260, soil: 0.08, pop: 1300 }),
        W('Banning Pass, CA', 33.93, -116.88, { rain: 0, fire: 0.72, lst: 41, elev: 720, soil: 0.05, pop: 90 }, { report: 'incident' }),
        W('Indio, CA', 33.72, -116.22, { rain: 0, fire: 0.15, lst: 47, elev: -5, soil: 0.03, pop: 500 }),
        W('Blythe, CA', 33.61, -114.60, { rain: 0, lst: 52.4, elev: 80, soil: 0.02, pop: 40 }),
        W('Buckeye, AZ', 33.37, -112.58, { rain: 0, lst: 49, elev: 270, soil: 0.03, pop: 300 }),
        W('Phoenix, AZ', 33.45, -112.07, { rain: 0, lst: 47, elev: 330, soil: 0.04, pop: 1200 }, { kind: 'hub' }),
      ],
      alternatives: [
        { id: 'LAX-PHX-B', name: 'I-15 / I-40 / US-93 vía Barstow – Kingman', distanceKm: 760, baseHours: 8,
          waypoints: [
            W('Los Angeles, CA', 34.05, -118.24, { rain: 0, lst: 34, elev: 90, soil: 0.1, pop: 3200 }, { kind: 'hub' }),
            W('Barstow, CA', 34.90, -117.02, { rain: 0, lst: 43, elev: 660, soil: 0.03, pop: 60 }),
            W('Needles, CA', 34.85, -114.61, { rain: 0, lst: 48, elev: 150, soil: 0.02, pop: 20 }),
            W('Kingman, AZ', 35.19, -114.05, { rain: 0, lst: 40, elev: 1000, soil: 0.04, pop: 80 }),
            W('Wickenburg, AZ', 33.97, -112.73, { rain: 0, lst: 44, elev: 630, soil: 0.03, pop: 30 }),
            W('Phoenix, AZ', 33.45, -112.07, { rain: 0, lst: 47, elev: 330, soil: 0.04, pop: 1200 }, { kind: 'hub' }),
          ] },
        { id: 'LAX-PHX-C', name: 'Misma ruta · salida nocturna 22:00 (ventana térmica)', distanceKm: 600, baseHours: 6.5, heatFactor: 0.55,
          waypoints: null },
      ],
    },

    // ---------- Buffalo → Boston (winter / fragile) ----------
    'BUF-BOS': {
      id: 'BUF-BOS', corridor: 'I-90 Northeast Corridor', countries: 'US',
      origin: 'Buffalo, NY', destination: 'Boston, MA',
      distanceKm: 740, baseHours: 7.5,
      waypoints: [
        W('Buffalo, NY', 42.89, -78.88, { rain: 4.2, lst: -4, elev: 180, soil: 0.6, snow: 0.85, pop: 2500 }, { kind: 'hub' }),
        W('Rochester, NY', 43.16, -77.61, { rain: 3.8, lst: -3, elev: 150, soil: 0.58, snow: 0.7, pop: 1000 }),
        W('Syracuse, NY', 43.05, -76.15, { rain: 5.4, lst: -5, elev: 120, soil: 0.6, snow: 0.9, pop: 900 }, { report: 'incident' }),
        W('Albany, NY', 42.65, -73.75, { rain: 3.0, lst: -2, elev: 45, soil: 0.5, snow: 0.6, pop: 1500 }),
        W('Springfield, MA', 42.10, -72.59, { rain: 2.1, lst: 0, elev: 20, soil: 0.45, snow: 0.35, pop: 1800 }),
        W('Boston, MA', 42.36, -71.06, { rain: 1.4, lst: 1, elev: 5, soil: 0.4, snow: 0.2, pop: 5300 }, { kind: 'hub' }),
      ],
      alternatives: [
        { id: 'BUF-BOS-B', name: 'I-86 / I-84 vía Binghamton – Hartford', distanceKm: 830, baseHours: 9,
          waypoints: [
            W('Buffalo, NY', 42.89, -78.88, { rain: 4.2, lst: -4, elev: 180, soil: 0.6, snow: 0.85, pop: 2500 }, { kind: 'hub' }),
            W('Corning, NY', 42.14, -77.05, { rain: 2.0, lst: -2, elev: 280, soil: 0.5, snow: 0.4, pop: 200 }),
            W('Binghamton, NY', 42.10, -75.91, { rain: 1.8, lst: -1, elev: 260, soil: 0.45, snow: 0.35, pop: 500 }),
            W('Scranton, PA', 41.41, -75.66, { rain: 1.2, lst: 1, elev: 230, soil: 0.4, snow: 0.2, pop: 900 }),
            W('Hartford, CT', 41.76, -72.68, { rain: 1.0, lst: 2, elev: 15, soil: 0.4, snow: 0.15, pop: 2600 }),
            W('Boston, MA', 42.36, -71.06, { rain: 1.4, lst: 1, elev: 5, soil: 0.4, snow: 0.2, pop: 5300 }, { kind: 'hub' }),
          ] },
      ],
    },

    // ---------- Yacuiba (AR border) → Santa Cruz (low risk reference) ----------
    'YAC-SCZ': {
      id: 'YAC-SCZ', corridor: 'Ruta 9 · Corredor Sur', countries: 'AR → BO',
      origin: 'Yacuiba (frontera AR)', destination: 'Santa Cruz de la Sierra (BO)',
      distanceKm: 540, baseHours: 8,
      waypoints: [
        W('Yacuiba (frontera)', -22.01, -63.68, { rain: 0.8, lst: 33, elev: 620, soil: 0.25, pop: 400 }, { kind: 'border' }),
        W('Camiri', -20.04, -63.52, { rain: 0.5, lst: 35, elev: 800, soil: 0.2, pop: 150 }),
        W('Abapó', -18.83, -63.40, { rain: 1.1, lst: 37, elev: 480, soil: 0.3, pop: 30 }),
        W('Santa Cruz de la Sierra', -17.78, -63.18, { rain: 2.1, lst: 38.5, elev: 416, soil: 0.4, pop: 4800 }, { kind: 'hub' }),
      ],
      alternatives: [],
    },
  };

  // ------------------------------------------------------------------
  // Operations (Módulo 1)
  // ------------------------------------------------------------------
  const operations = [
    { id: 'OP-2026-0417', type: 'import', routeId: 'ARI-SCZ', cargo: ['pharma'], product: 'Vacunas refrigeradas (lote VX-2208)', company: 'Farmacorp Import S.R.L.', departure: '2026-11-12T06:00', mode: 'truck', status: 'analyzed', essential: true,
      sheet: { tMin: 2, tMax: 8, humidity: 0.6, water: 0.65, fragility: 0.45, maxDelayH: 12 } },
    { id: 'OP-2026-0421', type: 'export', routeId: 'SCZ-COR', cargo: ['frozen'], product: 'Carne bovina congelada (40 t)', company: 'Frigor Oriente S.A.', departure: '2026-11-12T18:00', mode: 'truck', status: 'analyzed', essential: true,
      sheet: { tMin: -25, tMax: -18, humidity: 0.3, water: 0.3, fragility: 0.2, maxDelayH: 10 } },
    { id: 'OP-2026-0398', type: 'transit', routeId: 'CHI-MEM', cargo: ['electro'], product: 'Servidores y racks (12 pallets)', company: 'Midwest Data Logistics', departure: '2026-11-12T17:00', mode: 'truck', status: 'analyzed', essential: false,
      sheet: { tMin: -10, tMax: 45, humidity: 0.8, water: 0.95, fragility: 0.6, maxDelayH: 120 } },
    { id: 'OP-2026-0402', type: 'transit', routeId: 'LAX-PHX', cargo: ['choco'], product: 'Chocolate fino de exportación', company: 'Cacao Andino Ltda.', departure: '2026-11-12T13:00', mode: 'truck', status: 'analyzed', essential: false,
      sheet: { tMin: 12, tMax: 20, humidity: 0.6, water: 0.5, fragility: 0.3, maxDelayH: 48 } },
    { id: 'OP-2026-0433', type: 'transit', routeId: 'BUF-BOS', cargo: ['fragile'], product: 'Vidrio arquitectónico templado', company: 'Northeast Glassworks', departure: '2026-11-12T23:00', mode: 'truck', status: 'pending', essential: false,
      sheet: { tMin: -20, tMax: 50, humidity: 0.2, water: 0.3, fragility: 0.95, maxDelayH: 168 } },
    { id: 'OP-2026-0440', type: 'import', routeId: 'YAC-SCZ', cargo: ['raw', 'chem'], product: 'Carga mixta: acero + agroquímicos', company: 'Agroinsumos del Sur', departure: '2026-11-13T05:00', mode: 'truck', status: 'analyzed', essential: false, mixed: true,
      sheet: { tMin: 5, tMax: 35, humidity: 0.5, water: 0.75, fragility: 0.55, maxDelayH: 72 } },
  ];

  // ------------------------------------------------------------------
  // Alerts (Módulo 4) — 3 verification states:
  // 'satellite' = Amenaza ambiental detectada (satélite)
  // 'reported'  = Incidente reportado
  // 'confirmed' = Cierre confirmado
  // ------------------------------------------------------------------
  const alerts = [
    { id: 'AL-1041', source: 'firms', state: 'confirmed', severity: 'high', routeId: 'SCZ-COR', place: 'Roboré – Ruta 4 km 412', lat: -18.33, lng: -59.76, value: 'FRP 312 MW · 27 detecciones VIIRS', minsAgo: 38,
      es: 'Frente de incendio activo cruza la Ruta 4. ABC confirma cierre temporal del tramo Roboré–El Carmen.', en: 'Active fire front crossing Route 4. ABC confirms temporary closure of Roboré–El Carmen segment.' },
    { id: 'AL-1039', source: 'gpm', state: 'reported', severity: 'high', routeId: 'ARI-SCZ', place: 'Villa Tunari (Chapare) – Ruta 4', lat: -16.97, lng: -65.42, value: '14.8 mm/h · 96 mm/24 h', minsAgo: 52,
      es: 'IMERG estima precipitación intensa persistente. Transportistas reportan calzada anegada y tránsito lento (no confirmado por ABC).', en: 'IMERG estimates persistent heavy rainfall. Carriers report flooded roadway and slow traffic (not confirmed by ABC).' },
    { id: 'AL-1037', source: 'modis', state: 'satellite', severity: 'medium', routeId: 'ARI-SCZ', place: 'Santa Cruz – Parque Industrial', lat: -17.74, lng: -63.12, value: 'LST 38.5 °C (anomalía +6.2 °C)', minsAgo: 95,
      es: 'Temperatura superficial elevada en zona de destino. MODIS mide superficie terrestre, no la temperatura interna del contenedor.', en: 'Elevated land surface temperature at destination. MODIS measures land surface, not internal container temperature.' },
    { id: 'AL-1036', source: 'eco', state: 'satellite', severity: 'medium', routeId: 'ARI-SCZ', place: 'Terminal Puerto de Arica – patio de contenedores', lat: -18.473, lng: -70.318, value: 'LST 41.3 °C @ 70 m · paso ISS 11:42 UTC', minsAgo: 140,
      es: 'ECOSTRESS detecta isla de calor localizada en patio de contenedores refrigerados. Verificar continuidad eléctrica de reefers.', en: 'ECOSTRESS detects localized heat island at reefer container yard. Verify reefer power continuity.' },
    { id: 'AL-1035', source: 'dem', state: 'satellite', severity: 'medium', routeId: 'ARI-SCZ', place: 'Paso Tambo Quemado 4 660 m', lat: -18.27, lng: -69.07, value: 'Nieve 55 % · −6 °C nocturno', minsAgo: 160,
      es: 'Altitud extrema y probabilidad de nevada nocturna. Riesgo de exposición a frío fuera de rango (2–8 °C) si la unidad reefer falla.', en: 'Extreme altitude and night snow probability. Cold exposure risk below 2–8 °C range if reefer unit fails.' },
    { id: 'AL-1033', source: 'gpm', state: 'reported', severity: 'high', routeId: 'CHI-MEM', place: 'Sikeston, MO – I-57/I-55', lat: 36.88, lng: -89.59, value: '18.2 mm/h · 141 mm/24 h', minsAgo: 24,
      es: 'Lluvia extrema sobre suelo saturado (SMAP 0.90). MoDOT reporta inundación localizada en I-57 sur.', en: 'Extreme rain over saturated soil (SMAP 0.90). MoDOT reports localized flooding on I-57 south.' },
    { id: 'AL-1031', source: 'modis', state: 'satellite', severity: 'high', routeId: 'LAX-PHX', place: 'Blythe, CA – I-10', lat: 33.61, lng: -114.60, value: 'LST 52.4 °C', minsAgo: 71,
      es: 'Temperatura superficial extrema en corredor I-10. Alta relevancia para mercancía sensible al calor (chocolate 12–20 °C).', en: 'Extreme land surface temperature on I-10 corridor. High relevance for heat-sensitive cargo (chocolate 12–20 °C).' },
    { id: 'AL-1030', source: 'firms', state: 'reported', severity: 'medium', routeId: 'LAX-PHX', place: 'Banning Pass, CA', lat: 33.93, lng: -116.88, value: 'FRP 88 MW · 6 detecciones', minsAgo: 110,
      es: 'Detección térmica a 1.8 km de la I-10. Caltrans reporta humo sobre calzada; sin cierre.', en: 'Thermal detection 1.8 km from I-10. Caltrans reports smoke over roadway; no closure.' },
    { id: 'AL-1028', source: 'gpm', state: 'reported', severity: 'medium', routeId: 'BUF-BOS', place: 'Syracuse, NY – I-90', lat: 43.05, lng: -76.15, value: 'Nieve efecto lago · 5.4 mm/h eq.', minsAgo: 45,
      es: 'Banda de nieve por efecto lago. NYSDOT reporta visibilidad reducida y restricción de velocidad.', en: 'Lake-effect snow band. NYSDOT reports reduced visibility and speed restriction.' },
    { id: 'AL-1027', source: 'sedac', state: 'satellite', severity: 'medium', routeId: 'SCZ-COR', place: 'Roboré – Puerto Suárez (GPW)', lat: -18.6, lng: -58.8, value: '~48 000 hab. dependientes del corredor', minsAgo: 200,
      es: 'SEDAC GPW: localidades de la Chiquitanía dependen de este corredor para alimentos y combustible. Interrupción >24 h de relevancia humana.', en: 'SEDAC GPW: Chiquitania towns depend on this corridor for food and fuel. >24 h disruption is of human relevance.' },
    { id: 'AL-1025', source: 'smap', state: 'satellite', severity: 'medium', routeId: 'ARI-SCZ', place: 'Yapacaní – Ruta 4', lat: -17.40, lng: -63.88, value: 'Humedad de suelo 0.74 m³/m³', minsAgo: 320,
      es: 'Suelo saturado al 74 %: la lluvia adicional pronosticada eleva la probabilidad de anegamiento de calzada.', en: 'Soil 74 % saturated: additional forecast rain raises roadway flooding probability.' },
    { id: 'AL-1022', source: 'firms', state: 'satellite', severity: 'low', routeId: 'SCZ-COR', place: 'San José de Chiquitos', lat: -17.85, lng: -60.75, value: 'FRP 41 MW · 3 detecciones', minsAgo: 150,
      es: 'Detecciones térmicas a 6 km de la vía. Sin reporte de afectación.', en: 'Thermal detections 6 km from roadway. No impact reported.' },
    { id: 'AL-1020', source: 'sedac', state: 'satellite', severity: 'low', routeId: 'ARI-SCZ', place: 'Cochabamba – Santa Cruz (GPW)', lat: -17.3, lng: -64.6, value: '~2.1 M hab. en área de servicio', minsAgo: 400,
      es: 'Operación de vacunas esencial: 2.1 M de habitantes en el área de distribución final (Santa Cruz metro).', en: 'Essential vaccine operation: 2.1 M inhabitants in final distribution area (Santa Cruz metro).' },
  ];

  // Extra alerts that stream in live
  const streamAlerts = [
    { id: 'AL-1042', source: 'gpm', state: 'satellite', severity: 'medium', routeId: 'ARI-SCZ', place: 'Cochabamba – Ruta 4 km 18', lat: -17.39, lng: -66.16, value: '3.2 → 6.1 mm/h (↑)', minsAgo: 2,
      es: 'IMERG 30 min: intensidad de lluvia duplicada sobre salida este de Cochabamba.', en: 'IMERG 30-min: rainfall intensity doubled over Cochabamba east exit.' },
    { id: 'AL-1043', source: 'firms', state: 'satellite', severity: 'medium', routeId: 'SCZ-COR', place: 'Chochís – Serranía de Santiago', lat: -18.13, lng: -59.98, value: 'FRP 67 MW · nueva detección', minsAgo: 1,
      es: 'Nueva detección VIIRS a 3.4 km de la Ruta 4 (viento SE 28 km/h hacia la vía).', en: 'New VIIRS detection 3.4 km from Route 4 (SE wind 28 km/h toward roadway).' },
    { id: 'AL-1044', source: 'eco', state: 'satellite', severity: 'low', routeId: 'SCZ-COR', place: 'Puerto Quijarro – zona franca', lat: -17.78, lng: -57.77, value: 'LST 39.8 °C @ 70 m', minsAgo: 3,
      es: 'ECOSTRESS: patio de transferencia con temperatura superficial elevada. Reefers requieren verificación.', en: 'ECOSTRESS: transfer yard with elevated surface temperature. Reefers need verification.' },
    { id: 'AL-1045', source: 'gpm', state: 'confirmed', severity: 'high', routeId: 'ARI-SCZ', place: 'Villa Tunari – puente Espíritu Santo', lat: -16.99, lng: -65.40, value: '96 → 118 mm/24 h', minsAgo: 1,
      es: 'ABC confirma cierre preventivo del puente por crecida del río Espíritu Santo. Vigencia estimada 6–10 h.', en: 'ABC confirms preventive bridge closure due to Espíritu Santo river surge. Estimated 6–10 h.' },
  ];

  // ------------------------------------------------------------------
  // i18n
  // ------------------------------------------------------------------
  const i18n = {
    es: {
      tagline: 'Inteligencia geoespacial para el comercio internacional',
      nav_ops: 'Operaciones', nav_cargo: 'Mercancías', nav_map: 'Mapa satelital', nav_alerts: 'Alertas', nav_compare: 'Escenarios', nav_ai: 'Asistente IA',
      mod1: 'Módulo 1 · Panel de Operaciones Comerciales', mod2: 'Módulo 2 · Registro y Perfil de Mercancías', mod3: 'Módulo 3 · Mapa de Inteligencia Satelital',
      mod4: 'Módulo 4 · Panel de Alertas y Exposición Logística', mod5: 'Módulo 5 · Comparador de Escenarios y Rutas', mod6: 'Módulo 6 · Asistente de IA EUREKA',
      live: 'EN VIVO', sources_ok: 'fuentes NASA sincronizadas',
      sb_active_op: 'Operación activa', sb_layers: 'Capas NASA', sb_sources: 'Estado de fuentes', sb_window: 'Ventana de análisis', sb_cargo: 'Perfil de mercancía',
      win_today: 'Hoy', win_tomorrow: 'Mañana', win_week: 'Días 3–7',
      kpi_routes: 'Rutas impactadas', kpi_places: 'Localidades impactadas', kpi_pop: 'Población expuesta (SEDAC)', kpi_essential: 'Operaciones esenciales en riesgo',
      col_op: 'Operación', col_route: 'Origen → Destino', col_dep: 'Salida', col_cargo: 'Mercancía', col_impact: 'Impacto', col_slow: 'Demora', col_eta: 'ETA ajustada', col_risk: 'Riesgo máx.', col_status: 'Estado', col_dist: 'Distancia', col_time: 'Tiempo', col_terr: 'Territorial', col_vuln: 'Vulnerabilidad', col_expo: 'Exposición', col_alerts: 'Amenazas', col_reports: 'Reportes', col_cargoexp: 'Exposición mercancía', col_verify: 'Requiere verificación',
      impact_high: 'Alto', impact_med: 'Medio', impact_low: 'Bajo',
      status_analyzed: 'Analizada', status_pending: 'Pendiente', status_monitoring: 'Monitoreo',
      type_import: 'Importación', type_export: 'Exportación', type_transit: 'Tránsito intl.',
      state_satellite: 'Amenaza ambiental detectada (satélite)', state_reported: 'Incidente reportado', state_confirmed: 'Cierre confirmado',
      state_satellite_s: 'Satélite', state_reported_s: 'Reportado', state_confirmed_s: 'Confirmado',
      dim_terr: 'Riesgo territorial', dim_vuln: 'Vulnerabilidad de la mercancía', dim_expo: 'Exposición logística', dim_terr_s: 'Territorial', dim_vuln_s: 'Vulnerab.', dim_expo_s: 'Exposición',
      bm_dark: 'Oscuro', bm_night: 'NASA Noche', bm_marble: 'Blue Marble', bm_sat: 'Satélite',
      dim_terr_d: '¿Qué ocurre en el recorrido? Lluvia, inundación, incendios, calor, nieve.', dim_vuln_d: '¿Qué características del producto podrían comprometerse?', dim_expo_d: 'Importancia del tramo, tiempo comprometido, alternativas y población dependiente.',
      primary: 'Ruta prevista', alt: 'Alternativa', recommended: 'Recomendada por IA', keep: 'Mantener ruta', apply: 'Ver en mapa', applied: 'En mapa',
      register_op: 'Registrar operación', new_op: 'Nueva operación', analyze: 'Analizar con EUREKA', save_profile: 'Guardar perfil',
      f_origin: 'Origen', f_dest: 'Destino', f_route: 'Ruta prevista', f_date: 'Fecha estimada de traslado', f_product: 'Nombre del producto', f_category: 'Categoría comercial', f_company: 'Empresa / operador', f_type: 'Tipo de operación', f_mode: 'Modo',
      f_tmin: 'Temp. mínima (°C)', f_tmax: 'Temp. máxima (°C)', f_hum: 'Sensibilidad humedad', f_water: 'Sensibilidad agua', f_frag: 'Fragilidad', f_delay: 'Tolerancia a retraso (h)', f_mixed: 'Carga mixta', f_refrig: 'Requiere refrigeración', f_frozen: 'Requiere congelación', f_sheet: 'Ficha técnica del fabricante',
      map_fit: 'Vista global', map_focus: 'Centrar ruta', legend: 'Leyenda', seg_low: 'Tramo riesgo bajo', seg_med: 'Tramo riesgo medio', seg_high: 'Tramo riesgo alto',
      alerts_title: 'Alertas y exposición', alerts_filter_all: 'Todas', alert_note: 'MODIS / ECOSTRESS miden temperatura de superficie terrestre, no la temperatura del aire ni la interna del contenedor.',
      chart_title: 'Perfil de exposición por tramo', chart_sub: 'Riesgo territorial (0–10) a lo largo de la ruta prevista vs. alternativa recomendada',
      ai_title: 'Asistente EUREKA', ai_sub: 'Interpreta datos NASA en función de tu operación. Distingue amenaza detectada, incidente reportado y cierre confirmado.', ai_placeholder: 'Pregunta sobre tu operación…', ai_report: 'Generar informe ejecutivo', ai_send: 'Enviar',
      q1: '¿Qué operaciones presentan mayor exposición?', q2: '¿Qué tramos presentan riesgo?', q3: '¿Qué características de mi mercancía podrían verse comprometidas?', q4: '¿Qué zonas pobladas (SEDAC) se afectarían?', q5: '¿Qué rutas alternativas existen?', q6: '¿Qué debo verificar antes de modificar la operación?',
      integrity: 'Índice de integridad de carga', delay_h: 'h de demora', base: 'base', ops_total: 'operaciones registradas', ops_high: 'con exposición alta', ops_essential: 'esenciales',
      hz_rain: 'Precipitación', hz_fire: 'Incendio', hz_heat: 'Calor superficial', hz_soil: 'Suelo saturado', hz_snow: 'Nieve / altitud', hz_pop: 'Población', hz_cold: 'Frío extremo',
      source_ts: 'Fuente', obs_ts: 'Observación', resolution: 'Resolución', value: 'Valor', segment: 'Tramo', min_ago: 'min', h_ago: 'h',
      collapse: 'Colapsar', tooltip_lst: 'Temperatura de superficie (no del aire)',
      ticker_prefix: 'TELEMETRÍA',
      thr_heat: 'Calor', thr_cold: 'Frío', thr_hum: 'Humedad', thr_water: 'Agua', thr_frag: 'Fragilidad', thr_delay: 'Retraso',
      cargo_mixed_note: 'Carga mixta: la vulnerabilidad se evalúa con el máximo de cada producto.',
      op_created: 'Operación registrada y analizada',
      no_alt: 'Sin alternativas registradas para este corredor.',
      verify_items: ['Reporte oficial de carreteras (ABC / DOT)', 'Temperatura interna real del contenedor (sensor IoT)', 'Disponibilidad de almacenamiento refrigerado en ruta', 'Habilitación de la ruta alternativa'],
    },
    en: {
      tagline: 'Geospatial intelligence for international trade',
      nav_ops: 'Operations', nav_cargo: 'Cargo', nav_map: 'Satellite map', nav_alerts: 'Alerts', nav_compare: 'Scenarios', nav_ai: 'AI Assistant',
      mod1: 'Module 1 · Trade Operations Panel', mod2: 'Module 2 · Cargo Registry & Profile', mod3: 'Module 3 · Satellite Intelligence Map',
      mod4: 'Module 4 · Alerts & Logistics Exposure', mod5: 'Module 5 · Scenario & Route Comparator', mod6: 'Module 6 · EUREKA AI Assistant',
      live: 'LIVE', sources_ok: 'NASA sources in sync',
      sb_active_op: 'Active operation', sb_layers: 'NASA layers', sb_sources: 'Source status', sb_window: 'Analysis window', sb_cargo: 'Cargo profile',
      win_today: 'Today', win_tomorrow: 'Tomorrow', win_week: 'Days 3–7',
      kpi_routes: 'Impacted routes', kpi_places: 'Impacted locations', kpi_pop: 'Exposed population (SEDAC)', kpi_essential: 'Essential operations at risk',
      col_op: 'Operation', col_route: 'Origin → Destination', col_dep: 'Departure', col_cargo: 'Cargo', col_impact: 'Impact', col_slow: 'Slowdown', col_eta: 'Adjusted ETA', col_risk: 'Max risk', col_status: 'Status', col_dist: 'Distance', col_time: 'Time', col_terr: 'Territorial', col_vuln: 'Vulnerability', col_expo: 'Exposure', col_alerts: 'Threats', col_reports: 'Reports', col_cargoexp: 'Cargo exposure', col_verify: 'Needs verification',
      impact_high: 'High', impact_med: 'Medium', impact_low: 'Low',
      status_analyzed: 'Analyzed', status_pending: 'Pending', status_monitoring: 'Monitoring',
      type_import: 'Import', type_export: 'Export', type_transit: 'Intl. transit',
      state_satellite: 'Environmental threat detected (satellite)', state_reported: 'Incident reported', state_confirmed: 'Closure confirmed',
      state_satellite_s: 'Satellite', state_reported_s: 'Reported', state_confirmed_s: 'Confirmed',
      dim_terr: 'Territorial risk', dim_vuln: 'Cargo vulnerability', dim_expo: 'Logistics exposure', dim_terr_s: 'Territorial', dim_vuln_s: 'Vulnerab.', dim_expo_s: 'Exposure',
      bm_dark: 'Dark', bm_night: 'NASA Night', bm_marble: 'Blue Marble', bm_sat: 'Satellite',
      dim_terr_d: 'What is happening along the route? Rain, flooding, fire, heat, snow.', dim_vuln_d: 'Which product characteristics could be compromised?', dim_expo_d: 'Segment criticality, time at stake, alternatives and dependent population.',
      primary: 'Planned route', alt: 'Alternative', recommended: 'AI recommended', keep: 'Keep route', apply: 'Show on map', applied: 'On map',
      register_op: 'Register operation', new_op: 'New operation', analyze: 'Analyze with EUREKA', save_profile: 'Save profile',
      f_origin: 'Origin', f_dest: 'Destination', f_route: 'Planned route', f_date: 'Estimated transport date', f_product: 'Product name', f_category: 'Commercial category', f_company: 'Company / operator', f_type: 'Operation type', f_mode: 'Mode',
      f_tmin: 'Min temp (°C)', f_tmax: 'Max temp (°C)', f_hum: 'Humidity sensitivity', f_water: 'Water sensitivity', f_frag: 'Fragility', f_delay: 'Delay tolerance (h)', f_mixed: 'Mixed cargo', f_refrig: 'Requires refrigeration', f_frozen: 'Requires freezing', f_sheet: 'Manufacturer technical sheet',
      map_fit: 'Global view', map_focus: 'Focus route', legend: 'Legend', seg_low: 'Low-risk segment', seg_med: 'Medium-risk segment', seg_high: 'High-risk segment',
      alerts_title: 'Alerts & exposure', alerts_filter_all: 'All', alert_note: 'MODIS / ECOSTRESS measure land surface temperature, not air or internal container temperature.',
      chart_title: 'Segment exposure profile', chart_sub: 'Territorial risk (0–10) along planned route vs. recommended alternative',
      ai_title: 'EUREKA Assistant', ai_sub: 'Interprets NASA data for your operation. Distinguishes detected threat, reported incident and confirmed closure.', ai_placeholder: 'Ask about your operation…', ai_report: 'Generate executive report', ai_send: 'Send',
      q1: 'Which operations have the highest exposure?', q2: 'Which segments present risk?', q3: 'Which characteristics of my cargo could be compromised?', q4: 'Which populated areas (SEDAC) would be affected?', q5: 'What alternative routes exist?', q6: 'What should I verify before changing the operation?',
      integrity: 'Cargo integrity index', delay_h: 'h delay', base: 'base', ops_total: 'registered operations', ops_high: 'with high exposure', ops_essential: 'essential',
      hz_rain: 'Precipitation', hz_fire: 'Wildfire', hz_heat: 'Surface heat', hz_soil: 'Saturated soil', hz_snow: 'Snow / altitude', hz_pop: 'Population', hz_cold: 'Extreme cold',
      source_ts: 'Source', obs_ts: 'Observation', resolution: 'Resolution', value: 'Value', segment: 'Segment', min_ago: 'min', h_ago: 'h',
      collapse: 'Collapse', tooltip_lst: 'Surface temperature (not air)',
      ticker_prefix: 'TELEMETRY',
      thr_heat: 'Heat', thr_cold: 'Cold', thr_hum: 'Humidity', thr_water: 'Water', thr_frag: 'Fragility', thr_delay: 'Delay',
      cargo_mixed_note: 'Mixed cargo: vulnerability is assessed with the maximum of each product.',
      op_created: 'Operation registered and analyzed',
      no_alt: 'No alternatives registered for this corridor.',
      verify_items: ['Official road report (ABC / DOT)', 'Actual internal container temperature (IoT sensor)', 'Refrigerated storage availability en route', 'Alternative route enablement'],
    },
  };

  return { sources, validationLayers, cargoProfiles, routes, operations, alerts, streamAlerts, i18n };
})();
