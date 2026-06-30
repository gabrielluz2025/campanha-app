// ═══════════════════════════════════════════════════════════
// Constantes compartilhadas do sistema
// ═══════════════════════════════════════════════════════════

export const BAIRROS_BLUMENAU = [
  'Água Verde', 'Badenfurt', 'Boa Vista', 'Bom Retiro', 'Centro',
  'Escola Agrícola', 'Fidélis', 'Fortaleza', 'Fortaleza Alta', 'Garcia',
  'Glória', 'Itoupava Central', 'Itoupava Norte', 'Itoupava Seca', 'Itoupavazinha',
  'Jardim Blumenau', 'Nova Esperança', 'Passo Manso', 'Ponta Aguda', 'Progresso',
  'Ribeirão Fresco', 'Salto', 'Salto do Norte', 'Salto Weissbach', 'Testo Salto',
  'Tribess', 'Valparaíso', 'Velha', 'Velha Central', 'Velha Grande',
  'Victor Konder', 'Vila Formosa', 'Vila Itoupava', 'Vila Nova', 'Vorstadt',
]

export const REGIOES = {
  'Centro': ['Centro', 'Vorstadt', 'Victor Konder', 'Ponta Aguda', 'Jardim Blumenau', 'Salto'],
  'Norte':  ['Itoupava Norte', 'Itoupava Central', 'Itoupava Seca', 'Itoupavazinha', 'Escola Agrícola', 'Badenfurt', 'Testo Salto', 'Vila Itoupava'],
  'Sul':    ['Garcia', 'Glória', 'Velha', 'Velha Central', 'Velha Grande', 'Boa Vista', 'Valparaíso', 'Bom Retiro', 'Vila Formosa', 'Vila Nova'],
  'Leste':  ['Fortaleza', 'Fortaleza Alta', 'Fidélis', 'Progresso', 'Salto do Norte', 'Salto Weissbach', 'Tribess'],
  'Oeste':  ['Água Verde', 'Passo Manso', 'Nova Esperança', 'Ribeirão Fresco'],
}

