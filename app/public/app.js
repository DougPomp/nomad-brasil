let mapInstance = null;
let currentTab = 'dashboard';
let citiesList = [];
let emergenciesList = [];
let survivalList = [];
let mapMarker = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  initTabs();
  loadData();
  setupMapSearch();
  setupRouteSearch();
  loadPoisData();
  loadUserWaypoints();
  calculateRationing();
  loadRadioData();
  calculateAntennaDipole();
  loadVenomousData();
  calculateSolar();
  renderBobKit();
  loadPlantsData();
  renderKnotsList();
  loadPefData();
  calculateMarch();
});

// Mobile Sidebar Drawer Toggle
window.toggleMobileSidebar = function(force) {
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) return;
  const isOpen = sidebar.classList.contains('open');
  const nextState = typeof force === 'boolean' ? force : !isOpen;
  sidebar.classList.toggle('open', nextState);
  if (backdrop) backdrop.classList.toggle('open', nextState);
};

// Clock
function initClock() {
  const clockEl = document.getElementById('system-clock-time');
  const sideClockEl = document.getElementById('sidebar-clock-time');
  function update() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('pt-BR', { hour12: false });
    if (clockEl) clockEl.textContent = timeStr;
    if (sideClockEl) sideClockEl.textContent = timeStr;
  }
  update();
  setInterval(update, 1000);
}

// Tab navigation
function initTabs() {
  const tabButtons = document.querySelectorAll('[data-tab-target]');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab-target');
      switchTab(target);
    });
  });
}

function switchTab(tabId) {
  currentTab = tabId;

  // Close mobile sidebar if open
  if (typeof window.toggleMobileSidebar === 'function') {
    window.toggleMobileSidebar(false);
  }

  // Update nav buttons
  document.querySelectorAll('[data-tab-target]').forEach(btn => {
    if (btn.getAttribute('data-tab-target') === tabId) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Update views
  document.querySelectorAll('.tab-view').forEach(view => {
    if (view.id === `tab-${tabId}`) {
      view.classList.add('active');
    } else {
      view.classList.remove('active');
    }
  });

  // Trigger map resize if switching to map
  if (tabId === 'map') {
    setTimeout(() => {
      if (!mapInstance) {
        initMap();
      } else {
        mapInstance.resize();
      }
    }, 100);
  }

  // Load Kiwix iframe if switching to wiki
  if (tabId === 'wiki') {
    const iframe = document.getElementById('kiwix-iframe');
    if (iframe && !iframe.getAttribute('src')) {
      iframe.setAttribute('src', 'http://localhost:8090/content/wikipedia_pt_all_maxi_2026-05');
    }
  }

  if (tabId === 'venomous') {
    loadVenomousData();
  }
  if (tabId === 'plants') {
    loadPlantsData();
  }
  if (tabId === 'knots') {
    renderKnotsList();
  }
  if (tabId === 'pef') {
    loadPefData();
  }
  if (tabId === 'march') {
    calculateMarch();
  }
  if (tabId === 'solar') {
    calculateSolar();
  }
  if (tabId === 'bob') {
    renderBobKit();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Load data from API
async function loadData() {
  try {
    // 1. Status
    const statusRes = await fetch('/api/status');
    const statusData = await statusRes.json();
    const statsEl = document.getElementById('status-summary');
    if (statsEl) {
      statsEl.innerHTML = `
        <span class="text-emerald-400 font-bold">${statusData.datasets.citiesCount}</span> cidades mapeadas &bull; 
        <span class="text-emerald-400 font-bold">${statusData.datasets.emergenciesCount}</span> protocolos médicos &bull; 
        <span class="text-emerald-400 font-bold">${statusData.datasets.survivalCount}</span> manuais de campo
      `;
    }

    // 2. Cities (todos os 5.571 municípios do IBGE)
    const citiesRes = await fetch('/api/cities?limit=6000');
    citiesList = await citiesRes.json();

    // 3. Emergencies
    const emRes = await fetch('/api/emergencies');
    emergenciesList = await emRes.json();
    renderEmergencies();

    // 4. Survival
    const surRes = await fetch('/api/survival');
    survivalList = await surRes.json();
    renderSurvival();

  } catch (err) {
    console.error('Erro ao carregar dados:', err);
  }
}

// Render Emergencies Accordion
function renderEmergencies() {
  const container = document.getElementById('emergencies-container');
  if (!container) return;

  container.innerHTML = emergenciesList.map(em => `
    <div class="accordion-item" id="em-${em.id}">
      <div class="accordion-header" onclick="toggleAccordion('em-${em.id}')">
        <div class="accordion-title-wrap">
          <span class="card-tag ${em.severity === 'crítico' ? 'tag-alert' : 'tag-active'}">${em.severity}</span>
          <span class="accordion-title">${em.title}</span>
        </div>
        <span class="text-sm font-bold text-emerald-400">&blacktriangledown;</span>
      </div>
      <div class="accordion-body">
        <p class="mb-3 text-gray-300 font-medium">${em.summary}</p>
        <div class="bg-gray-900/60 p-3 rounded border border-gray-800 mb-4 flex items-center justify-between">
          <span class="text-xs uppercase font-bold text-gray-400">Canal de Emergência:</span>
          <span class="text-sm font-mono font-bold text-red-400">${em.phone}</span>
        </div>
        <h4 class="text-sm font-bold text-gray-200 mb-2 uppercase tracking-wide">Passo a Passo de Ação:</h4>
        <ul class="step-list">
          ${em.steps.map(step => `<li>${step}</li>`).join('')}
        </ul>
        ${em.notes ? `<div class="info-box"><strong>Observação Importante:</strong> ${em.notes}</div>` : ''}
      </div>
    </div>
  `).join('');
}

// Render Survival Manuals
function renderSurvival() {
  const container = document.getElementById('survival-container');
  if (!container) return;

  container.innerHTML = survivalList.map(man => `
    <div class="accordion-item" id="sur-${man.id}">
      <div class="accordion-header" onclick="toggleAccordion('sur-${man.id}')">
        <div class="accordion-title-wrap">
          <span class="card-tag tag-active">${man.category}</span>
          <span class="accordion-title">${man.title}</span>
        </div>
        <span class="text-sm font-bold text-emerald-400">&blacktriangledown;</span>
      </div>
      <div class="accordion-body">
        ${man.sections.map(sec => `
          <div class="mb-4">
            <h4 class="text-base font-bold text-emerald-400 mb-1.5">${sec.heading}</h4>
            <p class="text-gray-300 text-sm leading-relaxed whitespace-pre-line">${sec.content}</p>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

window.toggleAccordion = function(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.toggle('open');
  }
};

// MapLibre GL Integration
function initMap() {
  const container = document.getElementById('map-container');
  if (!container || mapInstance) return;

  // Add PMTiles protocol
  if (window.pmtiles) {
    const protocol = new pmtiles.Protocol();
    maplibregl.addProtocol('pmtiles', protocol.tile);
  }

  // Base map style (tactical dark theme)
  const mapStyle = {
    version: 8,
    sources: {
      'world-tiles': {
        type: 'vector',
        url: 'pmtiles://http://' + window.location.host + '/api/maps/pmtiles',
        maxzoom: 13,
        attribution: 'Project NOMAD Brasil &bull; OpenStreetMap'
      }
    },
    glyphs: '/api/maps/fonts/{fontstack}/{range}.pbf',
    layers: [
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': '#090d10'
        }
      },
      {
        id: 'water',
        type: 'fill',
        source: 'world-tiles',
        'source-layer': 'water',
        paint: {
          'fill-color': '#111c26'
        }
      },
      {
        id: 'landuse',
        type: 'fill',
        source: 'world-tiles',
        'source-layer': 'landuse',
        paint: {
          'fill-color': '#0f171f',
          'fill-opacity': 0.8
        }
      },
      {
        id: 'parks',
        type: 'fill',
        source: 'world-tiles',
        'source-layer': 'landuse',
        filter: ['any', ['==', 'kind', 'park'], ['==', 'kind', 'forest'], ['==', 'kind', 'nature_reserve']],
        paint: {
          'fill-color': '#112218',
          'fill-opacity': 0.85
        }
      },
      {
        id: 'buildings',
        type: 'fill',
        source: 'world-tiles',
        'source-layer': 'buildings',
        minzoom: 13,
        paint: {
          'fill-color': '#18202a',
          'fill-outline-color': '#283446',
          'fill-opacity': 0.85
        }
      },
      {
        id: 'roads_minor',
        type: 'line',
        source: 'world-tiles',
        'source-layer': 'roads',
        minzoom: 11,
        paint: {
          'line-color': '#202934',
          'line-width': ['interpolate', ['linear'], ['zoom'], 11, 0.8, 14, 2, 16, 4.5]
        }
      },
      {
        id: 'roads_medium',
        type: 'line',
        source: 'world-tiles',
        'source-layer': 'roads',
        paint: {
          'line-color': '#334155',
          'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 14, 3, 16, 6]
        }
      },
      {
        id: 'roads_major',
        type: 'line',
        source: 'world-tiles',
        'source-layer': 'roads',
        paint: {
          'line-color': '#475569',
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 1.2, 12, 3.5, 16, 8]
        }
      },
      {
        id: 'boundaries',
        type: 'line',
        source: 'world-tiles',
        'source-layer': 'boundaries',
        paint: {
          'line-color': '#10b981',
          'line-width': 1.6,
          'line-dasharray': [2, 2]
        }
      },
      {
        id: 'roads_labels',
        type: 'symbol',
        source: 'world-tiles',
        'source-layer': 'roads',
        minzoom: 12,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['coalesce', ['get', 'name:pt'], ['get', 'name:latin'], ['get', 'name'], ''],
          'text-font': ['Noto Sans Regular'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 9, 14, 11, 16, 13],
          'text-letter-spacing': 0.05
        },
        paint: {
          'text-color': '#cbd5e1',
          'text-halo-color': '#090d10',
          'text-halo-width': 1.5
        }
      },
      {
        id: 'places_labels',
        type: 'symbol',
        source: 'world-tiles',
        'source-layer': 'places',
        layout: {
          'text-field': ['coalesce', ['get', 'name:pt'], ['get', 'name:latin'], ['get', 'name'], ''],
          'text-font': ['Noto Sans Medium'],
          'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 8, 14, 12, 17],
          'text-max-width': 8
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#090d10',
          'text-halo-width': 2
        }
      },
      {
        id: 'pois_labels',
        type: 'symbol',
        source: 'world-tiles',
        'source-layer': 'pois',
        minzoom: 13,
        layout: {
          'text-field': ['coalesce', ['get', 'name:pt'], ['get', 'name:latin'], ['get', 'name'], ''],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-max-width': 9
        },
        paint: {
          'text-color': '#6ee7b7',
          'text-halo-color': '#090d10',
          'text-halo-width': 1.5
        }
      }
    ]
  };

  try {
    mapInstance = new maplibregl.Map({
      container: 'map-container',
      style: mapStyle,
      center: [-47.9292, -15.7801], // Brasil / DF
      zoom: 4.2,
      maxZoom: 16,
      minZoom: 2
    });

    mapInstance.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    mapInstance.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');

    // Render POIs & User Waypoints once map is ready
    if (typeof renderPoiMarkers === 'function') renderPoiMarkers();
    if (typeof renderUserWptMarkers === 'function') renderUserWptMarkers();

    mapInstance.on('mousemove', (e) => {
      const coordsEl = document.getElementById('hud-coordinates');
      if (coordsEl) {
        coordsEl.textContent = `LAT: ${e.lngLat.lat.toFixed(4)}° | LNG: ${e.lngLat.lng.toFixed(4)}° | ZOOM: ${mapInstance.getZoom().toFixed(1)}`;
      }
    });

    // Interactive Map Click
    mapInstance.on('click', (e) => {
      const { lng, lat } = e.lngLat;

      // If user is picking route origin or destination on map
      if (mapPickMode) {
        handleMapPickedPoint(lat, lng, mapPickMode);
        return;
      }

      // Otherwise detect nearest municipality within 25 km
      let nearest = null;
      let minDist = Infinity;
      for (let i = 0; i < citiesList.length; i++) {
        const c = citiesList[i];
        const dist = getDistanceFromLatLonInKm(lat, lng, c.lat, c.lng);
        if (dist < minDist) {
          minDist = dist;
          nearest = c;
        }
      }

      if (nearest && minDist <= 25) {
        flyToCity(nearest.id);
      } else {
        flyToCoords(lat, lng, 'Ponto no Mapa', mapInstance.getZoom());
      }
    });

  } catch (err) {
    console.error('Erro ao inicializar mapa:', err);
  }
}

// City Search
function setupMapSearch() {
  const input = document.getElementById('map-city-search');
  const dropdown = document.getElementById('map-search-results');
  if (!input || !dropdown) return;

  function doSearch() {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      dropdown.classList.remove('visible');
      dropdown.innerHTML = '';
      return;
    }

    // Check if coordinates
    const coordMatch = q.match(/^(-?\d+(\.\d+)?)[,\s]+(-?\d+(\.\d+)?)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[3]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        dropdown.innerHTML = `
          <div class="search-item" onclick="flyToCoords(${lat}, ${lng}, 'Coordenadas Personalizadas')">
            <div>
              <span class="search-item-title">Ir para Coordenadas</span>
              <div class="text-xs text-emerald-400 font-mono">${lat.toFixed(4)}, ${lng.toFixed(4)}</div>
            </div>
            <span class="search-item-badge">GPS</span>
          </div>
        `;
        dropdown.classList.add('visible');
        return;
      }
    }

    // Filter cities across all 5,571 municipalities
    const normQ = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const matches = citiesList.filter(c => {
      const normName = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const normState = c.state.toLowerCase();
      return normName.includes(normQ) || normState === normQ;
    }).sort((a, b) => {
      const aNorm = a.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const bNorm = b.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const aStarts = aNorm.startsWith(normQ);
      const bStarts = bNorm.startsWith(normQ);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      if (a.capital && !b.capital) return -1;
      if (!a.capital && b.capital) return 1;
      return a.name.localeCompare(b.name);
    }).slice(0, 12);

    if (matches.length === 0) {
      dropdown.innerHTML = `
        <div class="p-3 text-xs text-gray-400 text-center">
          Nenhuma cidade encontrada com este termo. Tente coordenadas (ex: -23.55, -46.63)
        </div>
      `;
      dropdown.classList.add('visible');
      return;
    }

    dropdown.innerHTML = matches.map(c => `
      <div class="search-item" onclick="flyToCity('${c.id}')">
        <div>
          <span class="search-item-title">${c.name}</span>
          <span class="search-item-state">${c.state}</span>
        </div>
        <div class="flex items-center gap-2">
          ${c.capital ? '<span class="text-[10px] uppercase font-bold text-amber-400 bg-amber-900/30 px-1 rounded border border-amber-600/40">Capital</span>' : ''}
          <span class="search-item-badge">${c.pop ? (c.pop / 1000).toFixed(0) + 'k hab' : (c.ddd ? 'DDD ' + c.ddd : c.state)}</span>
        </div>
      </div>
    `).join('');

    dropdown.classList.add('visible');
  }

  input.addEventListener('input', doSearch);
  input.addEventListener('focus', () => {
    if (input.value.trim()) doSearch();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const firstItem = dropdown.querySelector('.search-item');
      if (firstItem) {
        firstItem.click();
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('visible');
    }
  });
}

let currentSelectedCity = null;

// Haversine distance formula in kilometers
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of Earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Show City Intel Drawer with rich tactical data
window.showCityIntel = function(city) {
  currentSelectedCity = city;
  const drawer = document.getElementById('city-intel-drawer');
  if (!drawer) return;

  const cityNameEl = document.getElementById('drawer-city-name');
  const stateNameEl = document.getElementById('drawer-state-name');
  const badgeRegionEl = document.getElementById('drawer-badge-region');
  const badgeUfEl = document.getElementById('drawer-badge-uf');
  const ibgeEl = document.getElementById('drawer-ibge');
  const dddEl = document.getElementById('drawer-ddd');
  const capitalStatusEl = document.getElementById('drawer-capital-status');
  const coordsEl = document.getElementById('drawer-coords');
  const distanceEl = document.getElementById('drawer-distance');
  const wikiLinkEl = document.getElementById('drawer-wiki-link');

  if (cityNameEl) cityNameEl.textContent = city.name;
  if (stateNameEl) stateNameEl.textContent = `${city.state_name || city.state} (${city.state})`;
  if (badgeRegionEl) badgeRegionEl.textContent = (city.region || 'Brasil').toUpperCase();
  if (badgeUfEl) badgeUfEl.textContent = city.state;
  if (ibgeEl) ibgeEl.textContent = city.codigo_ibge || 'N/A';
  if (dddEl) dddEl.textContent = city.ddd ? `(${city.ddd})` : 'N/A';
  if (capitalStatusEl) capitalStatusEl.textContent = city.capital ? 'Capital Estadual' : 'Município';
  if (coordsEl) coordsEl.textContent = `${city.lat.toFixed(4)}°, ${city.lng.toFixed(4)}°`;

  // Calculate distance to State Capital or Brasilia
  if (distanceEl) {
    if (city.capital) {
      const dist = Math.round(getDistanceFromLatLonInKm(city.lat, city.lng, -15.7801, -47.9292));
      distanceEl.textContent = `${dist} km (até Brasília)`;
    } else {
      const cap = citiesList.find(c => c.state === city.state && c.capital);
      if (cap) {
        const dist = Math.round(getDistanceFromLatLonInKm(city.lat, city.lng, cap.lat, cap.lng));
        distanceEl.textContent = `${dist} km (${cap.name})`;
      } else {
        distanceEl.textContent = 'N/A';
      }
    }
  }

  // Exact Wikipedia offline article link (Kiwix port 8090)
  if (wikiLinkEl) {
    let wikiTarget = city.name;
    if (city.wiki_query) {
      wikiTarget = city.wiki_query;
    } else {
      wikiTarget = `${city.name}_(${city.state_name || city.state})`;
    }
    const cleanTarget = wikiTarget.replace(/ /g, '_');
    wikiLinkEl.href = `http://localhost:8090/content/wikipedia_pt_all_maxi_2026-05/${encodeURIComponent(cleanTarget)}`;
  }

  drawer.classList.add('open');
};

