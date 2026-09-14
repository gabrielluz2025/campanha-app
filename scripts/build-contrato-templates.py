# -*- coding: utf-8 -*-
"""Gera catálogo JS a partir dos .txt extraídos, convertendo tabelas em blocos legíveis
e inserindo {{placeholders}} nos campos do contratado/candidato."""
from pathlib import Path
import re
import json

src = Path(__file__).resolve().parent.parent / '.tmp-contratos-txt'
out_js = Path(__file__).resolve().parent.parent / 'src' / 'utils' / 'contratoTemplatesCatalog.js'

CATALOG_META = [
  ('MODELO_-_CONTRATO_-_CABO_ELEITORAL', 'cabo-eleitoral', 'Cabo eleitoral / prestação de serviços', 'equipe', True),
  ('Cópia_de_CONTRATO_DE_PRESTAÇÃO_DE_SERVIÇOS_DE_CAMPANHA_2022', 'prestacao-campanha', 'Prestação de serviços de campanha', 'equipe', True),
  ('Contrato_de_entrega_e_divulgadores_de_material', 'panfletagem', 'Panfletagem / mobilização / bandeiraço', 'equipe', True),
  ('Cópia_de_Cópia_de_Modelo_prest_serviço_P_Física', 'prestacao-pf', 'Prestação de serviços — pessoa física', 'equipe', True),
  ('Cópia_de_Cópia_de_Modelo_prest_serviço_P_Física_PARTIDO', 'prestacao-pf-partido', 'Prestação de serviços PF — partido', 'equipe', True),
  ('Cópia_de_TRABALHO_VOLUNTÁRIO_2024', 'voluntario', 'Termo de trabalho voluntário', 'equipe', True),
  ('Cópia_de_Cópia_de_termo_de_adesao_de_serv_voluntarios', 'adesao-voluntario', 'Termo de adesão — serviços voluntários', 'equipe', True),
  ('Cópia_Termo_de_Autorização_de_Uso_de_Imagem', 'uso-imagem', 'Autorização de uso de imagem', 'equipe', True),
  ('MODELO_-_CONTRATO_-_DOAÇÃO_DE_SERVIÇO', 'doacao-servico', 'Termo de doação estimada de serviço', 'equipe', True),
  ('MODELO_-_RECIBO_DE_PAGAMENTO', 'recibo', 'Recibo de pagamento', 'equipe', True),
  ('Cópia_de_MODELO_RECIBO_PGTO_PESSOAL_-_ELEIÇÕES_2020', 'recibo-pessoal', 'Recibo de pagamento pessoal', 'equipe', True),
  ('Cópia_de_AUTORIZAÇÃO_DE_PERFURADE_E_USO_DE_DADOS', 'propaganda-bem', 'Autorização de propaganda em bem particular', 'equipe', True),
  ('Cópia_de_Termo_Cessao_imóveis_e_veículos', 'cessao', 'Termo de cessão (imóveis e veículos)', 'patrimonio', False),
  ('CONTRATO_DE_LOCAÇÃO_VEÍCULO', 'locacao-veiculo', 'Locação de veículo', 'patrimonio', False),
  ('Cópia_de_Cópia_de_contrato_locacao_comite', 'locacao-comite', 'Locação de imóvel — comitê', 'patrimonio', False),
  ('Cópia_de_Cópia_de_contrato_locacao_comite_central_com_mobilia', 'locacao-comite-mobilia', 'Locação comitê central com mobília', 'patrimonio', False),
  ('Cópia_de_Cópia_de_contrato_sublocacao_imovel', 'sublocacao', 'Sublocação de bem imóvel', 'patrimonio', False),
  ('CONTRATO_DE_PRESTAÇÃO_DE_SERVIÇOS_DE_TRANSPORTE_PARA_EMPRESA_-_MODELO', 'transporte', 'Prestação de serviços de transporte', 'fornecedor', False),
  ('Cópia_de_Cópia_de_contrato_fornecimento_de_combustiveis', 'combustivel', 'Fornecimento de combustíveis', 'fornecedor', False),
  ('Cópia_de_Cópia_de_contrato_hotel', 'hotel', 'Locação de salas / hotel', 'fornecedor', False),
  ('Cópia_de_Cópia_de_contrato_informatica', 'informatica', 'Contrato de informática', 'fornecedor', False),
  ('Cópia_de_Cópia_de_Contrato_Produtora', 'produtora', 'Contrato com produtora', 'fornecedor', False),
  ('Cópia_de_Cópia_de_Minuta_contrato_-_Clipagem', 'clipagem', 'Minuta — clipagem', 'fornecedor', False),
]

