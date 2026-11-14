"""Importação única das abas históricas do Controle de Vencidos."""
import argparse
from collections import Counter, defaultdict
from datetime import date, datetime
import json
import os
from pathlib import Path
import re
from urllib.parse import urlencode, quote
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

from openpyxl import load_workbook
from importar_dados import api, batch, pendencia

MESES = {'Setembro 2026': '2026-09-01', 'Outubro 2026': '2026-10-01'}
FUSO = ZoneInfo('America/Sao_Paulo')


def texto(valor):
    if isinstance(valor, float) and valor.is_integer():
        valor = int(valor)
    return str(valor).strip() if valor is not None else ''


def ler(path, loja):
    workbook = load_workbook(path, read_only=True, data_only=True)
    try:
        for aba, mes in MESES.items():
            linhas = workbook[aba].iter_rows(max_col=11)
            cab = [texto(c.value) for c in next(linhas)]
            esperadas = {'Cod/Ean', 'Lote', 'Validade', 'Qtd', 'Descrição', 'Seção', 'Data da Coleta'}
            if not esperadas.issubset(cab):
                raise ValueError(f'Colunas inesperadas em {aba}.')
            for numero, linha in enumerate(linhas, 2):
                dados = {nome: cel.value for nome, cel in zip(cab, linha)}
                if not any(dados.get(k) is not None for k in ('Cod/Ean', 'Lote', 'Qtd', 'Descrição')):
                    continue
                codigo = texto(dados['Cod/Ean'])
                lote = texto(dados['Lote'])
                quantidade = dados['Qtd']
                validade = dados['Validade']
                coleta = dados['Data da Coleta']
                try:
                    if not re.fullmatch(r'[0-9]{1,20}', codigo) or not 1 <= len(lote) <= 100:
                        raise ValueError()
                    if type(quantidade) not in (int, float) or int(quantidade) != quantidade or not 0 <= quantidade <= 2147483647:
                        raise ValueError()
                    if isinstance(validade, datetime):
                        validade = validade.date()
                    elif not isinstance(validade, date):
                        formato = '%d/%m/%Y' if len(texto(validade).rsplit('/', 1)[-1]) == 4 else '%d/%m/%y'
                        validade = datetime.strptime(texto(validade), formato).date()
                except (ValueError, OverflowError):
                    raise ValueError(f'{aba}, linha {numero}: confira código, lote, quantidade e Validade.') from None
                dia = coleta if isinstance(coleta, datetime) and coleta.strftime('%Y-%m') == mes[:7] else datetime.fromisoformat(mes + 'T12:00:00')
                yield dict(loja_id=loja, mapa_nome='Sem responsável', tipo_mapa='funcionario',
                           lote=lote, validade=validade.isoformat(), quantidade=int(quantidade),
                           mes_lancamento=mes, criado_em=dia.replace(tzinfo=FUSO).isoformat(),
                           origem_migracao=f'controle-vencidos-2026:{loja}:{mes}:{numero}',
                           codigo_original=codigo, descricao=texto(dados['Descrição']),
                           secao=texto(dados['Seção']))
    finally:
        workbook.close()


def catalogo(registros, conexao):
    encontrados = defaultdict(list)
    for campo, codigos in (
        ('ean', sorted({r['codigo_original'] for r in registros if len(r['codigo_original']) in range(8, 15)})),
        ('codigo_interno', sorted({r['codigo_original'] for r in registros})),
    ):
        for bloco in batch(codigos, 60):
            cursor = None
            while True:
                params = dict(select=f'id,ean,{campo}' if campo != 'ean' else 'id,ean',
                              order='id.asc', limit=100, **{campo: 'in.(' + ','.join(bloco) + ')'})
                if cursor:
                    params['id'] = 'gt.' + cursor
                produtos = json.loads(api('produtos?' + urlencode(params), method='GET', **conexao))
                if not produtos:
                    break
                for produto in produtos:
                    encontrados[campo, produto[campo]].append(produto)
                cursor = produtos[-1]['id']
    return encontrados