// Paleta de cores para gráficos categóricos (Azul Royal + Cyan)
export const CHART_COLORS = ['#2563eb', '#06b6d4', '#22d3ee', '#3b82f6', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

// Normaliza string para comparação sem acentos, maiúsculas, sem pontuação
export function normStr(s) {
  return (s || '').toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Mapeamento de colégios eleitorais de Blumenau → bairro (fonte: TRE-SC oficial)
export const COLEGIO_BAIRRO = {
  'ASSOCIAÇÃO EDUCACIONAL E ASSISTENCIAL SHALOM': 'Garcia',
  'ASSOCIAÇÃO FRANCISCANA DE ENSINO SENHOR BOM JESUS': 'Centro',
  'CEDUPHH - CENTRO DE EDUCACAO PROFISSIONAL HERMANN HERING': 'Escola Agrícola',
  'CENTRO DE EDUCAÇÃO INFANTIL ALBERTO STEIN': 'Velha',
  'CENTRO DE EDUCAÇÃO INFANTIL PEDRO KRAUS': 'Vorstadt',
  'ESCOLA BARÃO DO RIO BRANCO': 'Centro',
  'ESCOLA BASICA MUNICIPAL FELIPE SCHMIDT': 'Itoupavazinha',
  'ESCOLA BASICA MUNICIPAL GUSTAVO RICHARD': 'Nova Esperança',
  'ESCOLA BASICA MUNICIPAL PROFESSOR JOÃO JOAQUIM FRONZA': 'Testo Salto',
  'ESCOLA BASICA MUNICIPAL TIRADENTES E PROFESSORA JULIA STRZALCOWSKA': 'Garcia',
  'ESCOLA BÁSICA MUNICIPAL ALBERTO STEIN': 'Velha',
  'ESCOLA BÁSICA MUNICIPAL ALICE THIELE': 'Garcia',
  'ESCOLA BÁSICA MUNICIPAL ALMIRANTE TAMANDARÉ': 'Ponta Aguda',
  'ESCOLA BÁSICA MUNICIPAL ANITA GARIBALDI': 'Itoupava Central',
  'ESCOLA BÁSICA MUNICIPAL ANNEMARIE TECHENTIN': 'Passo Manso',
  'ESCOLA BÁSICA MUNICIPAL CONSELHEIRO MAFRA': 'Velha Grande',
  'ESCOLA BÁSICA MUNICIPAL DUQUE DE CAXIAS': 'Itoupava Central',
  'ESCOLA BÁSICA MUNICIPAL FRANCISCO LANSER': 'Tribess',
  'ESCOLA BÁSICA MUNICIPAL GENERAL LÚCIO ESTEVES': 'Escola Agrícola',
  'ESCOLA BÁSICA MUNICIPAL HENRIQUE ALFARTH': 'Progresso',
  'ESCOLA BÁSICA MUNICIPAL LAURO MÜLLER': 'Badenfurt',
  'ESCOLA BÁSICA MUNICIPAL LEOBERTO LEAL': 'Salto do Norte',
  'ESCOLA BÁSICA MUNICIPAL MACHADO DE ASSIS': 'Itoupava Seca',
  'ESCOLA BÁSICA MUNICIPAL PEDRO I': 'Itoupava Central',
  'ESCOLA BÁSICA MUNICIPAL PEDRO II': 'Progresso',
  'ESCOLA BÁSICA MUNICIPAL PROFESSOR OSCAR UNBEHAUN': 'Água Verde',
  'ESCOLA BÁSICA MUNICIPAL PROFESSOR RODOLFO HOLLENWEGER': 'Fidélis',
  'ESCOLA BÁSICA MUNICIPAL PROFESSORA ADELAIDE STARKE': 'Itoupava Norte',
  'ESCOLA BÁSICA MUNICIPAL PROFESSORA ZULMA SOUZA DA SILVA': 'Velha Central',
  'ESCOLA BÁSICA MUNICIPAL QUINTINO BOCAIÚVA': 'Testo Salto',
  'ESCOLA BÁSICA MUNICIPAL VIDAL RAMOS': 'Vorstadt',
  'ESCOLA BÁSICA MUNICIPAL VISCONDE DE TAUNAY': 'Itoupava Central',
  'ESCOLA BÁSICA MUNICIPAL WILHELM THEODOR SCHURMANN': 'Itoupava Central',
  'ESCOLA DE EDUCAÇÃO BÁSICA ADOLPHO KONDER': 'Velha',
  'ESCOLA DE EDUCAÇÃO BÁSICA BRUNO HOELTGEBAUM': 'Fortaleza',
  'ESCOLA DE EDUCAÇÃO BÁSICA CARLOS TECHENTIN': 'Passo Manso',
  'ESCOLA DE EDUCAÇÃO BÁSICA CORONEL PEDRO CHRISTIANO FEDDERSEN': 'Vila Itoupava',
  'ESCOLA DE EDUCAÇÃO BÁSICA EMILIO BAUMGART': 'Itoupava Central',
  'ESCOLA DE EDUCAÇÃO BÁSICA GOVERNADOR CELSO RAMOS': 'Glória',
  'ESCOLA DE EDUCAÇÃO BÁSICA HERCÍLIO DEEKE': 'Velha Central',
  'ESCOLA DE EDUCAÇÃO BÁSICA JOÃO DURVAL MÜLLER': 'Velha Central',
  'ESCOLA DE EDUCAÇÃO BÁSICA JONAS ROSÁRIO COELHO NEVES': 'Fidélis',
  'ESCOLA DE EDUCAÇÃO BÁSICA PADRE JOSÉ MAURÍCIO': 'Progresso',
  'ESCOLA DE EDUCAÇÃO BÁSICA PROFESSOR JOÃO WIDEMANN': 'Itoupava Norte',
  'ESCOLA DE EDUCAÇÃO BÁSICA PROFESSOR LOTHAR KRIECK': 'Água Verde',
  'ESCOLA DE EDUCAÇÃO BÁSICA PROFESSORA ÁUREA PERPÉTUA GOMES': 'Salto do Norte',
  'ESCOLA DE EDUCAÇÃO BÁSICA PROFESSORA IZOLETE ELISA GOUVEIA': 'Valparaíso',
  'ESCOLA DE EDUCAÇÃO BÁSICA SANTOS DUMONT': 'Garcia',
  'ESCOLA DE EDUCAÇÃO BÁSICA SENADOR EVELÁSIO VIEIRA': 'Itoupavazinha',
  'ESCOLA DE EDUCAÇÃO BÁSICA VICTOR HERING': 'Vila Nova',
  'ESCOLA DE EDUCACAO BASICA DOUTOR MAX TAVARES DO AMARAL': 'Itoupava Norte',
  'ESCOLA DE EDUCAÇÃO BÁSICA PROFESSOR HERIBERTO JOSEPH MÜLLER': 'Fortaleza',
  'ESCOLA DE ENSINO FUNDAMENTAL JOSÉ VIEIRA CÔRTE': 'Progresso',
  'ESCOLA EDUCAÇÃO BÁSICA ERWIN RADTKE': 'Vila Itoupava',
  'ESCOLA MUNICIPAL FREDERICO SIEVERT': 'Vila Itoupava',
  'FACULDADE SENAC BLUMENAU': 'Ponta Aguda',
  'FURB - FUNDACAO UNIVERSIDADE REGIONAL DE BLUMENAU': 'Itoupava Seca',
  'PRÓ FAMÍLIA I - UNIDADE IDOSOS': 'Velha',
}

// Total de eleitores aptos por bairro (fonte: TRE-SC – Zona 3 e Zona 88)
export const ELEITORES_POR_BAIRRO = {
  'Água Verde':       10441,
  'Badenfurt':         6427,
  'Centro':           11198,
  'Escola Agrícola':  15174,
  'Fidélis':           3921,
  'Fortaleza':        13059,
  'Garcia':           15237,
  'Glória':            6635,
  'Itoupava Central': 28871,
  'Itoupava Norte':   16818,
  'Itoupava Seca':    16117,
  'Itoupavazinha':     7647,
  'Nova Esperança':    3504,
  'Passo Manso':       6514,
  'Ponta Aguda':       7799,
  'Progresso':        14050,
  'Salto do Norte':    9830,
  'Testo Salto':       6039,
  'Tribess':           7603,
  'Valparaíso':        4382,
  'Velha':            21737,
  'Velha Central':    18017,
  'Velha Grande':      3257,
  'Vila Itoupava':     4621,
  'Vila Nova':         5448,
  'Vorstadt':          3918,
}
