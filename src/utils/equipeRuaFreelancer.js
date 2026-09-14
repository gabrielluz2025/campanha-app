import {
  loadPrevisao, savePrevisaoSeguro, uid, EQUIPE_PREVISAO_EVENT, PREVISAO_KEY,
} from './equipeSync'
import { publicarPrevisaoResumo } from './previsaoCalculo'

export const FREELANCER_CAT_NOME = 'Equipe de rua freelancer'

export function freelancerVazio() {
  return {
    id: uid(),
    nome: '',
    quantidade: 1,
    valorDiario: '',
    dias: '',
    observacoes: '',
    criadoEm: new Date().toISOString(),
  }
}

export function parseNum(v) {
  if (v === '' || v == null) return 0
  const s = String(v).trim()
  if (!s) return 0
  // BR "1.234,56" ou decimal "150.5" / "150,5"
  if (s.includes(',') && s.includes('.')) {
    const n = Number(s.replace(/\./g, '').replace(',', '.'))
    return Number.isFinite(n) ? n : 0
  }
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

/** Total de uma linha: quantidade × valor diário × dias */
export function totalLinhaFreelancer(f) {
  if (!f) return 0
  const q = Math.max(0, parseNum(f.quantidade))
  const d = Math.max(0, parseNum(f.dias))
  const v = Math.max(0, parseNum(f.valorDiario))
  return q * d * v
}

export function totalRuaFreelancers(lista = []) {
  return (Array.isArray(lista) ? lista : []).reduce((s, f) => s + totalLinhaFreelancer(f), 0)
}

export function qtdPessoasFreelancers(lista = []) {
  return (Array.isArray(lista) ? lista : []).reduce((s, f) => s + Math.max(0, parseNum(f.quantidade)), 0)
}

export function loadRuaFreelancers() {
  const p = loadPrevisao()
  return Array.isArray(p.ruaFreelancers) ? p.ruaFreelancers : []
}

function notify() {
  try {
    window.dispatchEvent(new CustomEvent(EQUIPE_PREVISAO_EVENT, { detail: { key: PREVISAO_KEY } }))
  } catch { /* ignore */ }
}

/** Recalcula previsao_resumo completo (sem patch parcial). */
export function patchPrevisaoResumoFreelancers(_lista) {
  return publicarPrevisaoResumo()
}

export function salvarRuaFreelancers(lista) {
  const limpa = (Array.isArray(lista) ? lista : []).map(f => ({
    id: f.id || uid(),
    nome: String(f.nome || '').trim(),
    quantidade: Math.max(0, parseNum(f.quantidade)) || 0,
    valorDiario: f.valorDiario === '' || f.valorDiario == null ? '' : parseNum(f.valorDiario),
    dias: f.dias === '' || f.dias == null ? '' : parseNum(f.dias),
    observacoes: String(f.observacoes || '').trim(),
    criadoEm: f.criadoEm || new Date().toISOString(),
  }))
  savePrevisaoSeguro({ ruaFreelancers: limpa })
  publicarPrevisaoResumo({ ruaFreelancers: limpa })
  notify()
  return limpa
}

export function fmtMoedaBr(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}
