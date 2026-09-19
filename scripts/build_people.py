#!/usr/bin/env python3
"""Build people.json and portfolio.json from APH address-label CSVs."""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path
from urllib.parse import quote

RAW = Path("/tmp/find-who-to-write/data/raw")
OUT_DIR = Path("/tmp/find-who-to-write/data")

PARTY_DISPLAY = {
    "ALP": "Australian Labor Party",
    "LP": "Liberal Party",
    "LNP": "Liberal National Party",
    "NATS": "Nationals",
    "AG": "Australian Greens",
    "IND": "Independent",
    "ON": "One Nation",
    "KAP": "Katter's Australian Party",
    "CA": "Centre Alliance",
    "UAP": "United Australia Party",
    "JLN": "Jacqui Lambie Network",
    "CLP": "Country Liberal Party",
    "AV": "Australia's Voice",
}

STATE_NAMES = {
    "NSW": "New South Wales",
    "VIC": "Victoria",
    "QLD": "Queensland",
    "SA": "South Australia",
    "WA": "Western Australia",
    "TAS": "Tasmania",
    "NT": "Northern Territory",
    "ACT": "Australian Capital Territory",
}

PORTFOLIO_ROLES = [
    {
        "key": "immigration-minister",
        "label": "Minister for Immigration and Citizenship",
        "why": "Owns the visa program.",
    },
    {
        "key": "immigration-assistant",
        "label": "Assistant Minister for Immigration",
        "why": "Supports the immigration portfolio.",
    },
    {
        "key": "home-affairs",
        "label": "Minister for Home Affairs",
        "why": "Department that processes visas.",
    },
    {
        "key": "multicultural",
        "label": "Minister for Multicultural Affairs",
        "why": "Family and community portfolio overlap.",
    },
    {
        "key": "citizenship-assistant",
        "label": "Assistant Minister for Citizenship",
        "why": "Citizenship and customs overlap.",
    },
]


def slug(text: str) -> str:
    s = text.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-{2,}", "-", s).strip("-")
    return s


def clean(value: str | None) -> str:
    if value is None:
        return ""
    return str(value).replace("\u00a0", " ").strip()


def title_case_place(value: str) -> str:
    value = clean(value)
    if not value:
        return ""
    # Keep already mixed-case APH names (McEwen, O'Connor) as-is.
    if any(c.islower() for c in value):
        return value
    small = {"and", "of", "the"}
    parts = []
    for i, word in enumerate(re.split(r"(\s+|-|/)", value)):
        if word in (" ", "-", "/") or word == "":
            parts.append(word)
            continue
        low = word.lower()
        if i > 0 and low in small:
            parts.append(low)
        elif "'" in word:
            a, b = word.split("'", 1)
            parts.append(a.capitalize() + "'" + (b[:1].upper() + b[1:].lower() if b else ""))
        elif word.upper().startswith("MC") and len(word) > 2:
            parts.append("Mc" + word[2:].capitalize())
        else:
            parts.append(word.capitalize())
    return "".join(parts)


def split_titles(*parts: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for part in parts:
        if not part:
            continue
        text = part.replace("\r\n", "\n").replace("\r", "\n")
        chunks: list[str] = []
        for line in text.split("\n"):
            chunks.extend(line.split("; "))
        for chunk in chunks:
            title = clean(chunk)
            if title and title not in seen:
                seen.add(title)
                out.append(title)
    return out


def portfolio_tags(titles: list[str]) -> list[str]:
    tags: list[str] = []
    seen: set[str] = set()
    for title in titles:
        low = title.lower()
        is_assistant = "assistant" in low
        candidates: list[str] = []
        if "minister for immigration" in low:
            candidates.append(
                "immigration-assistant" if is_assistant else "immigration-minister"
            )
        if "minister for home affairs" in low and not is_assistant:
            candidates.append("home-affairs")
        if "minister for multicultural" in low:
            candidates.append("multicultural")
        if "assistant minister for citizenship" in low:
            candidates.append("citizenship-assistant")
        for key in candidates:
            if key not in seen:
                seen.add(key)
                tags.append(key)
    return tags


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh, restkey="extra")
        rows = []
        for row in reader:
            cleaned = {k: clean(v) for k, v in row.items() if k != "extra"}
            rows.append(cleaned)
        return rows


def office_lines(row: dict[str, str]) -> list[str]:
    lines = []
    for key in ("Electorate Address Line 1", "Electorate Address Line 2"):
        val = clean(row.get(key, ""))
        if val:
            lines.append(val)
    return lines


def display_name(first: str, surname: str) -> str:
    return clean(f"{first} {surname}")