window.closeCityDrawer = function() {
  const drawer = document.getElementById('city-intel-drawer');
  if (drawer) drawer.classList.remove('open');
};

window.copyCityCoords = function() {
  if (!currentSelectedCity) return;
  const str = `${currentSelectedCity.lat.toFixed(6)}, ${currentSelectedCity.lng.toFixed(6)}`;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(str).then(() => {
      const btn = document.getElementById('btn-copy-coords');
      if (btn) {
        btn.textContent = '✅ Copiado!';
        setTimeout(() => { btn.textContent = '📋 Copiar'; }, 2000);
      }
    }).catch(() => {
      prompt('Coordenadas (copie abaixo):', str);
    });
  } else {
    prompt('Coordenadas (copie abaixo):', str);
  }
};

window.zoomCity = function(level) {
  if (!mapInstance || !currentSelectedCity) return;
  mapInstance.flyTo({
    center: [currentSelectedCity.lng, currentSelectedCity.lat],
    zoom: level,
    duration: 1200,
    essential: true
  });
};

window.flyToCity = function(cityId) {
  if (currentTab !== 'map') {
    switchTab('map');
  }

  const city = citiesList.find(c => c.id === cityId);
  if (!city) return;

  const dropdown = document.getElementById('map-search-results');
  if (dropdown) dropdown.classList.remove('visible');

  const input = document.getElementById('map-city-search');
  if (input) input.value = `${city.name} - ${city.state}`;

  showCityIntel(city);
  flyToCoords(city.lat, city.lng, `${city.name} (${city.state})`, 13);
};

window.flyToCoords = function(lat, lng, label = 'Ponto Selecionado', zoom = 12) {
  if (!mapInstance) {
    initMap();
    setTimeout(() => flyToCoords(lat, lng, label, zoom), 300);
    return;
  }

  mapInstance.flyTo({
    center: [lng, lat],
    zoom: zoom,
    duration: 1600,
    essential: true
  });

  if (mapMarker) {
    mapMarker.remove();
  }

  // Tactical pulsing marker
  const wrap = document.createElement('div');
  wrap.className = 'tactical-marker-wrap';
  wrap.innerHTML = '<div class="tactical-marker-radar"></div><div class="tactical-marker-dot"></div>';
  wrap.style.cursor = 'pointer';

  const popup = new maplibregl.Popup({ offset: 18 })
    .setHTML(`
      <div style="color: #0f141a; font-family: -apple-system, sans-serif; padding: 4px;">
        <h4 style="margin: 0 0 2px; font-weight: 800; font-size: 13px; color: #090d10;">${label}</h4>
        <div style="font-size: 11px; color: #374454; font-family: monospace;">LAT: ${lat.toFixed(4)} | LNG: ${lng.toFixed(4)}</div>
      </div>
    `);

  mapMarker = new maplibregl.Marker({ element: wrap })
    .setLngLat([lng, lat])
    .setPopup(popup)
    .addTo(mapInstance);

  popup.addTo(mapInstance);
};

// ==========================================
// TACTICAL ROUTE PLANNER IMPLEMENTATION
// ==========================================
let routeOrigin = null;
let routeDest = null;
let routeProfile = 'driving';
let mapPickMode = null;
let routeMarkers = [];
let currentRouteData = null;

// Toggle Route Planner
window.toggleRoutePlanner = function(forceState) {
  const panel = document.getElementById('route-planner-panel');
  const btn = document.getElementById('btn-toggle-route-panel');
  const wptDrawer = document.getElementById('waypoints-drawer');
  const wptBtn = document.getElementById('layer-btn-waypoints');
  if (!panel) return;

  const isOpen = panel.classList.contains('open');
  const targetState = typeof forceState === 'boolean' ? forceState : !isOpen;

  if (targetState) {
    // Close waypoints drawer so left drawers never collide
    if (wptDrawer) wptDrawer.classList.remove('open');
    if (wptBtn) wptBtn.classList.remove('active');
    if (window.innerWidth <= 900) closeCityDrawer();

    panel.classList.add('open');
    if (btn) btn.classList.add('active');
    if (currentTab !== 'map') switchTab('map');
  } else {
    panel.classList.remove('open');
    if (btn) btn.classList.remove('active');
    cancelMapPick();
  }
};

// Plan Route directly to selected city (from City Intel Drawer)
window.planRouteToSelectedCity = function() {
  if (!currentSelectedCity) return;
  toggleRoutePlanner(true);

  // Set destination as selected city
  routeDest = {
    lat: currentSelectedCity.lat,
    lng: currentSelectedCity.lng,
    label: `${currentSelectedCity.name} (${currentSelectedCity.state})`
  };
  const toInput = document.getElementById('route-to-input');
  if (toInput) toInput.value = routeDest.label;

  // If origin is not set, set origin to Sao Paulo or Campinas
  if (!routeOrigin) {
    const defaultOrigin = currentSelectedCity.id === 'sp-sao-paulo' ?
      citiesList.find(c => c.id === 'sp-campinas') :
      citiesList.find(c => c.id === 'sp-sao-paulo');

    if (defaultOrigin) {
      routeOrigin = {
        lat: defaultOrigin.lat,
        lng: defaultOrigin.lng,
        label: `${defaultOrigin.name} (${defaultOrigin.state})`
      };
      const fromInput = document.getElementById('route-from-input');
      if (fromInput) fromInput.value = routeOrigin.label;
    }
  }

  // Calculate route immediately!
  calculateRoute();
};

// Autocomplete search for origin and destination inputs
function setupRouteSearch() {
  setupCityAutocomplete('route-from-input', 'route-from-dropdown', (city) => {
    routeOrigin = {
      lat: city.lat,
      lng: city.lng,
      label: `${city.name} (${city.state})`
    };
    const input = document.getElementById('route-from-input');
    if (input) input.value = routeOrigin.label;
    if (routeOrigin && routeDest) calculateRoute();
  });

  setupCityAutocomplete('route-to-input', 'route-to-dropdown', (city) => {
    routeDest = {
      lat: city.lat,
      lng: city.lng,
      label: `${city.name} (${city.state})`
    };
    const input = document.getElementById('route-to-input');
    if (input) input.value = routeDest.label;
    if (routeOrigin && routeDest) calculateRoute();
  });
}

function setupCityAutocomplete(inputId, dropdownId, onSelect) {
  const input = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  if (!input || !dropdown) return;

  function doSearch() {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      dropdown.classList.remove('visible');
      dropdown.innerHTML = '';
      return;
    }

    const normQ = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const matches = citiesList.filter(c => {
      const normName = c.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const normState = c.state.toLowerCase();
      return normName.includes(normQ) || normState === normQ;
    }).sort((a, b) => {
      const aNorm = a.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const bNorm = b.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const aStarts = aNorm.startsWith(normQ);
      const bStarts = bNorm.startsWith(normQ);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return a.name.localeCompare(b.name);
    }).slice(0, 8);

    if (matches.length === 0) {
      dropdown.innerHTML = `<div class="p-2.5 text-xs text-gray-400 text-center">Nenhum município encontrado</div>`;
      dropdown.classList.add('visible');
      return;
    }

    dropdown.innerHTML = matches.map(c => `
      <div class="search-item" data-id="${c.id}">
        <div>
          <span class="search-item-title">${c.name}</span>
          <span class="search-item-state">${c.state}</span>
        </div>
        <span class="search-item-badge">DDD ${c.ddd || c.state}</span>
      </div>
    `).join('');

    dropdown.querySelectorAll('.search-item').forEach(item => {
      item.addEventListener('click', () => {
        const c = citiesList.find(x => x.id === item.getAttribute('data-id'));
        if (c) {
          onSelect(c);
          dropdown.classList.remove('visible');
        }
      });
    });

    dropdown.classList.add('visible');
  }

  input.addEventListener('input', doSearch);
  input.addEventListener('focus', () => {
    if (input.value.trim()) doSearch();
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const first = dropdown.querySelector('.search-item');
      if (first) first.click();
    }
  });

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      dropdown.classList.remove('visible');
    }
  });
}

// Invert origin and destination
window.swapRoutePoints = function() {
  const temp = routeOrigin;
  routeOrigin = routeDest;
  routeDest = temp;

  const fromInput = document.getElementById('route-from-input');
  const toInput = document.getElementById('route-to-input');
  if (fromInput) fromInput.value = routeOrigin ? routeOrigin.label : '';
  if (toInput) toInput.value = routeDest ? routeDest.label : '';

  if (routeOrigin && routeDest) {
    calculateRoute();
  }
};

// Profile selector change
window.selectProfile = function(profile) {
  routeProfile = profile;
  document.querySelectorAll('.profile-option').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.getElementById(`prof-${profile}`);
  if (activeBtn) activeBtn.classList.add('active');

  if (routeOrigin && routeDest) {
    calculateRoute();
  }
};
window.onProfileChange = window.selectProfile;

// Map pick mode (clicking on map to set point)
window.enableMapPick = function(target) {
  mapPickMode = target;
  const banner = document.getElementById('map-pick-banner');
  const targetLabel = document.getElementById('map-pick-target-name');
  if (banner) banner.style.display = 'flex';
  if (targetLabel) {
    if (target === 'origin') targetLabel.textContent = 'Ponto A (Origem)';
    else if (target === 'dest') targetLabel.textContent = 'Ponto B (Destino)';
    else if (target === 'waypoint') targetLabel.textContent = 'Novo Marcador Tático';
  }
};

window.cancelMapPick = function() {
  mapPickMode = null;
  const banner = document.getElementById('map-pick-banner');
  if (banner) banner.style.display = 'none';
};

function handleMapPickedPoint(lat, lng, mode) {
  cancelMapPick();
  
  if (mode === 'waypoint') {
    const latIn = document.getElementById('wpt-lat-input');
    const lngIn = document.getElementById('wpt-lng-input');
    if (latIn) latIn.value = lat.toFixed(4);
    if (lngIn) lngIn.value = lng.toFixed(4);
    toggleWaypointsDrawer(true);
    return;
  }

  let label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  let nearest = null;
  let minDist = Infinity;
  for (const c of citiesList) {
    const d = getDistanceFromLatLonInKm(lat, lng, c.lat, c.lng);
    if (d < minDist) {
      minDist = d;
      nearest = c;
    }
  }

  if (nearest && minDist <= 15) {
    label = `${nearest.name} (${nearest.state})`;
  }

  if (mode === 'origin') {
    routeOrigin = { lat, lng, label };
    const input = document.getElementById('route-from-input');
    if (input) input.value = label;
  } else {
    routeDest = { lat, lng, label };
    const input = document.getElementById('route-to-input');
    if (input) input.value = label;
  }

  if (routeOrigin && routeDest) {
    calculateRoute();
  }
}

// Calculate route
window.calculateRoute = async function() {
  if (!routeOrigin || !routeDest) {
    return;
  }

  const loadingIndicator = document.getElementById('route-loading-indicator');
  const resultContainer = document.getElementById('route-result-container');

  if (loadingIndicator) {
    loadingIndicator.style.display = 'flex';
  }
  if (resultContainer) {
    resultContainer.style.opacity = '0.35';
    resultContainer.style.pointerEvents = 'none';
  }

  try {
    const url = `/api/route?fromLat=${routeOrigin.lat}&fromLng=${routeOrigin.lng}&toLat=${routeDest.lat}&toLng=${routeDest.lng}&profile=${routeProfile}`;
    const res = await fetch(url);
    const data = await res.json();
    currentRouteData = data;

    renderRouteOnMap(data);
    renderRouteMetricsAndSteps(data);

  } catch (err) {
    console.error('Erro ao calcular rota:', err);
  } finally {
    if (loadingIndicator) {
      loadingIndicator.style.display = 'none';
    }
    if (resultContainer) {
      resultContainer.style.opacity = '1';
      resultContainer.style.pointerEvents = 'auto';
    }
  }
};

// Render route layer on MapLibre GL
function renderRouteOnMap(data) {
  if (!mapInstance || !data.geometry) return;

  const geojson = {
    type: 'Feature',
    properties: {},
    geometry: data.geometry
  };

  if (mapInstance.getSource('route-source')) {
    mapInstance.getSource('route-source').setData(geojson);
  } else {
    mapInstance.addSource('route-source', {
      type: 'geojson',
      data: geojson
    });

    // Outer glow
    mapInstance.addLayer({
      id: 'route-glow',
      type: 'line',
      source: 'route-source',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#10b981',
        'line-width': 8,
        'line-opacity': 0.45,
        'line-blur': 3
      }
    });

    // Core line
    mapInstance.addLayer({
      id: 'route-line',
      type: 'line',
      source: 'route-source',
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      },
      paint: {
        'line-color': '#34d399',
        'line-width': 4.5,
        'line-opacity': 0.95
      }
    });
  }

  // Clear previous route markers
  routeMarkers.forEach(m => m.remove());
  routeMarkers = [];

  // Start Marker (A)
  const elA = document.createElement('div');
  elA.className = 'dot-origin';
  elA.style.width = '24px';
  elA.style.height = '24px';
  elA.style.fontSize = '12px';
  elA.style.boxShadow = '0 0 12px rgba(16, 185, 129, 0.9)';
  elA.textContent = 'A';

  const markerA = new maplibregl.Marker({ element: elA })
    .setLngLat([routeOrigin.lng, routeOrigin.lat])
    .setPopup(new maplibregl.Popup({ offset: 15 }).setHTML(`<strong>Origem:</strong> ${routeOrigin.label}`))
    .addTo(mapInstance);
  routeMarkers.push(markerA);

  // End Marker (B)
  const elB = document.createElement('div');
  elB.className = 'dot-dest';
  elB.style.width = '24px';
  elB.style.height = '24px';
  elB.style.fontSize = '12px';
  elB.style.boxShadow = '0 0 12px rgba(239, 68, 68, 0.9)';
  elB.textContent = 'B';

  const markerB = new maplibregl.Marker({ element: elB })
    .setLngLat([routeDest.lng, routeDest.lat])
    .setPopup(new maplibregl.Popup({ offset: 15 }).setHTML(`<strong>Destino:</strong> ${routeDest.label}`))
    .addTo(mapInstance);
  routeMarkers.push(markerB);

  // Fit camera bounds to route coordinates
  const coords = data.geometry.coordinates;
  const bounds = coords.reduce((b, coord) => b.extend(coord), new maplibregl.LngLatBounds(coords[0], coords[0]));
  mapInstance.fitBounds(bounds, {
    padding: { top: 90, bottom: 90, left: 420, right: 90 },
    maxZoom: 14,
    duration: 1500
  });
}

// Render metrics & steps in panel
function renderRouteMetricsAndSteps(data) {
  const container = document.getElementById('route-result-container');
  if (!container) return;
  container.style.display = 'flex';

  // Distance
  const distEl = document.getElementById('route-metric-dist');
  if (distEl) distEl.textContent = `${data.distanceKm} km`;

  // Duration
  const durEl = document.getElementById('route-metric-dur');
  if (durEl) {
    if (data.profile === 'walking') {
      const totalHours = Math.floor(data.durationMin / 60);
      const remainingMins = data.durationMin % 60;
      if (totalHours >= 8) {
        const days = (data.durationMin / 60 / 8).toFixed(1);
        durEl.textContent = `${totalHours}h ${remainingMins}min (~${days} d de marcha)`;
      } else {
        durEl.textContent = `${totalHours}h ${remainingMins}min`;
      }
    } else if (data.durationMin >= 60) {
      const h = Math.floor(data.durationMin / 60);
      const m = data.durationMin % 60;
      durEl.textContent = `${h}h ${m}min`;
    } else {
      durEl.textContent = `${data.durationMin} min`;
    }
  }

  // Fuel / Water
  const fuelTitleEl = document.getElementById('route-metric-fuel-title');
  const fuelEl = document.getElementById('route-metric-fuel');
  if (fuelTitleEl && fuelEl) {
    if (data.profile === 'walking') {
      fuelTitleEl.textContent = 'ÁGUA & ENERGIA';
      const kcal = data.caloriesKcal || Math.round((data.durationMin / 60) * 380);
      fuelEl.innerHTML = `${data.waterLiters}L Água &bull; <span class="text-xs text-gray-300 font-normal">${kcal} kcal</span>`;
    } else {
      fuelTitleEl.textContent = 'COMBUSTÍVEL EST.';
      fuelEl.textContent = `${data.fuelLiters} L (~${Math.round(data.fuelLiters / 50 * 100)}% tanque)`;
    }
  }

  // Source Badge
  const sourceEl = document.getElementById('route-metric-source');
  if (sourceEl) {
    if (data.source === 'osrm_online') {
      sourceEl.textContent = data.cached ? 'CACHE DISCO' : 'OSRM RODOVIAS';
      sourceEl.className = 'metric-badge text-emerald-400';
    } else {
      sourceEl.textContent = 'CORREDOR OFFLINE';
      sourceEl.className = 'metric-badge text-amber-400';
    }
  }

  // Steps
  const countEl = document.getElementById('route-steps-count');
  if (countEl) countEl.textContent = `${data.steps.length} etapas`;

  const listEl = document.getElementById('route-steps-list');
  if (listEl) {
    listEl.innerHTML = data.steps.map((s, idx) => {
      let icon = '⬆️';
      if (s.type === 'depart') icon = '🟢';
      else if (s.type === 'arrive') icon = '🏁';
      else if (s.instruction.includes('direita')) icon = '↗️';
      else if (s.instruction.includes('esquerda')) icon = '↖️';
      else if (s.instruction.includes('rotatória')) icon = '🔄';
      else if (s.instruction.includes('Passagem')) icon = '📍';

      return `
        <div class="step-row">
          <span class="step-icon">${icon}</span>
          <div class="step-info">
            <span>${s.instruction}</span>
          </div>
          ${s.distanceKm > 0 ? `<span class="step-dist">${s.distanceKm} km</span>` : ''}
        </div>
      `;
    }).join('');
  }
}