# Corpo canônico do Cabo Eleitoral (fiel ao DOCX da advogada + placeholders)
CABO_ELEITORAL = '''CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE CAMPANHA
CONTRATO DE PRESTAÇÃO DE SERVIÇOS - ELEIÇÕES {{ano}} – LEI FEDERAL Nº 9.504/97

CONTRATANTE: ELEIÇÃO {{ano}} {{candidatoNome}} CNPJ sob n.º {{candidatoCnpj}}

CLÁUSULA PRIMEIRA - OBJETO: É objeto do presente contrato de prestação de serviços para CAMPANHA ELEITORAL, os itens abaixo discriminados:
{{listaObjeto}}

CLÁUSULA SEGUNDA - VALOR: O valor a ser pago ao prestador de serviço será de {{valor}} por DIA/SEMANA/MÊS, mediante o cheque nominal ou transferência bancária, de acordo com valor de mercado.

CLÁUSULA TERCEIRA – PRAZO: O prazo da prestação de serviço se dará a contar de {{dataInicioCurta}} até o dia {{dataFimCurta}}, podendo ser rescindido a qualquer tempo a critério das partes.

CLÁUSULA QUARTA – DA FUNDAMENTAÇÃO JÚRIDICA DO CONTRATO: Art. 26, VII da Lei Federal nº 9.504/97 (Lei das Eleições).
Parágrafo Primeiro- Fica o(a) CONTRATADO(a) obrigado a emissão relatórios referentes as suas atividades, objeto desta prestação de serviços, descritas na Cláusula Primeira, sob pena de devolução dos recursos recebidos provenientes do Fundo Especial de Financiamento de Campanha - FEFC.
Parágrafo Segundo – CARGA HORÁRIA - O CONTRATADO(A) se compromete, neste ato, a prestar os serviços acima citados, na carga horária de {{horas}}, em local a ser designado pelo CONTRATANTE, observada as formalidades legais, especialmente nos bairros: {{regiao}}.
Parágrafo Terceiro. O horário de trabalho poderá a vir ser alterado tantas vezes quanto necessário, para qualquer outro, inclusive da noite para o dia e vice-versa, desde que respeitado os limites legais, sem que assista ao(á) CONTRATADO(A) qualquer direito de indenização

CLÁUSULA QUINTA – INEXISTÊNCIA DE VÍNCULO: O presente contrato não gera vínculo empregatício, nos termos do disposto no art. 100, da Lei nº 9.504/97 - Art. 100. A contratação de pessoal para prestação de serviços nas campanhas eleitorais não gera vínculo empregatício com o candidato ou partido contratantes, aplicando-se à pessoa física contratada o disposto na alínea h do inciso V do art. 12 da Lei no 8.212, de 24 de julho de 1991.
Parágrafo Único: Fica a cargo do Contribuinte Individual a contribuição de Previdência Social, ciente de que a prestação de serviços ao candidato não gera vínculos trabalhistas.

CLÁUSULA SEXTA – DAS OBRIGAÇÕES: O Prestador de Serviço deverá agir com diligência e estrita observância da legislação eleitoral, civil e criminal, não respondendo o CANDIDATO por quaisquer condutas ativas ou passivas, comissivas ou omissivas adotadas por aquele no desempenho dos serviços aqui contratados.
Parágrafo Único: O presente instrumento será rescindido de forma imediata, sem comunicação à parte infratora, quando forem descumpridas quaisquer das cláusulas do presente instrumento, bem como – e especialmente – houver transgressão à legislação eleitoral, notadamente no que diz respeito à propaganda eleitoral.

CLÁUSULA SÉTIMA – CASOS OMISSOS: Os casos omissos serão resolvidos pelas partes, de comum acordo, ou pelas disposições legais aplicáveis à espécie.

CLÁUSULA OITAVA – DO FORO: Para dirimir quaisquer dúvidas que decorrem da execução do presente instrumento, fica eleito o Foro da Comarca de {{foro}}.
Município de {{cidadeAssinatura}}, {{dataAssinaturaCurta}}.

CONTRATADO: {{prestadorNome}}
CPF: {{prestadorCpf}}
Data de nascimento: {{prestadorNascimento}}
Endereço: {{prestadorEndereco}}
E-mail: {{prestadorEmail}}
Telefone: {{prestadorTelefone}}
Inf. Bancárias — Banco: {{prestadorBanco}}  Agência: {{prestadorAgencia}}  Conta: {{prestadorConta}}  PIX: {{prestadorPix}}

{{blocoAssinaturas}}'''

