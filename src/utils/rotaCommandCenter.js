import {
  detalheParada, resumoExecucao, gpsEstaAoVivo, gpsPosicaoVisivel, execucaoEstaEncerrada,
} from './rotaShare'
import { haversineKm } from './rotaUtils'

export function calcularKpisCommandCenter({ execucoes = {}, rotas = [], agoraLive = Date.now() } = {}) {
  const packs = Object.values(execucoes).filter(p => !execucaoEstaEncerrada(p?.exec, p?.share))
  const aoVivo = packs.filter(p => gpsEstaAoVivo(p?.exec?.posicao, agoraLive)).length
  const aguardando = packs.filter(p => !gpsPosicaoVisivel(p?.exec?.posicao, agoraLive)).length
  const visiveis = packs.filter(p => gpsPosicaoVisivel(p?.exec?.posicao, agoraLive)).length

  let visitas = 0
  let totalParadas = 0
  for (const pack of packs) {
    const rid = pack.share?.rotaId || pack.exec?.rotaId
    const rota = rotas.find(r => String(r.id) === String(rid))
    const paradas = (rota?.paradas || pack.share?.paradas || []).filter(p => p?.key && !String(p.key).startsWith('equipe:'))
    totalParadas += paradas.length
    const res = resumoExecucao(pack.exec, paradas)
    visitas += res.visitadas || 0
  }

  return {
    equipesCampo: packs.length,
    aoVivo,
    aguardandoGps: aguardando,
    comGps: visiveis,
    visitas,
    totalParadas,
    pctVisitas: totalParadas ? Math.round((visitas / totalParadas) * 100) : 0,
  }
}

export function calcularAlertasLive({ execucoes = {}, rotas = [], agoraLive = Date.now() } = {}) {
  const alertas = []
  for (const pack of Object.values(execucoes)) {
    if (execucaoEstaEncerrada(pack?.exec, pack?.share)) continue
    const sid = pack.share?.shareId || pack.exec?.shareId
    const rid = pack.share?.rotaId || pack.exec?.rotaId
    const nome = pack.share?.nome || pack.exec?.membroNome || 'Equipe'
    const pos = pack.exec?.posicao

    if (!gpsPosicaoVisivel(pos, agoraLive)) {
      alertas.push({
        id: `wait-${sid}`,
        tipo: 'aguardando',
        severity: 'info',
        titulo: nome,
        msg: 'Link enviado — aguardando GPS do celular',
        rotaId: rid,
        shareId: sid,
      })
      continue
    }

    const t = new Date(pos?.atualizadoEm || 0).getTime()
    const idleMin = Number.isFinite(t) ? (agoraLive - t) / 60000 : 999
    if (idleMin > 5 && gpsPosicaoVisivel(pos, agoraLive)) {
      alertas.push({
        id: `idle-${sid}`,
        tipo: 'gps_parado',
        severity: 'warn',
        titulo: nome,
        msg: `GPS sem atualizar há ${Math.round(idleMin)} min`,
        rotaId: rid,
        shareId: sid,
      })
    }

    const rota = rotas.find(r => String(r.id) === String(rid))
    const paradas = (rota?.paradas || pack.share?.paradas || []).filter(p => p?.key && !String(p.key).startsWith('equipe:'))
    const prox = paradas.find(p => {
      const st = detalheParada(pack.exec, p.key).status || 'pendente'
      return st !== 'concluido' && st !== 'nao_visitou'
    })
    if (prox?.lat && prox?.lng && pos?.lat) {
      const km = haversineKm(pos, prox)
      if (km > 25) {
        alertas.push({
          id: `far-${sid}`,
          tipo: 'longe',
          severity: 'warn',
          titulo: nome,
          msg: `~${km.toFixed(1)} km da próxima parada (${prox.nome || 'parada'})`,
          rotaId: rid,
          shareId: sid,
        })
      }
    }
  }
  return alertas.sort((a, b) => (a.severity === 'warn' ? -1 : 1))
}

export function calcularTimelineDia({ execucoes = {}, rotas = [], agoraLive = Date.now() } = {}) {
  const eventos = []
  for (const pack of Object.values(execucoes)) {
    if (execucaoEstaEncerrada(pack?.exec, pack?.share)) continue
    const rid = pack.share?.rotaId || pack.exec?.rotaId
    const rota = rotas.find(r => String(r.id) === String(rid))
    const paradas = (rota?.paradas || pack.share?.paradas || []).filter(p => p?.key && !String(p.key).startsWith('equipe:'))
    const nomeRota = pack.share?.nome || rota?.nome || 'Rota'

    for (let i = 0; i < paradas.length; i++) {
      const p = paradas[i]
      const det = detalheParada(pack.exec, p.key)
      const st = det.status || 'pendente'
      eventos.push({
        id: `${rid}-${p.key}`,
        rotaId: rid,
        shareId: pack.share?.shareId,
        hora: p.horaPrevista || `${String(8 + i).padStart(2, '0')}:00`,
        nome: p.nome || p.key,
        status: st,
        ordem: i + 1,
        rotaNome: nomeRota,
        aoVivo: gpsEstaAoVivo(pack.exec?.posicao, agoraLive),
      })
    }
  }
  return eventos.sort((a, b) => String(a.hora).localeCompare(String(b.hora)))
}