def build_house(rows: list[dict[str, str]]) -> list[dict]:
    people = []
    for row in rows:
        first = clean(row.get("Preferred Name")) or clean(row.get("First Name"))
        surname = clean(row.get("Surname"))
        electorate = clean(row.get("Electorate"))
        state = clean(row.get("State")).upper()
        party_code = clean(row.get("Political Party"))
        parl = split_titles(row.get("Parliamentary Title", ""))
        ministerial = split_titles(row.get("Ministerial Title", ""))
        titles = split_titles(*parl, *ministerial)
        person = {
            "id": "house:" + slug(electorate),
            "chamber": "house",
            "name": display_name(first, surname),
            "firstName": first,
            "surname": surname,
            "honorific": clean(row.get("Honorific")),
            "party": PARTY_DISPLAY.get(party_code, party_code),
            "partyCode": party_code,
            "electorate": electorate,
            "state": state,
            "titles": titles,
            "ministerialTitle": "; ".join(ministerial),
            "phoneParliament": clean(row.get("Telephone")),
            "phoneElectorate": clean(row.get("Electorate Telephone")),
            "officeSuburb": title_case_place(row.get("Electorate Suburb", "")),
            "officePostcode": clean(row.get("Electorate PostCode")),
            "officeLines": office_lines(row),
            "profileSearch": (
                "https://www.aph.gov.au/Senators_and_Members/"
                "Parliamentarian_Search_Results?q=" + quote(surname)
            ),
        }
        tags = portfolio_tags(titles)
        if tags:
            person["portfolio"] = tags
        people.append(person)
    people.sort(key=lambda p: p["electorate"])
    return people


def build_senate(rows: list[dict[str, str]], ph_rows: list[dict[str, str]]) -> list[dict]:
    ph_by_key = {}
    for row in ph_rows:
        key = (
            clean(row.get("Surname")).lower(),
            (clean(row.get("Preferred Name")) or clean(row.get("First Name"))).lower(),
            clean(row.get("State")).upper(),
        )
        ph_by_key[key] = row

    people = []
    for row in rows:
        first = clean(row.get("Preferred Name")) or clean(row.get("First Name"))
        surname = clean(row.get("Surname"))
        state = clean(row.get("State")).upper()
        party_code = clean(row.get("Political Party"))
        titles = split_titles(row.get("Parliamentary Titles", ""))
        ministerial = [t for t in titles if "minister" in t.lower()]
        ph = ph_by_key.get((surname.lower(), first.lower(), state), {})
        phone_parliament = clean(ph.get("Telephone") or row.get("Telephone"))
        person = {
            "id": "senate:" + state.lower() + ":" + slug(f"{surname}-{first}"),
            "chamber": "senate",
            "name": display_name(first, surname),
            "firstName": first,
            "surname": surname,
            "honorific": clean(row.get("Title")),
            "party": PARTY_DISPLAY.get(party_code, party_code),
            "partyCode": party_code,
            "electorate": STATE_NAMES.get(state, state),
            "state": state,
            "titles": titles,
            "ministerialTitle": "; ".join(ministerial),
            "phoneParliament": phone_parliament,
            "phoneElectorate": clean(row.get("Electorate Telephone")),
            "officeSuburb": title_case_place(row.get("Electorate Suburb", "")),
            "officePostcode": clean(row.get("Electorate PostCode")),
            "officeLines": office_lines(row),
            "profileSearch": (
                "https://www.aph.gov.au/Senators_and_Members/"
                "Parliamentarian_Search_Results?q=" + quote(surname)
            ),
        }
        tags = portfolio_tags(titles)
        if tags:
            person["portfolio"] = tags
        people.append(person)
    people.sort(key=lambda p: (p["state"], p["surname"]))
    return people


def main() -> None:
    members = read_csv(RAW / "members.csv")
    senators = read_csv(RAW / "senators.csv")
    senators_ph = read_csv(RAW / "senators-ph.csv")

    house = build_house(members)
    senate = build_senate(senators, senators_ph)

    people = {
        "generated": "2026-09-19",
        "source": "APH Address labels CSV (48th Parliament)",
        "house": house,
        "senate": senate,
    }
    people_path = OUT_DIR / "people.json"
    people_path.write_text(
        json.dumps(people, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    portfolio = {
        "generated": "2026-09-19",
        "issue": "subclass-309",
        "roles": PORTFOLIO_ROLES,
    }
    portfolio_path = OUT_DIR / "portfolio.json"
    portfolio_path.write_text(
        json.dumps(portfolio, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    print(f"house={len(house)}")
    print(f"senate={len(senate)}")
    tagged = [p for p in house + senate if p.get("portfolio")]
    print(f"portfolio_tagged={len(tagged)}")
    for person in tagged:
        print(f"{person['name']}: {', '.join(person['portfolio'])}")

    burke = next(p for p in house if p["surname"] == "Burke" and p["firstName"] == "Tony")
    print(f"tony_burke_portfolio={burke.get('portfolio')}")


if __name__ == "__main__":
    main()
