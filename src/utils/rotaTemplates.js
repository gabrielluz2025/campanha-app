import { readStorage, writeStorage } from './persist'
import { paradaKey, criarParadaBase, isParadaEquipe } from './rotaUtils'
import { mesclarParadasIgreja, paradasNovasDeIgrejas } from './rotaPlanHelpers'

export const ROTA_TEMPLATES_KEY = 'rotas_templates_v1'

export function loadRotaTemplates() {
  return readStorage(ROTA_TEMPLATES_KEY, [])
}

export function saveRotaTemplate({ nome, paradas = [], bairro = '', tags = [] }) {
  const lista = loadRotaTemplates()
  const tpl = {
    id: `tpl_${Date.now()}`,
    nome: String(nome || 'Template').trim(),
    bairro: String(bairro || '').trim(),
    tags: Array.isArray(tags) ? tags : [],
    paradaKeys: (paradas || [])
      .filter(p => p?.key && !isParadaEquipe(p))
      .map(p => p.key),
    criadoEm: new Date().toISOString(),
  }
  writeStorage(ROTA_TEMPLATES_KEY, [tpl, ...lista].slice(0, 40))
  return tpl
}

export function removerRotaTemplate(id) {
  writeStorage(ROTA_TEMPLATES_KEY, loadRotaTemplates().filter(t => String(t.id) !== String(id)))
}

/** Aplica template — preserva equipe na rota. */
export function aplicarRotaTemplate(template, paradasAtuais = []) {
  if (!template?.paradaKeys?.length) return paradasAtuais
  const ids = template.paradaKeys
    .filter(k => String(k).startsWith('igreja:'))
    .map(k => k.slice(7))
  const novas = paradasNovasDeIgrejas(ids, paradasAtuais)
  if (!novas.length) return paradasAtuais
  return mesclarParadasIgreja(paradasAtuais, novas)
}

export function templateFromRota(rota, nome) {
  return saveRotaTemplate({
    nome: nome || rota?.nome || 'Template',
    paradas: rota?.paradas || [],
    bairro: '',
  })
}