def ja_processados(registros, conexao):
    processados = set()
    origens = [r['origem_migracao'] for r in registros]
    for tabela in ('mapa_lancamentos', 'migracao_pendencias'):
        for bloco in batch(origens, 60):
            params = urlencode({'select': 'origem_migracao',
                                'origem_migracao': 'in.(' + ','.join(bloco) + ')'})
            salvos = json.loads(api(tabela + '?' + params, method='GET', **conexao))
            processados.update(item['origem_migracao'] for item in salvos)
    return processados


def resolver(registros, produtos):
    mapas, pendencias = [], []
    for linha in registros:
        codigo = linha['codigo_original']
        candidatos = produtos['ean', codigo] or produtos['codigo_interno', codigo]
        if len(candidatos) == 1:
            produto = candidatos[0]
            mapa = {k: v for k, v in linha.items() if k not in ('codigo_original', 'descricao', 'secao')}
            mapas.append({**mapa, 'ean': produto['ean'], 'produto_id': produto['id']})
        elif not candidatos and len(codigo) in range(8, 15):
            mapa = {k: v for k, v in linha.items() if k not in ('codigo_original', 'descricao', 'secao')}
            mapas.append({**mapa, 'ean': codigo, 'produto_id': None})
        else:
            pendencias.append(pendencia({**linha, 'ean': ''}, 'mapa_lancamentos',
                                       'Código interno sem EAN único no catálogo'))
    return mapas, pendencias


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--arquivo', type=Path, default=Path('controle-vencidos.xlsx'))
    parser.add_argument('--loja', default='151')
    parser.add_argument('--offline', action='store_true')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    if not re.fullmatch(r'[0-9]{1,12}', args.loja) or (args.apply and args.offline):
        parser.error('Confira a loja e o modo de execução.')
    if not args.offline:
        conexao = dict(url=os.environ['SUPABASE_URL'].rstrip('/'), key=os.environ['SUPABASE_SECRET_KEY'])
        if not conexao['url'].startswith('https://') or not conexao['key']:
            parser.error('Configure SUPABASE_URL e SUPABASE_SECRET_KEY.')
    if not args.arquivo.exists() and not args.offline:
        bucket = os.environ.get('CONTROLE_BUCKET', 'migracao')
        headers = {'apikey': conexao['key']}
        if conexao['key'].count('.') == 2:
            headers['Authorization'] = 'Bearer ' + conexao['key']
        endereco = conexao['url'] + '/storage/v1/object/authenticated/' + quote(bucket, safe='') + '/controle-vencidos.xlsx'
        with urlopen(Request(endereco, headers=headers), timeout=60) as resposta:
            conteudo = resposta.read(30 * 1024 * 1024 + 1)
        if len(conteudo) > 30 * 1024 * 1024:
            raise ValueError('Planilha maior que o limite de 30 MiB.')
        args.arquivo.write_bytes(conteudo)
    registros = list(ler(args.arquivo, args.loja))
    for mes, total in Counter(r['mes_lancamento'] for r in registros).items():
        unidades = sum(r['quantidade'] for r in registros if r['mes_lancamento'] == mes)
        print(f'{mes[:7]}: {total} lançamentos, {unidades} unidades')
    if args.offline:
        return
    lojas = json.loads(api('lojas?id=eq.' + args.loja + '&select=id', method='GET', **conexao))
    if not lojas:
        raise ValueError('Loja não cadastrada.')
    processados = ja_processados(registros, conexao)
    novos = [r for r in registros if r['origem_migracao'] not in processados]
    print(f'Linhas já processadas: {len(registros) - len(novos)}.')
    mapas, pendencias = resolver(novos, catalogo(novos, conexao))
    print(f'Mapas: {len(mapas)}. Pendências de código interno: {len(pendencias)}.')
    if args.apply:
        for tabela, linhas in [('mapa_lancamentos', mapas), ('migracao_pendencias', pendencias)]:
            for bloco in batch(linhas, 100):
                api(tabela, bloco, conflict='origem_migracao', **conexao)
        print('Importação concluída. Registros com a mesma origem foram preservados.')
    else:
        print('Prévia concluída sem gravação.')


if __name__ == '__main__':
    main()
