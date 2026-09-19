#!/usr/bin/env python3
"""Build compact localities.json from AEC-derived Place/Postcode/Electorate rows."""

from __future__ import annotations

import json
import re
from pathlib import Path

RAW = Path("/tmp/find-who-to-write/data/raw/localities.json")
OUT = Path("/tmp/find-who-to-write/data/localities.json")

GENERATED = "2026-09-19"
SOURCE = "pmcau/AustralianElectorates Localities.json (AEC-derived)"


def title_rest(s: str) -> str:
    return s.title()


def title_mc_o(part: str) -> str:
    upper = part.upper()
    if upper.startswith("MC") and not upper.startswith("MAC") and len(upper) > 2 and not upper.startswith("MC-"):
        return "Mc" + title_rest(upper[2:])
    if "O'" in upper:
        idx = upper.index("O'")
        return upper[:idx] + "O'" + title_rest(upper[idx + 2 :])
    return title_rest(upper)


def title_electorate(raw: str) -> str:
    upper = raw.strip().upper()
    parts = upper.split("-")
    return "-".join(title_mc_o(p) for p in parts)


_WORD_SPLIT = re.compile(r"(\s+)")


def title_suburb(raw: str) -> str:
    pieces = _WORD_SPLIT.split(raw.strip())
    out: list[str] = []
    for piece in pieces:
        if not piece or piece.isspace():
            out.append(piece)
            continue
        if "-" in piece:
            out.append("-".join(title_mc_o(p) if p else p for p in piece.split("-")))
        else:
            out.append(title_mc_o(piece))
    return "".join(out)


def pad_postcode(value) -> str:
    if value is None or value == "":
        return ""
    try:
        n = int(value)
    except (TypeError, ValueError):
        s = str(value).strip()
        if not s:
            return ""
        if s.isdigit():
            n = int(s)
        else:
            return s.zfill(4) if len(s) < 4 else s
    return f"{n:04d}"


def state_from_postcode(pc: str) -> str:
    try:
        n = int(pc)
    except (TypeError, ValueError):
        return ""
    if 800 <= n <= 999:
        return "NT"
    if 200 <= n <= 299 or 2600 <= n <= 2618 or 2900 <= n <= 2920:
        return "ACT"
    if 1000 <= n <= 2599 or 2619 <= n <= 2899 or 2921 <= n <= 2999:
        return "NSW"
    if 3000 <= n <= 3999 or 8000 <= n <= 8999:
        return "VIC"
    if 4000 <= n <= 4999 or 9000 <= n <= 9999:
        return "QLD"
    if 5000 <= n <= 5999:
        return "SA"
    if 6000 <= n <= 6999:
        return "WA"
    if 7000 <= n <= 7999:
        return "TAS"
    return ""


def main() -> None:
    rows = json.loads(RAW.read_text(encoding="utf-8"))
    merged: dict[tuple[str, str], dict] = {}
    order: list[tuple[str, str]] = []

    for row in rows:
        place = str(row.get("Place") or "").strip()
        electorate_raw = str(row.get("Electorate") or "").strip()
        if not place or not electorate_raw:
            continue
        postcode = pad_postcode(row.get("Postcode"))
        suburb = title_suburb(place)
        electorate = title_electorate(electorate_raw)
        key = (suburb.casefold(), postcode)
        if key not in merged:
            merged[key] = {
                "suburb": suburb,
                "postcode": postcode,
                "state": state_from_postcode(postcode),
                "electorates": [electorate],
            }
            order.append(key)
        else:
            els = merged[key]["electorates"]
            if electorate not in els:
                els.append(electorate)

    items = [merged[k] for k in order]
    items.sort(key=lambda it: (it["postcode"], it["suburb"]))

    payload = {
        "generated": GENERATED,
        "source": SOURCE,
        "items": items,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    sample_2620 = [it for it in items if it["postcode"] == "2620"]
    q_h = [
        it
        for it in sample_2620
        if it["suburb"] in ("Queanbeyan", "Hume")
    ]
    print(f"item_count={len(items)}")
    print("sample_2620_queanbeyan_hume=")
    print(json.dumps(q_h, indent=2, ensure_ascii=False))
    print("sample_2620_all_count=", len(sample_2620))
    syd = [it for it in items if it["postcode"] == "2000" and it["suburb"] == "Sydney"]
    print("sydney_2000=")
    print(json.dumps(syd, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
