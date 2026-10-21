#!/usr/bin/env python3
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
items_path = root / "items.txt"
json_path = root / "produtos_ean.json"


def normalize_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def build_sections_map() -> dict[str, str]:
    sections: dict[str, str] = {}
    with items_path.open("r", encoding="utf-8") as fh:
        for raw_line in fh:
            line = raw_line.strip()
            if not line:
                continue

            parts = [p.strip() for p in line.split("\t")]
            if len(parts) >= 3:
                ean, nome, secao = parts[0], parts[1], parts[2]
                if ean and nome and secao:
                    sections[normalize_text(nome).upper()] = secao
            elif len(parts) == 2:
                nome, secao = parts[0], parts[1]
                if nome and secao:
                    sections[normalize_text(nome).upper()] = secao
    return sections


if not json_path.exists():
    raise FileNotFoundError(f"Arquivo inexistente: {json_path}")

with json_path.open("r", encoding="utf-8") as fh:
    original = json.load(fh)

sections = build_sections_map()
updated: dict[str, dict[str, str | None]] = {}

for ean, produto in original.items():
    if isinstance(produto, dict):
        produto_nome = produto.get("produto") or produto.get("nome") or ""
        secao = produto.get("secao")
        updated[str(ean)] = {"produto": produto_nome, "secao": secao}
        continue

    produto_nome = str(produto)
    secao = sections.get(normalize_text(produto_nome).upper())
    updated[str(ean)] = {"produto": produto_nome, "secao": secao}

with json_path.open("w", encoding="utf-8") as fh:
    json.dump(updated, fh, ensure_ascii=False, indent=2)
    fh.write("\n")

print(f"Arquivo convertido com sucesso: {json_path}")
print(f"Total de registros: {len(updated)}")