PRESTACAO_CAMPANHA = '''CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE CAMPANHA
CONTRATO DE PRESTAÇÃO DE SERVIÇOS - ELEIÇÕES {{ano}} – LEI FEDERAL Nº 9.504/97

CONTRATANTE: ELEIÇÃO {{ano}} {{candidatoNome}} CNPJ sob n.º {{candidatoCnpj}}, Candidato(a) às eleições {{ano}}

CONTRATADO: {{prestadorNome}}
CPF: {{prestadorCpf}}
RG: {{prestadorRg}}
Data de nascimento: {{prestadorNascimento}}
Endereço: {{prestadorEndereco}}
E-mail: {{prestadorEmail}}
Telefone: {{prestadorTelefone}}
Inf. Bancárias — Banco: {{prestadorBanco}}  Agência: {{prestadorAgencia}}  Conta: {{prestadorConta}}  PIX: {{prestadorPix}}

CLÁUSULA PRIMEIRA - OBJETO: É objeto do presente contrato de prestação de serviços para CAMPANHA ELEITORAL, os itens abaixo discriminados:
{{listaObjeto}}

CLÁUSULA SEGUNDA - VALOR: O valor a ser pago ao prestador de serviço será de {{valor}}, mediante o cheque nominal ou transferência bancária.

CLÁUSULA TERCEIRA – PRAZO: O prazo da prestação de serviço se dará a contar de {{dataInicioCurta}} até o dia {{dataFimCurta}}, podendo ser rescindido a qualquer tempo a critério das partes.

CLÁUSULA QUARTA – DA FUNDAMENTAÇÃO JÚRIDICA DO CONTRATO: Art. 26, VII da Lei Federal nº 9.504/97 (Lei das Eleições).
Parágrafo Primeiro- Fica o(a) CONTRATADO(a) obrigado a emissão relatórios referentes as suas atividades, objeto desta prestação de serviços, descritas na Cláusula Primeira, sob pena de devolução dos recursos recebidos provenientes do Fundo Especial de Financiamento de Campanha - FEFC.
Parágrafo Segundo – CARGA HORÁRIA - O CONTRATADO(A) se compromete, neste ato, a prestar os serviços acima citados, na carga horária de {{horas}}, em local a ser designado pelo CONTRATANTE, observada as formalidades legais.
Parágrafo Terceiro. O horário de trabalho poderá a vir ser alterado tantas vezes quanto necessário, para qualquer outro, inclusive da noite para o dia e vice-versa, desde que respeitado os limites legais, sem que assista ao(á) CONTRATADO(A) qualquer direito de indenização

CLÁUSULA QUINTA – INEXISTÊNCIA DE VÍNCULO: O presente contrato não gera vínculo empregatício, nos termos do disposto no art. 100, da Lei nº 9.504/97 - Art. 100. A contratação de pessoal para prestação de serviços nas campanhas eleitorais não gera vínculo empregatício com o candidato ou partido contratantes, aplicando-se à pessoa física contratada o disposto na alínea h do inciso V do art. 12 da Lei no 8.212, de 24 de julho de 1991.
Parágrafo Único: Fica a cargo do Contribuinte Individual a contribuição de Previdência Social, ciente de que a prestação de serviços ao candidato não gera vínculos trabalhistas.

CLÁUSULA SEXTA – DAS OBRIGAÇÕES: O Prestador de Serviço deverá agir com diligência e estrita observância da legislação eleitoral, civil e criminal, não respondendo o CANDIDATO por quaisquer condutas ativas ou passivas, comissivas ou omissivas adotadas por aquele no desempenho dos serviços aqui contratados.
Parágrafo Único: O presente instrumento será rescindido de forma imediata, sem comunicação à parte infratora, quando forem descumpridas quaisquer das cláusulas do presente instrumento, bem como – e especialmente – houver transgressão à legislação eleitoral, notadamente no que diz respeito à propaganda eleitoral.

CLÁUSULA SÉTIMA – CASOS OMISSOS: Os casos omissos serão resolvidos pelas partes, de comum acordo, ou pelas disposições legais aplicáveis à espécie.

CLÁUSULA OITAVA – DO FORO: Para dirimir quaisquer dúvidas que decorrem da execução do presente instrumento, fica eleito o Foro da Comarca de {{foro}}.
Município de {{cidadeAssinatura}}, {{dataAssinaturaCurta}}.

{{blocoAssinaturas}}'''

