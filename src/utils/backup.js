// Backup global do sistema: exporta/importa todos os dados do localStorage.

// Prefixos/chaves usadas pelos módulos do app. Mantém o backup focado nos
// dados do sistema e evita arrastar lixo de outras origens.
const APP_KEYS = [
  'previsao_data',
  'agenda_eventos',
  'equipe_membros', 'equipe_tarefas',
  'eleitores_data', 'metas_zona', 'meta_global_votos',
  'pastores_igrejas', 'geo_coords_igrejas', 'igrejas_visitas',
  'igrejas_notas', 'igrejas_prioridades', 'igrejas_custom', 'igrejas_rota',
  'pesquisas_enquetes', 'pesquisas_respostas',
  'materiais_estoque', 'materiais_distribuicao',
  'apoiadores_lista', 'apoiadores_interacoes',
]

function coletarChaves() {
  // Inclui as chaves conhecidas + qualquer chave já presente que pareça do app.
  const presentes = Object.keys(localStorage)
  const set = new Set(APP_KEYS)
  presentes.forEach(k => {
    if (
      APP_KEYS.includes(k) ||
      /^(previsao|agenda|equipe|eleitores|metas|meta|pastores|geo|igrejas|pesquisas|materiais|apoiadores)/.test(k)
    ) {
      set.add(k)
    }
  })
  return [...set].filter(k => localStorage.getItem(k) !== null)
}

export function exportarBackup() {
  const dados = {}
  coletarChaves().forEach(k => { dados[k] = localStorage.getItem(k) })

  const backup = {
    _app: 'campanha-app',
    _versao: 1,
    _exportadoEm: new Date().toISOString(),
    dados,
  }

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  a.href = url
  a.download = `backup-campanha-${stamp}.json`
  a.click()
  URL.revokeObjectURL(url)
  return Object.keys(dados).length
}

export function importarBackup(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result)
        const dados = parsed && parsed.dados ? parsed.dados : parsed
        if (!dados || typeof dados !== 'object') {
          reject(new Error('Arquivo de backup inválido.'))
          return
        }
        let n = 0
        Object.entries(dados).forEach(([k, v]) => {
          if (typeof v === 'string') { localStorage.setItem(k, v); n++ }
          else if (v !== undefined) { localStorage.setItem(k, JSON.stringify(v)); n++ }
        })
        resolve(n)
      } catch (e) {
        reject(new Error('Não foi possível ler o arquivo. Verifique se é um backup válido.'))
      }
    }
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'))
    reader.readAsText(file)
  })
}