// Clear current route
window.clearCurrentRoute = function() {
  routeOrigin = null;
  routeDest = null;
  currentRouteData = null;

  const fromInput = document.getElementById('route-from-input');
  const toInput = document.getElementById('route-to-input');
  if (fromInput) fromInput.value = '';
  if (toInput) toInput.value = '';

  const resContainer = document.getElementById('route-result-container');
  if (resContainer) resContainer.style.display = 'none';

  const loader = document.getElementById('route-loading-indicator');
  if (loader) loader.style.display = 'none';

  routeMarkers.forEach(m => m.remove());
  routeMarkers = [];

  if (mapInstance && mapInstance.getSource('route-source')) {
    mapInstance.getSource('route-source').setData({
      type: 'FeatureCollection',
      features: []
    });
  }
  cancelMapPick();
};

// Download GPX
window.downloadCurrentRouteGpx = function() {
  if (!routeOrigin || !routeDest) return;
  const url = `/api/route/gpx?fromLat=${routeOrigin.lat}&fromLng=${routeOrigin.lng}&toLat=${routeDest.lat}&toLng=${routeDest.lng}&profile=${routeProfile}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `rota_tatica_${routeProfile}_nomad.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

/* ========================================================
   MODULE 1: STRATEGIC POIs ON MAP
   ======================================================== */
let poisData = [];
let poiMarkers = [];
const activePoiCategories = {
  hospital: true,
  rescue: true,
  police: true,
  water: true,
  fuel: true
};

const POI_ICONS = {
  hospital: '🏥',
  rescue: '🚒',
  police: '🛡️',
  water: '💧',
  fuel: '⛽'
};

async function loadPoisData() {
  try {
    const res = await fetch('/api/pois');
    if (res.ok) {
      poisData = await res.json();
      if (mapInstance) renderPoiMarkers();
    }
  } catch (err) {
    console.error('Erro ao carregar POIs estratégicos:', err);
  }
}

window.togglePoiCategory = function(cat) {
  activePoiCategories[cat] = !activePoiCategories[cat];
  const btn = document.getElementById(`layer-btn-${cat}`);
  if (btn) {
    btn.classList.toggle('active', activePoiCategories[cat]);
  }
  renderPoiMarkers();
};

function renderPoiMarkers() {
  if (!mapInstance || !poisData) return;

  // Clear existing POI markers
  poiMarkers.forEach(m => m.remove());
  poiMarkers = [];

  poisData.forEach(poi => {
    if (!activePoiCategories[poi.category]) return;

    const el = document.createElement('div');
    el.className = 'poi-custom-marker';
    el.innerHTML = `
      <div style="background: rgba(10,15,26,0.9); border: 2px solid #10b981; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 0 10px rgba(16,185,129,0.5); cursor: pointer;">
        ${POI_ICONS[poi.category] || '📍'}
      </div>
    `;

    const popupHtml = `
      <div style="color: #fff; font-family: sans-serif; font-size: 12px; line-height: 1.4; padding: 4px;">
        <div style="font-weight: 800; color: #34d399; font-size: 13px; margin-bottom: 3px;">
          ${POI_ICONS[poi.category] || ''} ${poi.name}
        </div>
        <div style="color: #94a3b8; font-size: 11px; margin-bottom: 5px;">
          ${poi.city} - ${poi.uf} ${poi.phone ? `&bull; 📞 ${poi.phone}` : ''}
        </div>
        <div style="color: #cbd5e1; margin-bottom: 8px;">
          ${poi.details || ''}
        </div>
        <button onclick="setRouteDestination(${poi.lat}, ${poi.lng}, '${poi.name.replace(/'/g, "\\'")}')" 
                style="background: #10b981; color: #000; font-weight: 800; border: none; padding: 5px 8px; border-radius: 4px; cursor: pointer; width: 100%;">
          🧭 Traçar Rota até aqui
        </button>
      </div>
    `;

    const popup = new maplibregl.Popup({ offset: 15 }).setHTML(popupHtml);
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([poi.lng, poi.lat])
      .setPopup(popup)
      .addTo(mapInstance);

    poiMarkers.push(marker);
  });
}

window.setRouteDestination = function(lat, lng, label) {
  toggleRoutePlanner(true);
  routeDest = { lat, lng, label };
  const toInput = document.getElementById('route-to-input');
  if (toInput) toInput.value = label;
  if (routeOrigin && routeDest) calculateRoute();
};

/* ========================================================
   MODULE 2: PERSONAL TACTICAL WAYPOINTS (LOCALSTORAGE)
   ======================================================== */
let userWaypoints = [];
let userWptMarkers = [];

const WPT_ICONS = {
  base: '🏠',
  rendezvous: '🤝',
  shelter: '🏕️',
  water: '💧',
  danger: '⚠️'
};

function loadUserWaypoints() {
  try {
    const raw = localStorage.getItem('nomad_brasil_waypoints');
    userWaypoints = raw ? JSON.parse(raw) : [];
  } catch (e) {
    userWaypoints = [];
  }
  updateWaypointsBadges();
  renderWaypointList();
  if (mapInstance) renderUserWptMarkers();
}

function saveUserWaypointsToStorage() {
  try {
    localStorage.setItem('nomad_brasil_waypoints', JSON.stringify(userWaypoints));
  } catch (e) {}
  updateWaypointsBadges();
  renderWaypointList();
  renderUserWptMarkers();
}

function updateWaypointsBadges() {
  const badge1 = document.getElementById('user-wpt-badge');
  const badge2 = document.getElementById('user-wpt-total');
  if (badge1) badge1.textContent = userWaypoints.length;
  if (badge2) badge2.textContent = userWaypoints.length;
}

window.toggleWaypointsDrawer = function(force) {
  const drawer = document.getElementById('waypoints-drawer');
  const btn = document.getElementById('layer-btn-waypoints');
  const routePanel = document.getElementById('route-planner-panel');
  const routeBtn = document.getElementById('btn-toggle-route-panel');
  if (!drawer) return;

  const isOpen = drawer.classList.contains('open');
  const shouldOpen = typeof force === 'boolean' ? force : !isOpen;

  if (shouldOpen) {
    if (routePanel) routePanel.classList.remove('open');
    if (routeBtn) routeBtn.classList.remove('active');
    if (window.innerWidth <= 900) closeCityDrawer();
    drawer.classList.add('open');
    if (btn) btn.classList.add('active');
  } else {
    drawer.classList.remove('open');
    if (btn) btn.classList.remove('active');
  }
};

window.setWptFromMapCenter = function() {
  if (!mapInstance) return;
  const c = mapInstance.getCenter();
  const latIn = document.getElementById('wpt-lat-input');
  const lngIn = document.getElementById('wpt-lng-input');
  if (latIn) latIn.value = c.lat.toFixed(4);
  if (lngIn) lngIn.value = c.lng.toFixed(4);
};

window.saveNewWaypoint = function() {
  const nameIn = document.getElementById('wpt-name-input');
  const catIn = document.getElementById('wpt-cat-select');
  const latIn = document.getElementById('wpt-lat-input');
  const lngIn = document.getElementById('wpt-lng-input');

  const name = nameIn ? nameIn.value.trim() : '';
  const category = catIn ? catIn.value : 'base';
  const lat = parseFloat(latIn ? latIn.value : '');
  const lng = parseFloat(lngIn ? lngIn.value : '');

  if (!name) {
    alert('Por favor, informe um nome para o marcador.');
    return;
  }
  if (isNaN(lat) || isNaN(lng)) {
    alert('Coordenadas de latitude e longitude inválidas. Use o botão "Centro" ou clique no mapa.');
    return;
  }

  const wpt = {
    id: 'wpt_' + Date.now(),
    name,
    category,
    lat,
    lng,
    createdAt: new Date().toISOString()
  };

  userWaypoints.push(wpt);
  saveUserWaypointsToStorage();

  if (nameIn) nameIn.value = '';
  alert(`Marcador "${name}" salvo com sucesso!`);
};

window.deleteWaypoint = function(id) {
  if (!confirm('Deseja realmente remover este marcador?')) return;
  userWaypoints = userWaypoints.filter(w => w.id !== id);
  saveUserWaypointsToStorage();
};

function renderWaypointList() {
  const container = document.getElementById('wpt-list-items');
  if (!container) return;

  if (userWaypoints.length === 0) {
    container.innerHTML = '<div class="text-xs text-gray-500 py-3 text-center">Nenhum marcador cadastrado ainda.</div>';
    return;
  }

  container.innerHTML = userWaypoints.map(w => `
    <div class="wpt-item">
      <span class="wpt-icon">${WPT_ICONS[w.category] || '📍'}</span>
      <div class="wpt-details">
        <div class="wpt-title">${w.name}</div>
        <div class="wpt-coords">${w.lat.toFixed(4)}, ${w.lng.toFixed(4)}</div>
      </div>
      <div class="wpt-actions">
        <button class="wpt-act-btn route" onclick="setRouteDestination(${w.lat}, ${w.lng}, '${w.name.replace(/'/g, "\\'")}')" title="Traçar rota até aqui">🧭</button>
        <button class="wpt-act-btn" onclick="flyToCoords(${w.lat}, ${w.lng}, '${w.name.replace(/'/g, "\\'")}', 14)" title="Ver no mapa">🔍</button>
        <button class="wpt-act-btn delete" onclick="deleteWaypoint('${w.id}')" title="Remover">🗑️</button>
      </div>
    </div>
  `).join('');
}

function renderUserWptMarkers() {
  if (!mapInstance) return;
  userWptMarkers.forEach(m => m.remove());
  userWptMarkers = [];

  userWaypoints.forEach(w => {
    const el = document.createElement('div');
    el.innerHTML = `
      <div style="background: rgba(14,165,233,0.9); border: 2px solid #fff; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; font-size: 14px; box-shadow: 0 0 12px rgba(14,165,233,0.7); cursor: pointer;">
        ${WPT_ICONS[w.category] || '📍'}
      </div>
    `;

    const popupHtml = `
      <div style="color: #fff; font-family: sans-serif; font-size: 12px; padding: 4px;">
        <div style="font-weight: 800; color: #38bdf8; font-size: 13px; margin-bottom: 2px;">
          ${WPT_ICONS[w.category] || ''} ${w.name}
        </div>
        <div style="color: #94a3b8; font-size: 10px; margin-bottom: 6px;">
          Coord: ${w.lat.toFixed(4)}, ${w.lng.toFixed(4)}
        </div>
        <button onclick="setRouteDestination(${w.lat}, ${w.lng}, '${w.name.replace(/'/g, "\\'")}')" 
                style="background: #0ea5e9; color: #000; font-weight: 800; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; width: 100%;">
          🧭 Rota até aqui
        </button>
      </div>
    `;

    const popup = new maplibregl.Popup({ offset: 15 }).setHTML(popupHtml);
    const marker = new maplibregl.Marker({ element: el })
      .setLngLat([w.lng, w.lat])
      .setPopup(popup)
      .addTo(mapInstance);

    userWptMarkers.push(marker);
  });
}

window.exportWaypointsGpx = function() {
  if (userWaypoints.length === 0) {
    alert('Nenhum marcador pessoal cadastrado para exportar.');
    return;
  }

  let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="NOMAD Brasil" xmlns="http://www.topografix.com/GPX/1/1">\n`;
  userWaypoints.forEach(w => {
    gpx += `  <wpt lat="${w.lat}" lon="${w.lng}">\n    <name>${w.name}</name>\n    <desc>Categoria: ${w.category}</desc>\n  </wpt>\n`;
  });
  gpx += `</gpx>`;

  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nomad_brasil_marcadores_${Date.now()}.gpx`;
  a.click();
};

window.exportWaypointsJson = function() {
  if (userWaypoints.length === 0) {
    alert('Nenhum marcador para exportar.');
    return;
  }
  const blob = new Blob([JSON.stringify(userWaypoints, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nomad_brasil_marcadores_backup.json`;
  a.click();
};

window.handleImportWaypoints = function(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const content = e.target.result;
      if (file.name.endsWith('.json')) {
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          userWaypoints = [...userWaypoints, ...parsed];
          saveUserWaypointsToStorage();
          alert(`${parsed.length} marcadores importados com sucesso!`);
        }
      } else {
        alert('Formato de importação: utilize arquivos .json');
      }
    } catch (err) {
      alert('Erro ao processar arquivo: ' + err.message);
    }
  };
  reader.readAsText(file);
};

/* ========================================================
   MODULE 3: TACTICAL RATIONING & FOOD SUPPLY CALCULATOR
   ======================================================== */
window.setRationingDays = function(days) {
  const input = document.getElementById('calc-days');
  if (input) input.value = days;

  document.querySelectorAll('.map-quick-chips button').forEach(b => b.classList.remove('chip-highlight'));
  const btn = document.getElementById(`btn-days-${days}`);
  if (btn) btn.classList.add('chip-highlight');

  calculateRationing();
};

window.calculateRationing = function() {
  const adults = parseInt(document.getElementById('calc-adults')?.value || '2', 10);
  const children = parseInt(document.getElementById('calc-children')?.value || '1', 10);
  const days = parseInt(document.getElementById('calc-days')?.value || '15', 10);
  const activity = parseFloat(document.getElementById('calc-activity')?.value || '1.2');

  const totalPeople = adults + children;

  // Caloric computation
  const baseAdultKcal = 2200;
  const baseChildKcal = 1500;
  const dailyKcal = Math.round(((adults * baseAdultKcal) + (children * baseChildKcal)) * activity);
  const totalKcal = dailyKcal * days;

  // Water computation (Litros)
  // Consumo: 2.5L/adulto/dia, 1.8L/criança/dia
  // Higiene mínima: 2L/pessoa/dia
  const dailyDrinkingWater = (adults * 2.5) + (children * 1.8);
  const totalDrinkingWater = Math.round(dailyDrinkingWater * days);
  const dailyHygieneWater = totalPeople * 2.0;
  const totalHygieneWater = Math.round(dailyHygieneWater * days);

  // Dry food weight estimation (aprox 450g de comida seca por 2000 kcal)
  const totalFoodWeightKg = Math.round((totalKcal / 2000) * 0.45);

  // Update Summary cards
  const elWaterTot = document.getElementById('res-water-total');
  const elWaterHyg = document.getElementById('res-water-hygiene');
  const elCalTot = document.getElementById('res-calories-total');
  const elCalDaily = document.getElementById('res-calories-daily');
  const elFoodWeight = document.getElementById('res-food-weight');
  const elGroupDesc = document.getElementById('res-group-desc');

  if (elWaterTot) elWaterTot.textContent = `${totalDrinkingWater} L`;
  if (elWaterHyg) elWaterHyg.textContent = `${totalHygieneWater} L`;
  if (elCalTot) elCalTot.textContent = `${totalKcal.toLocaleString('pt-BR')} kcal`;
  if (elCalDaily) elCalDaily.textContent = `${dailyKcal.toLocaleString('pt-BR')} kcal / dia`;
  if (elFoodWeight) elFoodWeight.textContent = `${totalFoodWeightKg} kg`;
  if (elGroupDesc) elGroupDesc.textContent = `${adults} adultos, ${children} crianças &bull; ${days} dias`;

  // Energy & Battery calculations
  // Bateria 12V 100Ah = 1200Wh. Consumo diário (rádio 20W x 3h + 2 leds 5W x 5h = 110Wh/dia)
  const batteryDays = Math.max(1, Math.round(1200 / 110));
  const generatorFuel = (days * 4 * 0.6).toFixed(1); // 4h/dia gastando 0.6L/h
  const batteriesCount = Math.round(totalPeople * Math.ceil(days / 7) * 2);

  const elBatDays = document.getElementById('res-battery-days');
  const elFuelGen = document.getElementById('res-fuel-generator');
  const elBatCount = document.getElementById('res-batteries-count');
  if (elBatDays) elBatDays.textContent = `~${batteryDays} dias`;
  if (elFuelGen) elFuelGen.textContent = `${generatorFuel} L`;
  if (elBatCount) elBatCount.textContent = `${batteriesCount} un`;

  // Brazilian Survival Food Basket Items
  const foodItems = [
    { name: 'Arroz Branco / Parboilizado', perPersonDay: 0.12, unit: 'kg', kcalPerUnit: 3600, shelfLife: '2 a 5 anos (embalado)' },
    { name: 'Feijão Preto / Carioca', perPersonDay: 0.08, unit: 'kg', kcalPerUnit: 3400, shelfLife: '1 a 3 anos' },
    { name: 'Aveia em Flocos / Farinha de Mandioca', perPersonDay: 0.06, unit: 'kg', kcalPerUnit: 3800, shelfLife: '1 a 2 anos' },
    { name: 'Sardinha / Atum em Óleo (Enlatado)', perPersonDay: 0.4, unit: 'latas (125g)', kcalPerUnit: 250, shelfLife: '3 a 5 anos' },
    { name: 'Óleo Vegetal (Soja/Girassol)', perPersonDay: 0.025, unit: 'L', kcalPerUnit: 8840, shelfLife: '1 a 2 anos' },
    { name: 'Açúcar Cristal / Mascavo', perPersonDay: 0.035, unit: 'kg', kcalPerUnit: 3900, shelfLife: 'Indeterminada (seco)' },
    { name: 'Sal Refinado Iodado', perPersonDay: 0.012, unit: 'kg', kcalPerUnit: 0, shelfLife: 'Indeterminada' },
    { name: 'Leite em Pó Integral', perPersonDay: 0.04, unit: 'kg', kcalPerUnit: 5000, shelfLife: '1 a 2 anos' },
    { name: 'Café em Pó / Chá Mate', perPersonDay: 0.015, unit: 'kg', kcalPerUnit: 0, shelfLife: '1 a 2 anos' }
  ];

  const tbody = document.getElementById('rationing-table-body');
  if (tbody) {
    tbody.innerHTML = foodItems.map(item => {
      const qty = (item.perPersonDay * totalPeople * days).toFixed(item.unit.includes('latas') ? 0 : 1);
      const totalItemKcal = Math.round(qty * item.kcalPerUnit);
      return `
        <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
          <td style="padding: 0.65rem 0.8rem; font-weight: 700; color: #fff;">${item.name}</td>
          <td style="padding: 0.65rem 0.8rem; font-family: monospace; font-weight: 800; color: #34d399;">${qty} ${item.unit}</td>
          <td style="padding: 0.65rem 0.8rem; font-family: monospace; color: #f59e0b;">${totalItemKcal > 0 ? totalItemKcal.toLocaleString('pt-BR') + ' kcal' : '-'}</td>
          <td style="padding: 0.65rem 0.8rem; color: #94a3b8;">${item.shelfLife}</td>
        </tr>
      `;
    }).join('');
  }
};

window.printRationingList = function() {
  window.print();
};

/* ========================================================
   MODULE 4: TELECOM & ANTENNA CALCULATOR
   ======================================================== */
let radioDataStore = null;

async function loadRadioData() {
  try {
    const res = await fetch('/api/radio');
    if (res.ok) {
      radioDataStore = await res.json();
      renderRadioBands(radioDataStore.bands || []);
      renderQCode(radioDataStore.q_code || []);
      renderPhoneticAlphabet(radioDataStore.phonetic_alphabet || []);
    }
  } catch (e) {
    console.error('Erro ao carregar dados de rádio:', e);
  }
}

function renderRadioBands(bands) {
  const container = document.getElementById('telecom-bands-container');
  if (!container) return;

  container.innerHTML = bands.map(b => `
    <div style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); border-radius: 8px; padding: 1rem;">
      <h4 style="color: #38bdf8; font-size: 1rem; margin-bottom: 0.25rem;">${b.name}</h4>
      <p style="color: #94a3b8; font-size: 0.75rem; margin-bottom: 0.75rem;">${b.description}</p>
      <div style="overflow-x: auto;">
        <table style="width: 100%; text-align: left; font-size: 0.75rem; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border); color: #64748b;">
              <th style="padding: 0.35rem 0.5rem;">CANAL</th>
              <th style="padding: 0.35rem 0.5rem;">FREQ.</th>
              <th style="padding: 0.35rem 0.5rem;">MODO</th>
              <th style="padding: 0.35rem 0.5rem;">FINALIDADE &amp; USO OFICIAL</th>
            </tr>
          </thead>
          <tbody>
            ${b.channels.map(c => `
              <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
                <td style="padding: 0.4rem 0.5rem; font-weight: 700; color: #fff;">${c.channel}</td>
                <td style="padding: 0.4rem 0.5rem; font-family: monospace; color: #10b981; font-weight: 800;">${c.freq}</td>
                <td style="padding: 0.4rem 0.5rem; color: #f59e0b; font-family: monospace;">${c.mode}</td>
                <td style="padding: 0.4rem 0.5rem; color: #cbd5e1;">${c.usage}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `).join('');
}

function renderQCode(list) {
  const container = document.getElementById('qcode-list-container');
  if (!container) return;

  container.innerHTML = list.map(q => `
    <div class="step-row" style="padding: 0.45rem 0.6rem; border-bottom: 1px solid rgba(255,255,255,0.04);">
      <span style="font-family: monospace; font-weight: 800; color: #34d399; width: 55px; flex-shrink: 0;">${q.code}</span>
      <div style="flex: 1; font-size: 0.75rem;">
        <div style="color: #fff; font-weight: 600;">${q.meaning}</div>
        <div style="color: #64748b; font-size: 0.7rem;">Ex: "${q.example}"</div>
      </div>
    </div>
  `).join('');
}

window.filterQCode = function() {
  const q = document.getElementById('qcode-search-input')?.value.trim().toLowerCase();
  if (!radioDataStore || !radioDataStore.q_code) return;
  if (!q) {
    renderQCode(radioDataStore.q_code);
    return;
  }
  const filtered = radioDataStore.q_code.filter(item => 
    item.code.toLowerCase().includes(q) || 
    item.meaning.toLowerCase().includes(q)
  );
  renderQCode(filtered);
};

function renderPhoneticAlphabet(list) {
  const container = document.getElementById('phonetic-list-container');
  if (!container) return;

  container.innerHTML = list.map(p => `
    <div class="step-row" style="padding: 0.4rem 0.6rem; border-bottom: 1px solid rgba(255,255,255,0.04);">
      <span style="font-family: monospace; font-size: 1.1rem; font-weight: 900; color: #38bdf8; width: 35px;">${p.letter}</span>
      <div style="flex: 1; font-size: 0.78rem;">
        <span style="font-weight: 800; color: #fff;">${p.code}</span>
        <span style="color: #94a3b8; font-size: 0.7rem; margin-left: 0.5rem;">[${p.pronunciation}]</span>
      </div>
    </div>
  `).join('');
}

window.calculateAntennaDipole = function() {
  const freq = parseFloat(document.getElementById('calc-antenna-freq')?.value || '146.520');
  if (isNaN(freq) || freq <= 0) return;

  // L total (m) = 142.5 / f(MHz)
  const totalLengthM = 142.5 / freq;
  const eachLegCm = (totalLengthM / 2) * 100;

  const elTot = document.getElementById('antenna-res-total');
  const elLeg = document.getElementById('antenna-res-leg');
  if (elTot) elTot.textContent = `${totalLengthM.toFixed(2)} m`;
  if (elLeg) elLeg.textContent = `${eachLegCm.toFixed(1)} cm`;
};

window.setAntennaPreset = function(mhz) {
  const input = document.getElementById('calc-antenna-freq');
  if (input) input.value = mhz;
  calculateAntennaDipole();
};

/* ========================================================
   MODULE 5: MORSE & EMERGENCY SIGNALS (AUDIO + OPTICAL)
   ======================================================== */
const MORSE_MAP = {
  'A': '.-', 'B': '-...', 'C': '-.-.', 'D': '-..', 'E': '.', 'F': '..-.',
  'G': '--.', 'H': '....', 'I': '..', 'J': '.---', 'K': '-.-', 'L': '.-..',
  'M': '--', 'N': '-.', 'O': '---', 'P': '.--.', 'Q': '--.-', 'R': '.-.',
  'S': '...', 'T': '-', 'U': '..-', 'V': '...-', 'W': '.--', 'X': '-..-',
  'Y': '-.--', 'Z': '--..', '1': '.----', '2': '..---', '3': '...--',
  '4': '....-', '5': '.....', '6': '-....', '7': '--...', '8': '---..',
  '9': '----.', '0': '-----', ' ': '/'
};

let audioContextInstance = null;
let isAudioSosActive = false;
let audioSosInterval = null;

let isOpticalSosActive = false;
let opticalSosInterval = null;

function getAudioContext() {
  if (!audioContextInstance) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioContextInstance = new AudioContext();
  }
  if (audioContextInstance.state === 'suspended') {
    audioContextInstance.resume();
  }
  return audioContextInstance;
}

function playTone(freq, durationMs) {
  return new Promise(resolve => {
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);

      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.00001, ctx.currentTime + (durationMs / 1000));

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + (durationMs / 1000));
      setTimeout(resolve, durationMs);
    } catch (e) {
      resolve();
    }
  });
}