OVERRIDE_CORPOS = {
  'cabo-eleitoral': CABO_ELEITORAL,
  'prestacao-campanha': PRESTACAO_CAMPANHA,
}


def clean(text: str) -> str:
    text = text.replace('\r', '\n').replace('\x07', '').replace('\xa0', ' ')
    text = re.sub(r'\n{3,}', '\n\n', text)
    lines = []
    for ln in text.split('\n'):
        s = ln.strip()
        if s == '|':
            continue
        # "LABEL: |"  → "LABEL: "
        s2 = re.sub(r'^([^:\n]{2,40}:)\s*\|?\s*$', r'\1 ', s)
        if s2 == '' and lines and lines[-1] == '':
            continue
        lines.append(s2 if s else ln.rstrip())
    return '\n'.join(lines).strip()


def inject_placeholders(text: str) -> str:
    """Troca campos vazios comuns por {{placeholders}} sem apagar o texto jurídico."""
    reps = [
        (r'(CONTRATADO:\s*)(?:\|)?\s*(?=\n|$)', r'\1{{prestadorNome}}'),
        (r'(^|\n)(CPF:\s*)(?:\|)?\s*(?=\n|$)', r'\1\2{{prestadorCpf}}'),
        (r'(Data de nascimento:\s*)(?:\|)?\s*(?=\n|$)', r'\1{{prestadorNascimento}}'),
        (r'(Endere[cç]o:\s*)(?:\|)?\s*(?=\n|$)', r'\1{{prestadorEndereco}}'),
        (r'(E-?mail:\s*)(?:\|)?\s*(?=\n|$)', r'\1{{prestadorEmail}}'),
        (r'(Telefone:\s*)(?:\|)?\s*(?=\n|$)', r'\1{{prestadorTelefone}}'),
        (r'(RG\s*n[ºo°]?\s*)(?:\|)?\s*(?=\n|$)', r'\1{{prestadorRg}}'),
        (r'(Banco:\s*)_{0,}', r'\1{{prestadorBanco}} '),
        (r'(Ag[eê]ncia:\s*)_{0,}', r'\1{{prestadorAgencia}} '),
        (r'(Conta:\s*)_{0,}', r'\1{{prestadorConta}} '),
        (r'(PIX:\s*)_{0,}', r'\1{{prestadorPix}}'),
    ]
    out = text
    for pat, repl in reps:
        out = re.sub(pat, repl, out, flags=re.IGNORECASE | re.MULTILINE)
    # Evita duplicar placeholders se já existirem
    out = re.sub(r'(\{\{prestador\w+\}\})\s*\1', r'\1', out)
    return out


