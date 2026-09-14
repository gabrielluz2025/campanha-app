/** Unifica listas BNU + Xanda + ADBLU, removendo duplicatas (prioriza quem tem endereço). */

function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
}

function extrairNumero(end) {
  const m = String(end || '').match(/,?\s*(\d{1,6})\b/)
  return m ? m[1] : ''
}

function extrairLogradouro(end) {
  return String(end || '').split(',')[0].replace(/\bS\s*\/\s*N\b/i, '').trim()
}

export function extrairCongregacaoAd(nome) {
  let n = norm(nome)
  n = n.replace(/ASSEMBLEIA DE DEUS/g, '').replace(/ADBLU/g, '').replace(/MISSOES/g, '')
  n = n.replace(/^(IGREJA|CONGREGACAO|TEMPLO)\s+/, '').trim()
  return n
}

export function congregacoesAdCompat(a, b) {
  const ta = extrairCongregacaoAd(a)
  const tb = extrairCongregacaoAd(b)
  if (!ta || !tb) return false
  if (ta === tb) return true
  if (ta.includes(tb) || tb.includes(ta)) return true
  const wa = ta.split(/\s+/).filter(t => t.length > 2)
  const wb = new Set(tb.split(/\s+/).filter(t => t.length > 2))
  if (!wa.length) return false
  const hit = wa.filter(t => wb.has(t)).length
  return hit >= 1 && hit / wa.length >= 0.6
}

const PRIOR_FONTE = { bnu: 30, xanda: 20, adblu: 10 }

function scoreItem(item) {
  let s = PRIOR_FONTE[item.fonteLista] || 0
  if (item.endereco) s += 15
  if (item.pastor) s += 4
  if (item.telefone || item.whatsapp) s += 3
  if (item.culto) s += 2
  if (item.bairro) s += 1
  return s
}

function chaveLista(item) {
  const num = extrairNumero(item.endereco)
  const log = norm(extrairLogradouro(item.endereco))
  if (num && log) return `addr:${log}:${num}`
  const cong = item.congregacao || extrairCongregacaoAd(item.nome)
  if (cong && cong.length >= 3) return `ad:${cong}`
  return `nm:${norm(item.nome)}:${norm(item.bairro)}`
}

function mergePar(a, b) {
  const pick = scoreItem(a) >= scoreItem(b) ? a : b
  const other = pick === a ? b : a
  return {
    ...other,
    ...pick,
    nome: pick.nome || other.nome,
    endereco: pick.endereco || other.endereco,
    bairro: pick.bairro || other.bairro,
    culto: pick.culto || other.culto,
    pastor: pick.pastor || other.pastor,
    telefone: pick.telefone || other.telefone,
    whatsapp: pick.whatsapp || other.whatsapp,
    congregacao: pick.congregacao || other.congregacao,
    setorNum: pick.setorNum || other.setorNum,
    fonteLista: pick.fonteLista || other.fonteLista,
    fontes: [...new Set([...(a.fontes || [a.fonteLista]), ...(b.fontes || [b.fonteLista])].filter(Boolean))],
  }
}

/** @param {import('../data/igrejasListaPapel').IgrejaListaPlanilha[]} listas */
export function unificarListasIgrejas(listas) {
  const map = new Map()
  for (const item of listas) {
    if (!item?.nome) continue
    const key = chaveLista(item)
    const cur = map.get(key)
    map.set(key, cur ? mergePar(cur, item) : { ...item, fontes: [item.fonteLista].filter(Boolean) })
  }
  return [...map.values()]
}
