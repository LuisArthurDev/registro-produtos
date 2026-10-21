#!/usr/bin/env python3
import json
from pathlib import Path

root = Path(__file__).resolve().parent
items_path = root / "items.txt"
json_path = root / "produtos_ean.json"


def normalize(value: str) -> str:
    return " ".join((value or "").split()).strip()


def build_item_map() -> dict[str, str]:
    item_map: dict[str, str] = {}
    if not items_path.exists():
        return item_map

    with items_path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            parts = [p.strip() for p in line.split("\t")]
            if len(parts) >= 3:
                ean, produto, secao = parts[0], parts[1], parts[2]
                item_map[normalize(produto).upper()] = normalize(secao)
            elif len(parts) == 2:
                produto, secao = parts[0], parts[1]
                item_map[normalize(produto).upper()] = normalize(secao)
    return item_map


if not json_path.exists():
    raise FileNotFoundError(f"Arquivo JSON não encontrado: {json_path}")

with json_path.open("r", encoding="utf-8") as f:
    original = json.load(f)

item_map = build_item_map()
converted: dict[str, dict[str, str]] = {}

for ean, value in original.items():
    if isinstance(value, dict):
        produto = normalize(str(value.get("produto") or value.get("nome") or ""))
        secao = normalize(str(value.get("secao") or ""))
    else:
        produto = normalize(str(value))
        secao = item_map.get(produto.upper(), "")

    converted[str(ean)] = {
        "produto": produto,
        "secao": secao,
    }

with json_path.open("w", encoding="utf-8") as f:
    json.dump(converted, f, ensure_ascii=False, indent=2)
    f.write("\n")

print(f"Arquivo convertido: {json_path}")
print(f"Registros: {len(converted)}")
