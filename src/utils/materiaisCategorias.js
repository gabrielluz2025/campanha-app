/** Categorias de materiais (padrão + personalizadas). */

import { writeStorage, readStorage } from './persist'

export const KEY_CATEGORIAS = 'materiais_categorias'

/** Cores padrão — nomes fixos do sistema. */
export const CORES_CAT_PADRAO = {
  Santinhos: '#3b82f6',
  Bandeiras: '#f59e0b',
  Adesivos: '#10b981',
  Camisetas: '#06b6d4',
  Bonés: '#ec4899',
  Panfletos: '#8b5cf6',
  Canetas: '#f97316',
  Outros: '#94a3b8',
  Parachoque: '#22c55e',
  Botton: '#a855f7',
  Perfurado: '#3b82f6',
  Parabrisa: '#06b6d4',
  'Wind banner': '#f59e0b',
  Bandeira: '#ef4444',
  Carta: '#eab308',
}

const CORES_FALLBACK = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#06b6d4', '#ec4899', '#f97316', '#22c55e', '#a855f7',
]

function normCat(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function loadCategoriasCustom() {
  const raw = readStorage(KEY_CATEGORIAS, [])
  if (!Array.isArray(raw)) return []
  return raw
    .map(c => {
      if (typeof c === 'string') {
        const nome = c.trim()
        return nome ? { nome, cor: corParaNome(nome) } : null
      }
      if (c && typeof c === 'object' && c.nome) {
        const nome = String(c.nome).trim()
        if (!nome) return null
        return { nome, cor: String(c.cor || '').trim() || corParaNome(nome) }
      }
      return null
    })
    .filter(Boolean)
}

function corParaNome(nome) {
  const n = normCat(nome)
  let h = 0
  for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0
  return CORES_FALLBACK[h % CORES_FALLBACK.length]
}

export function saveCategoriasCustom(lista) {
  const uniq = new Map()
  for (const c of lista || []) {
    const nome = String(c?.nome || '').trim()
    if (!nome) continue
    const key = normCat(nome)
    if (uniq.has(key)) continue
    uniq.set(key, { nome, cor: String(c.cor || '').trim() || corParaNome(nome) })
  }
  const out = [...uniq.values()]
  writeStorage(KEY_CATEGORIAS, out)
  return out
}

/** Mapa nome → cor (padrão + custom). */
export function mapaCoresCategorias(custom = null) {
  const map = { ...CORES_CAT_PADRAO }
  for (const c of custom || loadCategoriasCustom()) {
    if (c?.nome) map[c.nome] = c.cor || corParaNome(c.nome)
  }
  return map
}

/** Lista de nomes de categoria (padrão + custom, sem duplicata). */
export function listarCategorias(custom = null) {
  const cores = mapaCoresCategorias(custom)
  return Object.keys(cores)
}

export function adicionarCategoria(nome, cor = '') {
  const n = String(nome || '').trim()
  if (!n) return { ok: false, erro: 'Informe o nome da categoria.' }
  const key = normCat(n)
  const padraoKeys = new Set(Object.keys(CORES_CAT_PADRAO).map(normCat))
  const atuais = loadCategoriasCustom()
  if (padraoKeys.has(key) || atuais.some(c => normCat(c.nome) === key)) {
    return { ok: false, erro: 'Essa categoria já existe.', nome: n }
  }
  const lista = saveCategoriasCustom([
    ...atuais,
    { nome: n, cor: String(cor || '').trim() || corParaNome(n) },
  ])
  return { ok: true, lista, nome: n }
}

/** Une listas de categorias por nome normalizado. */
export function mergeCategoriasListas(a, b) {
  const map = new Map()
  for (const list of [a, b]) {
    for (const c of Array.isArray(list) ? list : []) {
      const nome = typeof c === 'string' ? c.trim() : String(c?.nome || '').trim()
      if (!nome) continue
      const key = normCat(nome)
      if (map.has(key)) continue
      map.set(key, {
        nome,
        cor: (typeof c === 'object' && c?.cor) ? String(c.cor) : corParaNome(nome),
      })
    }
  }
  return [...map.values()].sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'))
}
