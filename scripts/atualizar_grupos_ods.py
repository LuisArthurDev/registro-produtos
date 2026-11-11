#!/usr/bin/env python3
"""Auditoria e atualização de Grupo do catálogo via arquivo ODS versionado.

Somente altera Grupo quando EAN e Código Interno correspondem simultaneamente
à mesma linha do Supabase. Nenhum EAN é convertido para número nem completado.
"""
import argparse
import collections
import csv
import json
import os
from pathlib import Path
import re
import sys
import unicodedata
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from zipfile import ZipFile

T='{urn:oasis:names:tc:opendocument:xmlns:table:1.0}'
X='{urn:oasis:names:tc:opendocument:xmlns:text:1.0}'
O='{urn:oasis:names:tc:opendocument:xmlns:office:1.0}'

def linhas_ods(path):
    with ZipFile(path) as z:
        doc=ET.fromstring(z.read('content.xml'))
    sheet=next(doc.iter(T+'table'),None)
    if sheet is None: raise ValueError('ODS sem tabela')
    for row in sheet.iter(T+'table-row'):
        cells=[]
        for c in row:
            if c.tag not in (T+'table-cell',T+'covered-table-cell'): continue
            n=int(c.attrib.get(T+'number-columns-repeated','1'))
            value=' '.join(''.join(p.itertext()) for p in c.iter(X+'p')).strip() or c.attrib.get(O+'value','')
            cells.extend([value]*min(n,max(0,50-len(cells))))
            if len(cells)>=50:break
        if any(str(v).strip() for v in cells):
            for _ in range(min(1000,int(row.attrib.get(T+'number-rows-repeated','1')))):
                yield cells

def chave(s):
    s=unicodedata.normalize('NFKD',str(s or '').strip())
    return re.sub(r'[^a-z0-9]+','_', ''.join(x for x in s if not unicodedata.combining(x)).lower()).strip('_')

def preparar(linhas):
    cab=None; col={}; validos={}; ignorados=[]; conflitantes=set(); n=0
    for i,row in enumerate(linhas,1):
        if cab is None:
            colunas=[chave(v) for v in row]
            if 'ean' in colunas and ('produto' in colunas or 'codigo_interno' in colunas) and 'grupo' in colunas:
                col={'ean':colunas.index('ean'),'codigo_interno':colunas.index('codigo_interno') if 'codigo_interno' in colunas else colunas.index('produto'),'grupo':colunas.index('grupo')};cab=i
            elif i>25: raise ValueError('Cabeçalho EAN, Produto (código interno) e Grupo não encontrado')
            continue
        def field(name):
            j=col[name];return str(row[j]).strip() if j<len(row) else ''
        ean,interno,grupo=field('ean'),field('codigo_interno'),field('grupo')
        n+=1
        if not re.fullmatch(r'\d{8,14}',ean) or not re.fullmatch(r'\d{1,40}',interno) or not grupo or len(grupo)>120:
            ignorados.append({'linha':i,'ean':ean,'codigo_interno':interno,'motivo':'identificador ou grupo inválido'});continue
        item={'ean':ean,'codigo_interno':interno,'grupo':grupo}
        old=validos.get(ean)
        if old and old!=item:
            conflitantes.add(ean)
            ignorados.append({'linha':i,'ean':ean,'codigo_interno':interno,'motivo':'EAN repetido com dados divergentes'})
        elif not old: validos[ean]=item
    if cab is None: raise ValueError('Cabeçalho EAN, Produto e Grupo não encontrado')
    for e in conflitantes:
        ignorados.append({'ean':e,'codigo_interno':validos[e]['codigo_interno'],'motivo':'EAN conflitante descartado por segurança'})
        del validos[e]
    return list(validos.values()),ignorados,{'cabecalho_linha':cab,'linhas_processadas':n,'aprovadas':len(validos),'ignoradas':len(ignorados),'conflitos':len(conflitantes)}

def registrar(base,key,itens):
    url=base.rstrip('/')+'/rest/v1/rpc/atualizar_grupos_por_ods'
    data=json.dumps({'p_itens':itens},ensure_ascii=False).encode()
    headers={'apikey':key,'Content-Type':'application/json','Accept':'application/json'}
    if key.count('.')==2:headers['Authorization']='Bearer '+key
    req=urllib.request.Request(url,data,headers,method='POST')
    try:
        with urllib.request.urlopen(req,timeout=45) as response:return json.load(response)
    except urllib.error.HTTPError as exc:
        detalhe=exc.read().decode(errors='replace')[:800]
        raise RuntimeError(f'Falha no Supabase HTTP {exc.code}: {detalhe}') from exc

def main(argv=None):
    p=argparse.ArgumentParser();p.add_argument('--arquivo',default='atualizacao-produtos.ods');p.add_argument('--aplicar',action='store_true');p.add_argument('--relatorio',default='relatorio-atualizacao-grupos.json')
    args=p.parse_args(argv)
    itens,ignorados,resumo=preparar(linhas_ods(args.arquivo))
    resumo['modo']='aplicação' if args.aplicar else 'validação';resumo['sem_correspondencia']=0;resumo['alterados']=0;resumo['correspondentes']=0
    if args.aplicar:
        base=os.getenv('SUPABASE_URL','').strip();key=os.getenv('SUPABASE_SECRET_KEY','').strip()
        if not (base.startswith('https://') and key):raise RuntimeError('Configure SUPABASE_URL e SUPABASE_SECRET_KEY nos Secrets')
        for i in range(0,len(itens),200):
            resposta=registrar(base,key,itens[i:i+200])
            for k in ['alterados','correspondentes','sem_correspondencia']:resumo[k]+=int(resposta.get(k,0))
            ignorados.extend(dict(x,motivo='EAN e Código Interno não coincidem com o mesmo cadastro') for x in resposta.get('divergencias',[]))
        if resumo['correspondentes']+resumo['sem_correspondencia']!=len(itens):raise RuntimeError('Contagem de atualização inconsistente')
    resultado={'resumo':resumo,'divergencias':ignorados}
    Path(args.relatorio).write_text(json.dumps(resultado,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(resumo,ensure_ascii=False))
    print('Relatório:',args.relatorio)
    return 0

if __name__=='__main__':sys.exit(main())
