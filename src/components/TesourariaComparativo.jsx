import { useMemo } from 'react'
import { GitCompareArrows, TrendingUp, ArrowDownLeft, ArrowUpRight, Info } from 'lucide-react'
import { fmtMoeda } from '../utils/tesouraria'
import { montarComparativoCampanha, fmtPct } from '../utils/tesourariaComparativo'
import { KpiStrip } from './ui'

const CARD = {
  background: 'var(--bg-card, var(--bg-surface, #0e131c))',
  border: '1px solid var(--border-subtle)',
}

/** NÃO usar nome `ref` — no React 18 ele é reservado e some dos props. */
function BarDupla({ atual = 0, referencia = 0, cor = '#fbbf24', previsto = 0 }) {
  const a = Number(atual) || 0
  const r = Number(referencia) || 0
  const p = Number(previsto) || 0
  const max = Math.max(r, a, p, 1)
  const wAtual = Math.min(100, (a / max) * 100)
  const wPrev = Math.min(100, (p / max) * 100)
  const wRef = Math.min(100, (r / max) * 100)
  return (
    <div className="space-y-1.5">
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${wAtual}%`, background: cor }} />
      </div>
      {p > 0 && (
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
          <div className="h-full rounded-full" style={{ width: `${wPrev}%`, background: `${cor}66` }} />
        </div>
      )}
      <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }}>
        <div className="h-full rounded-full" style={{ width: `${wRef}%`, background: 'rgba(148,163,184,0.55)' }} />
      </div>
    </div>
  )
}

function CardMacro({ item }) {
  const Icon = item.id === 'entradas' ? ArrowDownLeft : item.id === 'orcamento' ? TrendingUp : ArrowUpRight
  return (
    <div className="rounded-2xl p-4" style={CARD}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>{item.label}</p>
          {item.hint && <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{item.hint}</p>}
        </div>
        <Icon size={16} style={{ color: item.cor }} />
      </div>
      <p className="text-xl font-black tnum" style={{ color: item.cor }}>{fmtMoeda(item.atual)}</p>
      <p className="text-[12px] mt-1 tnum" style={{ color: 'var(--text-tertiary)' }}>
        Ref. 2022: {fmtMoeda(item.referencia)}
      </p>
      <div className="mt-3">
        <BarDupla atual={item.atual} referencia={item.referencia} cor={item.cor} previsto={item.previsto} />
      </div>
      <div className="flex justify-between mt-2 text-[11px] font-bold">
        <span style={{ color: item.cor }}>{fmtPct(item.pct)} do 2022</span>
        {item.previsto > 0 && (
          <span style={{ color: 'var(--text-faint)' }}>+previsto {fmtMoeda(item.previsto)}</span>
        )}
      </div>
    </div>
  )
}

/**
 * Comparativo somente visualização: campanha atual (caixa + previsão) × Histórico 2022.
 */
export default function TesourariaComparativo({ movimentos = [] }) {
  const cmp = useMemo(() => {
    try {
      return montarComparativoCampanha(movimentos)
    } catch (err) {
      console.error('[Comparativo]', err)
      return null
    }
  }, [movimentos])

  if (!cmp) {
    return (
      <div className="rounded-2xl p-8 text-center" style={CARD}>
        <p className="font-bold" style={{ color: 'var(--text-primary)' }}>Não foi possível montar o comparativo</p>
        <p className="text-sm mt-2" style={{ color: 'var(--text-tertiary)' }}>Recarregue a página ou verifique os dados da Previsão.</p>
      </div>
    )
  }

  const kpis = [
    {
      label: 'Saídas vs 2022',
      value: fmtPct(cmp.ritmo.pctCaixaVs2022),
      gold: true,
      hint: `${fmtMoeda(cmp.caixa.saidas)} / ${fmtMoeda(cmp.ref.saida)}`,
    },
    {
      label: 'Entradas vs 2022',
      value: fmtPct(cmp.ritmo.pctEntradaVs2022),
      hint: `${fmtMoeda(cmp.caixa.entradas)} / ${fmtMoeda(cmp.ref.entrada)}`,
    },
    {
      label: 'Previsão vs 2022',
      value: fmtPct(cmp.ritmo.pctOrcadoVs2022),
      hint: cmp.ritmo.orcado > 0 ? fmtMoeda(cmp.ritmo.orcado) : 'Sem previsão cadastrada',
    },
    {
      label: 'Saldo atual',
      value: fmtMoeda(cmp.ritmo.saldoAtual),
      hint: `Ref. 2022 · ${cmp.ref.periodo}`,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="rounded-xl px-3 py-2.5 flex items-start gap-2"
        style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.28)' }}>
        <GitCompareArrows size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          <strong style={{ color: 'var(--gold-bright)' }}>Comparativo de campanha</strong>
          {' '}· campanha atual (lançamentos + previsão) × referência {cmp.ref.periodo}.
          Somente visualização — não altera o caixa.
        </div>
      </div>

      <KpiStrip items={kpis} columns={4} />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {cmp.macro.map(m => <CardMacro key={m.id} item={m} />)}
      </div>

      <div className="rounded-2xl p-4" style={CARD}>
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp size={15} style={{ color: 'var(--gold-bright)' }} />
          <h3 className="text-[12px] font-bold uppercase tracking-wide" style={{ color: 'var(--text-faint)' }}>
            Andamento por natureza
          </h3>
        </div>
        <p className="text-[12px] mb-4" style={{ color: 'var(--text-tertiary)' }}>
          Barra colorida = valor no sistema (caixa confirmado; se ainda não houver lançamento, usa a previsão).
          Barra cinza = total da campanha 2022.
        </p>

        <div className="space-y-5">
          {cmp.linhas.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: 'var(--text-tertiary)' }}>
              Cadastre lançamentos na Tesouraria ou valores na Previsão para ver o andamento.
            </p>
          ) : cmp.linhas.map(l => {
            const exibido = l.realizado > 0 ? l.realizado : l.previsto
            const cor = l.pctImputado != null && l.pctImputado >= 100 ? '#f87171'
              : l.pctImputado != null && l.pctImputado >= 70 ? '#fbbf24'
              : '#60a5fa'
            return (
              <div key={l.id}>
                <div className="flex flex-wrap items-end justify-between gap-2 mb-1.5">
                  <div className="min-w-0">
                    <p className="text-[13px] font-bold" style={{ color: 'var(--text-primary)' }}>{l.label}</p>
                    <p className="text-[11px]" style={{ color: 'var(--text-faint)' }}>{l.hint}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[13px] font-black tnum" style={{ color: cor }}>
                      {fmtMoeda(exibido)}
                      <span className="font-semibold ml-1.5" style={{ color: 'var(--text-faint)' }}>
                        / {fmtMoeda(l.ref2022 || 0)}
                      </span>
                    </p>
                    <p className="text-[11px] font-bold" style={{ color: cor }}>
                      {l.ref2022 > 0 ? fmtPct(l.pctImputado) : 'sem ref. 2022'}
                      {l.realizado > 0 && l.previsto > l.realizado && (
                        <span className="ml-1 font-normal" style={{ color: 'var(--text-faint)' }}>
                          (caixa {fmtMoeda(l.realizado)})
                        </span>
                      )}
                      {l.realizado === 0 && l.previsto > 0 && (
                        <span className="ml-1 font-normal" style={{ color: 'var(--text-faint)' }}>(previsão)</span>
                      )}
                    </p>
                  </div>
                </div>
                <BarDupla
                  atual={l.realizado}
                  previsto={l.previsto}
                  referencia={l.ref2022}
                  cor={cor}
                />
              </div>
            )
          })}
        </div>
      </div>

      <div className="rounded-xl px-3 py-2.5 flex items-start gap-2"
        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)' }}>
        <Info size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--text-faint)' }} />
        <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
          Referência 2022: {fmtMoeda(cmp.ref.entrada)} entradas · {fmtMoeda(cmp.ref.saida)} saídas BB ·{' '}
          {fmtMoeda(cmp.ref.despesas)} despesas oficiais · {cmp.ref.empresas} empresas · {cmp.ref.pessoas} pessoas.
          Conforme você lança valores no caixa e na previsão, as barras sobem em relação à última campanha.
        </p>
      </div>
    </div>
  )
}
