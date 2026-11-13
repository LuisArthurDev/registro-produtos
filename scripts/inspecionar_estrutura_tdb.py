#!/usr/bin/env python3
"""Diagnóstico SOMENTE LEITURA dos nomes de colunas Absolute Database observados.

Extrai apenas metadados de esquema das páginas comprimidas ABSP tipo 8.
Não lê registros pessoais, não gera nem modifica arquivos .TDB.
O formato de páginas foi observado no Teste2(1).TDB e não é uma especificação geral.
"""
import argparse
import hashlib
import json
import re
import zlib
from pathlib import Path

PAGE_SIZE = 4096
PAGE_MARK = b'ABSP'
MAGIC = b'ABS0LUTEDATABASEL'


def diagnosticar_tdb(path):
    file_path = Path(path)
    content = file_path.read_bytes()
    if not content.startswith(MAGIC):
        raise ValueError('Assinatura incompatível com a amostra Absolute Database')
    if len(content) > 256 * 1024 * 1024:
        raise ValueError('Arquivo excessivamente grande para diagnóstico local')
    header_size = len(content) % PAGE_SIZE
    if header_size < 64:
        raise ValueError('Geometria de páginas não reconhecida nesta amostra')
    pages = (len(content) - header_size) // PAGE_SIZE
    result = {
        'arquivo': file_path.name, 'bytes': len(content),
        'sha256': hashlib.sha256(content).hexdigest(),
        'assinatura': MAGIC.decode('ascii'), 'marcador': PAGE_MARK.decode('ascii'),
        'tamanho_pagina_observado': PAGE_SIZE, 'prefixo_em_bytes': header_size,
        'paginas_declaradas_pelo_tamanho': pages,
        'tabelas': [],
        'observacao': ('Nomes extraídos de metadados comprimidos; informações de tipo, '
                       'chaves, defaults, constraints e vínculos exigem validação nativa. '
                       'ESTE DIAGNÓSTICO NÃO GERA TDB IMPORTÁVEL.')
    }
    for i in range(pages):
        page = content[header_size + i * PAGE_SIZE: header_size + (i+1) * PAGE_SIZE]
        if page[:4] != PAGE_MARK:
            continue
        kind = int.from_bytes(page[8:10], 'little')
        if kind != 8:  # metadados de esquema, não registros
            continue
        # Arquivo da amostra usa zlib neste offset, não presume ser universal.
        if page[50:52] not in (b'\x78\x01', b'\x78\x9c', b'\x78\xda', b'\x78\x5e'):
            continue
        decoder = zlib.decompressobj()
        decompressed = decoder.decompress(page[50:], 200000)
        if not decoder.eof or len(decompressed) < 8:
            continue
        field_count = int.from_bytes(decompressed[:4], 'little')
        if not (1 <= field_count <= 250):
            continue
        cursor = 4
        fields = []
        for _ in range(field_count):
            if cursor + 1 >= len(decompressed):
                raise ValueError('Esquema truncado')
            size = decompressed[cursor]
            start = cursor + 1
            descriptor = start + size
            if size < 1 or descriptor+45 > len(decompressed):
                raise ValueError('Campo de tamanho inválido')
            name = decompressed[start:descriptor].decode('ascii')
            if not re.fullmatch(r'[A-Z][A-Z0-9_]{0,100}', name):
                raise ValueError('Nome de campo desconhecido')
            # A amostra usa 45 bytes de metadados após cada nome; códigos sem tipo inferido.
            attrs = decompressed[descriptor:descriptor + 45]
            fld = {'nome': name, 'id_interno_observado': int.from_bytes(attrs[0:4], 'little'),
                   'marcadores_tipo_hex_observados': attrs[4:6].hex()}
            if attrs[4:6] == b'\x03\x02':
                fld['comprimento_textual_aparente'] = int.from_bytes(attrs[6:8], 'little')
            fields.append(fld)
            cursor = descriptor + 45
        result['tabelas'].append({'nome': fields[0]['nome'], 'pagina_esquema': i,
                                 'quantidade_campos': len(fields), 'campos': fields})
    if not result['tabelas']:
        raise ValueError('Nenhum esquema de tabela suportado encontrado')
    return result


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('arquivo',help='Caminho do .TDB (nunca será modificado)')
    parser.add_argument('--saida',help='Arquivo JSON opcional para relatório sem registros')
    args=parser.parse_args()
    meta=diagnosticar_tdb(args.arquivo)
    text=json.dumps(meta,ensure_ascii=False,indent=2)+'\n'
    if args.saida:
        Path(args.saida).write_text(text,encoding='utf-8')
    else:
        print(text)
