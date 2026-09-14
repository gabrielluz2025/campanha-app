import { normStr } from './constants'
import { resolveBairroVotacao, zonaPertenceCidade } from './eleitoresHelpers'

export const COLEGIO_COORDS_KEY = 'geo_coords_colegios'

export function findTreLocal(nome, scDataFull, cidade = 'BLUMENAU') {
  const n = normStr(nome)
  const mun = normStr(cidade || 'BLUMENAU')
  const pool = (scDataFull || []).filter(r => normStr(r.municipio) === mun)
  let hit = pool.find(r => normStr(r.nome_local_votacao) === n)
  if (hit) return hit
  hit = pool.find(r =>
    n.length >= 18 && (normStr(r.nome_local_votacao).startsWith(n.slice(0, 18))
      || n.startsWith(normStr(r.nome_local_votacao).slice(0, 18))),
  )
  if (hit) return hit
  return pool.find(r =>
    (n.length >= 12 && normStr(r.nome_local_votacao).includes(n.slice(0, 12)))
    || (normStr(r.nome_local_votacao).length >= 12 && n.includes(normStr(r.nome_local_votacao).slice(0, 12))),
  ) || null
}

export function buildColegiosFromEleitores(
  dadosEleitores,
  scDataFull,
  treCtx,
  setorIgrejaMap = {},
  cidade = 'BLUMENAU',
) {
  if (!dadosEleitores?.zonas) return []
  const cidadeFoco = cidade || 'BLUMENAU'
  const out = []
  for (const z of dadosEleitores.zonas) {
    if (!zonaPertenceCidade(z, dadosEleitores, cidadeFoco)) continue
    for (const l of z.locais || []) {
      const bairro = resolveBairroVotacao(l, z, dadosEleitores, treCtx, { setorIgrejaMap })
      const votos = (l.secoes || []).reduce((s, sec) => s + (Number(sec.votos) || 0), 0)
      const tre = findTreLocal(l.nome, scDataFull, cidadeFoco)
      const endereco = tre?.endereco || l.endereco || ''
      const cep = tre?.cep || l.cep || ''
      out.push({
        id: l.id,
        nome: l.nome,
        bairro,
        zona: z.zona,
        votos,
        numSecoes: (l.secoes || []).length,
        endereco,
        cep,
        enderecoCompleto: [endereco, cep ? `CEP ${cep}` : '', cidadeFoco, 'SC'].filter(Boolean).join(', '),
      })
    }
  }
  return out.sort((a, b) => b.votos - a.votos)
}

/** Deslocamento estável para não sobrepor marcadores no centróide do bairro. */
export function offsetPorId(id, scale = 0.006) {
  let h = 0
  for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) % 1000
  const angle = (h / 1000) * Math.PI * 2
  const r = scale * (0.4 + (h % 600) / 1000)
  return [Math.sin(angle) * r, Math.cos(angle) * r]
}
