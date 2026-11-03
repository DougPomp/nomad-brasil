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
});

// Clock
function initClock() {
  const clockEl = document.getElementById('system-clock-time');
  function update() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('pt-BR', { hour12: false });
    if (clockEl) clockEl.textContent = timeStr;
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
  if (!panel) return;

  const isOpen = panel.classList.contains('open');
  const targetState = typeof forceState === 'boolean' ? forceState : !isOpen;

  if (targetState) {
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

  // If origin is not set, set origin to Louveira or Sao Paulo
  if (!routeOrigin) {
    const defaultOrigin = currentSelectedCity.id === 'sp-louveira' ?
      citiesList.find(c => c.id === 'sp-sao-paulo') :
      citiesList.find(c => c.id === 'sp-louveira');

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
  if (!drawer) return;
  const isHidden = drawer.style.display === 'none';
  const shouldOpen = force !== undefined ? force : isHidden;
  drawer.style.display = shouldOpen ? 'flex' : 'none';
  if (shouldOpen) {
    // close route planner if open to prevent screen clutter
    const routePanel = document.getElementById('route-planner-panel');
    if (routePanel) routePanel.classList.remove('open');
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

window.convertAndPlayCustomMorse = async function() {
  const text = (document.getElementById('morse-custom-input')?.value || 'SOS').toUpperCase().trim();
  const display = document.getElementById('morse-output-display');

  const morseSeq = text.split('').map(char => MORSE_MAP[char] || '?').join(' ');
  if (display) display.textContent = morseSeq;

  // Play audio sequence
  for (const char of morseSeq) {
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
  }, 200);
}

