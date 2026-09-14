/**
 * Catálogo de camadas públicas — geo.blumenau.sc.gov.br (ArcGIS REST)
 * MapServer tiles via export PNG; dados vetoriais (bairros/limite) em blumenauGeoApi.js
 */

export const BLUMENAU_GEO_CATEGORIES = {
  viario: { label: 'Sistema Viário', order: 1 },
  limites: { label: 'Limites', order: 2 },
  planejamento: { label: 'Planejamento Urbano', order: 3 },
  cadastro: { label: 'Cadastro & Lotes', order: 4 },
  meio_ambiente: { label: 'Meio Ambiente', order: 5 },
  defesa: { label: 'Defesa Civil & Geologia', order: 6 },
  drenagem: { label: 'Drenagem', order: 7 },
  infra: { label: 'Infraestrutura', order: 8 },
  mobilidade: { label: 'Mobilidade', order: 9 },
  estatisticos: { label: 'Dados Estatísticos', order: 10 },
}

/** Camadas raster (MapServer/export). id estável para persistência local. */
export const BLUMENAU_GEO_LAYERS = [
  // ── Sistema Viário ──
  {
    id: 'vias',
    label: 'Vias oficiais',
    category: 'viario',
    servicePath: 'Sistema_Viario/Vias/MapServer',
    layerId: 0,
    opacity: 0.72,
    defaults: { eleitoral: true, visitas: true, rotas: true },
  },
  {
    id: 'rodovias',
    label: 'Rodovias',
    category: 'viario',
    servicePath: 'Sistema_Viario/Rodovias/MapServer',
    layerId: 0,
    opacity: 0.85,
    defaults: { eleitoral: false, visitas: false, rotas: true },
  },
  {
    id: 'vias_projetadas',
    label: 'Vias projetadas',
    category: 'viario',
    servicePath: 'Sistema_Viario/Vias_Projetadas/MapServer',
    layerId: 0,
    opacity: 0.7,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  {
    id: 'buffer_vias_projetadas',
    label: 'Buffer vias projetadas',
    category: 'viario',
    servicePath: 'Sistema_Viario/Buffer_Vias_Projetadas/MapServer',
    layerId: 0,
    opacity: 0.55,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  {
    id: 'buffer_raios',
    label: 'Buffer raios viários',
    category: 'viario',
    servicePath: 'Sistema_Viario/Buffer_Raios/MapServer',
    layerId: 0,
    opacity: 0.5,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  {
    id: 'ppi',
    label: 'PPI (Plano Prioritário)',
    category: 'viario',
    servicePath: 'Sistema_Viario/PPI/MapServer',
    layerId: 0,
    opacity: 0.65,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  // ── Limites ──
  {
    id: 'limite_tile',
    label: 'Limite municipal (raster)',
    category: 'limites',
    servicePath: 'Limites/Limite_Municipal/MapServer',
    layerId: 0,
    opacity: 0.35,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  // ── Planejamento Urbano ──
  {
    id: 'zoneamento',
    label: 'Zoneamento',
    category: 'planejamento',
    servicePath: 'Planejamento_Urbano/Zoneamento/MapServer',
    layerId: 0,
    opacity: 0.55,
    defaults: { eleitoral: true, visitas: false, rotas: false },
  },
  {
    id: 'zeis',
    label: 'ZEIS',
    category: 'planejamento',
    servicePath: 'Planejamento_Urbano/ZEIS/MapServer',
    layerId: 0,
    opacity: 0.6,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  {
    id: 'aia',
    label: 'AIA',
    category: 'planejamento',
    servicePath: 'Planejamento_Urbano/AIA/MapServer',
    layerId: 0,
    opacity: 0.55,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  {
    id: 'corredor_servico',
    label: 'Corredor de serviço',
    category: 'planejamento',
    servicePath: 'Planejamento_Urbano/Corredor_servico/MapServer',
    layerId: 0,
    opacity: 0.6,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  {
    id: 'patrimonio_historico',
    label: 'Patrimônio histórico',
    category: 'planejamento',
    servicePath: 'Planejamento_Urbano/Patrimonio_Historico/MapServer',
    layerId: 0,
    opacity: 0.75,
    defaults: { eleitoral: true, visitas: false, rotas: false },
  },
  {
    id: 'marcos_historicos',
    label: 'Marcos históricos',
    category: 'planejamento',
    servicePath: 'Planejamento_Urbano/Marcos_Historicos/MapServer',
    layerId: 0,
    opacity: 0.85,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  {
    id: 'desapropriacao_aia',
    label: 'Desapropriação AIA',
    category: 'planejamento',
    servicePath: 'Planejamento_Urbano/Desapropriacao_Terreno_AIA/MapServer',
    layerId: 0,
    opacity: 0.6,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  {
    id: 'p3',
    label: 'P3',
    category: 'planejamento',
    servicePath: 'Planejamento_Urbano/P3/MapServer',
    layerId: 0,
    opacity: 0.55,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  // ── Cadastro ──
  {
    id: 'lotes_publicacao',
    label: 'Lotes (publicação)',
    category: 'cadastro',
    servicePath: 'Lotes/PUBLICACAO_LOTES/MapServer',
    layerId: 0,
    opacity: 0.45,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  {
    id: 'lotes_cadastro',
    label: 'Cadastro de lotes',
    category: 'cadastro',
    servicePath: 'Cadastro_Imobiliario/Lotes_Blumenau/MapServer',
    layerId: 0,
    opacity: 0.45,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  {
    id: 'lotes_ci',
    label: 'Lotes CI',
    category: 'cadastro',
    servicePath: 'Cadastro_Imobiliario/Lotes/MapServer',
    layerId: 0,
    opacity: 0.4,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  // ── Meio Ambiente ──
  {
    id: 'hidrografia',
    label: 'Hidrografia',
    category: 'meio_ambiente',
    servicePath: 'Meio_Ambiente/Hidrografia_consulta/MapServer',
    layerId: 0,
    opacity: 0.7,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  {
    id: 'hidrografia_principal',
    label: 'Hidrografia principal',
    category: 'meio_ambiente',
    servicePath: 'Meio_Ambiente/Hidrografia_Principal/MapServer',
    layerId: 0,
    opacity: 0.65,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  {
    id: 'app_curso_dagua',
    label: 'APP curso d\'água',
    category: 'meio_ambiente',
    servicePath: 'Meio_Ambiente/APP_CURSO_DAGUA/MapServer',
    layerId: 0,
    opacity: 0.55,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  {
    id: 'app_art4',
    label: 'APP Art. 4 CF',
    category: 'meio_ambiente',
    servicePath: 'Meio_Ambiente/APP_ART4_CF_Multipart/MapServer',
    layerId: 0,
    opacity: 0.5,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  {
    id: 'unidades_conservacao',
    label: 'Unidades de conservação',
    category: 'meio_ambiente',
    servicePath: 'Meio_Ambiente/Unidades_Conservacao/MapServer',
    layerId: 0,
    opacity: 0.6,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  {
    id: 'topo_morro',
    label: 'Topo de morro',
    category: 'meio_ambiente',
    servicePath: 'Meio_Ambiente/Topo_de_Morro_Consulta/MapServer',
    layerId: 0,
    opacity: 0.55,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  // ── Defesa Civil & Geologia ──
  {
    id: 'risco_deslizamento',
    label: 'Risco de deslizamento',
    category: 'defesa',
    servicePath: 'Geologia/Perigo_Risco_a_Deslizamento/MapServer',
    layerId: 0,
    opacity: 0.65,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  {
    id: 'cota_enchente_1983',
    label: 'Cota enchente 1983',
    category: 'defesa',
    servicePath: 'Defesa_Civil/Cota_Enchente_Antiga1983/MapServer',
    layerId: 0,
    opacity: 0.6,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  // ── Drenagem ──
  {
    id: 'rede_drenagem',
    label: 'Rede de drenagem',
    category: 'drenagem',
    servicePath: 'Drenagem/FSNE_Rede_Drenagem/MapServer',
    layerId: 0,
    opacity: 0.65,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  {
    id: 'drenagem_pluvial',
    label: 'Drenagem pluvial',
    category: 'drenagem',
    servicePath: 'Drenagem/REDE_DRENAGEM_PLUVIAL/MapServer',
    layerId: 0,
    opacity: 0.65,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  // ── Infraestrutura ──
  {
    id: 'linhas_celesc',
    label: 'Linhas Celesc',
    category: 'infra',
    servicePath: 'Obras_Infraestrutura/Linhas_Transmissao_Celesc/MapServer',
    layerId: 0,
    opacity: 0.75,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  {
    id: 'linhas_eletrosul',
    label: 'Linhas Eletrosul',
    category: 'infra',
    servicePath: 'Obras_Infraestrutura/Linhas_Transmissao_Eletrosul/MapServer',
    layerId: 0,
    opacity: 0.75,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  {
    id: 'buffer_celesc',
    label: 'Buffer linhas Celesc',
    category: 'infra',
    servicePath: 'Obras_Infraestrutura/Buffer_Linhas_Celesc/MapServer',
    layerId: 0,
    opacity: 0.45,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  {
    id: 'buffer_eletrosul',
    label: 'Buffer linhas Eletrosul',
    category: 'infra',
    servicePath: 'Obras_Infraestrutura/Buffer_Linhas_Eletrosul/MapServer',
    layerId: 0,
    opacity: 0.45,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
  // ── Mobilidade ──
  {
    id: 'ciclovias',
    label: 'Ciclovias',
    category: 'mobilidade',
    servicePath: 'CICLOVIAS/MAPA_CICLOVIAS/MapServer',
    layerId: 0,
    opacity: 0.85,
    defaults: { eleitoral: false, visitas: false, rotas: true },
  },
  // ── Estatísticos ──
  {
    id: 'dados_estatisticos',
    label: 'Dados estatísticos',
    category: 'estatisticos',
    servicePath: 'dadosestatisticos/dados_estatisticos/MapServer',
    layerId: 0,
    opacity: 0.6,
    defaults: { eleitoral: false, visitas: false, rotas: false },
  },
]

const LAYER_BY_ID = Object.fromEntries(BLUMENAU_GEO_LAYERS.map(l => [l.id, l]))

export function getGeoLayerById(id) {
  return LAYER_BY_ID[id] || null
}

export function defaultGeoLayersForScreen(screen) {
  const out = {}
  BLUMENAU_GEO_LAYERS.forEach(l => {
    out[l.id] = l.defaults?.[screen] ?? false
  })
  return out
}

export function resolveActiveTileLayers(active = {}) {
  const list = BLUMENAU_GEO_LAYERS.filter(l => active[l.id])
  return list.map((l, i) => ({
    id: l.id,
    servicePath: l.servicePath,
    layerId: l.layerId ?? 0,
    opacity: l.opacity ?? 0.75,
    zIndex: 350 + i,
  }))
}

export function countActiveGeoLayers(active = {}) {
  return BLUMENAU_GEO_LAYERS.filter(l => active[l.id]).length
}

export function layersByCategory() {
  const groups = {}
  BLUMENAU_GEO_LAYERS.forEach(l => {
    if (!groups[l.category]) groups[l.category] = []
    groups[l.category].push(l)
  })
  return Object.entries(BLUMENAU_GEO_CATEGORIES)
    .sort((a, b) => a[1].order - b[1].order)
    .map(([key, meta]) => ({ key, ...meta, layers: groups[key] || [] }))
    .filter(g => g.layers.length)
}