function sleepMs(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// SOS Pattern: ... --- ... (Dot: 120ms, Dash: 360ms, Pause: 120ms, Letter pause: 360ms, Word pause: 1200ms)
async function playSosLoop() {
  const dot = 120;
  const dash = 360;

  while (isAudioSosActive) {
    // S: . . .
    for (let i = 0; i < 3; i++) {
      if (!isAudioSosActive) return;
      await playTone(800, dot);
      await sleepMs(dot);
    }
    await sleepMs(dash);

    // O: - - -
    for (let i = 0; i < 3; i++) {
      if (!isAudioSosActive) return;
      await playTone(800, dash);
      await sleepMs(dot);
    }
    await sleepMs(dash);

    // S: . . .
    for (let i = 0; i < 3; i++) {
      if (!isAudioSosActive) return;
      await playTone(800, dot);
      await sleepMs(dot);
    }

    // Long pause between SOS loops
    await sleepMs(1400);
  }
}

window.toggleAudioSos = function() {
  const btn = document.getElementById('btn-toggle-audio-sos');
  if (isAudioSosActive) {
    isAudioSosActive = false;
    if (btn) {
      btn.innerHTML = `<span>🔊</span> INICIAR BIPE SONORO (SOS)`;
      btn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      btn.style.color = '#000';
    }
  } else {
    isAudioSosActive = true;
    if (btn) {
      btn.innerHTML = `<span>⏹️</span> PARAR BIPE SONORO`;
      btn.style.background = 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)';
      btn.style.color = '#fff';
    }
    playSosLoop();
  }
};

window.toggleOpticalSos = function(force) {
  const overlay = document.getElementById('optical-sos-overlay');
  if (!overlay) return;

  const shouldActive = force !== undefined ? force : !isOpticalSosActive;
  isOpticalSosActive = shouldActive;

  const btn = document.getElementById('btn-toggle-optical-sos');

  if (isOpticalSosActive) {
    overlay.style.display = 'flex';
    if (btn) {
      btn.innerHTML = `<span>⏹️</span> PARAR SINALIZADOR VISUAL`;
      btn.style.background = '#000';
      btn.style.border = '1px solid #ef4444';
    }
    runOpticalFlashLoop(overlay);
  } else {
    overlay.style.display = 'none';
    overlay.classList.remove('flash-active-white', 'flash-active-black');
    if (btn) {
      btn.innerHTML = `<span>🚨</span> INICIAR SINALIZADOR VISUAL (SOS)`;
      btn.style.background = 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)';
      btn.style.border = 'none';
    }
  }
};

async function runOpticalFlashLoop(overlay) {
  const dot = 150;
  const dash = 450;

  async function flash(ms) {
    overlay.classList.add('flash-active-white');
    overlay.classList.remove('flash-active-black');
    await sleepMs(ms);
    overlay.classList.remove('flash-active-white');
    overlay.classList.add('flash-active-black');
    await sleepMs(dot);
  }

  while (isOpticalSosActive) {
    // S: . . .
    for (let i = 0; i < 3; i++) {
      if (!isOpticalSosActive) return;
      await flash(dot);
    }
    await sleepMs(dash);

    // O: - - -
    for (let i = 0; i < 3; i++) {
      if (!isOpticalSosActive) return;
      await flash(dash);
    }
    await sleepMs(dash);

    // S: . . .
    for (let i = 0; i < 3; i++) {
      if (!isOpticalSosActive) return;
      await flash(dot);
    }

    await sleepMs(1500);
  }
}

let isMorseTransmitting = false;

window.convertAndPlayCustomMorse = async function(btnEl) {
  if (isMorseTransmitting) return;

  const btn = btnEl || document.getElementById('btn-morse-transmit');
  const input = document.getElementById('morse-custom-input');
  const text = (input?.value || 'SOS').toUpperCase().trim();
  const display = document.getElementById('morse-output-display');

  if (!text) return;

  const morseSeq = text.split('').map(char => MORSE_MAP[char] || (char === ' ' ? '/' : '?')).join(' ');
  if (display) display.textContent = morseSeq;

  // Travar o botão e indicar transmissão em andamento
  isMorseTransmitting = true;
  let originalBtnHtml = '';
  if (btn) {
    btn.disabled = true;
    originalBtnHtml = btn.innerHTML;
    btn.innerHTML = '<span>⏳</span> Transmitindo...';
    btn.style.opacity = '0.65';
    btn.style.cursor = 'not-allowed';
  }
  if (input) input.disabled = true;

  try {
    // Reprodução da sequência Morse
    for (const char of morseSeq) {
      if (!isMorseTransmitting) break;
      if (char === '.') {
        await playTone(800, 100);
        await sleepMs(80);
      } else if (char === '-') {
        await playTone(800, 300);
        await sleepMs(80);
      } else if (char === ' ') {
        await sleepMs(200);
      } else if (char === '/') {
        await sleepMs(400);
      }
    }
  } catch (err) {
    console.error('Erro na transmissão Morse:', err);
  } finally {
    // Destravar o botão após a finalização do áudio
    isMorseTransmitting = false;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalBtnHtml || '<span>▶️</span> Transmitir Áudio';
      btn.style.opacity = '';
      btn.style.cursor = '';
    }
    if (input) input.disabled = false;
  }
};

// Hook into initial loading of application
const prevInitDashboard = window.initDashboard || function() {};
window.initDashboard = function() {
  prevInitDashboard();
  loadPoisData();
  loadUserWaypoints();
  calculateRationing();
  loadRadioData();
  calculateAntennaDipole();
};

// Call immediately if DOM is already ready
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(() => {
    loadPoisData();
    loadUserWaypoints();
    calculateRationing();
    loadRadioData();
    calculateAntennaDipole();
    loadVenomousData();
    calculateSolar();
    renderBobKit();
    loadPlantsData();
    renderKnotsList();
    loadPefData();
    calculateMarch();
  }, 200);
}

// =====================================================================
// PWA SERVICE WORKER REGISTRATION
// =====================================================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('[PWA] Service Worker registrado:', reg.scope);
    }).catch(err => {
      console.warn('[PWA] Falha ao registrar Service Worker:', err);
    });
  });
}

// =====================================================================
// 10. ANIMAIS PEÇONHENTOS DO BRASIL
// =====================================================================
let venomousAnimalsData = [];
let currentVenomousFilter = 'all';

async function loadVenomousData() {
  if (venomousAnimalsData && venomousAnimalsData.length > 0) {
    renderVenomousList(venomousAnimalsData);
    return;
  }
  try {
    const res = await fetch('/api/venomous');
    if (!res.ok) throw new Error('Falha HTTP ' + res.status);
    venomousAnimalsData = await res.json();
    renderVenomousList(venomousAnimalsData);
  } catch (err) {
    console.warn('Carregando fallback de animais peçonhentos:', err);
    try {
      const res2 = await fetch('./data/venomous_animals.json');
      venomousAnimalsData = await res2.json();
      renderVenomousList(venomousAnimalsData);
    } catch (e2) {
      console.error('Falha fatal ao carregar catálogo peçonhento:', e2);
    }
  }
}

window.filterVenomousGroup = function(group) {
  currentVenomousFilter = group;
  const section = document.getElementById('tab-venomous');
  if (section) {
    const chips = section.querySelectorAll('.chip-btn');
    chips.forEach(btn => {
      const text = btn.textContent.toLowerCase();
      if ((group === 'all' && text.includes('todos')) ||
          (group === 'serpente' && text.includes('serpentes')) ||
          (group === 'escorpião' && text.includes('escorpiões')) ||
          (group === 'aranha' && text.includes('aranhas'))) {
        btn.classList.add('chip-highlight');
      } else {
        btn.classList.remove('chip-highlight');
      }
    });
  }
  renderVenomousList(venomousAnimalsData);
};

