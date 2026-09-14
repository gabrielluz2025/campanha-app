import { cultoParaData, horaInicioCultoNaData } from './cultoParse'

function minutosDesdeMeiaNoite(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** Alertas quando hora prevista da parada conflita com horário de culto. */
export function alertasCultoParadas(paradas = [], dataRota = '') {
  const out = []
  const data = dataRota || new Date().toISOString().slice(0, 10)

  for (const p of paradas || []) {
    if (!p?.culto || !p?.horaPrevista) continue
    const cultoH = horaInicioCultoNaData(p.culto, data)
    if (!cultoH) continue
    const cultoMin = minutosDesdeMeiaNoite(cultoH)
    const prevMin = minutosDesdeMeiaNoite(p.horaPrevista)
    if (cultoMin == null || prevMin == null) continue

    const diff = prevMin - cultoMin
    if (diff > 15) {
      out.push({
        key: p.key,
        nome: p.nome || p.key,
        severity: 'warn',
        msg: `Chegada prevista ${p.horaPrevista} · culto ${cultoH} (atraso ~${diff} min)`,
        cultoH,
        horaPrevista: p.horaPrevista,
      })
    } else if (diff < -30) {
      out.push({
        key: p.key,
        nome: p.nome || p.key,
        severity: 'info',
        msg: `Chegada ${p.horaPrevista} · culto ${cultoH} (muito cedo)`,
        cultoH,
        horaPrevista: p.horaPrevista,
      })
    }
  }
  return out
}

export function resumoAlertasCulto(alertas = []) {
  const warns = alertas.filter(a => a.severity === 'warn').length
  return { total: alertas.length, warns }
}
