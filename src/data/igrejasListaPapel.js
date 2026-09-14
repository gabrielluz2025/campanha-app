/**
 * @typedef {{
 *   nome: string,
 *   bairro: string,
 *   endereco: string,
 *   culto: string,
 *   denominacao: string,
 *   regiao?: string,
 *   pastor?: string,
 *   telefone?: string,
 *   whatsapp?: string,
 *   congregacao?: string,
 *   setorNum?: string,
 *   fonteLista?: string,
 *   equipe?: string,
 * }} IgrejaListaPapel
 */

/** Lista digitada das fichas de papel (Região Central + Sul + ADBLU 25–36) — corrigida ago/2026 */

/** @type {IgrejaListaPapel[]} */
export const IGREJAS_LISTA_PAPEL = [
  // —— Região Central (Kelton) ——
  { regiao: 'Central', equipe: 'Kelton', nome: 'Comunidade Evangélica Sara', bairro: 'Itoupava Seca', endereco: 'Rua São Paulo, 1698', culto: 'Sáb 19:30 · Dom 19:30', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Central', equipe: 'Kelton', nome: 'Pentecostal de Missões', bairro: 'Victor Konder', endereco: 'Rua São Paulo, 683', culto: 'Ter 19:30 · Dom 19:30', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Central', equipe: 'Kelton', nome: 'Verbo da Vida', bairro: 'Itoupava Seca', endereco: 'Rua Carlos Jensen, 150', culto: 'Ter 19:30 · Qui 19:30 · Dom 19:30', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Central', equipe: 'Kelton', nome: 'Batista Restauração', bairro: 'Vila Nova', endereco: 'Rua Almirante Barroso, 301', culto: 'Ter 19:30 · Dom 19:00', denominacao: 'Batista', fonteLista: 'lista-papel' },
  { regiao: 'Central', equipe: 'Kelton', nome: 'Koinonia', bairro: 'Itoupava Seca', endereco: 'Rua Alfredo Hering, 98', culto: 'Qua 19:30 · Dom 10:00/19:30', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Central', equipe: 'Kelton', nome: 'De Jesus', bairro: 'Vila Nova', endereco: 'Rua Almirante Barroso, 399', culto: 'Dom 19:00', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Central', equipe: 'Kelton', nome: 'Plano de Deus Revelado', bairro: 'Vila Nova', endereco: 'Rua Emiliano J. de Oliveira, 70', culto: 'Seg 19:30 · Qua 19:30 · Sex 19:00 · Dom 07:00/18:00', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Central', equipe: 'Kelton', nome: 'Templo dos Milagres', bairro: 'Itoupava Seca', endereco: 'Rua São Paulo, 2896', culto: 'Dom 18:30', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Central', equipe: 'Kelton', nome: 'Vertical', bairro: 'Victor Konder', endereco: 'Rua Eugen Fouquet, 66', culto: 'Dom 18:30', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Central', equipe: 'Kelton', nome: 'Deus é Amor', bairro: 'Centro', endereco: 'Rua XV de Novembro, 117', culto: 'Dom 19:00', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Central', equipe: 'Kelton', nome: 'Ministério Casa de Oração Blumenau', bairro: 'Centro', endereco: 'Rua Sete de Setembro, 2482', culto: 'Dom 19:00', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Central', equipe: 'Kelton', nome: 'Universal do Reino de Deus', bairro: 'Itoupava Seca', endereco: 'Rua São Paulo, 3424', culto: 'Sáb 19:30', denominacao: 'Universal', fonteLista: 'lista-papel' },
  { regiao: 'Central', equipe: 'Kelton', nome: 'Comunidade Cristã 5 Rios', bairro: 'Boa Vista', endereco: 'Rua Frederico Deeke, 292', culto: 'Qua 19:00 · Dom 18:30', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Central', equipe: 'Kelton', nome: 'Assembleia de Deus Missões ADBlu', bairro: 'Victor Konder', endereco: 'Rua São Paulo, 890', culto: 'Ter 19:00 · Qui 19:00 · Dom 18:30', denominacao: 'Assembleia de Deus', congregacao: 'Sede', fonteLista: 'lista-papel' },
  { regiao: 'Central', equipe: 'Kelton', nome: 'Assembleia de Deus Missões ADBlu', bairro: 'Vila Nova', endereco: 'Rua Prudente de Moraes, 326', culto: 'Seg 19:00 · Dom 18:30', denominacao: 'Assembleia de Deus', congregacao: 'Vila Nova', fonteLista: 'lista-papel' },

  // —— Região Sul (Garcia / Progresso / …) ——
  { regiao: 'Sul', equipe: 'Grego', nome: 'Quadrangular', bairro: 'Garcia', endereco: 'Rua Araranguá, 255', culto: 'Qui 19:30 · Dom 09:00/19:00', denominacao: 'Quadrangular', fonteLista: 'lista-papel' },
  { regiao: 'Sul', equipe: 'Dayane', nome: 'Batista de Blumenau — Shalon', bairro: 'Garcia', endereco: 'Rua Pref. Frederico Busch Jr, 455', culto: 'Dom 09:30/18:00', denominacao: 'Batista', fonteLista: 'lista-papel' },
  { regiao: 'Sul', equipe: 'Adria', nome: 'Ministério Geração Eleita de Blumenau', bairro: 'Garcia', endereco: 'Rua Pref. Frederico Busch Jr, 540', culto: 'Sáb 19:30', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Sul', equipe: 'Mara', nome: 'Internacional da Graça', bairro: 'Garcia', endereco: 'Rua Amazonas, 455', culto: 'Ter 19:30 · Qua 19:00 · Sex 19:00 · Dom 18:00', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Sul', equipe: 'Kelton', nome: 'Visão Missionária', bairro: 'Garcia', endereco: 'Rua Maravilha, 65', culto: 'Ter 19:00 · Qua 19:00 · Qui 19:00 · Sex 19:00 · Sáb 19:00 · Dom 19:00', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Sul', equipe: 'Shalom', nome: 'Cristã Maranata', bairro: 'Progresso', endereco: 'Rua Santa Maria', culto: 'Ter 19:30 · Qua 19:30', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Sul', equipe: 'Abdiel', nome: 'Cristo Esperança', bairro: 'Garcia', endereco: 'Rua da Glória, 1390', culto: 'Ter 19:00 · Sex 19:00 · Sáb 18:30 · Dom 18:30', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Sul', equipe: 'Ana B.', nome: 'MFA — Missão Fé Apostólica', bairro: 'Garcia', endereco: 'Rua da Glória, 840', culto: 'Qua 20:00 · Sáb 20:00 · Dom 19:00', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Sul', nome: 'Evangélica Vida Missionária', bairro: 'Garcia', endereco: 'Rua Amazonas, 688', culto: 'Qui 19:00 · Sáb 19:00 · Dom 18:30', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Sul', nome: 'Atleta das Nações', bairro: 'Garcia', endereco: 'Rua Antônio Zendron, 52', culto: 'Qua 19:30 · Sáb 19:30 · Dom 18:30', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Sul', nome: 'Internacional da Conquista', bairro: 'Progresso', endereco: 'Rua Júlio Heiden, 1315', culto: 'Sáb 08:30', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Sul', nome: 'Quadrangular', bairro: 'Progresso', endereco: 'Rua Rui Barbosa, 771', culto: 'Ter 19:00 · Qua 19:00 · Qui 19:00 · Sex 19:00 · Sáb 19:00 · Dom 19:00', denominacao: 'Quadrangular', fonteLista: 'lista-papel' },
  { regiao: 'Sul', nome: 'Deus é Amor', bairro: 'Garcia', endereco: 'Rua Progresso, 1606', culto: 'Sex 19:30', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Sul', nome: 'Assembleia de Deus Guerreiros de Cristo', bairro: 'Progresso', endereco: 'Rua Hermann Huscher, 1637', culto: 'Qua 19:30 · Sáb 19:00 · Dom 19:00', denominacao: 'Assembleia de Deus', fonteLista: 'lista-papel' },
  { regiao: 'Sul', nome: 'CEI Blumenau', bairro: 'Garcia', endereco: 'Ribeirão Fresco', culto: 'Qui 20:00 · Dom 09:30/19:45', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Sul', nome: 'Deus é Amor', bairro: 'Ribeirão Fresco', endereco: 'Rua Pastor Oswaldo Hesse, 401', culto: '', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Sul', nome: 'Assembleia de Deus Ministério Madureira', bairro: 'Garcia', endereco: 'Rua Amazonas, 4397', culto: 'Ter 19:00 · Sex 19:00 · Dom 19:00', denominacao: 'Assembleia de Deus', fonteLista: 'lista-papel' },
  { regiao: 'Sul', nome: 'Visão Missionária', bairro: 'Glória', endereco: 'Rua da Glória, 789', culto: '', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Sul', nome: 'Universal do Reino de Deus', bairro: 'Garcia', endereco: 'Rua Amazonas, 2923', culto: 'Ter 19:30 · Qui 19:30 · Sáb 19:00 · Dom 19:00', denominacao: 'Universal', fonteLista: 'lista-papel' },
  { regiao: 'Sul', nome: 'Ministério Evangelístico Reino Eterno', bairro: 'Progresso', endereco: 'Rua Leopoldo Heringer, 26', culto: 'Qua 19:00', denominacao: 'Outra', fonteLista: 'lista-papel' },
  { regiao: 'Sul', nome: 'Assembleia de Deus Missões ADBlu', bairro: 'Ribeirão Fresco', endereco: 'Rua Araranguá, 1151', culto: 'Qua 19:00 · Dom 18:30', denominacao: 'Assembleia de Deus', congregacao: 'Araranguá', fonteLista: 'lista-papel' },
  { regiao: 'Sul', nome: 'Assembleia de Deus Missões ADBlu', bairro: 'Garcia', endereco: 'Rua Boa Esperança, 260', culto: 'Qua 19:00 · Sex 19:00 · Dom 18:30', denominacao: 'Assembleia de Deus', congregacao: 'Boa Esperança', fonteLista: 'lista-papel' },
  { regiao: 'Sul', nome: 'Assembleia de Deus Missões ADBLu', bairro: 'Progresso', endereco: 'Rua Santa Maria, 1119', culto: 'Qua 19:00 · Sex 19:00 · Dom 18:30', denominacao: 'Assembleia de Deus', congregacao: 'Canto do Rio', fonteLista: 'lista-papel' },
  { regiao: 'Sul', nome: 'Assembleia de Deus Missões ADBLu', bairro: 'Progresso', endereco: 'Rua Gregório Henrique da Silva, S/N', culto: 'Qua 19:00 · Dom 18:30', denominacao: 'Assembleia de Deus', congregacao: 'Filadélfia', fonteLista: 'lista-papel' },

  // —— ADBLU Sul (ficha 25–36) ——
  { regiao: 'Sul', setorNum: '25', nome: 'Assembleia de Deus Missões ADBLu', bairro: 'Garcia', endereco: 'Rua Engenheiro Odebrecht, 695', culto: 'Ter 19:00 · Dom 18:30', denominacao: 'Assembleia de Deus', congregacao: 'Eng. Odebrecht', fonteLista: 'lista-papel' },
  { regiao: 'Sul', setorNum: '26', nome: 'Assembleia de Deus Missões ADBLu', bairro: 'Progresso', endereco: 'Rua Belmiro Colzani, 407', culto: 'Ter 19:00 · Dom 18:30', denominacao: 'Assembleia de Deus', congregacao: 'Filadélfia', fonteLista: 'lista-papel' },
  { regiao: 'Sul', setorNum: '27', nome: 'Assembleia de Deus Missões ADBLu', bairro: 'Garcia', endereco: 'Rua Amazonas, 4243', culto: 'Qua 19:30 · Qui 19:30 · Dom 18:30', denominacao: 'Assembleia de Deus', congregacao: 'Garcia', fonteLista: 'lista-papel' },
  { regiao: 'Sul', setorNum: '28', nome: 'Assembleia de Deus Missões ADBLu', bairro: 'Glória', endereco: 'Rua Brusque, 615', culto: 'Ter 19:00 · Qua 19:00 · Sáb 09:00 · Dom 18:30', denominacao: 'Assembleia de Deus', congregacao: 'Glória', fonteLista: 'lista-papel' },
  { regiao: 'Sul', setorNum: '29', nome: 'Assembleia de Deus Missões ADBLu', bairro: 'Progresso', endereco: 'Rua Francisco Manoel dos Santos, S/N', culto: 'Qua 19:00 · Dom 18:30', denominacao: 'Assembleia de Deus', congregacao: 'Progresso', fonteLista: 'lista-papel' },
  { regiao: 'Sul', setorNum: '30', nome: 'Assembleia de Deus Missões ADBLu', bairro: 'Garcia', endereco: 'Rua Carlos Splitter, 63', culto: 'Qua 19:30 · Dom 18:30', denominacao: 'Assembleia de Deus', congregacao: 'Itapuí', fonteLista: 'lista-papel' },
  { regiao: 'Sul', setorNum: '31', nome: 'Assembleia de Deus Missões ADBLu', bairro: 'Progresso', endereco: 'Rua Jordão, 239', culto: 'Qui 19:00 · Dom 18:30', denominacao: 'Assembleia de Deus', congregacao: 'Jordão', fonteLista: 'lista-papel' },
  { regiao: 'Sul', setorNum: '32', nome: 'Assembleia de Deus Missões ADBLu', bairro: 'Ribeirão Fresco', endereco: 'Rua Antônio Sofiati, 27', culto: 'Qui 19:00 · Dom 18:30', denominacao: 'Assembleia de Deus', congregacao: 'Morro da Antena', fonteLista: 'lista-papel' },
  { regiao: 'Sul', setorNum: '33', nome: 'Assembleia de Deus Missões ADBLu', bairro: 'Ribeirão Fresco', endereco: 'Rua Benigno Joaquim dos Santos, 29', culto: 'Qui 19:00 · Dom 18:30', denominacao: 'Assembleia de Deus', congregacao: 'Morro da Garuva', fonteLista: 'lista-papel' },
  { regiao: 'Sul', setorNum: '34', nome: 'Assembleia de Deus Missões ADBLu', bairro: 'Progresso', endereco: 'Rua Pastor Oswald Hesse, 526', culto: 'Qui 19:00 · Sex 19:00 · Dom 18:30', denominacao: 'Assembleia de Deus', congregacao: 'Pastor Oswald Hesse', fonteLista: 'lista-papel' },
  { regiao: 'Sul', setorNum: '35', nome: 'Assembleia de Deus Missões ADBLu', bairro: 'Progresso', endereco: 'Rua Rui Barbosa, 500', culto: 'Qui 19:00 · Dom 18:30', denominacao: 'Assembleia de Deus', congregacao: 'Progresso', fonteLista: 'lista-papel' },
  { regiao: 'Sul', setorNum: '36', nome: 'Assembleia de Deus Missões ADBLu', bairro: 'Valparaíso', endereco: 'Rua Antônio Zendron, 2070', culto: 'Seg 19:00 · Qui 19:00 · Dom 18:30', denominacao: 'Assembleia de Deus', congregacao: 'Zendron', fonteLista: 'lista-papel' },
]

export const TOTAL_LISTA_PAPEL = IGREJAS_LISTA_PAPEL.length