function renderVenomousList(data) {
  const container = document.getElementById('venomous-container');
  if (!container) return;

  const filtered = (currentVenomousFilter === 'all')
    ? data
    : data.filter(item => (item.group || '').toLowerCase().includes(currentVenomousFilter));

  if (!filtered || filtered.length === 0) {
    container.innerHTML = '<div class="tactical-card text-center text-gray-400">Nenhum espécime encontrado nesta categoria.</div>';
    return;
  }

  container.innerHTML = filtered.map(item => {
    const lethality = item.lethality || item.dangerLevel || 'ALTO';
    const dangerBadgeColor = lethality.toLowerCase().includes('muito') || lethality.toLowerCase().includes('crítico') ? 'var(--accent-red)' :
                             lethality.toLowerCase().includes('alta') ? 'var(--accent-amber)' : 'var(--accent-cyan)';
    const firstAidText = Array.isArray(item.firstAid)
      ? item.firstAid.map(s => `<div>• ${s}</div>`).join('')
      : (item.firstAid || '');
    const warningsText = Array.isArray(item.dangerWarnings)
      ? item.dangerWarnings.map(w => `<div>⚠️ ${w}</div>`).join('')
      : '';

    return `
      <div class="tactical-card">
        <div class="flex justify-between items-start gap-2 mb-2">
          <div>
            <div class="text-xs uppercase tracking-wider font-bold text-gray-400">${item.group}</div>
            <h3 class="text-lg font-bold text-white">${item.name}</h3>
          </div>
          <span class="status-pill" style="border-color: ${dangerBadgeColor}; color: ${dangerBadgeColor}; background: rgba(0,0,0,0.4); font-size: 0.7rem; font-weight: 800;">
            ${lethality}
          </span>
        </div>

        <div class="space-y-2 text-xs">
          <div class="metric-card" style="padding: 0.5rem 0.75rem;">
            <div class="text-gray-400 text-xs font-bold uppercase">Ação do Veneno</div>
            <div class="text-amber-300 font-medium mt-0.5">${item.venomType}</div>
          </div>

          <div class="metric-card" style="padding: 0.5rem 0.75rem;">
            <div class="text-gray-400 text-xs font-bold uppercase">Soro Específico (SUS / Butantan / Vital Brazil)</div>
            <div class="text-emerald-400 font-mono font-bold mt-0.5">${item.antivenom || item.antivenomSerum}</div>
          </div>

          <div style="background: rgba(255,255,255,0.03); padding: 0.5rem; border-radius: 6px; border-left: 3px solid var(--accent-cyan);">
            <strong class="text-white">Identificação Visual:</strong>
            <p class="text-gray-300 mt-0.5">${item.characteristics || item.identification}</p>
          </div>

          <div style="background: rgba(255,255,255,0.03); padding: 0.5rem; border-radius: 6px; border-left: 3px solid var(--accent-amber);">
            <strong class="text-white">Habitat &amp; Ocorrência:</strong>
            <p class="text-gray-300 mt-0.5">${item.habitat}${item.incidence ? ` (${item.incidence})` : ''}</p>
          </div>

          <div style="background: rgba(239, 68, 68, 0.1); padding: 0.5rem; border-radius: 6px; border-left: 3px solid var(--accent-red);">
            <strong class="text-red-300">Primeiros Socorros &amp; Conduta:</strong>
            <div class="text-gray-200 mt-0.5 space-y-1">${firstAidText}</div>
            ${warningsText ? `<div class="mt-2 text-red-300 font-bold space-y-1 border-t border-red-900 pt-1">${warningsText}</div>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// =====================================================================
// 11. CALCULADORA DE ENERGIA SOLAR & BATERIAS 12V
// =====================================================================
window.calculateSolar = function() {
  const radioH = parseFloat(document.getElementById('solar-radio-hours')?.value) || 0;
  const ledH = parseFloat(document.getElementById('solar-led-hours')?.value) || 0;
  const pcH = parseFloat(document.getElementById('solar-pc-hours')?.value) || 0;
  const fridgeH = parseFloat(document.getElementById('solar-fridge-hours')?.value) || 0;
  const phoneH = parseFloat(document.getElementById('solar-phone-hours')?.value) || 0;

  const hsp = parseFloat(document.getElementById('solar-region')?.value) || 4.8;
  const dod = parseFloat(document.getElementById('solar-battery-type')?.value) || 0.5;

  const totalWh = (radioH * 25) + (ledH * 10) + (pcH * 45) + (fridgeH * 40) + (phoneH * 15);
  const totalAh12v = totalWh / 12;

  // Panel sizing: totalWh / (HSP * 0.75 performance ratio)
  const requiredWatts = totalWh > 0 ? Math.ceil(totalWh / (hsp * 0.75)) : 0;
  const panels150w = Math.ceil(requiredWatts / 150) || 1;

  // Battery bank sizing: 1.5 days autonomy / DoD
  const requiredAh = totalWh > 0 ? Math.ceil((totalAh12v * 1.5) / dod) : 0;

  // Charge controller: Panel Watts / 12V * 1.25 safety factor
  const controllerAmps = Math.ceil((requiredWatts / 12) * 1.25);
  const peakWatts = Math.max(300, Math.ceil((25 + 10 + 45 + 120 + 30) * 1.3));

  const elWh = document.getElementById('solar-res-wh');
  const elAh = document.getElementById('solar-res-ah12v');
  const elPanelsW = document.getElementById('solar-res-panels-w');
  const elPanelsQty = document.getElementById('solar-res-panels-qty');
  const elBatteryAh = document.getElementById('solar-res-battery-ah');
  const elBatteryQty = document.getElementById('solar-res-battery-qty');
  const elController = document.getElementById('solar-res-controller');
  const elWire = document.getElementById('solar-res-wire');
  const elInverter = document.getElementById('solar-res-inverter');
  const elFuse = document.getElementById('solar-res-fuse');

  if (elWh) elWh.textContent = `${Math.round(totalWh)} Wh/dia`;
  if (elAh) elAh.textContent = `${totalAh12v.toFixed(1)} Ah/dia em 12V`;
  if (elPanelsW) elPanelsW.textContent = `${requiredWatts} Wp`;
  if (elPanelsQty) elPanelsQty.textContent = `${panels150w}x painel(éis) de 150W (${panels150w * 150}W)`;
  if (elBatteryAh) elBatteryAh.textContent = `${requiredAh} Ah`;
  if (elBatteryQty) {
    const batt100Qty = Math.ceil(requiredAh / 100);
    elBatteryQty.textContent = `Autonomia 1.5 dias (~${batt100Qty}x bat. 100Ah)`;
  }
  if (elController) elController.textContent = `${Math.max(10, controllerAmps)} A`;

  if (elWire) {
    elWire.textContent = controllerAmps > 20 ? '10.0 mm²' : '6.0 mm²';
  }
  if (elInverter) {
    elInverter.textContent = peakWatts > 500 ? '1000W Onda Senoidal Pura' : '600W Onda Senoidal Pura';
  }
  if (elFuse) {
    elFuse.textContent = `${Math.max(40, Math.ceil(controllerAmps * 1.5))}A`;
  }
};

// =====================================================================
// 12. CHECKLIST TÁTICO DE MOCHILA 72H (BUG-OUT BAG - BOB)
// =====================================================================
const BOB_KITS = {
  bob: {
    name: 'Mochila 72h (Evacuação)',
    maxWeight: 12.0,
    categories: [
      {
        category: '💧 Água & Hidratação',
        items: [
          { id: 'b_water1', name: 'Cantil militar com caneco inox 1L cheio', weight: 1.25, checked: true },
          { id: 'b_water2', name: 'Filtro portátil de água de campo (tipo canudo)', weight: 0.12, checked: true },
          { id: 'b_water3', name: 'Pastilhas de cloro Clorin 1mg (blister c/ 20)', weight: 0.02, checked: true },
          { id: 'b_water4', name: 'Bolsa de hidratação dobrável 2L vazia', weight: 0.08, checked: false }
        ]
      },
      {
        category: '🔥 Alimentação & Fogo',
        items: [
          { id: 'b_food1', name: 'Rações de emergência / barras de alta densidade (3 dias)', weight: 1.50, checked: true },
          { id: 'b_food2', name: 'Pederneira de ferrocerium com raspador', weight: 0.08, checked: true },
          { id: 'b_food3', name: '2x Isqueiros tipo maçarico / Bic em saco estanque', weight: 0.06, checked: true },
          { id: 'b_food4', name: 'Iscas de fogo (algodão parafinado)', weight: 0.05, checked: true }
        ]
      },
      {
        category: '⛺ Abrigo & Aquecimento',
        items: [
          { id: 'b_shlt1', name: '2x Mantas térmicas de mylar aluminizadas', weight: 0.12, checked: true },
          { id: 'b_shlt2', name: 'Lona tática ripstop 3x3m para tarp', weight: 0.65, checked: true },
          { id: 'b_shlt3', name: 'Corda Paracord 550 (15 metros)', weight: 0.18, checked: true },
          { id: 'b_shlt4', name: 'Poncho impermeável militar camuflado/verde', weight: 0.35, checked: true },
          { id: 'b_shlt5', name: 'Muda de roupa seca em saco ziploc a vácuo', weight: 0.85, checked: true }
        ]
      },
      {
        category: '🚑 Primeiros Socorros & Farmácia',
        items: [
          { id: 'b_med1', name: 'Torniquete tático homologado (tipo C-A-T)', weight: 0.15, checked: true },
          { id: 'b_med2', name: 'Bandagem elástica tipo israelense 6"', weight: 0.10, checked: true },
          { id: 'b_med3', name: 'Gaze estéril + fita micropore', weight: 0.08, checked: true },
          { id: 'b_med4', name: 'Medicamentos de uso contínuo (reserva 7 dias)', weight: 0.15, checked: true },
          { id: 'b_med5', name: 'Analgésicos (Dipirona), anti-histamínico e antidiarreico', weight: 0.08, checked: true },
          { id: 'b_med6', name: 'Frasco pequeno álcool 70% ou clorexidina', weight: 0.10, checked: true }
        ]
      },
      {
        category: '📻 Comunicação, Navegação & Energia',
        items: [
          { id: 'b_nav1', name: 'Bússola prismática com régua milimétrica', weight: 0.09, checked: true },
          { id: 'b_nav2', name: 'Rádio comunicador VHF/UHF (Baofeng UV-5R)', weight: 0.28, checked: true },
          { id: 'b_nav3', name: 'Powerbank 20.000 mAh c/ cabos USB blindados', weight: 0.42, checked: true },
          { id: 'b_nav4', name: 'Lanterna de cabeça LED c/ pilhas recarregáveis', weight: 0.12, checked: true },
          { id: 'b_nav5', name: 'Apito de resgate sem esfera (120 dB)', weight: 0.02, checked: true }
        ]
      },
      {
        category: '🛠️ Ferramentas & Equipamento',
        items: [
          { id: 'b_tool1', name: 'Faca de sobrevivência lâmina fixa full-tang', weight: 0.35, checked: true },
          { id: 'b_tool2', name: 'Alicate multi-função (Leatherman ou similar)', weight: 0.25, checked: true },
          { id: 'b_tool3', name: 'Rolo de Silver Tape industrial (10m compacto)', weight: 0.12, checked: true },
          { id: 'b_tool4', name: 'Abraçadeiras plásticas (enforca-gato) x10', weight: 0.03, checked: true },
          { id: 'b_tool5', name: 'Luvas de proteção vaqueta / couro de campo', weight: 0.14, checked: true }
        ]
      },
      {
        category: '📄 Documentos & Dinheiro',
        items: [
          { id: 'b_doc1', name: 'Cópia plastificada de RG, CNH, Certidões', weight: 0.05, checked: true },
          { id: 'b_doc2', name: 'Dinheiro em espécie (cédulas de 10, 20 e 50 reais)', weight: 0.05, checked: true },
          { id: 'b_doc3', name: 'Cartão de Bolso Nomad Brasil A4 plastificado', weight: 0.04, checked: true },
          { id: 'b_doc4', name: 'Bloco de notas à prova d\'água e lápis grafite', weight: 0.06, checked: true }
        ]
      }
    ]
  },
  edc: {
    name: 'Kit EDC (Everyday Carry - Bolso & Cinto)',
    maxWeight: 1.5,
    categories: [
      {
        category: '🎒 Porte Diário Essencial',
        items: [
          { id: 'e_edc1', name: 'Canivete dobrável com trava segura', weight: 0.12, checked: true },
          { id: 'e_edc2', name: 'Mini lanterna tática LED (pilha AA ou USB)', weight: 0.08, checked: true },
          { id: 'e_edc3', name: 'Isqueiro compacto', weight: 0.03, checked: true },
          { id: 'e_edc4', name: 'Mini caneta e chaveiro com apito de emergência', weight: 0.04, checked: true },
          { id: 'e_edc5', name: 'Curativos adesivos e 2 comprimidos dipirona', weight: 0.02, checked: true },
          { id: 'e_edc6', name: 'Cédula de reserva em compartimento oculto', weight: 0.01, checked: true },
          { id: 'e_edc7', name: 'Cartão multi-ferramenta em aço para carteira', weight: 0.04, checked: true }
        ]
      }
    ]
  },
  car: {
    name: 'Kit Veicular de Emergência',
    maxWeight: 20.0,
    categories: [
      {
        category: '🚗 Mecânica, Tração & Elétrica',
        items: [
          { id: 'c_car1', name: 'Cabo auxiliar de partida (chupeta de bateria 500A)', weight: 1.80, checked: true },
          { id: 'c_car2', name: 'Compressor de ar 12V para calibração de pneus', weight: 1.40, checked: true },
          { id: 'c_car3', name: 'Kit reparo macarrão antifuro para pneus', weight: 0.30, checked: true },
          { id: 'c_car4', name: 'Cabo de reboque com manilhas de aço (5 toneladas)', weight: 2.10, checked: true },
          { id: 'c_car5', name: 'Jogo de chaves de fenda, philips e soquetes', weight: 1.50, checked: true },
          { id: 'c_car6', name: 'Fusíveis automotivos reservas variados', weight: 0.08, checked: true }
        ]
      },
      {
        category: '🦺 Sinalização & Socorro Rodoviário',
        items: [
          { id: 'c_car7', name: 'Colete refletivo de alta visibilidade', weight: 0.15, checked: true },
          { id: 'c_car8', name: 'Sinalizador LED estroboscópico magnético', weight: 0.25, checked: true },
          { id: 'c_car9', name: 'Extintor ABC inspecionado e válido', weight: 2.00, checked: true },
          { id: 'c_car10', name: 'Galão homologado 5L com água para motor/emergência', weight: 5.30, checked: true },
          { id: 'c_car11', name: 'Pá dobrável de trincheira / desatolamento', weight: 1.10, checked: true }
        ]
      }
    ]
  }
};

let currentBobKit = 'bob';
const BOB_STORAGE_KEY = 'nomad_bob_checked_state_v1';

function getStoredBobChecks() {
  try {
    const raw = localStorage.getItem(BOB_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function saveStoredBobChecks(state) {
  try {
    localStorage.setItem(BOB_STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Erro ao salvar no localStorage:', e);
  }
}

window.switchBobKit = function(kitId) {
  currentBobKit = kitId;
  ['bob', 'edc', 'car'].forEach(id => {
    const btn = document.getElementById(`bob-tab-${id}`);
    if (btn) {
      if (id === kitId) {
        btn.classList.add('chip-highlight');
      } else {
        btn.classList.remove('chip-highlight');
      }
    }
  });
  renderBobKit();
};

window.toggleBobItem = function(itemId) {
  const kit = BOB_KITS[currentBobKit];
  if (!kit) return;
  const stored = getStoredBobChecks() || {};

  for (const cat of kit.categories) {
    for (const it of cat.items) {
      if (it.id === itemId) {
        const currentChecked = (stored[itemId] !== undefined) ? stored[itemId] : it.checked;
        stored[itemId] = !currentChecked;
        saveStoredBobChecks(stored);
        break;
      }
    }
  }
  renderBobKit();
};

window.resetBobKit = function() {
  if (!confirm('Deseja restaurar as seleções padrão deste kit?')) return;
  const kit = BOB_KITS[currentBobKit];
  if (!kit) return;
  const stored = getStoredBobChecks() || {};
  for (const cat of kit.categories) {
    for (const it of cat.items) {
      delete stored[it.id];
    }
  }
  saveStoredBobChecks(stored);
  renderBobKit();
};

function renderBobKit() {
  const container = document.getElementById('bob-items-container');
  if (!container) return;

  const kit = BOB_KITS[currentBobKit];
  if (!kit) return;

  const stored = getStoredBobChecks() || {};

  let totalWeight = 0;
  let totalChecked = 0;
  let totalItemsCount = 0;

  let html = '';

  kit.categories.forEach(cat => {
    let catHtml = `
      <div class="tactical-card">
        <div class="bob-category-header">${cat.category}</div>
        <div class="bob-category-items">
    `;

    cat.items.forEach(it => {
      totalItemsCount++;
      const isChecked = (stored[it.id] !== undefined) ? stored[it.id] : it.checked;
      if (isChecked) {
        totalWeight += it.weight;
        totalChecked++;
      }

      catHtml += `
        <div class="bob-item-row" onclick="toggleBobItem('${it.id}')">
          <input type="checkbox" class="bob-checkbox" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); toggleBobItem('${it.id}');">
          <span class="bob-item-name ${isChecked ? '' : 'text-gray-500 line-through'}">${it.name}</span>
          <span class="bob-item-weight font-mono">${it.weight.toFixed(2)} kg</span>
        </div>
      `;
    });

    catHtml += `</div></div>`;
    html += catHtml;
  });

  container.innerHTML = html;

  const weightDisplay = document.getElementById('bob-weight-display');
  const weightBar = document.getElementById('bob-weight-bar');
  const checkedDisplay = document.getElementById('bob-status-checked');
  const warningDisplay = document.getElementById('bob-status-warning');

  if (weightDisplay) {
    weightDisplay.textContent = `${totalWeight.toFixed(2)} kg / Meta máx: ${kit.maxWeight.toFixed(1)} kg`;
  }

  const pct = Math.min(100, Math.round((totalWeight / kit.maxWeight) * 100));
  if (weightBar) {
    weightBar.style.width = `${pct}%`;
    if (totalWeight > kit.maxWeight) {
      weightBar.style.background = 'var(--accent-red)';
    } else if (totalWeight > kit.maxWeight * 0.85) {
      weightBar.style.background = 'var(--accent-amber)';
    } else {
      weightBar.style.background = 'var(--accent-green)';
    }
  }

  if (checkedDisplay) {
    checkedDisplay.textContent = `${totalChecked} de ${totalItemsCount} itens empacotados (${Math.round((totalChecked / (totalItemsCount || 1)) * 100)}%)`;
  }

  if (warningDisplay) {
    if (totalWeight > kit.maxWeight) {
      warningDisplay.textContent = `⚠️ SOBREPESO: Excedeu o limite em ${(totalWeight - kit.maxWeight).toFixed(2)} kg! Elimine peso supérfluo.`;
    } else {
      warningDisplay.textContent = '✅ Peso dentro da margem recomendada de marcha.';
    }
  }
}

// =====================================================================
// 13. BÚSSOLA DIGITAL & ORIENTAÇÃO NATURAL
// =====================================================================
let compassActive = false;

window.enableCompassSensor = function() {
  const statusEl = document.getElementById('compass-sensor-status');

  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    DeviceOrientationEvent.requestPermission()
      .then(permissionState => {
        if (permissionState === 'granted') {
          window.addEventListener('deviceorientation', handleOrientation, true);
          compassActive = true;
          if (statusEl) statusEl.textContent = 'Sensor magnético calibrado e ativo.';
        } else {
          if (statusEl) statusEl.textContent = 'Permissão de sensor negada pelo usuário.';
        }
      })
      .catch(err => {
        if (statusEl) statusEl.textContent = 'Erro de permissão: ' + err.message;
      });
  } else if ('ondeviceorientationabsolute' in window) {
    window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    compassActive = true;
    if (statusEl) statusEl.textContent = 'Sensor magnético absoluto conectado.';
  } else if ('ondeviceorientation' in window) {
    window.addEventListener('deviceorientation', handleOrientation, true);
    compassActive = true;
    if (statusEl) statusEl.textContent = 'Sensor de orientação conectado.';
  } else {
    if (statusEl) statusEl.textContent = 'Dispositivo sem magnetômetro. Use a orientação pelo sol ou estrelas abaixo.';
  }
};

function handleOrientation(event) {
  let heading = null;

  if (event.webkitCompassHeading) {
    heading = event.webkitCompassHeading;
  } else if (event.alpha !== null) {
    heading = (360 - event.alpha) % 360;
  }

  if (heading === null || isNaN(heading)) return;

  const deg = Math.round(heading);
  const needle = document.getElementById('compass-needle');
  const degDisplay = document.getElementById('compass-degrees');

  if (needle) {
    needle.style.transform = `translate(-50%, -100%) rotate(${deg}deg)`;
  }

  if (degDisplay) {
    let cardinal = 'N';
    if (deg >= 337.5 || deg < 22.5) cardinal = 'N';
    else if (deg >= 22.5 && deg < 67.5) cardinal = 'NE';
    else if (deg >= 67.5 && deg < 112.5) cardinal = 'L';
    else if (deg >= 112.5 && deg < 157.5) cardinal = 'SE';
    else if (deg >= 157.5 && deg < 202.5) cardinal = 'S';
    else if (deg >= 202.5 && deg < 247.5) cardinal = 'SO';
    else if (deg >= 247.5 && deg < 292.5) cardinal = 'O';
    else if (deg >= 292.5 && deg < 337.5) cardinal = 'NO';

    degDisplay.textContent = `${String(deg).padStart(3, '0')}° ${cardinal}`;
  }
}

// =====================================================================
// 14. CIFRA TÁTICA & CÓDIGO DE CAMPO (VERNAM / OTP 5-LETTER BLOCKS)
// =====================================================================
window.generateRandomKey = function() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let key = '';
  for (let i = 0; i < 8; i++) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const keyInput = document.getElementById('cipher-key');
  if (keyInput) keyInput.value = key;
};

window.processCipher = function(mode) {
  const inputEl = document.getElementById('cipher-input');
  const keyEl = document.getElementById('cipher-key');
  const outEl = document.getElementById('cipher-output');

  if (!inputEl || !outEl) return;

  const text = (inputEl.value || '').toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const key = ((keyEl ? keyEl.value : '') || 'NOMAD').toUpperCase().replace(/[^A-Z]/g, '');

  if (!key) {
    alert('Insira uma chave secreta com letras de A a Z.');
    return;
  }

  const cleanText = text.replace(/[^A-Z]/g, '');
  if (!cleanText) {
    outEl.textContent = '--- (Nenhum texto alfabético para processar)';
    return;
  }

  let result = '';
  for (let i = 0; i < cleanText.length; i++) {
    const textCode = cleanText.charCodeAt(i) - 65;
    const keyCode = key.charCodeAt(i % key.length) - 65;

    let resCode;
    if (mode === 'encrypt') {
      resCode = (textCode + keyCode) % 26;
    } else {
      resCode = (textCode - keyCode + 26) % 26;
    }
    result += String.fromCharCode(resCode + 65);
  }

  const blocks = [];
  for (let i = 0; i < result.length; i += 5) {
    blocks.push(result.substring(i, i + 5));
  }

  outEl.textContent = blocks.join(' ');
};

window.copyCipherOutput = function() {
  const outEl = document.getElementById('cipher-output');
  if (!outEl) return;
  const text = outEl.textContent.trim();
  if (!text || text.startsWith('---')) return;

  navigator.clipboard.writeText(text).then(() => {
    alert('Mensagem copiada para a área de transferência!');
  }).catch(() => {
    alert('Texto selecionado: ' + text);
  });
};

// =====================================================================
// 15. GUIA DE PANC & FITOTERAPIA DE CAMPO
// =====================================================================
let pancPlantsData = [];
let currentPlantsFilter = 'all';

async function loadPlantsData() {
  if (pancPlantsData && pancPlantsData.length > 0) {
    renderPlantsList(pancPlantsData);
    return;
  }
  try {
    const res = await fetch('/api/plants');
    if (!res.ok) throw new Error('Falha HTTP ' + res.status);
    pancPlantsData = await res.json();
    renderPlantsList(pancPlantsData);
  } catch (err) {
    console.warn('Fallback plantas silvestres:', err);
    try {
      const res2 = await fetch('./data/panc_plants.json');
      pancPlantsData = await res2.json();
      renderPlantsList(pancPlantsData);
    } catch (e2) {
      console.error('Falha ao carregar PANC:', e2);
    }
  }
}

window.filterPlantsGroup = function(grp) {
  currentPlantsFilter = grp;
  const section = document.getElementById('tab-plants');
  if (section) {
    section.querySelectorAll('.chip-btn').forEach(btn => {
      const text = btn.textContent.toLowerCase();
      btn.classList.toggle('chip-highlight',
        (grp === 'all' && text.includes('todas')) ||
        (grp === 'Alimentícia' && text.includes('alimentícias')) ||
        (grp === 'Medicinal' && text.includes('medicinais'))
      );
    });
  }
  renderPlantsList(pancPlantsData);
};

function renderPlantsList(data) {
  const container = document.getElementById('plants-container');
  if (!container) return;

  const filtered = (currentPlantsFilter === 'all')
    ? data
    : data.filter(item => (item.type || '').toLowerCase().includes(currentPlantsFilter.toLowerCase()));

  if (!filtered || filtered.length === 0) {
    container.innerHTML = '<div class="tactical-card text-center text-gray-400">Nenhuma planta encontrada nesta categoria.</div>';
    return;
  }

  container.innerHTML = filtered.map(item => {
    const isMed = (item.type || '').includes('Medicinal');
    const badgeColor = isMed ? 'var(--accent-cyan)' : 'var(--accent-green)';
    return `
      <div class="tactical-card">
        <div class="flex justify-between items-start gap-2 mb-2">
          <div>
            <div class="text-xs uppercase tracking-wider font-bold text-gray-400">${item.type}</div>
            <h3 class="text-lg font-bold text-white">${item.name}</h3>
          </div>
          <span class="status-pill" style="border-color: ${badgeColor}; color: ${badgeColor}; font-size: 0.7rem; font-weight: 800;">
            ${item.proteinContent || 'Comestível'}
          </span>
        </div>

        <div class="space-y-2 text-xs">
          <div style="background: rgba(255,255,255,0.03); padding: 0.5rem; border-radius: 6px; border-left: 3px solid var(--accent-cyan);">
            <strong class="text-white">Identificação Botânica:</strong>
            <p class="text-gray-300 mt-0.5">${item.identification}</p>
          </div>

          <div class="metric-card" style="padding: 0.5rem 0.75rem;">
            <div class="text-gray-400 text-xs font-bold uppercase">Partes Utilizadas &amp; Preparo</div>
            <div class="text-white font-medium mt-0.5"><strong>Partes:</strong> ${item.edibleParts}</div>
            <div class="text-emerald-300 mt-1">${item.preparation}</div>
          </div>

          <div style="background: rgba(255,255,255,0.03); padding: 0.5rem; border-radius: 6px; border-left: 3px solid var(--accent-amber);">
            <strong class="text-white">Habitat &amp; Ocorrência:</strong>
            <p class="text-gray-300 mt-0.5">${item.habitat}</p>
          </div>

          <div style="background: rgba(16, 185, 129, 0.08); padding: 0.5rem; border-radius: 6px; border-left: 3px solid var(--accent-green);">
            <strong class="text-emerald-400">Propriedades Fitoterápicas:</strong>
            <p class="text-gray-200 mt-0.5">${item.medicinal}</p>
          </div>

          <div style="background: rgba(239, 68, 68, 0.1); padding: 0.5rem; border-radius: 6px; border-left: 3px solid var(--accent-red);">
            <strong class="text-red-300">Cuidados &amp; Toxicologia:</strong>
            <p class="text-gray-200 mt-0.5">${item.warnings}</p>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// =====================================================================
// 16. MANUAL TÁTICO DE NÓS & AMARRAÇÕES
// =====================================================================
const TACTICAL_KNOTS = [
  {
    id: 'bowline',
    name: 'Lais de Guia (Bowline)',
    category: 'ancoragem',
    strength: '70% a 75% da carga',
    desc: 'O rei dos nós. Cria uma alça fixa e segura que jamais corre, aperta ou escorrega sob peso extremo, e se desata com facilidade mesmo após tracionar uma tonelada.',
    usage: 'Ancoragem em árvores, resgate e içamento de pessoas ou cargas pesadas.',
    steps: [
      'Faça uma volta (laço) simples na corda principal, mantendo a ponta livre virada para cima.',
      'A ponta livre (o coelho) sai da toca (passa por dentro do laço por baixo).',
      'Contorna a corda fixa principal (a árvore) por trás.',
      'Volta e entra novamente na toca (no laço) de cima para baixo.',
      'Puxe a corda principal e a alça formada para azelhar e travar o nó.'
    ],
    proTip: 'Dica Tática: Para segurança de vida em rapel ou tirolesa, deixe uma cauda de sobra de pelo menos 15 cm e arremate com nó de frade (nó simples).'
  },
  {
    id: 'truckers',
    name: 'Nó de Caminhoneiro (Trucker\'s Hitch)',
    category: 'tensao',
    strength: 'Multiplicador mecânico 3:1',
    desc: 'Cria um sistema de polia usando a própria corda, multiplicando sua força manual por 3 para tensionar amarrações no limite.',
    usage: 'Esticar lonas de abrigo contra vento forte, prender tambores e cargas no teto do veículo.',
    steps: [
      'Faça uma volta com alça (nó de correr ou volta do polegar) no meio da corda.',
      'Passe a ponta livre por baixo do gancho, argola ou tronco de ancoragem.',
      'Suba a ponta livre e passe-a por dentro da alça que você criou (polia).',
      'Puxe com força para baixo: note o efeito de roldana tracionando 3 vezes mais forte.',
      'Arremate com duas meias-voltas na corda sob tensão para travar.'
    ],
    proTip: 'Dica Tática: É o nó indispensável para o tarp (lona) nunca afrouxar durante chuva torrencial ou vendaval.'
  },
  {
    id: 'prussik',
    name: 'Nó Prussik (Autobloqueante)',
    category: 'ancoragem',
    strength: 'Atrito dinâmico blocante',
    desc: 'Nó friccional que desliza livremente pela corda guia quando empurrado pela mão, mas trava instantaneamente com força total sob qualquer tração ou peso.',
    usage: 'Ascensão em corda fixa, linha de vida em declives acentuados, esticar cumeeira de barraca.',
    steps: [
      'Use um cordelete mais fino (ex: 5mm ou 6mm) em volta de uma corda mais grossa (10mm a 12mm).',
      'Passe a alça do cordelete ao redor da corda principal.',
      'Enfie as duas pontas por dentro da alça 3 vezes completas (3 voltas internas).',
      'Ajuste as espiras para ficarem paralelas e bem organizadas sem encavalar.',
      'Teste puxando o laço: ele morde e trava a corda imediatamente.'
    ],
    proTip: 'Dica Tática: O cordelete do Prussik deve ter entre 60% e 75% do diâmetro da corda principal para morder adequadamente.'
  },
  {
    id: 'clove_hitch',
    name: 'Volta do Fiel (Clove Hitch)',
    category: 'ancoragem',
    strength: '60% a 65% da carga',
    desc: 'Amarração rápida e extremamente estável para fixar uma corda em postes, mourões, estacas ou troncos de madeira.',
    usage: 'Iniciar amarrações de abrigo, prender animais de carga ou fixar botes em estacas.',
    steps: [
      'Dê uma volta completa ao redor do poste.',
      'Cruze a corda sobre a primeira volta formando um "X".',
      'Dê mais uma volta pelo poste e passe a ponta livre por baixo do cruzamento do X.',
      'Puxe ambas as extremidades para arrochar o nó contra a madeira.'
    ],
    proTip: 'Dica Tática: Sob tração variável ou corda muito lisa, arremate a ponta solta com um nó de segurança para evitar deslizamento.'
  },
  {
    id: 'figure8_loop',
    name: 'Nó de Oito Duplo (Figure-Eight Loop)',
    category: 'ancoragem',
    strength: '75% a 80% da carga (Padrão UIAA)',
    desc: 'O nó mais seguro e confiável do mundo para ancoragem humana. Reduz menos a resistência da corda que qualquer outro nó de alça.',
    usage: 'Resgate em ribanceiras, ancoragem de maca, conexão em mosquetões de escalada e rapel.',
    steps: [
      'Dobre a corda ao meio para formar um seio (alça dupla).',
      'Dê uma volta completa sobre a corda principal.',
      'Passe a alça por trás e entre por dentro da primeira volta formando um formato de 8.',
      'Penteie as cordas para que fiquem alinhadas sem torção e ajuste com firmeza.'
    ],
    proTip: 'Dica Tática: Inspecione visualmente o formato de "8" simétrico antes de aplicar qualquer carga viva.'
  },
  {
    id: 'fisherman',
    name: 'Nó Pescador Duplo (Double Fisherman\'s)',
    category: 'uniao',
    strength: 'Aproximadamente 80% da carga',
    desc: 'A melhor emenda para unir duas cordas do mesmo diâmetro. Não desata nem desliza mesmo sob as condições mais severas.',
    usage: 'Emendar cordas curtas para formar uma longa, fechar anéis de cordelete para Prussik.',
    steps: [
      'Coloque as pontas das duas cordas paralelas em direções opostas.',
      'Com a ponta da primeira corda, dê duas voltas completas ao redor de ambas as cordas.',
      'Passe a ponta por dentro das duas voltas recém-criadas e aperte (primeiro nó de frade duplo).',
      'Repita o mesmo procedimento com a outra ponta livre do outro lado.',
      'Puxe as duas cordas principais: os dois nós deslizarão até se encostarem e travarem solidamente.'
    ],
    proTip: 'Dica Tática: Uma vez submetido a peso extremo, é quase impossível desatar; use quando desejar união permanente e de alta segurança.'
  }
];

let currentKnotsFilter = 'all';

window.filterKnots = function(cat) {
  currentKnotsFilter = cat;
  const section = document.getElementById('tab-knots');
  if (section) {
    section.querySelectorAll('.chip-btn').forEach(btn => {
      const text = btn.textContent.toLowerCase();
      btn.classList.toggle('chip-highlight',
        (cat === 'all' && text.includes('todos')) ||
        (cat === 'ancoragem' && text.includes('ancoragem')) ||
        (cat === 'tensao' && text.includes('tensionamento')) ||
        (cat === 'uniao' && text.includes('união'))
      );
    });
  }
  renderKnotsList();
};

function renderKnotsList() {
  const container = document.getElementById('knots-container');
  if (!container) return;

  const filtered = (currentKnotsFilter === 'all')
    ? TACTICAL_KNOTS
    : TACTICAL_KNOTS.filter(k => k.category === currentKnotsFilter);

  container.innerHTML = filtered.map(k => `
    <div class="tactical-card">
      <div class="flex justify-between items-start gap-2 mb-2">
        <div>
          <div class="text-xs uppercase tracking-wider font-bold text-gray-400">Categoria: ${k.category.toUpperCase()}</div>
          <h3 class="text-lg font-bold text-white">${k.name}</h3>
        </div>
        <span class="status-pill" style="border-color: var(--accent-cyan); color: var(--accent-cyan); font-size: 0.7rem; font-weight: 800;">
          ${k.strength}
        </span>
      </div>

      <p class="text-xs text-gray-300 mb-2">${k.desc}</p>

      <div class="metric-card mb-2" style="padding: 0.5rem 0.75rem;">
        <span class="text-xs text-gray-400 font-bold uppercase">Aplicação Tática Principal:</span>
        <div class="text-amber-300 text-xs font-medium mt-0.5">${k.usage}</div>
      </div>

      <div class="space-y-1.5 text-xs mb-2">
        <strong class="text-white text-xs">Instruções Passo a Passo:</strong>
        ${k.steps.map((st, idx) => `
          <div class="flex items-start gap-2">
            <span class="step-number-badge">${idx + 1}</span>
            <span class="text-gray-300">${st}</span>
          </div>
        `).join('')}
      </div>

      <div style="background: rgba(16, 185, 129, 0.08); padding: 0.5rem; border-radius: 6px; border-left: 3px solid var(--accent-green);" class="text-xs text-emerald-300">
        ${k.proTip}
      </div>
    </div>
  `).join('');
}

// =====================================================================
// 17. PLANO DE EMERGÊNCIA FAMILIAR (PEF)
// =====================================================================
const PEF_STORAGE_KEY = 'nomad_pef_data_v1';

window.savePefData = function() {
  const data = {
    point1: document.getElementById('pef-point1')?.value || '',
    point2: document.getElementById('pef-point2')?.value || '',
    contactName: document.getElementById('pef-contact-name')?.value || '',
    contactCity: document.getElementById('pef-contact-city')?.value || '',
    contactPhone: document.getElementById('pef-contact-phone')?.value || '',
    chkGas: document.getElementById('pef_chk_gas')?.checked || false,
    chkElec: document.getElementById('pef_chk_elec')?.checked || false,
    chkWater: document.getElementById('pef_chk_water')?.checked || false,
    chkPets: document.getElementById('pef_chk_pets')?.checked || false,
    chkDocs: document.getElementById('pef_chk_docs')?.checked || false,
    chkBob: document.getElementById('pef_chk_bob')?.checked || false,
    chkSms: document.getElementById('pef_chk_sms')?.checked || false
  };

  try {
    localStorage.setItem(PEF_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {}

  updatePefSummary(data);
};

window.loadPefData = function() {
  let data = null;
  try {
    const raw = localStorage.getItem(PEF_STORAGE_KEY);
    if (raw) data = JSON.parse(raw);
  } catch (e) {}

  if (!data) return;

  const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };

  setVal('pef-point1', data.point1);
  setVal('pef-point2', data.point2);
  setVal('pef-contact-name', data.contactName);
  setVal('pef-contact-city', data.contactCity);
  setVal('pef-contact-phone', data.contactPhone);

  setChk('pef_chk_gas', data.chkGas);
  setChk('pef_chk_elec', data.chkElec);
  setChk('pef_chk_water', data.chkWater);
  setChk('pef_chk_pets', data.chkPets);
  setChk('pef_chk_docs', data.chkDocs);
  setChk('pef_chk_bob', data.chkBob);
  setChk('pef_chk_sms', data.chkSms);

  updatePefSummary(data);
};

window.resetPefForm = function() {
  if (!confirm('Deseja limpar todos os dados do Plano Familiar?')) return;
  try { localStorage.removeItem(PEF_STORAGE_KEY); } catch (e) {}
  document.querySelectorAll('#tab-pef input[type="text"]').forEach(i => i.value = '');
  document.querySelectorAll('#tab-pef input[type="checkbox"]').forEach(c => c.checked = false);
  updatePefSummary({});
};

function updatePefSummary(data) {
  const summaryEl = document.getElementById('pef-status-summary');
  if (!summaryEl) return;

  const filledPoints = (data.point1 ? 1 : 0) + (data.point2 ? 1 : 0);
  const hasContact = !!(data.contactName && data.contactPhone);

  if (filledPoints === 2 && hasContact) {
    summaryEl.textContent = '✅ Plano Familiar completo e sincronizado na memória offline.';
    summaryEl.style.color = 'var(--accent-green)';
  } else {
    summaryEl.textContent = `⚠️ Plano incompleto (${filledPoints}/2 pontos de encontro, ${hasContact ? 'Contato OK' : 'Falta Contato Fora da Área'}).`;
    summaryEl.style.color = 'var(--accent-amber)';
  }
}

// =====================================================================
// 18. CRONÔMETRO DE DISTÂNCIA DE RELÂMPAGO
// =====================================================================
let stormStartTime = null;
let stormInterval = null;

window.startLightningTimer = function() {
  stormStartTime = Date.now();
  const btnFlash = document.getElementById('btn-storm-flash');
  const btnThunder = document.getElementById('btn-storm-thunder');
  const distEl = document.getElementById('storm-dist-display');
  const secEl = document.getElementById('storm-seconds-display');
  const badgeEl = document.getElementById('storm-danger-badge');

  if (btnFlash) btnFlash.disabled = true;
  if (btnThunder) btnThunder.disabled = false;
  if (badgeEl) {
    badgeEl.textContent = '⏱️ Contando tempo até o trovão... Fique atento ao som!';
    badgeEl.style.color = 'var(--accent-amber)';
  }

  clearInterval(stormInterval);
  stormInterval = setInterval(() => {
    const elapsedSec = (Date.now() - stormStartTime) / 1000;
    const distanceKm = elapsedSec * 0.340;
    if (secEl) secEl.textContent = `${elapsedSec.toFixed(1)} segundos decorridos`;
    if (distEl) distEl.textContent = `${distanceKm.toFixed(2)} km`;
  }, 100);
};

window.stopLightningTimer = function() {
  if (!stormStartTime) return;
  clearInterval(stormInterval);

  const elapsedSec = (Date.now() - stormStartTime) / 1000;
  const distanceKm = elapsedSec * 0.340;

  const btnFlash = document.getElementById('btn-storm-flash');
  const btnThunder = document.getElementById('btn-storm-thunder');
  const distEl = document.getElementById('storm-dist-display');
  const secEl = document.getElementById('storm-seconds-display');
  const badgeEl = document.getElementById('storm-danger-badge');

  if (btnFlash) btnFlash.disabled = false;
  if (btnThunder) btnThunder.disabled = true;

  if (secEl) secEl.textContent = `Tempo final: ${elapsedSec.toFixed(2)} segundos`;
  if (distEl) distEl.textContent = `${distanceKm.toFixed(2)} km`;

  if (badgeEl) {
    if (distanceKm <= 3.0) {
      badgeEl.textContent = '🚨 PERIGO IMINENTE: Raio a menos de 3 km! Abrigo imediato obrigatório!';
      badgeEl.style.color = 'var(--accent-red)';
    } else if (distanceKm <= 10.0) {
      badgeEl.textContent = '⚠️ ZONA DE RISCO (Regra 30s): Tempestade a menos de 10 km! Não fique em áreas abertas.';
      badgeEl.style.color = 'var(--accent-amber)';
    } else {
      badgeEl.textContent = '✅ Distância segura (> 10 km). Monitore se o próximo raio estará mais próximo.';
      badgeEl.style.color = 'var(--accent-green)';
    }
  }

  stormStartTime = null;
};

// =====================================================================
// 19. EXPORTADOR DO PACOTE PORTÁTIL AUTOCONTIDO
// =====================================================================
window.exportPortableHtmlPackage = async function() {
  const msgEl = document.getElementById('export-status-message');
  if (msgEl) msgEl.textContent = 'Compilando banco de dados offline e manuais em arquivo único...';

  try {
    const [emergRes, venomRes, plantsRes, radioRes] = await Promise.all([
      fetch('/api/emergencies').then(r => r.json()).catch(() => []),
      fetch('/api/venomous').then(r => r.json()).catch(() => []),
      fetch('/api/plants').then(r => r.json()).catch(() => []),
      fetch('/api/radio').then(r => r.json()).catch(() => null)
    ]);

    const pefRaw = localStorage.getItem(PEF_STORAGE_KEY) || '{}';
    const pef = JSON.parse(pefRaw);

    const fullHtml = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>NOMAD BRASIL — Central Portátil de Campo 100% Offline</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #090d10; color: #f1f5f9; padding: 20px; line-height: 1.5; }
    h1, h2, h3 { color: #fff; border-bottom: 2px solid #10b981; padding-bottom: 6px; }
    .card { background: #131920; border: 1px solid #1e293b; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; background: #10b981; color: #04130d; }
    .alert { background: rgba(239, 68, 68, 0.15); border-left: 4px solid #ef4444; color: #fca5a5; padding: 10px; margin: 10px 0; border-radius: 4px; }
    .mono { font-family: monospace; color: #34d399; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 13px; }
    th, td { border: 1px solid #334155; padding: 8px; text-align: left; }
    th { background: #1e293b; color: #38bdf8; }
    @media print { body { background: #fff; color: #000; } .card { border-color: #999; } }
  </style>
</head>
<body>
  <h1>🧭 NOMAD BRASIL — Ficha Tática Portátil de Sobrevivência</h1>
  <p><em>Arquivo autocontido gerado em ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}. Funciona 100% offline em qualquer dispositivo sem servidor.</em></p>

  <div class="card">
    <h2>👨‍👩‍👧‍👦 Plano de Emergência Familiar Cadastrado</h2>
    <div><strong>Ponto de Encontro 1 (Bairro):</strong> ${pef.point1 || 'Não cadastrado'}</div>
    <div><strong>Ponto de Encontro 2 (Regional):</strong> ${pef.point2 || 'Não cadastrado'}</div>
    <div><strong>Contato Fora da Área:</strong> ${pef.contactName || '--'} (${pef.contactCity || '--'}) &bull; Tel: <span class="mono">${pef.contactPhone || '--'}</span></div>
  </div>

  <div class="card">
    <h2>📻 Rádio de Emergência &amp; Frequências do Brasil</h2>
    <table>
      <tr><th>Serviço</th><th>Canal / Frequência</th><th>Uso</th></tr>
      <tr><td>PX (Faixa do Cidadão)</td><td>Canal 9 (27.065 MHz)</td><td>Emergência Rodoviária Nacional</td></tr>
      <tr><td>PX Caminhoneiros</td><td>Canal 19 (27.185 MHz)</td><td>Situação de Rodovias e Bloqueios</td></tr>
      <tr><td>VHF Marítimo</td><td>Canal 16 (156.800 MHz)</td><td>Socorro e Chamada Náutica</td></tr>
      <tr><td>VHF Radioamador</td><td>146.520 MHz Simplex</td><td>Chamada Geral de Campo</td></tr>
      <tr><td>HF Defesa Civil / RENER</td><td>7.060 MHz LSB (40 metros)</td><td>Rede Nacional de Emergência</td></tr>
    </table>
    <div style="margin-top: 10px;"><strong>SOS MORSE:</strong> <span class="mono">... --- ...</span> (3 curtos, 3 longos, 3 curtos)</div>
  </div>

  <div class="card">
    <h2>🐍 Animais Peçonhentos &amp; Soros Antiveneno</h2>
    ${venomRes.map(v => `
      <div style="margin-bottom: 12px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">
        <strong style="color:#38bdf8; font-size:15px;">${v.name}</strong> &bull; <span class="badge">${v.lethality || 'ALTO'}</span><br>
        <div><strong>Ação do Veneno:</strong> ${v.venomType}</div>
        <div><strong>Soro SUS / Butantan:</strong> <span class="mono">${v.antivenom || v.antivenomSerum}</span></div>
        <div><strong>Conduta:</strong> ${Array.isArray(v.firstAid) ? v.firstAid.join('; ') : v.firstAid}</div>
      </div>
    `).join('')}
  </div>

  <div class="card">
    <h2>🌾 Plantas Silvestres Alimentícias (PANC) &amp; Medicinais</h2>
    ${plantsRes.map(p => `
      <div style="margin-bottom: 10px; border-bottom: 1px solid #1e293b; padding-bottom: 6px;">
        <strong style="color:#34d399;">${p.name}</strong> (${p.type})<br>
        <div><strong>Preparo:</strong> ${p.preparation}</div>
        <div><strong>Propriedades:</strong> ${p.medicinal}</div>
      </div>
    `).join('')}
  </div>

  <div class="card">
    <h2>🚑 Primeiros Socorros Imediatos (Resumo Vital)</h2>
    <div class="alert"><strong>HEMORRAGIAS GRAVES:</strong> Pressão direta estéril imediata. Se em membros e sem estancar, aplique torniquete tático 5cm acima da lesão e anote o horário exato.</div>
    <div class="alert"><strong>ENGASGO (HEIMLICH):</strong> Abraçar a vítima por trás, punho cerrado entre umbigo e boca do estômago, compressão vigorosa em formato de "J" para dentro e para cima.</div>
    <div class="alert"><strong>PARADA CARDIORRESPIRATÓRIA:</strong> 100 a 120 compressões/minuto no centro do tórax (profundidade de 5 a 6 cm).</div>
  </div>

  <footer>
    <p>NOMAD Brasil &bull; Projeto de Código Aberto &bull; Mantenha cópias impressas ou salvas na memória de seus aparelhos de campo.</p>
  </footer>
</body>
</html>`;

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nomad-brasil-pacote-offline-${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    if (msgEl) {
      msgEl.textContent = '✅ Download concluído com sucesso! Guarde este arquivo em seu celular ou pendrive.';
      msgEl.style.color = 'var(--accent-green)';
    }
  } catch (err) {
    console.error('Erro na exportação:', err);
    if (msgEl) msgEl.textContent = 'Erro ao compilar pacote: ' + err.message;
  }
};

// =====================================================================
// 20. CALCULADORA DE MARCHA (REGRA DE NAISMITH) & GEODÉSICA
// =====================================================================
window.calculateMarch = function() {
  const distKm = parseFloat(document.getElementById('march-dist-km')?.value) || 0;
  const elevM = parseFloat(document.getElementById('march-elev-m')?.value) || 0;
  const loadFactor = parseFloat(document.getElementById('march-load-type')?.value) || 1.2;

  const flatTimeMin = (distKm / 5) * 60;
  const climbTimeMin = (elevM / 300) * 30;
  const rawTotalMin = (flatTimeMin + climbTimeMin) * loadFactor;

  const restHours = Math.floor(rawTotalMin / 60);
  const totalMin = Math.round(rawTotalMin + (restHours * 5));

  const hours = Math.floor(totalMin / 60);
  const mins = totalMin % 60;

  const waterLiters = ((totalMin / 60) * 0.65).toFixed(1);

  const timeEl = document.getElementById('march-res-time');
  const waterEl = document.getElementById('march-res-water');
  const tipEl = document.getElementById('march-daylight-tip');

  if (timeEl) timeEl.textContent = `${hours}h ${String(mins).padStart(2, '0')}m`;
  if (waterEl) waterEl.textContent = `${waterLiters} Litros`;

  if (tipEl) {
    if (hours >= 8) {
      tipEl.textContent = `⚠️ ATENÇÃO: Jornada longa (${hours}h)! Divida a marcha em 2 dias ou parta às 05:00 para não marchar no escuro.`;
      tipEl.style.color = 'var(--accent-red)';
    } else if (hours >= 5) {
      tipEl.textContent = `⏱️ Marcha moderada (${hours}h). Programe saída antes das 07:00 e preveja parada para almoço.`;
      tipEl.style.color = 'var(--accent-amber)';
    } else {
      tipEl.textContent = `✅ Jornada confortável (${hours}h). Mantenha ritmo constante de 60-68 passos duplos/100m.`;
      tipEl.style.color = 'var(--accent-green)';
    }
  }
};

window.convertGeodeticCoords = function() {
  const input = document.getElementById('geo-conv-in')?.value || '';
  const outEl = document.getElementById('geo-conv-out');
  if (!outEl) return;

  const parts = input.split(',').map(s => parseFloat(s.trim()));
  if (parts.length !== 2 || isNaN(parts[0]) || isNaN(parts[1])) {
    outEl.textContent = 'Formato inválido. Use: latitude, longitude (ex: -23.5505, -46.6333)';
    outEl.style.color = 'var(--accent-red)';
    return;
  }

  const [lat, lng] = parts;

  function toDms(val, posChar, negChar) {
    const dir = val >= 0 ? posChar : negChar;
    const abs = Math.abs(val);
    const deg = Math.floor(abs);
    const minFloat = (abs - deg) * 60;
    const min = Math.floor(minFloat);
    const sec = ((minFloat - min) * 60).toFixed(1);
    return `${deg}°${String(min).padStart(2, '0')}'${String(sec).padStart(4, '0')}"${dir}`;
  }

  const dmsLat = toDms(lat, 'N', 'S');
  const dmsLng = toDms(lng, 'E', 'W');

  outEl.textContent = `DMS: ${dmsLat} ${dmsLng} • Decimais: ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  outEl.style.color = 'var(--accent-green)';
};

// =====================================================================
// 21. CALCULADORA DE SORO CASEIRO OMS
// =====================================================================
window.calculateSoroDose = function() {
  const weight = parseFloat(document.getElementById('soro-weight-input')?.value) || 70;
  const attackMl = weight * 50;
  const attackL = (attackMl / 1000).toFixed(1);
  const cupMl = Math.min(300, Math.max(100, Math.round(weight * 3)));

  const doseEl = document.getElementById('soro-res-dose');
  const cupEl = document.getElementById('soro-res-cup');
  if (doseEl) doseEl.textContent = `${attackL} L`;
  if (cupEl) cupEl.textContent = `${cupMl} ml`;
};

// =====================================================================
// 22. CALCULADORA DE DILUIÇÃO DE HIPOCLORITO (ÁGUA SANITÁRIA)
// =====================================================================
window.calculateBleachDilution = function() {
  const usage = document.getElementById('bleach-usage-type')?.value || 'water_clean';
  const liters = parseFloat(document.getElementById('bleach-volume-liters')?.value) || 10;
  const qtyEl = document.getElementById('bleach-res-qty');
  const instEl = document.getElementById('bleach-res-instructions');
  if (!qtyEl || !instEl) return;

  if (usage === 'water_clean') {
    const drops = liters * 2;
    const ml = (drops / 20).toFixed(1);
    qtyEl.textContent = `${drops} gotas (~${ml} ml)`;
    instEl.textContent = 'Adicione na água limpa, misture bem e aguarde 30 minutos em recipiente tampado.';
  } else if (usage === 'water_turbid') {
    const drops = liters * 4;
    const ml = (drops / 20).toFixed(1);
    qtyEl.textContent = `${drops} gotas (~${ml} ml)`;
    instEl.textContent = 'Filtre previamente em pano limpo. Deixe agir por 45 minutos antes do consumo.';
  } else if (usage === 'veggies') {
    const ml = Math.round(liters * 15);
    const spoons = (ml / 15).toFixed(0);
    qtyEl.textContent = `${ml} ml (~${spoons} colheres de sopa)`;
    instEl.textContent = 'Mergulhe hortaliças e frutas por 15 minutos e enxágue em água potável filtrada.';
  } else if (usage === 'surfaces') {
    const ml = Math.round(liters * 200);
    const cups = (ml / 200).toFixed(1);
    qtyEl.textContent = `${ml} ml (~${cups} copos americanos)`;
    instEl.textContent = 'Solução hospitalar 0.5%: Use para pisos, solados e maçanetas com luvas. Ação em 10 min.';
  }
};

// =====================================================================
// 23. CALCULADORA DE AUTONOMIA DE BANCO DE BATERIAS
// =====================================================================
window.calculateBatteryAutonomy = function() {
  const volts = parseFloat(document.getElementById('batt-volts-input')?.value) || 12.0;
  const ah = parseFloat(document.getElementById('batt-ah-input')?.value) || 7.0;
  const watts = parseFloat(document.getElementById('batt-watts-input')?.value) || 5.0;

  const totalWh = volts * ah;
  const usableWh = totalWh * 0.85;
  const hours = (usableWh / watts).toFixed(1);

  const whEl = document.getElementById('batt-res-wh');
  const hoursEl = document.getElementById('batt-res-hours');
  if (whEl) whEl.textContent = `${totalWh.toFixed(1)} Wh`;
  if (hoursEl) hoursEl.textContent = `${hours} horas`;
};

// =====================================================================
// 24. PROTOCOLO PACE (LOCALSTORAGE)
// =====================================================================
window.savePacePlan = function() {
  const plan = {
    p: document.getElementById('pace-in-p')?.value || '',
    a: document.getElementById('pace-in-a')?.value || '',
    c: document.getElementById('pace-in-c')?.value || '',
    e: document.getElementById('pace-in-e')?.value || ''
  };
  try {
    localStorage.setItem('nomad_pace_plan_v1', JSON.stringify(plan));
  } catch (err) {}
};

window.loadPacePlan = function() {
  try {
    const raw = localStorage.getItem('nomad_pace_plan_v1');
    if (!raw) return;
    const plan = JSON.parse(raw);
    if (plan.p && document.getElementById('pace-in-p')) document.getElementById('pace-in-p').value = plan.p;
    if (plan.a && document.getElementById('pace-in-a')) document.getElementById('pace-in-a').value = plan.a;
    if (plan.c && document.getElementById('pace-in-c')) document.getElementById('pace-in-c').value = plan.c;
    if (plan.e && document.getElementById('pace-in-e')) document.getElementById('pace-in-e').value = plan.e;
  } catch (err) {}
};

window.resetPacePlan = function() {
  try { localStorage.removeItem('nomad_pace_plan_v1'); } catch (e) {}
  if (document.getElementById('pace-in-p')) document.getElementById('pace-in-p').value = 'VHF 146.520 MHz Simplex / Canal 1 Baofeng';
  if (document.getElementById('pace-in-a')) document.getElementById('pace-in-a').value = 'PX Canal 9 (27.065 MHz) / Rádio Caminhoneiro Ch 19';
  if (document.getElementById('pace-in-c')) document.getElementById('pace-in-c').value = 'HF 7.060 MHz LSB (RENER) / Bilhete escrito em ponto de apoio';
  if (document.getElementById('pace-in-e')) document.getElementById('pace-in-e').value = '3 silvos de apito a cada 15 min / Espelho Heliógrafo às 12h';
};

// =====================================================================
// 25. ORTOPEDIA AUSTERA & MANEJO DE FRATURAS/PMS
// =====================================================================
window.calculateOrthopedics = function() {
  const type = document.getElementById('ortho-injury-select')?.value || 'femur';
  const techEl = document.getElementById('ortho-res-tech');
  const descEl = document.getElementById('ortho-res-desc');
  const pmsEl = document.getElementById('ortho-res-pms');
  if (!techEl || !descEl || !pmsEl) return;

  if (type === 'femur') {
    techEl.textContent = 'Tração Femoral com Molinete (Estilo Hare/Sager)';
    descEl.textContent = 'Requer aplicação de tração axial contínua para sobrepor o espasmo do quadríceps, realinhar as bordas ósseas e prevenir choque hipovolêmico por laceração da artéria femoral profunda.';
    pmsEl.innerHTML = '<strong>Checagem PMS Obrigatória:</strong> Palpar pulso pedioso dorsal e tibial posterior antes e após tracionar. Tempo de enchimento capilar &lt; 2s.';
  } else if (type === 'shoulder') {
    techEl.textContent = 'Método Atraumático de Cunningham ou Milch';
    descEl.textContent = 'Sente o paciente ereto. Realize massagem suave no trapézio superior, deltoide e bíceps até relaxamento muscular completo. A cabeça do úmero desliza suavemente para a fossa glenoide sem puxões violentos.';
    pmsEl.innerHTML = '<strong>Checagem PMS Obrigatória:</strong> Avaliar sensibilidade na face lateral do deltoide (nervo axilar) e pulso radial antes e após a redução. Imobilizar em tipoia de Velpeau.';
  } else if (type === 'tibia') {
    techEl.textContent = 'Tala Rígida Moldada em "U" + Tala Posterior';
    descEl.textContent = 'Alinhe a perna aplicando tração manual suave no calcanhar. Imobilize desde o joelho até além do tornozelo em 90 graus com papelão reforçado ou galhos acolchoados.';
    pmsEl.innerHTML = '<strong>Checagem PMS Obrigatória:</strong> Verifique se a tala não comprime a cabeça da fíbula (risco de lesão do nervo fibular comum / pé caído).';
  } else if (type === 'patella') {
    techEl.textContent = 'Extensão Passiva e Medialização Suave';
    descEl.textContent = 'Estenda lentamente a perna e flexione levemente o quadril para relaxar o tendão patelar. Com a ponta dos dedos, empurre suavemente a patela em direção medial até o encaixe anatômico.';
    pmsEl.innerHTML = '<strong>Checagem PMS Obrigatória:</strong> Manter a perna estendida com tala posterior rígida por 2 a 3 semanas. Verificar circulação distal.';
  }
};

// =====================================================================
// 26. APICULTURA NATIVA & ATRATIVO DE ABELHAS ASF
// =====================================================================
window.calculateAsfBait = function() {
  const ml = parseFloat(document.getElementById('asf-alcohol-input')?.value) || 500;
  const sp = document.getElementById('asf-target-species')?.value || 'jatai';
  
  let propolisG = Math.round(ml * 0.25);
  let bottles = Math.round(ml / 20);
  let timeStr = '30 a 45 dias no escuro';

  if (sp === 'mandacaia') {
    propolisG = Math.round(ml * 0.30);
    timeStr = '40 a 60 dias (resina densa com geoprópolis)';
  } else if (sp === 'urucu') {
    propolisG = Math.round(ml * 0.35);
    timeStr = '45 dias no escuro';
  }

  const pEl = document.getElementById('asf-res-propolis');
  const bEl = document.getElementById('asf-res-bottles');
  const tEl = document.getElementById('asf-res-time');

  if (pEl) pEl.textContent = `${propolisG} g de própolis bruto`;
  if (bEl) bEl.textContent = `~${bottles} garrafas PET 2L`;
  if (tEl) tEl.textContent = timeStr;
};

// =====================================================================
// 27. AQUAPONIA & PISCICULTURA EM IBC 1000L
// =====================================================================
window.calculateAquaponics = function() {
  const liters = parseFloat(document.getElementById('aqua-tank-input')?.value) || 1000;
  const fish = document.getElementById('aqua-fish-select')?.value || 'tilapia';

  let density = '';
  let biomass = '';
  let filterL = Math.round(liters * 0.30);
  let bedM2 = (liters * 0.0025).toFixed(1);
  let pumpFlow = `${Math.round(liters * 1.2)} a ${Math.round(liters * 1.5)} L/h`;

  if (fish === 'tilapia') {
    const minFish = Math.round((liters / 1000) * 50);
    const maxFish = Math.round((liters / 1000) * 65);
    density = `${minFish} a ${maxFish} alevinos`;
    biomass = `~${Math.round(maxFish * 0.55)} kg de tilápia adulta`;
  } else if (fish === 'lambari') {
    const minFish = Math.round((liters / 1000) * 150);
    const maxFish = Math.round((liters / 1000) * 220);
    density = `${minFish} a ${maxFish} lambaris`;
    biomass = `~${Math.round(maxFish * 0.04)} kg de lambari`;
  } else {
    const minFish = Math.round((liters / 1000) * 20);
    const maxFish = Math.round((liters / 1000) * 30);
    density = `${minFish} a ${maxFish} carpas`;
    biomass = `~${Math.round(maxFish * 0.8)} kg de peixe vivo`;
  }

  const dEl = document.getElementById('aqua-res-density');
  const bEl = document.getElementById('aqua-res-biomass');
  const fEl = document.getElementById('aqua-res-filter');
  const bedEl = document.getElementById('aqua-res-bed');
  const pEl = document.getElementById('aqua-res-pump');

  if (dEl) dEl.textContent = density;
  if (bEl) bEl.textContent = biomass;
  if (fEl) fEl.textContent = `${filterL} Litros (biofiltro brita)`;
  if (bedEl) bedEl.textContent = `~${bedM2} m² de bancada vegetal`;
  if (pEl) pEl.textContent = pumpFlow;
};

// =====================================================================
// 28. GASOGÊNIO & RENDIMENTO WOOD GAS
// =====================================================================
window.calculateGasifier = function() {
  const kw = parseFloat(document.getElementById('gas-kw-input')?.value) || 3.5;
  const netKw = (kw * 0.72).toFixed(1);
  const woodPerH = (netKw * 1.35).toFixed(1);
  const hours = ((40 / woodPerH)).toFixed(1);

  const pEl = document.getElementById('gas-res-power');
  const wEl = document.getElementById('gas-res-wood');
  const hEl = document.getElementById('gas-res-hours');

  if (pEl) pEl.textContent = `~${netKw} kW (-28% perda térmica)`;
  if (wEl) wEl.textContent = `~${woodPerH} kg de madeira seca/h`;
  if (hEl) hEl.textContent = `~${hours} horas contínuas`;
};

// =====================================================================
// 29. FORTIFICAÇÃO & PROTEÇÃO BALÍSTICA
// =====================================================================
window.calculateFortification = function() {
  const threat = document.getElementById('fort-threat-select')?.value || 'handgun';

  let sand = '20 cm';
  let earth = '30 cm';
  let gravel = '15 cm';
  let wood = '25 cm';
  let steel = '4.5 mm (3/16")';

  if (threat === 'shotgun') {
    sand = '30 cm';
    earth = '40 cm';
    gravel = '25 cm';
    wood = '35 cm';
    steel = '6.5 mm (1/4")';
  } else if (threat === '556') {
    sand = '40 cm';
    earth = '50 cm';
    gravel = '30 cm';
    wood = '55 cm';
    steel = '9.5 mm (3/8")';
  } else if (threat === '762') {
    sand = '60 cm (dupla fileira)';
    earth = '75 cm compactada';
    gravel = '45 cm';
    wood = '80 cm (dormentes cruzados)';
    steel = '12.7 mm (1/2" chapa blindada)';
  }

  const sEl = document.getElementById('fort-res-sand');
  const eEl = document.getElementById('fort-res-earth');
  const gEl = document.getElementById('fort-res-gravel');
  const wEl = document.getElementById('fort-res-wood');
  const stEl = document.getElementById('fort-res-steel');

  if (sEl) sEl.textContent = sand;
  if (eEl) eEl.textContent = earth;
  if (gEl) gEl.textContent = gravel;
  if (wEl) wEl.textContent = wood;
  if (stEl) stEl.textContent = steel;
};

// =====================================================================
// 30. FORJA & TRATAMENTO TÉRMICO DE AÇOS
// =====================================================================
window.calculateBlacksmith = function() {
  const steel = document.getElementById('smith-steel-select')?.value || '5160';

  let forge = '950°C a 1150°C (Laranja a Amarelo)';
  let quench = '~800°C - 830°C (Vermelho Cereja Vivo)';
  let medium = 'Óleo Vegetal Morno (45°C - 55°C)';
  let temper = '2 horas a 200°C (Cor Palha Dourada)';
  let hrc = '58 a 60 HRC (Tenacidade Máxima)';

  if (steel === '1095') {
    forge = '900°C a 1050°C (Vermelho Claro / Laranja)';
    quench = '~790°C (Perda imediata de magnetismo)';
    medium = 'Óleo Fino Rápido (40°C)';
    temper = '2 horas a 220°C';
    hrc = '60 a 62 HRC (Fio de Navalha Extremo)';
  } else if (steel === '52100') {
    forge = '950°C a 1100°C';
    quench = '~820°C - 840°C';
    medium = 'Óleo Vegetal Morno a 50°C';
    temper = '2 ciclos de 1h30 a 190°C';
    hrc = '61 a 63 HRC (Resistência ao Desgaste)';
  } else if (steel === 'cable') {
    forge = '1050°C a 1250°C (Amarelo Claro / Solda)';
    quench = '~810°C (Vermelho Cereja)';
    medium = 'Óleo Mineral ou Vegetal Morno';
    temper = '2 horas a 200°C';
    hrc = '56 a 58 HRC (Padrão Damasco Flexível)';
  }

  const fEl = document.getElementById('smith-res-forge');
  const qEl = document.getElementById('smith-res-quench');
  const mEl = document.getElementById('smith-res-medium');
  const tEl = document.getElementById('smith-res-temper');
  const hEl = document.getElementById('smith-res-hrc');

  if (fEl) fEl.textContent = forge;
  if (qEl) qEl.textContent = quench;
  if (mEl) mEl.textContent = medium;
  if (tEl) tEl.textContent = temper;
  if (hEl) hEl.textContent = hrc;
};

// =====================================================================
// 31. CARVÃO ATIVADO MEDICINAL & DOSAGEM ANTITÓXICA
// =====================================================================
window.calculateCharcoal = function() {
  const kg = parseFloat(document.getElementById('char-weight-input')?.value) || 70;
  const doseG = Math.round(kg * 1.0);
  const waterMl = Math.round(doseG * 4.5);

  const dEl = document.getElementById('char-res-dose');
  const wEl = document.getElementById('char-res-water');

  if (dEl) dEl.textContent = `${doseG} gramas de pó fino (1g/kg)`;
  if (wEl) wEl.textContent = `${waterMl} a ${Math.round(waterMl * 1.3)} ml de água limpa`;
};

// Auto-init new calculators
document.addEventListener('DOMContentLoaded', () => {
  if (window.calculateSoroDose) window.calculateSoroDose();
  if (window.calculateBleachDilution) window.calculateBleachDilution();
  if (window.calculateBatteryAutonomy) window.calculateBatteryAutonomy();
  if (window.loadPacePlan) window.loadPacePlan();
  if (window.calculateOrthopedics) window.calculateOrthopedics();
  if (window.calculateAsfBait) window.calculateAsfBait();
  if (window.calculateAquaponics) window.calculateAquaponics();
  if (window.calculateGasifier) window.calculateGasifier();
  if (window.calculateFortification) window.calculateFortification();
  if (window.calculateBlacksmith) window.calculateBlacksmith();
  if (window.calculateCharcoal) window.calculateCharcoal();
});