def find_file(prefix: str):
    if prefix.endswith('.txt'):
        fp = src / prefix
        if fp.exists():
            return fp
        prefix = prefix[:-4]
    cands = []
    for fp in src.glob('*.txt'):
        stem = fp.stem
        base = stem.replace('_docx', '').replace('_doc', '')
        if base == prefix or stem == prefix or stem.startswith(prefix):
            if prefix.rstrip('_').endswith('locacao_comite') and 'central' in stem.lower() and 'mobilia' not in prefix.lower():
                if 'central' in prefix.lower() or 'mobilia' in prefix.lower():
                    pass
                else:
                    continue
            cands.append(fp)
    if not cands:
        for fp in src.glob('*.txt'):
            if prefix in fp.stem:
                if 'locacao_comite' in prefix and 'central' not in prefix and 'central' in fp.stem.lower():
                    continue
                cands.append(fp)
    if not cands:
        return None

    def score(fp: Path):
        t = fp.read_text(encoding='utf-8', errors='ignore')
        bonus = 0 if not (fp.stem.endswith('_docx') or fp.stem.endswith('_doc')) else -1
        return (len(clean(t)), bonus)

    cands.sort(key=score, reverse=True)
    return cands[0]


templates = []
for prefix, tid, title, cat, needs_person in CATALOG_META:
    if tid in OVERRIDE_CORPOS:
        body = OVERRIDE_CORPOS[tid]
        fonte = 'advogada-canonico'
    else:
        fp = find_file(prefix)
        if not fp:
            print('MISSING', prefix)
            continue
        body = inject_placeholders(clean(fp.read_text(encoding='utf-8', errors='ignore')))
        fonte = fp.name
        if len(body) < 50:
            print('SHORT', prefix, len(body))
            continue
    templates.append({
        'id': tid,
        'nome': title,
        'categoria': cat,
        'precisaPessoa': needs_person,
        'fonte': fonte,
        'corpo': body,
    })
    print('OK', tid, len(body))

parts = [
    '/** Catálogo de modelos — documentos da pasta da advogada (com placeholders). */',
    'export const CONTRATO_TEMPLATES = [',
]
for t in templates:
    parts.append('  {')
    parts.append(f"    id: {json.dumps(t['id'])},")
    parts.append(f"    nome: {json.dumps(t['nome'], ensure_ascii=False)},")
    parts.append(f"    categoria: {json.dumps(t['categoria'])},")
    parts.append(f"    precisaPessoa: {str(t['precisaPessoa']).lower()},")
    parts.append(f"    fonte: {json.dumps(t['fonte'], ensure_ascii=False)},")
    parts.append(f"    corpo: {json.dumps(t['corpo'], ensure_ascii=False)},")
    parts.append('  },')
parts.append(']')
parts.append('')
parts.append('export const CONTRATO_CATEGORIAS = [')
parts.append("  { id: 'equipe', label: 'Equipe / pessoas' },")
parts.append("  { id: 'patrimonio', label: 'Imóveis / veículos' },")
parts.append("  { id: 'fornecedor', label: 'Fornecedores' },")
parts.append(']')
parts.append('')

out_js.write_text('\n'.join(parts), encoding='utf-8')
print('Wrote', out_js, 'n=', len(templates))
