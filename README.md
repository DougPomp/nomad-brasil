# 🇧🇷 NOMAD Brasil — Central de Sobrevivência, Mapas & Conhecimento 100% Offline

> **Sistema autônomo e resiliente de mapas vetoriais, planejamento de rotas de evacuação, enciclopédia completa e protocolos de emergência para o Brasil.**  
> Projetado para operar com **zero dependência de internet**, funcionando diretamente em um HD externo, pendrive, notebook ou servidor de campo (Docker).

---

## 🧭 Visão Geral

O **NOMAD Brasil** é uma plataforma *open source* criada para prover infraestrutura crítica de informação durante apagões, desastres naturais, isolamento geográfico ou operações táticas de campo em território nacional.

O sistema integra em um único painel web ultra-rápido:
1. **🗺️ Mapas Nacionais em Nível de Ruas (100% Offline):** Cobertura completa do Brasil em formato vetorial PMTiles (1,57 GB) com renderização por aceleração gráfica (MapLibre GL JS), tipografia Noto Sans local e busca instantânea de **todos os 5.571 municípios do IBGE**.
2. **🚗 Planejador de Rotas & Evacuação:** Traçado de deslocamento rodoviário, tático (4x4) e marcha a pé (4,5 km/h) com instruções curva a curva, consumo de combustível, cálculo vital de água/calorias, cache permanente em disco e exportação direta em **GPX** para aparelhos GPS Garmin ou apps móveis offline (OsmAnd, Organic Maps).
3. **📊 Painel Tático de Informações Municipais (*City Intel*):** Dossiê de cada município brasileiro contendo Código IBGE, DDD, Região, Distância geodésica da Capital, Coordenadas GPS de precisão e atalho de rota direta.
4. **📚 Wikipédia Completa em Português (23+ GB):** Servidor Kiwix nativo integrado servindo mais de 1 milhão de artigos com imagens, enciclopédia médica e guias de viagem.
5. **🚑 Protocolos de Primeiros Socorros & Triagem:** Guias imediatos para Parada Cardíaca (RCP), Desengasgo (Heimlich), Hemorragias, Queimaduras e Acidentes com Animais Peçonhentos do Brasil (serpentes Jararaca/Cascavel e escorpiões).
6. **🏕️ Manuais Práticos de Resiliência:** Métodos de purificação de água, frequências do Rádio Cidadão / PX (Canais 9 e 19 de Emergência), Código Q e dimensionamento de energia solar 12V autônoma.

---

## ⚡ Instalação Rápida (1 Clique)

### No Windows:
1. Clone o repositório ou baixe os arquivos para o seu computador ou HD externo:
   ```cmd
   git clone https://github.com/SEU_USUARIO/nomad-brasil.git
   cd nomad-brasil
   ```
2. Execute o instalador automático com 2 cliques ou pelo terminal:
   ```cmd
   setup-nomad-brasil.bat
   ```
   *O instalador criará os diretórios, fará o download automático do mapa vetorial do Brasil (`brazil-streets.pmtiles`), oferecerá o download do acervo da Wikipédia e subirá o Docker automaticamente.*

### No Linux / macOS / Raspberry Pi:
```bash
git clone https://github.com/SEU_USUARIO/nomad-brasil.git
cd nomad-brasil
chmod +x setup-nomad-brasil.sh
./setup-nomad-brasil.sh
```

---

## 🌐 Portas de Acesso

Assim que iniciado, o sistema fica acessível pelo seu navegador em:

| Serviço | Endereço | Descrição |
| :--- | :--- | :--- |
| **Portal NOMAD Brasil** | [http://localhost:8000](http://localhost:8000) | Dashboard tático, mapa vetorial, rotas e manuais |
| **Biblioteca Kiwix** | [http://localhost:8090](http://localhost:8090) | Estante e leitor nativo dos arquivos ZIM |

---

## 🛠️ Arquitetura do Sistema

```
nomad-brasil/
├── app/
│   ├── server.js               # Servidor HTTP Node.js com streaming Range 206 e rotas
│   ├── data/
│   │   ├── cities.json         # Todos os 5.571 municípios do IBGE (UTF-8, DDD, Lat/Lng)
│   │   ├── emergencies.json    # Protocolos de atendimento pré-hospitalar
│   │   ├── survival.json       # Manuais técnicos de resiliência e campo
│   │   └── routes_cache/       # Cache permanente em disco de todas as rotas traçadas
│   └── public/
│       ├── index.html          # Interface tática em dark mode (Glassmorphism)
│       ├── styles.css          # Estilização HUD e painéis deslizantes
│       ├── app.js              # Lógica de mapas, busca e cálculo de rota
│       └── vendor/             # MapLibre GL e PMTiles 100% offline (zero CDNs)
├── storage/
│   ├── maps/
│   │   ├── brazil-streets.pmtiles      # Arquivo vetorial (1,57 GB, 1.186.952 tiles)
│   │   └── basemaps-assets/fonts/      # Glyphs Noto Sans locais
│   └── zim/
│       ├── wikipedia_pt_all_maxi.zim   # Wikipédia Completa em Português
│       └── kiwix-library.xml           # Catálogo XML gerado
├── tools/                      # Utilitário go-pmtiles
├── docker-compose.yml          # Orquestração dos serviços (Web e Kiwix)
├── setup-nomad-brasil.bat      # Instalador e downloader automático para Windows
├── setup-nomad-brasil.sh       # Instalador e downloader automático para Linux/macOS
└── README.md
```

---

## 🚗 Sistema de Rotas Táticas (Híbrido)

O sistema possui tripla camada de resiliência para cálculo de deslocamentos:
- **Camada 1 — Rodovias Reais (Online/OSRM):** Traçado geográfico fiel às rodovias federais e estaduais (Bandeirantes, Anhanguera, Dutra, BR-101, BR-116, etc.) com guia curva a curva.
- **Camada 2 — Cache Permanente em Disco:** Qualquer rota pesquisada uma única vez é gravada localmente em `app/data/routes_cache/`. Se a internet for cortada, a rota continua disponível instantaneamente para sempre.
- **Camada 3 — Corredor Tático de Contingência (Zero Conexão):** Em caso de rota inédita em área sem sinal, o motor interno calcula o corredor rodoviário aproximado entre as cidades com fator de curvatura real do Brasil (1,28x) e indica cidades de apoio no percurso.
- **Exportação GPX:** Qualquer rota calculada pode ser salva em arquivo `.gpx` para uso em aparelhos GPS Garmin ou aplicativos offline em smartphones.

---

## 📋 Requisitos Mínimos

- **Sistema Operacional:** Windows 10/11, Linux (Ubuntu, Debian, Fedora, Arch) ou macOS.
- **Hardware:**
  - Processador: Dual-core 2.0 GHz ou superior (compatível com Raspberry Pi 4 / 5).
  - Memória RAM: Mínimo 2 GB (o contêiner consome menos de 70 MB).
  - Armazenamento:
    - ~3 GB (Instalação básica com Mapas do Brasil e Wikipédia Médica).
    - ~30 GB (Instalação completa com Wikipédia Maxi 2026 de 23 GB com fotos).
- **Software:** Docker Engine / Docker Desktop instalado e ativo.

---

## 📄 Licença

Este projeto é disponibilizado sob a licença **MIT** — livre para uso pessoal, comunitário, acadêmico e corporativo.
