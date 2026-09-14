import { useEffect, useState } from 'react'
import { Radio, Camera, AlertTriangle, Navigation2, MapPin, Share2, Square, X, ExternalLink } from 'lucide-react'
import {
  detalheParada, resumoExecucao, MOTIVOS_NAO_VISITA, gpsPosicaoVisivel, execucaoEstaEncerrada,
  fetchSharePublica,
} from '../utils/rotaShare'
import { paradasParaPainelAoVivo, resolverMembroRota, formatEnderecoParada, formatDistanciaKm, haversineKm, linkGoogleMapsDaLocalizacao, estaNoLocalParada, distanciaMetrosParada, coordValida, enderecoTextoUtil } from '../utils/rotaUtils'

function labelStatus(st) {
  if (st === 'concluido') return { label: 'Visitada', cor: '#34d399' }
  if (st === 'nao_visitou') return { label: 'Não visitada', cor: '#f87171' }
  if (st === 'reagendar') return { label: 'Reagendar', cor: '#fb923c' }
  if (st === 'em_deslocamento') return { label: 'A caminho', cor: '#22d3ee' }
  if (st === 'no_local') return { label: 'No local', cor: '#fbbf24' }
  return { label: 'Pendente', cor: '#94a3b8' }
}

function haQuanto(iso) {
  if (!iso) return ''
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 20) return 'agora'
  if (s < 60) return `há ${Math.round(s)}s`
  if (s < 3600) return `há ${Math.round(s / 60)} min`
  return `há ${Math.round(s / 3600)} h`
}

function proximaParada(exec, paradas) {
  return paradas.find((p) => {
    const st = detalheParada(exec, p.key).status || 'pendente'
    return st !== 'concluido' && st !== 'nao_visitou' && st !== 'reagendar' && st !== 'cancelado'
  }) || null
}

function labelParada(p, i) {
  const nome = String(p?.nome || '').trim()
  if (nome) return nome
  const key = String(p?.key || '')
  if (key.startsWith('igreja:')) return `Igreja ${key.slice(7)}`
  if (key.startsWith('agenda:')) return 'Evento na agenda'
  if (key.startsWith('material:')) return 'Entrega de material'
  return `Parada ${i + 1}`
}

