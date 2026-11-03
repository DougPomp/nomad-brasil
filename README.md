<p align="center">
  <img src="docs/banner.svg" alt="NOMAD Brasil — Central de Sobrevivência, Mapas e Conhecimento 100% Offline" width="100%">
</p>

<p align="center">
  <a href="https://dougpomp.github.io/nomad-brasil/"><img src="https://img.shields.io/badge/Demo_Online-GitHub_Pages-10b981?style=for-the-badge&logo=github&logoColor=white" alt="Live Demo"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/Licen%C3%A7a-MIT-06b6d4?style=for-the-badge" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/Operacional-100%25_Offline-10b981?style=for-the-badge" alt="100% Offline">
  <img src="https://img.shields.io/badge/Docker-Pronto-2496ed?style=for-the-badge&logo=docker&logoColor=white" alt="Docker Ready">
</p>

> **Sistema autônomo e resiliente de mapas vetoriais, planejamento de rotas de evacuação, enciclopédia completa e protocolos de emergência para o Brasil.**  
> Projetado para operar com **zero dependência de internet**, funcionando diretamente em um HD externo, pendrive, notebook ou servidor de campo (Docker).  
> 🌐 **Acesse a Demonstração Online no GitHub Pages:** [https://dougpomp.github.io/nomad-brasil/](https://dougpomp.github.io/nomad-brasil/)

---

## 🧭 Visão Geral

O **NOMAD Brasil** é uma plataforma *open source* criada para prover infraestrutura crítica de informação durante apagões, desastres naturais, isolamento geográfico ou operações táticas de campo em território nacional.

O sistema integra em um único painel web ultra-rápido:
1. **🗺️ Mapas Nacionais em Nível de Ruas (100% Offline):** Cobertura completa do Brasil em formato vetorial PMTiles (1,57 GB) com renderização por aceleração gráfica (MapLibre GL JS), tipografia Noto Sans local e busca instantânea de **todos os 5.571 municípios do IBGE**.
2. **📍 Camadas Táticas de POIs & Marcadores Pessoais:** Hospitais/UPAs 24h, Batalhões da PM/Bombeiros (193), Polícia Rodoviária Federal (PRF), Mananciais de Água Doce e Postos de Abastecimento 24h. Sistema de **Waypoints Pessoais** com gravação local e exportação/importação em GPX e JSON.
3. **🚗 Planejador de Rotas & Evacuação:** Traçado de deslocamento rodoviário, tático (4x4) e marcha a pé (4,5 km/h) com instruções curva a curva, consumo de combustível, cálculo vital de água/calorias, cache permanente em disco e exportação direta em **GPX** para aparelhos GPS Garmin ou apps móveis offline (OsmAnd, Organic Maps).
4. **🎒 Calculadora Tática de Racionamento & Estoque:** Dimensionamento dinâmico de litros de água, calorias totais, cesta de alimentos não-perecíveis no padrão brasileiro (arroz, feijão, aveia, sardinha, óleo, sal), pilhas e combustível de gerador para qualquer tamanho de grupo e duração de isolamento.
5. **📻 Telecomunicações de Campo & Calculadora de Antenas:** Frequências de socorro oficiais do Brasil (PX 11m, VHF Marítimo Ch 16, Radioamadorismo / RENER Defesa Civil, Aeronáutico), Código Q com busca, Alfabeto Fonético ICAO e calculadora empírica para construir antenas dipolo com fio comum de luz.
6. **🚨 Central de Sinais de Socorro & Morse Ativo:** Farol de tela com padrão visual SOS em contraste máximo, sintetizador de áudio de 800 Hz em tempo real (100% offline via Web Audio), tradutor de texto para Morse, guia SAR terra-ar para helicópteros e códigos de apito de emergência.
7. **📄 Cartão Tático de Bolso Imprimível (A4 Dobrável):** Folha única de alta densidade pronta para impressão e dobra em 4 partes contendo contatos de socorro, ficha médica de identificação, protocolos de RCP/Heimlich, dosagem de hipoclorito para purificação de água e frequências de rádio.
8. **📚 Wikipédia Completa em Português (23+ GB):** Servidor Kiwix nativo integrado servindo mais de 1 milhão de artigos com imagens, enciclopédia médica e guias de viagem.
9. **🚑 Protocolos de Primeiros Socorros & Triagem:** Guias imediatos para Parada Cardíaca (RCP), Desengasgo (Heimlich), Hemorragias, Queimaduras e Acidentes com Animais Peçonhentos do Brasil (serpentes Jararaca/Cascavel e escorpiões).

---

## ⚡ Instalação Rápida (1 Clique)

### No Windows:
1. Clone o repositório ou baixe os arquivos para o seu computador ou HD externo:
   ```cmd
   git clone https://github.com/DougPomp/nomad-brasil.git
   cd nomad-brasil
   ```
2. Execute o instalador automático com 2 cliques ou pelo terminal:
   ```cmd
   setup-nomad-brasil.bat
   ```
   *O instalador criará os diretórios, fará o download automático do mapa vetorial do Brasil (`brazil-streets.pmtiles`), oferecerá o download do acervo da Wikipédia e subirá o Docker automaticamente.*

### No Linux / macOS / Raspberry Pi:
```bash
git clone https://github.com/DougPomp/nomad-brasil.git
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
│   │   ├── pois.json           # POIs estratégicos (Hospitais, Bombeiros, PRF, Água, Postos)
│   │   ├── radio_frequencies.json # Frequências oficiais (PX, VHF, Marítimo, Código Q)
│   │   ├── survival.json       # Manuais técnicos de resiliência e campo
│   │   └── routes_cache/       # Cache permanente em disco de todas as rotas traçadas
│   └── public/
│       ├── index.html          # Interface tática em dark mode responsivo
│       ├── styles.css          # Design system com sidebar lateral e gavetas móveis
│       ├── app.js              # Lógica de mapas, busca, rotas, POIs, Morse e estoque
│       ├── banner.svg          # Banner vetorizado da marca
│       ├── logo.svg            # Logotipo oficial
│       └── vendor/             # MapLibre GL e PMTiles 100% offline (zero CDNs)
├── docs/                       # Showcase publicado via GitHub Pages
│   ├── index.html              # Demonstração estática das ferramentas táticas
│   ├── banner.svg              # Imagem Open Graph / Twitter Card
│   ├── logo.svg                # Favicon
│   └── data/                   # Datasets para o showcase online
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
├── iniciar-nomad-brasil.bat    # Inicializador rápido diário
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
