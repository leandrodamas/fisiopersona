#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extrai pares CID-10 -> codigo (+ descricao opcional) a partir da camada de texto de um PDF
(tabelas rasterizadas sem texto nao aparecem; nesse caso use OCR ou exporte a planilha original).

Dependencia:
  pip install -r scripts/requirements-pdf-import.txt

Exemplo:
  python scripts/import-tabela-compat-pdf.py ^
    "C:\\Users\\Usuário\\AppData\\Roaming\\Cursor\\User\\workspaceStorage\\...\\TABELA...pdf" ^
    -o data/cid_procedimento_compat.json

O JSON usa a mesma estrutura esperada pela app (chave porCid).
Revise sempre o arquivo gerado: o layout varia entre operadoras.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path


def cid_pattern() -> re.Pattern[str]:
    # CID-10 (letra + dois digitos + subcategoria opcional)
    return re.compile(
        r"\b([A-TV-Z]\d{2}(?:\.\d{1,4})?)\b",
        re.IGNORECASE,
    )


def code_patterns():
    eight = re.compile(r"\b(\d{8})\b")
    ten = re.compile(r"\b(\d{10})\b")
    sus = re.compile(r"\b(\d{2}\.\d{2}\.\d{2}\.\d{3}-\d)\b")
    return eight, ten, sus


def norm_cid(raw: str) -> str:
    s = raw.strip().replace(",", ".").upper()
    s = re.sub(r"\s+", "", s)
    return s


def split_row(line: str) -> list[str]:
    line = line.strip()
    if not line:
        return []
    if "\t" in line:
        return [c.strip() for c in line.split("\t")]
    parts = [p.strip() for p in re.split(r"\s{2,}", line) if p.strip()]
    return parts


def pick_codes(line: str) -> list[tuple[str, str]]:
    """Lista (codigo, hint) — hint ajuda quando nao ha descricao clara."""
    eight_re, ten_re, sus_re = code_patterns()
    out = []
    for m in eight_re.findall(line):
        out.append((m, "TUSS/" + m))
    for m in ten_re.findall(line):
        out.append((m, "TUSS/" + m))
    for m in sus_re.findall(line):
        out.append((m, "SUS " + m))
    return out


def parse_table_row(cells: list[str], cid_re: re.Pattern[str]) -> list[dict] | None:
    if len(cells) < 2:
        return None
    raw_cid = cells[0].strip()
    mc = cid_re.search(raw_cid)
    if not mc:
        return None
    cid = norm_cid(mc.group(1))
    rest = " ".join(cells[1:])
    codes = pick_codes(rest)
    if not codes:
        return None
    extra_desc = ""
    if len(cells) > 2:
        extra_desc = " | ".join(cells[2:]).strip()
    out = []
    for code, hint in codes:
        desc = extra_desc[:500] if len(extra_desc) >= 4 else hint
        out.append({"cid": cid, "codigo": code, "descricao": desc[:500]})
    return out or None


def parse_line_heuristic(line: str, cid_re: re.Pattern[str]):
    """Tabela (colunas) ou CID + código(s) soltos na mesma linha."""
    line = line.strip()
    if not line or len(line) < 3:
        return None
    lowered = line.lower()
    if "cid-" in lowered and "capítulo" in lowered:
        return None
    if re.match(r"^(\s*N[ºº°]?\s*)?(cid|código\s*cid|cod\.?\s*tuss|proc\.?).{0,40}$", line, re.I):
        return None

    cells = split_row(line)
    tab_try = parse_table_row(cells, cid_re)
    if tab_try:
        return tab_try

    cid_hits = list(cid_re.finditer(line))
    codes = pick_codes(line)
    if not cid_hits or not codes:
        return None

    cid_strs = [norm_cid(m.group(1)) for m in cid_hits]
    pairs = []
    for c in cid_strs:
        for code, hint in codes:
            mi = cid_hits[0].start()
            ci = line.find(code)
            if ci < 0:
                continue
            desc = ""
            if mi < ci:
                desc = line[mi + len(cid_hits[0].group(1)) : ci].strip(" -|;:\t ")
            elif ci < mi:
                desc = line[ci + len(code) : mi].strip(" -|;:\t ")
            if not desc or len(desc) < 4:
                desc = hint
            pairs.append({"cid": c, "codigo": code, "descricao": desc[:500]})

    return pairs or None


