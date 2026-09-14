import { useRef, useState, useEffect, useCallback } from 'react'
import {
  Settings, Download, Upload, AlertTriangle, ShieldAlert, CheckCircle2, Sun, Moon,
  Cloud, HardDrive, RefreshCw, RotateCcw, Loader2, Save,
} from 'lucide-react'
import { PageHeader, ModuleWrap, Button } from './ui'
import {
  exportarBackup, importarBackup,
  criarSnapshotSeguro, listarSnapshotsLocais, listarSnapshotsNuvem, restaurarSnapshot,
} from '../utils/backup'
import { useTheme } from '../theme/ThemeContext'
import { confirmAction } from '../utils/confirm'

function fmtData(iso) {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return String(iso || '—')
    return d.toLocaleString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return '—'
  }
}

function kindLabel(kind) {
  if (kind === 'daily') return 'Diário'
  if (kind === 'pre_deploy') return 'Pré-deploy'
  if (kind === 'pre_restore') return 'Antes de restaurar'
  return 'Manual'
}

export default function Configuracoes() {
  const fileRef = useRef(null)
  const [msg, setMsg] = useState('')
  const [desbloqueado, setDesbloqueado] = useState(false)
  const [snapshots, setSnapshots] = useState([])
  const [loadingList, setLoadingList] = useState(false)
  const [saving, setSaving] = useState(false)
  const [restoringId, setRestoringId] = useState(null)
  const { isLight, toggleTheme } = useTheme()

  function flash(texto) {
    setMsg(texto)
    setTimeout(() => setMsg(''), 5000)
  }

  const carregarLista = useCallback(async () => {
    setLoadingList(true)
    try {
      const locais = listarSnapshotsLocais()
      const cloud = await listarSnapshotsNuvem()
      const cloudItems = cloud.ok ? cloud.items : []
      const merged = [
        ...cloudItems.map(i => ({ ...i, where: 'cloud' })),
        ...locais,
      ].sort((a, b) => {
        const ta = Date.parse(a.createdAt || 0) || 0
        const tb = Date.parse(b.createdAt || 0) || 0
        return tb - ta
      })
      setSnapshots(merged)
      if (!cloud.ok && cloud.error && cloud.error !== 'Sem login') {
        flash(`Nuvem: ${cloud.error}`)
      }
    } finally {
      setLoadingList(false)
    }
  }, [])

  useEffect(() => {
    if (desbloqueado) carregarLista()
  }, [desbloqueado, carregarLista])

  function handleExport() {
    try {
      const n = exportarBackup()
      flash(`Arquivo de backup gerado (${n} conjuntos).`)
    } catch (err) {
      flash(err.message || 'Falha ao gerar backup.')
    }
  }

  async function handleSnapshotAgora() {
    setSaving(true)
    try {
      const res = await criarSnapshotSeguro({ kind: 'manual' })
      if (!res.ok) {
        flash(res.cloud?.error || res.localError || 'Não foi possível salvar o snapshot.')
        return
      }
      const partes = []
      if (res.local) partes.push('neste aparelho')
      if (res.cloud?.ok) partes.push('na nuvem')
      flash(`Snapshot salvo ${partes.join(' e ')}.`)
      await carregarLista()
    } finally {
      setSaving(false)
    }
  }

  async function handleRestore(item) {
    const ok1 = await confirmAction({
      title: 'Restaurar snapshot',
      message: `Isto SUBSTITUI os dados atuais pelo snapshot “${item.label}” (${fmtData(item.createdAt)}). Um snapshot de segurança será criado antes.`,
      confirmLabel: 'Continuar',
      danger: true,
    })
    if (!ok1) return

    const palavra = window.prompt('Para confirmar, digite RESTAURAR em maiúsculas:')
    if (palavra !== 'RESTAURAR') {
      flash('Restauração cancelada.')
      return
    }

    setRestoringId(`${item.where}:${item.id}`)
    try {
      const n = await restaurarSnapshot({ where: item.where, id: item.id })
      alert(`Snapshot restaurado (${n} conjuntos). A página será recarregada.`)
      window.location.reload()
    } catch (err) {
      flash(err.message || 'Falha ao restaurar.')
    } finally {
      setRestoringId(null)
    }
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const ok1 = await confirmAction({
      title: 'Restaurar arquivo',
      message: 'Isto SUBSTITUI todos os dados atuais do sistema. Só continue se tiver certeza.',
      confirmLabel: 'Continuar',
      danger: true,
    })
    if (!ok1) return

    const palavra = window.prompt('Para confirmar, digite RESTAURAR em maiúsculas:')
    if (palavra !== 'RESTAURAR') {
      flash('Restauração cancelada.')
      return
    }

    try {
      const n = await importarBackup(file)
      alert(`Backup restaurado (${n} conjuntos de dados). A página será recarregada.`)
      window.location.reload()
    } catch (err) {
      flash(err.message || 'Falha ao restaurar o backup.')
    }
  }

  async function liberarAreaPerigosa() {
    const ok = await confirmAction({
      title: 'Área avançada',
      message: 'Backup e restauração podem apagar ou substituir dados. Use só se souber o que está fazendo.',
      confirmLabel: 'Entendi, liberar',
    })
    if (ok) setDesbloqueado(true)
  }

  return (
    <div className="flex-1 overflow-auto" style={{ background: 'var(--bg-base)' }}>
      <ModuleWrap className="pb-10">
        <PageHeader
          icon={Settings}
          title="Configurações"
          subtitle="Ajustes do sistema · área avançada protegida"
        />

        {msg && (
          <p className="mb-4 text-center font-semibold" style={{ fontSize: 13, color: 'var(--gold-bright)' }}>
            {msg}
          </p>
        )}

        <div className="space-y-5 max-w-2xl">
          <section className="rounded-3xl p-5"
            style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <p className="eyebrow mb-3" style={{ color: 'var(--gold)' }}>Aparência</p>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-bold" style={{ fontSize: 14, color: 'var(--text-primary)' }}>Tema</p>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  Alterna entre modo claro e escuro
                </p>
              </div>
              <button type="button" onClick={toggleTheme}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold"
                style={{
                  fontSize: 12,
                  background: 'var(--bg-raised)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-secondary)',
                }}>
                {isLight ? <Moon size={15} style={{ color: 'var(--gold)' }} /> : <Sun size={15} style={{ color: 'var(--gold)' }} />}
                {isLight ? 'Modo escuro' : 'Modo claro'}
              </button>
            </div>
          </section>

          <section className="rounded-3xl p-5"
            style={{ background: 'var(--bg-surface)', border: '1px solid rgba(248,113,113,0.25)' }}>
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(248,113,113,0.12)', color: '#fca5a5' }}>
                <ShieldAlert size={18} />
              </div>
              <div>
                <p className="font-bold" style={{ fontSize: 14, color: 'var(--text-primary)' }}>
                  Proteção de dados
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>
                  Snapshots diários na nuvem, cópia neste aparelho e restauração controlada.
                </p>
              </div>
            </div>

            {!desbloqueado ? (
              <div className="rounded-2xl p-4 text-center"
                style={{ background: 'var(--bg-raised)', border: '1px dashed rgba(248,113,113,0.35)' }}>
                <AlertTriangle size={22} className="mx-auto mb-2" style={{ color: '#fbbf24' }} />
                <p className="font-semibold mb-3" style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Área avançada bloqueada
                </p>
                <Button onClick={liberarAreaPerigosa}>Liberar backup e restauração</Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-xl px-3 py-2.5"
                  style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)' }}>
                  <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    <strong style={{ color: '#fbbf24' }}>Atenção:</strong> restaurar substitui os dados atuais.
                    O sistema cria um snapshot “Antes de restaurar” automaticamente.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button type="button" disabled={saving} onClick={handleSnapshotAgora}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold"
                    style={{
                      fontSize: 13,
                      background: 'linear-gradient(135deg, rgba(37,99,235,0.3), rgba(30,58,95,0.4))',
                      border: '1px solid rgba(59,130,246,0.4)',
                      color: '#93c5fd',
                      opacity: saving ? 0.7 : 1,
                    }}>
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {saving ? 'Salvando…' : 'Salvar snapshot agora'}
                  </button>
                  <button type="button" onClick={handleExport}
                    className="flex items-center justify-center gap-2 py-3 rounded-xl font-bold"
                    style={{
                      fontSize: 13,
                      background: 'linear-gradient(135deg, rgba(212,175,95,0.25), rgba(168,132,46,0.12))',
                      border: '1px solid rgba(212,175,95,0.4)',
                      color: 'var(--gold-bright)',
                    }}>
                    <Download size={16} /> Baixar arquivo .json
                  </button>
                </div>

                <input ref={fileRef} type="file" accept="application/json,.json"
                  onChange={handleImportFile} style={{ display: 'none' }} />

                <button type="button" onClick={() => fileRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold"
                  style={{
                    fontSize: 12,
                    background: 'rgba(248,113,113,0.1)',
                    border: '1px solid rgba(248,113,113,0.3)',
                    color: '#fca5a5',
                  }}>
                  <Upload size={14} /> Restaurar de arquivo .json
                </button>

                <div className="pt-2">
                  <div className="flex items-center justify-between mb-2">
                    <p className="font-bold" style={{ fontSize: 13, color: 'var(--text-primary)' }}>
                      Snapshots disponíveis
                    </p>
                    <button type="button" onClick={carregarLista} disabled={loadingList}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg"
                      style={{ fontSize: 11, color: 'var(--text-tertiary)', background: 'transparent', border: 'none' }}>
                      {loadingList ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                      Atualizar
                    </button>
                  </div>

                  {snapshots.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text-faint)' }}>
                      Nenhum snapshot ainda. Clique em “Salvar snapshot agora” ou aguarde o backup diário automático.
                    </p>
                  ) : (
                    <ul className="space-y-2 max-h-80 overflow-y-auto">
                      {snapshots.map(item => {
                        const rid = `${item.where}:${item.id}`
                        const busy = restoringId === rid
                        return (
                          <li key={rid}
                            className="rounded-xl px-3 py-2.5 flex items-start gap-2.5"
                            style={{ background: 'var(--bg-raised)', border: '1px solid var(--border-subtle)' }}>
                            <div className="mt-0.5 flex-shrink-0" style={{ color: item.where === 'cloud' ? '#93c5fd' : '#94a3b8' }}>
                              {item.where === 'cloud' ? <Cloud size={14} /> : <HardDrive size={14} />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold truncate" style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                                {item.label}
                              </p>
                              <p style={{ fontSize: 10, color: 'var(--text-faint)', marginTop: 2 }}>
                                {fmtData(item.createdAt)}
                                {' · '}
                                {kindLabel(item.kind)}
                                {' · '}
                                {item.where === 'cloud' ? 'Nuvem' : 'Este aparelho'}
                                {item.resumo ? ` · ${item.resumo.materiais ?? 0} materiais · ${item.resumo.rotas ?? 0} rotas` : ''}
                              </p>
                            </div>
                            <button type="button" disabled={busy} onClick={() => handleRestore(item)}
                              className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg font-bold"
                              style={{
                                fontSize: 11,
                                background: 'rgba(248,113,113,0.12)',
                                color: '#fca5a5',
                                border: '1px solid rgba(248,113,113,0.3)',
                                opacity: busy ? 0.6 : 1,
                              }}>
                              {busy ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                              Restaurar
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>

                <p className="flex items-center gap-1.5 justify-center" style={{ fontSize: 11, color: 'var(--text-faint)' }}>
                  <CheckCircle2 size={12} /> Área liberada nesta sessão · backup diário automático ativo
                </p>
              </div>
            )}
          </section>
        </div>
      </ModuleWrap>
    </div>
  )
}
