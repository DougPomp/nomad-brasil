<p align="center">
  <img src="docs/banner.svg" alt="NOMAD Brasil — Central de Sobrevivência, Mapas e Conhecimento 100% Offline" width="100%">
</p>

<p align="center">
  <a href="https://dougpomp.github.io/nomad-brasil/"><img src="https://img.shields.io/badge/Demo_Online-GitHub_Pages-10b981?style=for-the-badge&logo=github&logoColor=white" alt="Live Demo"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/Licen%C3%A7a-MIT-06b6d4?style=for-the-badge" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/Operacional-100%25_Offline-10b981?style=for-the-badge" alt="100% Offline">
  <img src="https://img.shields.io/badge/Docker-Pronto-2496ed?style=for-the-badge&logo=docker&logoColor=white" alt="Docker Ready">
  <img src="https://img.shields.io/badge/Módulos_Táticos-56_Completos-10b981?style=for-the-badge" alt="56 Módulos">
</p>

> **Sistema autônomo e resiliente de mapas vetoriais nacionais, rotas táticas de evacuação, enciclopédia completa e 56 módulos de sobrevivência, primeiros socorros e resiliência para o Brasil.**  
> Projetado para operar com **zero dependência de internet**, funcionando diretamente em notebook, HD externo, pendrive ou servidor local de campo (Docker).  
> 🌐 **Demonstração Online no GitHub Pages (PWA):** [https://dougpomp.github.io/nomad-brasil/](https://dougpomp.github.io/nomad-brasil/)

---

## 🧭 Visão Geral

O **NOMAD Brasil** é uma plataforma *open source* criada para prover infraestrutura crítica de informação durante apagões prolongados, catástrofes climáticas, colapso de redes ou operações de campo em áreas remotas do território nacional.

O sistema integra em uma interface tática ultra-rápida em *dark mode*:
- **🗺️ Cartografia Vetorial Offline & Detalhe Urbano (`z=14` / Zoom 18):** Cobertura do Brasil inteiro via PMTiles (1,57 GB) com MapLibre GL JS sem depender de serviços externos, pré-carregamento em 1 clique das vias residenciais de qualquer cidade (`z=14`), cache persistente em disco e geocodificação reversa offline no clique/botão direito (Decimal, DMS e UTM).
- **📍 Todos os 5.571 Municípios do IBGE + 416 mil+ Logradouros (SQLite FTS5):** Busca híbrida instantânea de cidades, ruas, avenidas, rodovias (`ref`) e POIs com sinônimos brasileiros (`Av`/`Avenida`, `Dr`/`Doutor`, `15`/`XV`), Radar de Socorro próximo (`🚑 Socorro`), prioridade por proximidade e auto-aprendizado em SQLite.
- **🚗 Rotas Táticas Quádruplas (OSRM + Grafo A\* MVT Offline):** Roteamento por rua ou município com OSRM online, cache permanente em disco, **grafo A\* curva a curva 100% offline sobre tiles MVT locais (até 30 km)**, corredor tático de contingência e exportação **GPX** para Garmin e OsmAnd.
- **📚 Acervo Enciclopédico Kiwix Integrado (23+ GB):** Wikipédia em português servida na porta 8090 com diagnóstico automático de livros ZIM e abertura direta de municípios do mapa na aba enciclopédia do portal.
- **💾 Persistência Tática & Backup Portátil:** Sincronização automática dos marcadores pessoais (Waypoints) em disco (`storage/user_waypoints.json`) + exportação/restauração completa em `.JSON` (`Waypoints`, `PEF`, `BOB` e `PACE`).
- **🛠️ 56 Módulos Especializados:** Guias interativos, calculadoras técnicas e protocolos operacionais para todas as dimensões de sobrevivência e autossuficiência.

---

## 🛡️ Arsenal de Módulos (56 Ferramentas)

### 1. 🗺️ Cartografia, Navegação & Deslocamento
1. **Mapas Nacionais em Nível de Ruas (`z=14` sob Demanda & Zoom 18):** Visualizador vetorial acelerado por GPU com camada de relevo, estradas, edificações, pré-carregamento urbano em lote (`z=14`) e destaque visual da rua selecionada.
2. **Busca Híbrida + Geocodificação Reversa Offline:** Motor local `brazil-streets.sqlite` integrado com sinônimos brasileiros e inspeção de qualquer ponto do mapa (clique ou botão direito) exibindo a via mais próxima, coordenadas **Decimal / DMS / UTM** e atalhos rápidos.
3. **Planejador de Rotas & Evacuação (OSRM + Grafo A\* Offline):** Autocomplete de ruas/cidades, cálculo offline curva a curva sobre tiles MVT locais em deslocamentos curtos, estimativa de combustível/água/calorias e exportação GPX.
4. **Radar de Socorro Próximo & Waypoints Persistentes:** Escaneamento instantâneo de hospitais, bombeiros/SAMU, PRF, postos e fontes de água em raios de `10`, `25` ou `50 km`, somado a marcadores pessoais salvos tanto no navegador quanto no servidor (`user_waypoints.json`) e backup completo em `.JSON`.
5. **Bússola Digital & Orientação Natural:** Rumo magnético, orientação solar por sombra de vareta e método analógico do relógio.
6. **Navegação Celeste (Hemisfério Sul):** Localização do Sul verdadeiro pelo Cruzeiro do Sul e constelação de Órion.
7. **Topografia de Expedição & Triangulação:** Leitura de cartas topográficas, cálculo de declividade e triangulação com bússola.
8. **Calculadora de Marcha & Navegação:** Ritmo de marcha militar, equação de Tobler para desníveis e gasto calórico.
9. **Mecânica de Emergência & Desatolamento:** Técnicas de ancoragem com guincho, estepe enterrado (deadman anchor) e reparos em campo.

### 2. 🩹 Primeiros Socorros & Atendimento Pré-Hospitalar (APH)
10. **Protocolos Imediatos de Suporte Básico:** Guias passo a passo para RCP (Parada Cardíaca), Manobra de Heimlich, Queimaduras e Convulsões.
11. **Trauma Grave — Protocolo TCCC / MARCHE:** Aplicação de torniquete tático, curativo compressivo israelense, selo de tórax valvulado e combate à hipotermia.
12. **Animais Peçonhentos do Brasil:** Identificação visual, tipo de veneno (crotálico, botrópico, elapídico) e soro antiofídico correspondente para Jararaca, Cascavel, Surucucu, Coral, Escorpiões e Aranhas.
13. **Fraturas, Luxações & Tração Óssea:** Protocolo de redução e alinhamento com talas rígidas e tração cutânea com teste obrigatório de **PMS** (Pulso, Motricidade, Sensibilidade).
14. **Suturas & Tratamento de Feridas na Mata:** Técnicas de assepsia de campo, aproximação com tiras adesivas, pontos simples e curativos com mel puro.
15. **Odontologia de Emergência & APH Bucomaxilar:** Alívio imediato de pulpite aguda, reimplante de dente avulsionado e hemostasia oral.
16. **Cinotécnica & APH Veterinário Canino (K9):** Parâmetros vitais de cães de trabalho, contenção tática, estancamento e intoxicação canina.
17. **Wikipédia Médica Completa:** Mais de 50.000 artigos médicos e farmacológicos servidos pelo Kiwix.

### 3. 📻 Telecomunicações, Rádio & Sinais de Emergência
18. **Central de Sinais de Socorro & Morse Ativo:** Sinalizador visual estroboscópico de tela, tradutor de texto para Morse e **sintetizador de áudio de 800 Hz** com trava de segurança anti-sobreposição.
19. **Frequências de Socorro do Brasil:** Frequências oficiais do Rádio Cidadão (PX Canal 9 - 27.065 MHz), VHF Marítimo (Canal 16 - 156.800 MHz), RENER (Defesa Civil) e Aviação (121.500 MHz).
20. **Calculadora de Antenas Dipolo:** Dimensionamento milimétrico de dipolos de meia onda utilizando fio comum de cobre.
21. **Código Q Oficial & Alfabeto ICAO:** Dicionário interativo com busca instantânea dos códigos de rádio operacionais.
22. **Sinais Terra-Ar para Resgate (SAR / ICAO):** Painéis e símbolos corporais para comunicação visual com aeronaves e helicópteros.
23. **Cifra Tática & Transmissão Segura:** Encriptação manual com Cifra de César, Cifra de Vigenère e bloco de uso único (One-Time Pad).
24. **Protocolo PACE de Comunicação:** Definição operacional das 4 camadas (Primary, Alternate, Contingency, Emergency) e janelas de escuta.
25. **Satélites Meteorológicos & Ciclo Lunar:** Previsão de passagens de satélites NOAA/GOES e tábua de luminosidade lunar.

### 4. 🌾 Resiliência Alimentar, Água & Agrofloresta
26. **Calculadora Tática de Racionamento:** Dimensionamento exato de água (3 L/dia/pessoa), calorias totais e cesta padrão nacional (arroz, feijão, aveia, sardinha, sal).
27. **Captação, Filtração & Cloração de Água:** Construção de biofiltros de areia/brita e tabela de dosagem de hipoclorito de sódio a 2,5%.
28. **Poço Caipira Manual & Carneiro Hidráulico:** Perfuração manual de poços rasos e montagem de bomba de carneiro sem energia elétrica.
29. **Plantas Alimentícias Não Convencionais (PANC):** Guia botânico de identificação e preparo de Ora-pro-nóbis, Taioba, Beldroega, Dente-de-leão e Caruru.
30. **Conservação Ancestral de Alimentos:** Defumação a frio/quente, cura com sal grosso, banha de porco (confit) e desidratação solar.
31. **Panificação Rústica & Fermentação Selvagem:** Cultivo e manutenção de fermento natural (*levain/sourdough*) e pães de panela de ferro.
32. **Apicultura Nativa & Abelhas Sem Ferrão (ASF):** Criação racional de espécies brasileiras (Jataí, Mandaçaia, Tiúba, Uruçu) e produção de mel medicinal.
33. **Piscicultura & Aquaponia Artesanal (IBC 1000L):** Criação sustentável de tilápias integrada ao cultivo de hortaliças em leito de brita.
34. **Banco de Sementes Crioulas & Hortas de Crise:** Métodos de coleta, secagem, armazenamento hermético em garrafas PET e plantio de subsistência.

### 5. ⚡ Energia, Infraestrutura & Sobrevivência Prática
35. **Calculadora Fotovoltaica Off-Grid:** Cálculo da potência de painéis solares (Wp), dimensionamento do banco de baterias e controlador MPPT.
36. **Baterias 18650 & Geradores Alternativos:** Recuperação de células de lítio, montagem de packs balanceados e geradores mecânicos.
37. **Gasogênio a Lenha (Wood Gas):** Fabricação de gasificador térmico para converter biomassa florestal em combustível de motores a pistão.
38. **Checklist de Mochila 72 Horas (BOB):** Inventário dinâmico dividido nas 7 linhas de resiliência com pesagem total em tempo real.
39. **Plano de Emergência Familiar (PEF):** Definição de rotas primárias de fuga, pontos de encontro (dentro/fora do bairro) e senhas familiares.
40. **Fogo em Condições Severas & Fogueira Dakota:** Técnicas de pederneira com fungo de árvore, fogo de atrito e buraco Dakota (chama invisível sem fumaça).
41. **Construção de Abrigos & Bioconstrução:** Técnicas de pau-a-pique, adobe, superadobe e abrigos rápidos de lona e folhagens.
42. **Manual Tático de Nós & Amarrações:** Nós de salvamento (Ás de Guia), tração (Caminhoneiro), junção (Nó de Escota) e pioneirias com bambu.
43. **Pesca & Armadilhas de Sobrevivência:** Arapucas para aves, laços de gatilho de mola e anzóis improvisados de osso/madeira.
44. **Meteorologia Empírica & Leitura de Nuvens:** Previsão do tempo sem barômetro através de nuvens cumulonimbus, névoa e comportamento animal.
45. **Sinais de Pista & Rastreamento Humano:** Identificação de passadas, leitura de compressão do solo e técnicas de contra-rastreamento.

### 6. 🛡️ Defesa Passiva, Proteção QBRN & Segurança
46. **Evasão Urbana & Conceito Gray Man:** Técnicas de blend-in civil, camuflagem comportamental e dispersão sem chamar atenção.
47. **Segurança Perimetral & Alertas de Intrusão:** Instalação de alarmes passivos de linha de tropeço (*tripwires* com espoleta/latinhas) e setores defensivos.
48. **Fortificação de Abrigos & Defesa Passiva:** Reforço de portas, barricadas de sacos de terra, blindagem balística e compartimentação de cômodos seguros.
49. **Gaiola de Faraday & Proteção EMP:** Construção de blindagens eletromagnéticas com caixas de munição e folhas de cobre para proteger rádios e baterias.
50. **Acidentes Radiológicos & Proteção QBRN:** Protocolos de blindagem radiológica (Tempo, Distância, Blindagem) e descontaminação pessoal.
51. **Biossegurança, Epidemias & Quarentena:** Protocolos de isolamento domiciliar, paramentação de proteção e saneamento básico de dejetos.
52. **Defesa Civil & Desastres Naturais do Brasil:** Procedimentos oficiais em inundações, enxurradas, deslizamentos de encostas e estiagens severas.

### 7. ⚒️ Oficinas Rústicas, Química & Ferramentaria
53. **Forja & Ferraria Rústica:** Montagem de forja de barro/tijolos, soprador de ar com ventoinha e têmpera de ferramentas em óleo.
54. **Cutelaria & Afiação de Campo:** Uso de pedras de rio, chairas e lixas para afiação de facões, machados e navalhas.
55. **Carvão Vegetal Ativado Medicinal & Filtros:** Pirólise controlada de cascas de coco/madeira e ativação com cloreto para uso antitóxico e em filtros.
56. **Química Prática & Sabão de Cinzas:** Saponificação tradicional utilizando lixívia de cinzas de madeira e gordura animal.
- **Cartão Tático de Bolso Imprimível (A4 Dobrável):** Folha única ultra-compacta contendo todas as frequências vitais, ficha médica, nós e protocolos de choque.
- **Pacote Portátil Offline:** Exportação compacta em arquivo único para armazenamento seguro em pen-drives criptografados.
- **Backup & Restauração Tática (.JSON):** Exportação e restauração portável de marcadores pessoais (Waypoints sincronizados no servidor), Plano de Emergência Familiar (PEF), Checklist da Mochila 72h (BOB) e Plano de Comunicação PACE.

---

## ⚡ Instalação Rápida (1 Clique)

### No Windows:
1. Clone o repositório ou baixe os arquivos para o seu computador:
   ```cmd
   git clone https://github.com/DougPomp/nomad-brasil.git
   cd nomad-brasil
   ```
2. Execute o instalador automático com 2 cliques ou pelo terminal:
   ```cmd
   setup-nomad-brasil.bat
   ```
   *O instalador cria a estrutura de diretórios, baixa o mapa vetorial do Brasil (`brazil-streets.pmtiles`), gera automaticamente o índice local de ruas em SQLite FTS5 (`storage/maps/brazil-streets.sqlite`), oferece o download da Wikipédia Kiwix e inicia os contêineres Docker automaticamente.*

   Caso deseje reconstruir manualmente o índice de ruas offline a partir do arquivo `brazil-streets.pmtiles`:
   ```cmd
   docker run --rm -v "C:\nomad-brasil:/repo" node:22-slim node /repo/app/build_streets_index.js
   ```

3. Para inicializações diárias rápidas:
   ```cmd
   iniciar-nomad-brasil.bat
   ```

### No Linux / macOS / Raspberry Pi:
```bash
git clone https://github.com/DougPomp/nomad-brasil.git
cd nomad-brasil
chmod +x setup-nomad-brasil.sh
./setup-nomad-brasil.sh
```
*O script também gera automaticamente o índice `storage/maps/brazil-streets.sqlite` (reconstruível via `docker run --rm -v "$(pwd):/repo" node:22-slim node /repo/app/build_streets_index.js`).*

---

## 🌐 Portas de Acesso Local

| Serviço | Endereço | Descrição |
| :--- | :--- | :--- |
| **Portal NOMAD Brasil** | [http://localhost:8000](http://localhost:8000) | Dashboard tático, mapa vetorial, rotas e 56 módulos de sobrevivência |
| **Biblioteca Kiwix** | [http://localhost:8090](http://localhost:8090) | Servidor e leitor nativo dos acervos ZIM da Wikipédia |

---

## 🛠️ Arquitetura do Sistema

```
nomad-brasil/
├── app/
│   ├── build_streets_index.js  # Indexador nacional PMTiles -> SQLite FTS5 com 416k+ ruas e POIs
│   ├── server.js               # Servidor HTTP Node.js 22 com Range 206, busca FTS5 /api/streets, cache z=14 e rotas
│   ├── data/
│   │   ├── cities.json         # Todos os 5.571 municípios do IBGE (UTF-8, DDD, Lat/Lng)
│   │   ├── emergencies.json    # Protocolos de atendimento pré-hospitalar
│   │   ├── pois.json           # POIs estratégicos (Hospitais, Bombeiros, PRF, Água, Postos)
│   │   ├── radio_frequencies.json # Frequências oficiais (PX, VHF, Marítimo, Código Q)
│   │   ├── survival.json       # Manuais técnicos de resiliência e campo
│   │   └── routes_cache/       # Cache permanente em disco de todas as rotas traçadas
│   └── public/
│       ├── index.html          # Interface tática em dark mode com os 56 módulos + backup JSON + Socorro
│       ├── styles.css          # Design system com sidebar tática e controles escuros
│       ├── app.js              # Mapas, geocodificação reversa, prefetch z=14, radar de socorro, rotas, backup
│       ├── sw.js               # Service Worker PWA (v10) para operação offline e Network-First nas APIs
│       ├── banner.svg          # Banner vetorizado da marca
│       ├── logo.svg            # Logotipo oficial
│       └── vendor/             # MapLibre GL e PMTiles 100% offline (zero CDNs)
├── docs/                       # Demonstração Web PWA no GitHub Pages
│   ├── index.html              # Showcase completo das ferramentas táticas + DMS/UTM + Backup JSON
│   ├── sw.js                   # Service Worker do GitHub Pages (v10)
│   ├── manifest.json           # Manifesto PWA instalável em smartphones e tablets
│   ├── banner.svg              # Imagem Open Graph / Twitter Card
│   └── logo.svg                # Favicon e ícones
├── storage/
│   ├── maps/
│   │   ├── brazil-streets.pmtiles      # Arquivo vetorial (1,57 GB, 1.186.952 tiles)
│   │   ├── brazil-streets.sqlite       # Índice SQLite FTS5 (WAL, ~48 MB, 416k+ vias + auto-aprendizado)
│   │   ├── detail_tiles_cache/         # Cache persistente em disco de tiles vetoriais z=14 (.pbf)
│   │   └── basemaps-assets/fonts/      # Glyphs Noto Sans locais
│   ├── user_waypoints.json             # Marcadores pessoais sincronizados automaticamente no servidor
│   └── zim/
│       ├── wikipedia_pt_all_maxi.zim   # Wikipédia Completa em Português
│       └── kiwix-library.xml           # Catálogo XML gerado
├── tools/                      # Utilitário go-pmtiles
├── docker-compose.yml          # Orquestração dos serviços (Web com storage rw e Kiwix ro)
├── setup-nomad-brasil.bat      # Instalador e downloader automático para Windows
├── setup-nomad-brasil.sh       # Instalador e downloader automático para Linux/macOS
├── iniciar-nomad-brasil.bat    # Inicializador rápido portátil (%~dp0)
└── README.md
```

---

## 🔍 Busca Nacional de Ruas, Pré-carregamento z=14 & Geocodificação Reversa

A pesquisa e inspeção de logradouros opera em 5 camadas integradas:
1. **Índice Local SQLite FTS5 (`brazil-streets.sqlite`):** Mais de **416.426** vias, rodovias (`ref`) e pontos de interesse extraídos de 184.493 tiles `z=13` cobrindo os 5.571 municípios brasileiros, com tokenização tolerante a acentos (`unicode61 remove_diacritics 2`), sinônimos brasileiros (`Av`↔`Avenida`, `Dr`↔`Doutor`, `15`↔`XV`) e ranking por proximidade ao centro atual do mapa.
2. **Inspeção Instantânea & Geocodificação Reversa Offline (`/api/streets/reverse`):** Clique em qualquer rua em zoom urbano (`>= 12.5`) ou clique com o botão direito em qualquer ponto do mapa para identificar a via mais próxima diretamente nos tiles locais (`brazil-streets.pmtiles` / `detail_tiles_cache`), ver coordenadas **Decimal / DMS / UTM** e acessar atalhos de rota, waypoint ou socorro próximo.
3. **Pré-carregamento Urbano por Cidade (`z=14` em 1 Clique):** No painel lateral da cidade selecionada, o botão **"Baixar Todas as Ruas da Cidade (Offline z=14)"** baixa em lote os tiles `z=14` ao redor do município via `/api/maps/prefetch-city`, salva em `storage/maps/detail_tiles_cache/` e indexa automaticamente todas as ruas residenciais no SQLite FTS5.
4. **Tiles Vetoriais de Detalhe sob Demanda (`z=14`):** Ao navegar por bairros no mapa, os tiles visitados também são persistidos e indexados em segundo plano.
5. **Descoberta Online Sob Demanda (`Photon` / `Nominatim`) com Persistência Offline:** Quando há conexão e uma rua residencial ainda não consta localmente, o backend consulta `Photon`/`Nominatim` e grava a via descoberta permanentemente no `brazil-streets.sqlite`.

---

## 🚗 Sistema de Rotas Táticas & Radar de Apoio

O sistema possui quádrupla camada de resiliência para cálculo de deslocamentos (entre municípios ou **porta a porta por rua/logradouro**) somada ao Radar de Socorro (`🚑 Socorro`):
1. **Camada 1 — Rodovias & Vias Urbanas Reais (Online/OSRM):** Traçado geográfico fiel às ruas locais e rodovias federais/estaduais com guia curva a curva.
2. **Camada 2 — Cache Permanente em Disco:** Qualquer rota pesquisada uma única vez é gravada localmente em `app/data/routes_cache/`.
3. **Camada 3 — Grafo A\* Offline sobre Tiles MVT Locais (até 30 km):** Sem internet e sem rota prévia em cache, o servidor extrai a malha viária dos tiles locais (`z=13` e `detail_tiles_cache` `z=14`) e calcula uma rota curva a curva real pelo algoritmo A\* com hierarquia viária.
4. **Camada 4 — Corredor Tático de Contingência:** Para trajetos intermunicipais inéditos acima de 30 km sem sinal, calcula o corredor com fator de curvatura nacional (`1,28x`) e municípios de apoio no percurso, mantendo exportação **GPX** universal para Garmin e OsmAnd.

---

## 📡 Referência de Endpoints da API Local (`:8000`)

| Método & Rota | Descrição Operacional |
| :--- | :--- |
| `GET /api/status` | Diagnóstico ao vivo: contagem de municípios IBGE, logradouros SQLite FTS5 (`streetsCount`), tiles `z=14` em cache (`detailTilesCachedCount`), rotas salvas (`routesCachedCount`), arquivos ZIM (`zimFilesCount`) e livro primário (`primaryZimBook`). |
| `GET /api/cities` | Lista e filtra os 5.571 municípios brasileiros por nome, UF, região, código IBGE e prefixo DDD. |
| `GET /api/streets` | Busca híbrida de ruas, avenidas, rodovias (`ref`) e POIs em SQLite FTS5 com sinônimos brasileiros, prioridade por proximidade e auto-aprendizado online opcional (`Photon`/`Nominatim`). |
| `GET /api/streets/reverse` | Geocodificação reversa offline (`?lat=...&lng=...`) sobre tiles MVT locais (`z=13`/`z=14`) retornando a via mais próxima, distância em metros, município e POIs próximos. |
| `GET /api/nearby-support` | Radar de apoio próximo (`?lat=...&lng=...&radiusKm=25&category=all`) combinando base estratégica (`pois.json`) e POIs extraídos do mapa vetorial no SQLite. |
| `GET / POST /api/maps/prefetch-city` | Pré-carrega em lote os tiles vetoriais `z=14` ao redor de uma cidade e indexa automaticamente todas as vias residenciais no `brazil-streets.sqlite`. |
| `GET / POST /api/waypoints` | Lê e persiste em disco (`storage/user_waypoints.json`) os marcadores táticos pessoais do mapa. |
| `GET /api/route` | Calcula rotas veiculares, 4x4 ou a pé com quádruplo fallback: OSRM online -> cache permanente em disco -> grafo A\* offline sobre MVT (`forceOfflineGraph=1` força o modo offline) -> corredor tático. |
| `GET /api/route/gpx` | Exporta qualquer rota calculada em arquivo `.gpx` padrão para Garmin, OsmAnd e aplicativos offline. |
| `GET /api/kiwix/resolve` | Detecta os livros `.zim` instalados em `storage/zim/` e resolve URLs diretas de artigo e busca para o leitor Kiwix (`:8090`). |

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
