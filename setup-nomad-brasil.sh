#!/usr/bin/env bash
set -e

echo "===================================================================="
echo "       NOMAD BRASIL - CENTRAL OFFLINE DE RESILIÊNCIA & MAPAS"
echo "                     Instalador Automático (Setup)"
echo "===================================================================="
echo ""

# 1. Verificar Docker
echo "[*] Verificando Docker Engine..."
if ! command -v docker &> /dev/null; then
    echo "[ERRO] Docker não foi encontrado. Por favor instale o Docker antes de continuar."
    exit 1
fi
echo "[OK] Docker detectado!"
echo ""

# 2. Criar Estrutura de Diretórios
echo "[*] Configurando estrutura de diretórios..."
mkdir -p storage/zim storage/maps/basemaps-assets/fonts storage/maps/basemaps-assets/sprites storage/maps/detail_tiles_cache app/data/routes_cache
echo "[OK] Diretórios configurados!"
echo ""

# 3. Mapa do Brasil
if [ ! -f "storage/maps/brazil-streets.pmtiles" ]; then
    echo "[*] Baixando mapa vetorial do Brasil (1.57 GB)..."
    curl -L -o "storage/maps/brazil-streets.pmtiles" "https://build.protomaps.com/20261101.pmtiles" --progress-bar
else
    echo "[OK] Mapa vetorial (brazil-streets.pmtiles) já presente."
fi
echo ""

# 3b. Índice offline de ruas e POIs (SQLite FTS5)
if [ -f "storage/maps/brazil-streets.pmtiles" ] && [ ! -f "storage/maps/brazil-streets.sqlite" ]; then
    echo "[*] Construindo índice nacional de ruas e POIs (SQLite FTS5)..."
    docker run --rm -v "$(pwd):/repo" node:22-slim node /repo/app/build_streets_index.js || echo "[AVISO] Falha ao indexar ruas agora."
elif [ -f "storage/maps/brazil-streets.sqlite" ]; then
    echo "[OK] Índice offline de ruas (brazil-streets.sqlite) já presente."
fi
echo ""

# 4. Acervo ZIM
if [ -z "$(ls -A storage/zim/*.zim 2>/dev/null)" ]; then
    echo "[!] Nenhum arquivo ZIM encontrado em storage/zim/"
    echo "Deseja baixar a Wikipédia Médica Offline (~1.2 GB)? [s/N]"
    read -r resp
    if [[ "$resp" =~ ^([sS][iI][mM]|[sS])$ ]]; then
        curl -L -o "storage/zim/wikipedia_pt_medicine_maxi_2026-05.zim" "https://download.kiwix.org/zim/wikipedia/wikipedia_pt_medicine_maxi_2026-05.zim" --progress-bar
    fi
fi
echo ""

# 5. Inicializar
echo "[*] Subindo contêineres Docker..."
docker compose up -d

echo ""
echo "===================================================================="
echo "       NOMAD BRASIL INICIADO COM SUCESSO!"
echo "===================================================================="
echo " - Portal Web:    http://localhost:8000"
echo " - Estante Kiwix: http://localhost:8090"
echo ""
