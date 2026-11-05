#!/usr/bin/env python3
"""Gera produtos_ean.db a partir do catálogo JSON sem converter códigos em números."""
import json
import os
import sqlite3
import sys
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / 'produtos_ean.json'
DB_PATH = ROOT / 'produtos_ean.db'
VERSION_PATH = ROOT / 'catalogo_versao.json'
TMP_PATH = ROOT / 'produtos_ean.db.tmp'


def texto(valor):
    if valor is None:
        return ''
    return ' '.join(str(valor).split()).strip()


def main():
    if not JSON_PATH.is_file():
        raise FileNotFoundError(f'Catálogo não encontrado: {JSON_PATH}')
    with JSON_PATH.open('r', encoding='utf-8-sig') as f:
        dados = json.load(f)
    if not isinstance(dados, dict):
        raise ValueError('O produtos_ean.json precisa ser um objeto indexado por código/EAN.')

    if TMP_PATH.exists():
        TMP_PATH.unlink()
    con = sqlite3.connect(TMP_PATH)
    try:
        con.execute('PRAGMA page_size=8192')
        con.execute('PRAGMA journal_mode=DELETE')
        con.execute('PRAGMA synchronous=FULL')
        con.execute('''CREATE TABLE produtos (
            ean TEXT PRIMARY KEY,
            codigo_interno TEXT NOT NULL DEFAULT '',
            descricao TEXT NOT NULL DEFAULT '',
            secao TEXT NOT NULL DEFAULT ''
        ) WITHOUT ROWID''')
        con.execute('CREATE INDEX idx_produtos_codigo_interno ON produtos(codigo_interno)')
        lote = []
        for chave, item in dados.items():
            codigo = texto(chave)
            if not codigo:
                continue
            if isinstance(item, dict):
                interno = texto(item.get('codigoInterno') or item.get('codigo_interno') or item.get('codInterno'))
                descricao = texto(item.get('produto') or item.get('descricao') or item.get('nome'))
                secao = texto(item.get('secao') or item.get('seção'))
            else:
                interno, descricao, secao = '', texto(item), ''
            lote.append((codigo, interno, descricao, secao))
            if len(lote) >= 5000:
                con.executemany('INSERT OR REPLACE INTO produtos(ean,codigo_interno,descricao,secao) VALUES(?,?,?,?)', lote)
                lote.clear()
        if lote:
            con.executemany('INSERT OR REPLACE INTO produtos(ean,codigo_interno,descricao,secao) VALUES(?,?,?,?)', lote)
        con.execute('ANALYZE')
        con.commit()
        con.execute('VACUUM')
        total = con.execute('SELECT COUNT(*) FROM produtos').fetchone()[0]
        if total < 1:
            raise ValueError('A geração do SQLite resultou em um banco vazio.')
        integridade = con.execute('PRAGMA integrity_check').fetchone()[0]
        if integridade != 'ok':
            raise ValueError(f'Falha na integridade do SQLite: {integridade}')
        print(f'Banco SQLite gerado: {total} produtos')
    finally:
        con.close()
    TMP_PATH.replace(DB_PATH)
    digest = hashlib.sha256(DB_PATH.read_bytes()).hexdigest()
    VERSION_PATH.write_text(json.dumps({'versao': digest, 'total': total}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(f'Arquivo: {DB_PATH} ({DB_PATH.stat().st_size:,} bytes)')
    print(f'Versão SHA-256: {digest}')


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(f'ERRO: {exc}', file=sys.stderr)
        raise
