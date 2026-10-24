
#!/usr/bin/env python3
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1]
items_path = root / "items.txt"
json_path = root / "produtos_ean.json"


def normalize(value: str) -> str:
    return " ".join((value or "").split()).strip()


def normalize_key(value: str) -> str:
    return normalize(value).upper()


def build_item_map() -> dict[str, dict[str, str]]:
    item_map: dict[str, dict[str, str]] = {}

    if not items_path.exists():
        return item_map

    with items_path.open("r", encoding="utf-8-sig") as f:
        for line in f:
            line = line.strip()

            if not line:
                continue

            # Formato:
            # Codigo Interno | Ean | Desc | Seccao
            parts = [normalize(p) for p in line.split("\t")]

            # Ignora cabeçalho, se existir
            if parts and normalize_key(parts[0]) in {
                "CODIGO INTERNO",
                "CÓDIGO INTERNO",
            }:
                continue

            if len(parts) < 4:
                continue

            codigo_interno, ean, produto, secao = parts[:4]

            registro = {
                "codigoInterno": codigo_interno,
                "ean": ean,
                "produto": produto,
                "secao": secao,
            }

            # Índice por EAN
            if ean:
                item_map[f"EAN:{normalize_key(ean)}"] = registro

            # Índice por código interno
            if codigo_interno:
                item_map[f"CODIGO:{normalize_key(codigo_interno)}"] = registro

            # Índice por descrição
            if produto:
                item_map[f"PRODUTO:{normalize_key(produto)}"] = registro

    return item_map


if not json_path.exists():
    raise FileNotFoundError(
        f"Arquivo JSON não encontrado: {json_path}"
    )

with json_path.open("r", encoding="utf-8-sig") as f:
    original = json.load(f)

if not isinstance(original, dict):
    raise ValueError(
        "O produtos_ean.json precisa conter um objeto JSON indexado por EAN."
    )

item_map = build_item_map()
converted: dict[str, dict[str, str]] = {}

for ean_original, value in original.items():
    ean = normalize(str(ean_original))

    if isinstance(value, dict):
        produto = normalize(
            str(value.get("produto") or value.get("nome") or "")
        )

        secao = normalize(str(value.get("secao") or ""))

        codigo_interno = normalize(
            str(value.get("codigoInterno") or value.get("codigo_interno") or "")
        )

    else:
        produto = normalize(str(value))
        secao = ""
        codigo_interno = ""

    # Complementa os dados usando o items.txt
    registro = item_map.get(f"EAN:{normalize_key(ean)}")

    if registro:
        codigo_interno = codigo_interno or registro["codigoInterno"]
        produto = produto or registro["produto"]
        secao = secao or registro["secao"]

    converted[ean] = {
        "codigoInterno": codigo_interno,
        "produto": produto,
        "secao": secao,
    }

with json_path.open("w", encoding="utf-8") as f:
    json.dump(converted, f, ensure_ascii=False, indent=2)
    f.write("\n")

print(f"Arquivo convertido: {json_path}")
print(f"Registros no JSON: {len(converted)}")
print(f"Registros disponíveis no items.txt: {len(item_map)}")
print("Conversão concluída!")
