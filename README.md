# EUREKA · Geospatial intelligence for international trade

**EUREKA** integrates NASA Earth observation data with international trade & logistics operations to assess climate risk on cargo transport — relating territorial threats to the specific vulnerability of each shipment.

> Frontend MVP · NASA Space Apps · HTML5 + Tailwind CSS + vanilla JS + Leaflet + Chart.js + Lucide

## Modules

| # | Module | What it does |
|---|--------|--------------|
| 1 | **Panel de Operaciones Comerciales** | Register & track import/export/transit operations (origin, destination, route, ETA, cargo, analysis status) |
| 2 | **Registro y Perfil de Mercancías** | 8 cargo categories + manufacturer technical sheet (min/max temp, humidity/water sensitivity, fragility, delay tolerance), mixed-cargo toggle |
| 3 | **Mapa de Inteligencia Satelital** | Dark Leaflet map with GPM IMERG · FIRMS · MODIS LST · ECOSTRESS (70 m) · SEDAC GPW · SMAP · NASADEM layers; every marker shows source + timestamp. Basemaps: Esri Dark, **NASA GIBS Black Marble**, **NASA Blue Marble**, satellite |
| 4 | **Panel de Alertas y Exposición Logística** | Every event classified as *Amenaza ambiental detectada (satélite)* / *Incidente reportado* / *Cierre confirmado* |
| 5 | **Comparador de Escenarios y Rutas** | Primary vs. alternative corridors across 3 dimensions: Riesgo territorial · Vulnerabilidad de la mercancía · Exposición logística |
| 6 | **Asistente de IA EUREKA** | Grounded quick-prompt assistant + structured executive decision report |

Flagship case (default): **OP-2026-0417 — refrigerated vaccines, Puerto de Arica (CL) → Santa Cruz de la Sierra (BO)** via Tambo Quemado · Oruro · Cochabamba · Chapare, with alternatives (Ruta 7 antigua; Iquique–Pisiga).

## Run

Static site — no build step.

```bash
python3 -m http.server 8080   # then open http://localhost:8080
```

## Data

All NASA observations in `js/data.js` are **simulated** but modelled on the real products (IMERG Early Run 30 min / ~10 km, FIRMS VIIRS <3 h, MOD11A1 LST, ECO_L2T_LSTE 70 m, GPW v4.11). Basemap tiles from NASA GIBS and Esri are real.

## Structure

```
index.html        layout · 6 module views · sidebar · ticker
css/styles.css    glassmorphism theme, map & chart skins
js/data.js        sources · cargo profiles · routes · operations · alerts · i18n (ES/EN)
js/app.js         risk engine (3 dimensions) · map · charts · alerts · comparator · AI assistant
```
