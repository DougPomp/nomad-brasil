#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"
AI_MODEL="${1:-qwen2.5:1.5b}"

echo "===================================================================="
echo "  NOMAD Brasil - Ativar Motor de IA Offline (Ollama + RAG Local)"
echo "===================================================================="
echo ""

if ! docker info >/dev/null 2>&1; then
  echo "[ERRO] Docker Engine nao esta em execucao."
  exit 1
fi

mkdir -p storage/ollama

echo "[1/3] Subindo servicos NOMAD Brasil + Ollama (perfil ai)..."
docker compose --profile ai up -d

echo "[2/3] Aguardando motor Ollama na porta 11434..."
for i in $(seq 1 15); do
  if docker exec nomad_brasil_ollama ollama list >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if [ "$AI_MODEL" != "none" ]; then
  echo "[3/3] Garantindo modelo offline: $AI_MODEL..."
  if docker exec nomad_brasil_ollama ollama list | grep -qi "$AI_MODEL"; then
    echo "[OK] Modelo $AI_MODEL ja instalado em storage/ollama!"
  else
    docker exec nomad_brasil_ollama ollama pull "$AI_MODEL"
  fi
fi

echo ""
echo "[OK] Tudo pronto! Acesse http://localhost:8000 -> aba IA Tatica Offline."
