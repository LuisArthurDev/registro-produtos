#!/usr/bin/env python3
"""Converte arquivo ODS padrão do Procfit para CSV sem depender de pacote externo.

Aceita cabeçalho com variações de nomes. Mantém EAN e Código Interno como texto.
É intencionalmente conservador: se as colunas não forem identificadas, não inventa mapeamento.
"""
import argparse, csv, re, sys, unicodedata, zipfile, xml.etree.ElementTree as ET
T='{urn:oasis:names:tc:opendocument:xmlns:table:1.0}'
X='{urn:oasis:names:tc:opendocument:xmlns:text:1.0}'


def clean(v):
    return ' '.join(''.join(c for c in unicodedata.normalize('NFD',str(v).lower()) if unicodedata.category(c)!='Mn').split()).replace('.','').replace(' ','_')


def sheet_rows(path):
    with zipfile.ZipFile(path) as z:
        root=ET.fromstring(z.read('content.xml'))
        table=root.find('.//'+T+'table')
        if table is None:raise ValueError('ODS sem tabela')
        for xmlrow in table.findall(T+'table-row'):
            v=[]
            for cell in xmlrow:
                if cell.tag not in (T+'table-cell',T+'covered-table-cell'):continue
                n=min(int(cell.get(T+'number-columns-repeated','1')),500)
                text=''.join(cell.itertext()).strip()
                # No LibreOffice, o valor de célula numérica pode estar no atributo office:value.
                value=cell.get('{urn:oasis:names:tc:opendocument:xmlns:office:1.0}value')
                if not text and value is not None:text=value
                v.extend([text]*n)
                if len(v)>600:break
            count=min(int(xmlrow.get(T+'number-rows-repeated','1')),1)
            if count and any(v):yield v


def main():
    a=argparse.ArgumentParser();a.add_argument('arquivo');a.add_argument('saida');args=a.parse_args()
    it=iter(sheet_rows(args.arquivo));first=next(it,[])
    if not first:sys.exit('Planilha ODS vazia')
    keys=list(map(clean,first))
    def column(names):
        for name in names:
            if name in keys:return keys.index(name)
        return None
    names={'ean':['ean','codigo_de_barras','codigo_barras'],'codigo_interno':['produto','codigo_interno','codigo','cod_interno'],
           'descricao':['descricao','nome'],'secao':['secao','seccao'],'quantidade':['quantidade','saldo','saldo_total']}
    cols={k:column(v) for k,v in names.items()}
    if cols['ean'] is None or cols['quantidade'] is None:
        sys.exit('Cabeçalhos não reconhecidos: '+', '.join(first[:30])+'\nRequer EAN e saldo/quantidade. Não será usado mapeamento por posição sem conferência.')
    with open(args.saida,'w',newline='',encoding='utf-8-sig') as f:
        w=csv.DictWriter(f,fieldnames=list(names));w.writeheader();count=0
        for r in it:
            row={k:(r[i].strip() if i is not None and i<len(r) else '') for k,i in cols.items()}
            if not row['ean']:continue
            w.writerow(row);count+=1
    print('Geradas',count,'linhas em',args.saida)
if __name__=='__main__':main()
