import { BAIRROS_BLUMENAU } from '../../utils/constants'

export const STORAGE_SECOES_KEY = 'mapa_eleitoral_secoes'
export const BLUMENAU_COORD = { lat: -26.9194, lng: -49.0661 }

/** Setores de igreja → bairro eleitoral (Blumenau) */
export const SETOR_BAIRRO = {
  Sede: 'Victor Konder',
  Garcia: 'Garcia',
  Badenfurt: 'Badenfurt',
  Fortaleza: 'Fortaleza',
  'Escola Agrícola': 'Escola Agrícola',
  'Velha Central': 'Velha Central',
  'Itoupava Central': 'Itoupava Central',
  Betânia: 'Ponta Aguda',
  'Nova Jerusalém': 'Fidélis',
  Betesda: 'Itoupava Central',
  'Velha Grande': 'Velha Grande',
  Progresso: 'Progresso',
  Jerusalém: 'Água Verde',
  Araranguá: 'Garcia',
  'Itoupava Norte': 'Itoupava Norte',
  Morell: 'Testo Salto',
  'Vila Itoupava': 'Vila Itoupava',
  Moriá: 'Fortaleza Alta',
  'Água Verde': 'Água Verde',
  'América do Sol': 'Vila Nova',
  Missões: 'Centro',
  'Cidade Jardim': 'Velha',
  'Pérola do Vale': 'Salto Weissbach',
  Ristow: 'Escola Agrícola',
  Jordão: 'Itoupava Seca',
  'Pedro Krauss': 'Itoupavazinha',
  Itoupavazinha: 'Itoupavazinha',
  'Pôr do Sol': 'Ribeirão Fresco',
  'Monte Hermom': 'Progresso',
  'Nova Esperança': 'Nova Esperança',
  'Frederico Jensen': 'Salto',
  'Via Moinho': 'Escola Agrícola',
}

export const LENTES = [
  { id: 'radar', label: 'Radar', desc: 'Prioridade territorial composta' },
  { id: 'resultado', label: 'Resultado', desc: '% votos / aptos' },
  { id: 'forca', label: 'Força', desc: 'Cobertura da equipe' },
  { id: 'colegios', label: 'Colégios', desc: 'Locais de votação' },
]

export const SHEET_TABS = [
  { id: 'ranking', label: 'Ranking' },
  { id: 'plano', label: 'Plano' },
  { id: 'filtros', label: 'Filtros' },
]

export const FORM_SECAO_VAZIO = {
  bairro: BAIRROS_BLUMENAU[0],
  colegio: '',
  secao: '',
  totalEleitores: '',
  votosObtidos: '',
}