def dedupe_por_cid(por_cid: dict[str, list[dict]]) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    for cid, items in por_cid.items():
        seen: set[tuple[str, str]] = set()
        lst = []
        for it in items:
            tup = (it.get("codigo", ""), (it.get("descricao") or "")[:240])
            if tup in seen:
                continue
            seen.add(tup)
            lst.append({"codigo": it["codigo"], "descricao": it.get("descricao") or ""})
        if lst:
            out[cid] = lst
    return out


def merge_por_cid(a: dict[str, list[dict]], b: dict[str, list[dict]]) -> dict[str, list[dict]]:
    acc: dict[str, list[dict]] = defaultdict(list)
    for src in (a, b):
        for cid, lst in src.items():
            nk = norm_cid(cid)
            acc[nk].extend(lst)
    return dedupe_por_cid(dict(acc))


def extract_pdf_text(path: Path) -> str:
    try:
        from pypdf import PdfReader
    except ImportError:
        print(
            "Instale: pip install pypdf\n"
            "  ou: pip install -r scripts/requirements-pdf-import.txt",
            file=sys.stderr,
        )
        sys.exit(1)

    reader = PdfReader(str(path))
    chunks = []
    for page in reader.pages:
        t = page.extract_text() or ""
        chunks.append(t)
    return "\n".join(chunks)


def build_por_cid(entries: list[dict]) -> dict[str, list[dict]]:
    agg: dict[str, dict[tuple[str, str], dict]] = defaultdict(dict)
    for e in entries:
        cid = e["cid"]
        key = (e["codigo"], e["descricao"][:200])
        if key not in agg[cid]:
            agg[cid][key] = {"codigo": e["codigo"], "descricao": e["descricao"]}
    return {cid: list(d.values()) for cid, d in agg.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf", type=Path, help="Arquivo PDF (tabela de compatibilidade).")
    ap.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("data/cid_procedimento_compat.json"),
        help="Saída JSON (default: data/cid_procedimento_compat.json).",
    )
    ap.add_argument(
        "--merge",
        action="store_true",
        help="Unir porCid sobre JSON existente no -o.",
    )
    args = ap.parse_args()

    if not args.pdf.is_file():
        print(f"Arquivo não encontrado: {args.pdf}", file=sys.stderr)
        sys.exit(1)

    text = extract_pdf_text(args.pdf)
    lines = text.replace("\u00a0", " ").splitlines()
    cid_re = cid_pattern()
    collected: list[dict] = []
    seen_line = set()
    for ln in lines:
        key = ln.strip()
        if not key or key in seen_line:
            continue
        seen_line.add(key)
        parsed = parse_line_heuristic(ln, cid_re)
        if parsed:
            collected.extend(parsed)

    por_cid = build_por_cid(collected)

    merged = dedupe_por_cid(dict(por_cid))
    prev_instr = ""
    if args.merge and args.output.is_file():
        try:
            old = json.loads(args.output.read_text(encoding="utf-8"))
            prev_instr = old.get("_instrucoes", "")
            merged = merge_por_cid(old.get("porCid") or {}, merged)
        except json.JSONDecodeError:
            print("Merge ignorado: JSON existente ilegível.", file=sys.stderr)

    out_doc = {
        "porCid": merged,
        "_instrucoes": prev_instr
        or "Gerado por scripts/import-tabela-compat-pdf.py a partir do PDF. Confira e ajuste linhas duvidosas antes de usar em produção.",
        "_fonte_pdf": str(args.pdf.resolve()),
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        json.dumps(out_doc, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    total = sum(len(v) for v in merged.values())
    print(f"CIDs com >=1 codigo: {len(merged)} | vínculos: {total} -> {args.output}")


if __name__ == "__main__":
    main()