export default function RotasAoVivo({
  rotas = [],
  execucoes = {},
  membros = [],
  igrejas = [],
  bairrosCoords = null,
  rotaAtivaId,
  liveSeguir = true,
  onSelectRota,
  onEnviarLink,
  onEncerrar,
  onAbrirEncerrar,
}) {
  const [shareRemoto, setShareRemoto] = useState({})
  const [fotoAmpliada, setFotoAmpliada] = useState(null)

  useEffect(() => {
    const ids = Object.values(execucoes)
      .map(p => p.share?.shareId)
      .filter(Boolean)
    let cancel = false
    ids.forEach((shareId) => {
      fetchSharePublica(shareId).then((s) => {
        if (!cancel && s?.paradas?.length) {
          setShareRemoto(prev => ({ ...prev, [shareId]: s }))
        }
      })
    })
    return () => { cancel = true }
  }, [execucoes])

  const packsAtivos = Object.values(execucoes)
    .filter(pack => {
      const rid = pack.share?.rotaId || pack.exec?.rotaId
      const rota = rotas.find(r => String(r.id) === String(rid))
      return !execucaoEstaEncerrada(pack?.exec, pack?.share, rota)
    })

  const cards = packsAtivos
    .filter(pack => gpsPosicaoVisivel(pack?.exec?.posicao))
    .map(pack => {
      const rid = pack.share?.rotaId || pack.exec?.rotaId
      const sid = pack.share?.shareId || pack.exec?.shareId
      const rota = rotas.find(r => String(r.id) === String(rid)) || {
        id: rid,
        nome: pack.share?.nome || pack.exec?.membroNome || 'Rota',
        paradas: pack.share?.paradas || [],
      }
      const shareParadas = shareRemoto[sid]?.paradas || pack.share?.paradas || []
      const paradas = paradasParaPainelAoVivo(
        rota.paradas,
        igrejas,
        membros,
        bairrosCoords,
        shareParadas,
      )
      const resumo = resumoExecucao(pack.exec, paradas)
      return { rota, pack, resumo, paradas, shareId: sid }
    })
    .sort((a, b) => new Date(b.pack.exec.posicao?.atualizadoEm || 0) - new Date(a.pack.exec.posicao?.atualizadoEm || 0))

  const aguardando = packsAtivos.filter(pack => !gpsPosicaoVisivel(pack?.exec?.posicao))

  const emGps = cards.filter(c => Number.isFinite(c.pack.exec?.posicao?.lat)).length

  if (!cards.length) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-4 pb-8 space-y-3">
        <div className="rounded-2xl p-4 text-center"
          style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.18)' }}>
          <span className="inline-flex w-10 h-10 rounded-2xl items-center justify-center mb-2"
            style={{ background: 'rgba(16,185,129,0.16)', color: '#6ee7b7' }}>
            <Radio size={18}/>
          </span>
          <p className="font-bold" style={{ fontSize: 14, color: '#fff' }}>Sala ao vivo</p>
          <p className="mt-1.5" style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.45 }}>
            {aguardando.length
              ? `${aguardando.length} rota(s) com link enviado — aguardando o celular abrir o link e permitir GPS.`
              : 'Ninguém no GPS agora. O membro precisa abrir o link da campanha no celular e permitir a localização.'}
          </p>
          {onEnviarLink && (
            <button type="button" onClick={onEnviarLink}
              className="mt-3 inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold"
              style={{ background: 'rgba(16,185,129,0.2)', color: '#6ee7b7' }}>
              <Share2 size={13}/> Gerar link da rota
            </button>
          )}
        </div>
        {aguardando.map(pack => {
          const rid = pack.share?.rotaId || pack.exec?.rotaId
          const rota = rotas.find(r => String(r.id) === String(rid))
          const membro = resolverMembroRota(membros, {
            membroId: pack.share?.membroId || pack.exec?.membroId,
            membroNome: pack.share?.membro || pack.exec?.membroNome,
          })
          return (
            <div key={pack.share?.shareId || rid}
              className="rounded-2xl px-3 py-3 flex items-center gap-3"
              style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.22)' }}>
              <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(251,191,36,0.16)', color: '#fcd34d' }}>
                <Navigation2 size={16}/>
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-bold truncate" style={{ fontSize: 13, color: '#fde68a' }}>
                  {rota?.nome || pack.share?.nome || 'Rota em campo'}
                </p>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {membro?.nome || pack.share?.membro || 'Equipe'} · aguardando GPS do celular
                </p>
                {onAbrirEncerrar && (
                  <button type="button"
                    onClick={() => onAbrirEncerrar({ rotaIdsPreselect: rid ? [rid] : [] })}
                    className="mt-1 text-[10px] font-bold underline"
                    style={{ color: '#94a3b8' }}>
                    Rota já feita? Encerrar ao vivo
                  </button>
                )}
              </div>
              {onEnviarLink && (
                <button type="button" onClick={onEnviarLink}
                  className="text-[10px] font-bold px-2 py-1 rounded-lg"
                  style={{ background: 'rgba(251,191,36,0.18)', color: '#fcd34d' }}>
                  Reenviar
                </button>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-8 space-y-2">
      <div className="flex items-center gap-1.5 px-0.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: '#34d399' }} />
        <Radio size={12} style={{ color: '#6ee7b7' }} />
        <p className="font-bold" style={{ fontSize: 12, color: '#6ee7b7' }}>Ao vivo</p>
        <p style={{ fontSize: 10, color: 'var(--text-faint)' }}>
          {cards.length} rota{cards.length > 1 ? 's' : ''}
          {emGps ? ` · ${emGps} com GPS` : ''}
          {liveSeguir ? ' · mapa seguindo' : ''}
        </p>
        {onAbrirEncerrar && (cards.length > 0 || aguardando.length > 0) && (
          <button type="button"
            onClick={() => onAbrirEncerrar({})}
            className="ml-auto text-[10px] font-bold px-2 py-1 rounded-lg"
            style={{ background: 'rgba(248,113,113,0.14)', color: '#fca5a5' }}>
            <Square size={10} className="inline mr-0.5"/> Encerrar / concluir
          </button>
        )}
      </div>

      {cards.map(({ rota, pack, resumo, paradas, shareId }) => {
        const ativa = String(rota.id) === String(rotaAtivaId)
        const exec = pack.exec
        const proxima = proximaParada(exec, paradas)
        const gps = exec.posicao
        const membro = resolverMembroRota(membros, {
          membroId: pack.share?.membroId || exec.membroId,
          membroNome: pack.share?.membro || exec.membroNome,
        })
        const quando = haQuanto(gps?.atualizadoEm || exec.atualizadoEm)
        const fotosCampo = paradas
          .map((p, i) => {
            const d = detalheParada(exec, p.key)
            if (!d.foto) return null
            return { key: p.key, foto: d.foto, nome: labelParada(p, i), quando: d.confirmadoEm || d.atualizadoEm }
          })
          .filter(Boolean)

        return (
          <div key={rota.id} className="rounded-2xl overflow-hidden"
            style={{
              background: ativa ? 'rgba(16,185,129,0.12)' : 'rgba(0,0,0,0.22)',
              border: `1px solid ${ativa ? 'rgba(52,211,153,0.4)' : 'rgba(255,255,255,0.06)'}`,
            }}>
          <button type="button"
            onClick={() => onSelectRota?.(rota.id, gps)}
            className="w-full text-left px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 flex items-center justify-center"
                  style={{ background: '#059669', color: '#fff', fontWeight: 800, fontSize: 13 }}>
                  {membro?.foto
                    ? <img src={membro.foto} alt="" className="w-full h-full object-cover"
                        style={{ objectPosition: `${membro.fotoX ?? 50}% ${membro.fotoY ?? 50}%` }}/>
                    : (membro?.nome || pack.share?.membro || 'E').trim().charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="font-bold truncate" style={{ fontSize: 13, color: '#fff' }}>{rota.nome}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                    {membro?.nome || pack.share?.membro || exec.membroNome || 'Equipe'}
                    {quando ? ` · ${quando}` : ''}
                  </p>
                </div>
              </div>
              <span className="flex-shrink-0 font-extrabold" style={{ fontSize: 13, color: '#6ee7b7' }}>{resumo.pct}%</span>
            </div>

            <div className="h-1.5 rounded-full mt-2 overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
              <div className="h-full rounded-full" style={{
                width: `${resumo.pct}%`,
                background: 'linear-gradient(90deg,#34d399,#10b981)',
              }} />
            </div>
            <p className="mt-1" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
              {resumo.visitadas} visitadas · {resumo.justificadas} justificadas · {resumo.andamento} em campo
            </p>

            {proxima && (
              <div className="mt-1.5">
                <p className="truncate font-semibold" style={{ fontSize: 11, color: '#67e8f9' }}>
                  Próxima: {labelParada(proxima, paradas.indexOf(proxima))}
                  {proxima.horaPrevista ? ` · ${proxima.horaPrevista}` : ''}
                  {gps?.lat && coordValida(proxima.lat, proxima.lng)
                    ? ` · ${formatDistanciaKm(haversineKm(gps, proxima))}`
                    : ''}
                </p>
                {gps?.lat && proxima?.lat && estaNoLocalParada(gps, proxima) && detalheParada(exec, proxima.key).status === 'pendente' && (
                  <p style={{ fontSize: 10, color: '#fbbf24' }}>
                    GPS no local (~{Math.round(distanciaMetrosParada(gps, proxima))} m) — aguardando confirmação no celular
                  </p>
                )}
                {(formatEnderecoParada(proxima) || proxima.enderecoCurto) && (
                  <p className="truncate" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                    <MapPin size={9} className="inline mr-0.5"/>
                    {formatEnderecoParada(proxima) || proxima.enderecoCurto}
                  </p>
                )}
                {(coordValida(proxima.lat, proxima.lng) || enderecoTextoUtil(formatEnderecoParada(proxima))) && (
                  <a
                    href={linkGoogleMapsDaLocalizacao([proxima])}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={e => e.stopPropagation()}
                    className="inline-flex items-center gap-0.5 mt-0.5"
                    style={{ fontSize: 9, color: '#7dd3fc' }}
                  >
                    <ExternalLink size={9}/> Ver no Google Maps
                  </a>
                )}
              </div>
            )}
            {gps?.lat
              ? (
                <p style={{ fontSize: 10, color: '#6ee7b7' }}>
                  GPS no mapa · {Number(gps.lat).toFixed(5)}, {Number(gps.lng).toFixed(5)}
                </p>
              )
              : <p style={{ fontSize: 10, color: '#fbbf24' }}>Aguardando o celular abrir o link da campanha (Maps sozinho não envia GPS)</p>}

            {fotosCampo.length > 0 && (
              <div className="mt-2 rounded-xl p-2"
                style={{ background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(52,211,153,0.22)' }}>
                <p className="font-bold mb-1.5 flex items-center gap-1" style={{ fontSize: 10, color: '#6ee7b7' }}>
                  <Camera size={11}/> Fotos do campo ({fotosCampo.length})
                </p>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                  {fotosCampo.map(f => (
                    <button key={f.key} type="button" onClick={(e) => { e.stopPropagation(); setFotoAmpliada(f) }}
                      className="flex-shrink-0 rounded-lg overflow-hidden"
                      style={{ width: 56, height: 56, border: '2px solid rgba(52,211,153,0.45)' }}>
                      <img src={f.foto} alt="" className="w-full h-full object-cover"/>
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 9, color: 'var(--text-faint)', marginTop: 4 }}>
                  Toque na foto para ampliar. Elas chegam quando o campo confirma visita com foto no link.
                </p>
              </div>
            )}

            <div className="mt-2 space-y-1.5 max-h-52 overflow-y-auto">
              {paradas.map((p, i) => {
                const d = detalheParada(exec, p.key)
                const meta = labelStatus(d.status)
                const motivo = MOTIVOS_NAO_VISITA.find(m => m.id === d.motivoId)
                const titulo = labelParada(p, i)
                return (
                  <div key={p.key} className="flex items-start gap-2">
                    {d.foto
                      ? <button type="button" onClick={(e) => {
                        e.stopPropagation()
                        setFotoAmpliada({ key: p.key, foto: d.foto, nome: titulo, quando: d.confirmadoEm })
                      }}
                        className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0"
                        style={{ border: '1px solid rgba(52,211,153,0.4)' }}>
                        <img src={d.foto} alt="" className="w-full h-full object-cover"/>
                      </button>
                      : (
                        <span className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                          style={{ background: `${meta.cor}22`, color: meta.cor }}>
                          {d.status === 'concluido' ? <Camera size={12}/>
                            : d.status === 'nao_visitou' ? <AlertTriangle size={12}/>
                              : d.status === 'em_deslocamento' ? <Navigation2 size={12}/>
                                : <MapPin size={12}/>}
                        </span>
                      )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold" style={{ fontSize: 11, color: '#e2e8f0' }}>
                        {i + 1}. {titulo}
                      </p>
                      {formatEnderecoParada(p) || p.enderecoCurto ? (
                        <p className="truncate" style={{ fontSize: 10, color: 'var(--text-faint)' }}>
                          {formatEnderecoParada(p) || p.enderecoCurto}
                        </p>
                      ) : null}
                      <p className="truncate" style={{ fontSize: 10, color: meta.cor }}>
                        {meta.label}
                        {d.foto ? ' · foto recebida' : ''}
                        {d.justificativa ? ` · ${d.justificativa}` : motivo ? ` · ${motivo.label}` : ''}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </button>
          {onEncerrar && (
            <div className="px-3 pb-2.5">
              <button type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onEncerrar(shareId || pack.share?.shareId || exec.shareId, rota)
                }}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-bold"
                style={{ background: 'rgba(248,113,113,0.12)', color: '#fca5a5', border: '1px solid rgba(248,113,113,0.25)' }}>
                <Square size={11}/> Encerrar ao vivo
              </button>
            </div>
          )}
          </div>
        )
      })}

      {fotoAmpliada && (
        <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.88)' }}
          onClick={() => setFotoAmpliada(null)}>
          <div className="relative max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <button type="button" onClick={() => setFotoAmpliada(null)}
              className="absolute -top-2 -right-2 z-10 w-8 h-8 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
              <X size={16}/>
            </button>
            <img src={fotoAmpliada.foto} alt="" className="w-full rounded-2xl object-contain max-h-[70vh]"/>
            <p className="mt-2 text-center font-bold" style={{ fontSize: 13, color: '#fff' }}>{fotoAmpliada.nome}</p>
            {fotoAmpliada.quando && (
              <p className="text-center" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                {haQuanto(fotoAmpliada.quando)}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
