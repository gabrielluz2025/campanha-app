/** Checklist antes de enviar rota ao campo. */
export function avaliarChecklistEnvio({
  paradasDetalhes = [],
  routeHealth = {},
  membro = null,
  rotaCalc = null,
  rotaAtiva = null,
  shareAtivo = false,
} = {}) {
  const paradas = (paradasDetalhes || []).filter(p => p?.key && !String(p.key).startsWith('equipe:'))
  const items = [
    {
      id: 'paradas',
      label: 'Pelo menos 2 paradas',
      ok: paradas.length >= 2,
      warn: paradas.length === 1 ? 'Adicione mais uma parada' : 'Adicione paradas',
    },
    {
      id: 'gps',
      label: 'Paradas com GPS/endereço',
      ok: (routeHealth?.semGps ?? 0) === 0,
      warn: routeHealth?.semGps ? `${routeHealth.semGps} sem GPS — geocodifique antes` : '',
    },
    {
      id: 'rota',
      label: 'Rota traçada (OSRM)',
      ok: Boolean(rotaCalc?.linha?.length),
      warn: 'Otimize o itinerário antes de enviar',
    },
    {
      id: 'resp',
      label: 'Responsável com telefone',
      ok: Boolean(membro?.telefone),
      warn: membro ? 'Cadastre telefone na Equipe' : 'Escolha quem executa',
    },
    {
      id: 'data',
      label: 'Data da rota definida',
      ok: Boolean(rotaAtiva?.data),
      warn: 'Defina a data da rota',
    },
    {
      id: 'share',
      label: shareAtivo ? 'Link ao vivo ativo' : 'Link será gerado ao enviar',
      ok: true,
      warn: '',
    },
  ]
  const obrigatorios = items.filter(i => i.id !== 'share')
  const ok = obrigatorios.every(i => i.ok)
  return { ok, items, score: obrigatorios.filter(i => i.ok).length, total: obrigatorios.length }
}
