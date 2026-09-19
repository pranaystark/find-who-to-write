const SHADOW = [
  { surname: "Duniam", key: "shadow-immigration", label: "Shadow Minister for Home Affairs and Immigration" },
  { surname: "Sharma", key: "shadow-citizenship", label: "Shadow Assistant Minister for Citizenship" },
];

const PARTY_SHORT = {
  ALP: "Labor",
  LP: "Liberal",
  LNP: "LNP",
  NATS: "Nationals",
  AG: "Greens",
  IND: "Independent",
  ON: "One Nation",
  KAP: "Katter",
  CA: "Centre Alliance",
  UAP: "UAP",
  JLN: "Lambie",
  CLP: "CLP",
  AV: "Australia's Voice",
};

const TPL_HINT = {
  first: "Use this the first time you write your local MP.",
  followup: "Use this if the office already replied and talked about onshore backlogs or Direction 117.",
  chamber: "Use this for committee members, senators, or if you want it on the Hansard record.",
  family: "Use this if the wait is splitting family life and a visitor visa is blocked too. Measured language — not ‘violation’.",
};

const IMPACT = {
  together: "We cannot live together in one home in Australia while this file sits in the queue.",
  visitor: "My partner has also been unable to visit on a tourist visa while the 309 is on foot — so we cannot live together and we cannot even visit.",
  housing: "We have had to delay buying or committing to a place to live because we do not know when we can share an address.",
  col: "We are paying for two lives in the current cost of living — extra rent or flights on top of Australian prices — and we cannot combine incomes for a home.",
  thirties: "I am in my thirties. People around me are buying homes and planning children. We are stuck in a visa queue instead of starting that life.",
  work: "Work and study plans are on hold until we know whether we can be in the same country.",
  children: "The wait is shaping decisions about children and family life.",
  health: "The length of the separation is wearing on our wellbeing. I am not asking you to act as a clinician — only to see the cost to a household in your community.",
};

const SPONSOR = {
  citizen: "I am an Australian citizen in this electorate. I took the citizenship pledge — to this country, its people, and its laws. I am not asking for a favour outside the rules. I am asking that a partner visa I am using in good faith not leave us split for years.",
  pr: "I am a permanent resident in this electorate. I was granted PR to make a life here; I work and pay tax in Australia. Permanent residents do not take the citizenship pledge — that is for citizens — but I have still committed to this country. I am asking that the partner visa pathway not leave us split for years.",
};

const $ = (id) => document.getElementById(id);

const state = {
  people: null,
  localities: null,
  chamber: null,
  byId: new Map(),
  houseByElectorate: new Map(),
  senateByState: new Map(),
  selected: null,
  letterPerson: null,
  letterKind: "mp",
  step: "mp",
};

function norm(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function telHref(p) {
  const d = String(p || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("0")) return `tel:+61${d.slice(1)}`;
  return `tel:${d}`;
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function unique(arr) {
  return [...new Set(arr)];
}

async function load() {
  $("status").textContent = "Loading maps…";
  const [people, localities, chamber] = await Promise.all([
    fetch("data/people.json").then((r) => {
      if (!r.ok) throw new Error("people.json missing");
      return r.json();
    }),
    fetch("data/localities.json").then((r) => {
      if (!r.ok) throw new Error("localities.json missing");
      return r.json();
    }),
    fetch("data/chamber.json").then((r) => {
      if (!r.ok) throw new Error("chamber.json missing");
      return r.json();
    }),
  ]);
  state.people = people;
  state.localities = localities;
  state.chamber = chamber;
  for (const p of [...people.house, ...people.senate]) {
    state.byId.set(p.id, p);
  }
  for (const m of people.house) state.houseByElectorate.set(norm(m.electorate), m);
  for (const s of people.senate) {
    if (!state.senateByState.has(s.state)) state.senateByState.set(s.state, []);
    state.senateByState.get(s.state).push(s);
  }
  for (const sh of SHADOW) {
    const person = [...people.house, ...people.senate].find((p) => norm(p.surname) === norm(sh.surname));
    if (person) {
      person.portfolio = [...(person.portfolio || []), sh.key];
      person.shadowLabel = sh.label;
    }
  }
  $("status").textContent = "";
}

function suburbMatches(query) {
  const n = query.trim().toLowerCase();
  if (n.length < 2) return [];
  const out = [];
  for (const item of state.localities.items) {
    const s = item.suburb.toLowerCase();
    if (s === n || s.startsWith(n)) out.push(item);
  }
  out.sort((a, b) => {
    const ae = a.suburb.toLowerCase() === n ? 0 : 1;
    const be = b.suburb.toLowerCase() === n ? 0 : 1;
    if (ae !== be) return ae - be;
    return a.suburb.localeCompare(b.suburb) || a.postcode.localeCompare(b.postcode);
  });
  return out.slice(0, 30);
}

function itemsForPostcode(postcode) {
  return state.localities.items.filter((i) => i.postcode === postcode);
}

function renderSuggest(items) {
  const box = $("suggest");
  if (!items.length) {
    box.hidden = true;
    box.innerHTML = "";
    return;
  }
  box.hidden = false;
  box.innerHTML = items
    .map(
      (i, idx) => `<li>
        <button type="button" data-i="${idx}">
          <span>${escapeHtml(i.suburb)}</span>
          <span class="meta">${escapeHtml(i.postcode)} · ${escapeHtml(i.electorates.join(", "))}</span>
        </button>
      </li>`
    )
    .join("");
  box.querySelectorAll("button").forEach((btn, idx) => {
    btn.addEventListener("click", () => applyItem(items[idx]));
  });
}

function applyItem(item) {
  $("q").value = `${item.suburb} ${item.postcode}`;
  $("suggest").hidden = true;
  renderResults({ label: `${item.suburb} ${item.postcode}`, items: [item] });
}

function search(raw) {
  const q = raw.trim();
  if (!q) {
    $("results").hidden = true;
    $("status").textContent = "Type a postcode or suburb.";
    return;
  }
  if (/^\d{4}$/.test(q)) {
    const items = itemsForPostcode(q);
    if (!items.length) {
      $("results").hidden = true;
      $("status").textContent = `Nothing for ${q}. Use the sponsor’s Australian postcode.`;
      return;
    }
    renderResults({ label: q, items });
    return;
  }
  const matches = suburbMatches(q);
  if (!matches.length) {
    $("results").hidden = true;
    $("status").textContent = `No suburb starting with “${q}”. Try the postcode.`;
    return;
  }
  const exact = matches.filter((m) => m.suburb.toLowerCase() === q.toLowerCase());
  if (exact.length === 1) {
    applyItem(exact[0]);
    return;
  }
  if (exact.length > 1) {
    renderSuggest(exact);
    $("status").textContent = `${exact.length} places named ${exact[0].suburb}. Pick one.`;
    $("results").hidden = true;
    return;
  }
  renderSuggest(matches);
  $("status").textContent = "Pick a suburb from the list.";
  $("results").hidden = true;
}

function peopleForItems(items) {
  const electorates = unique(items.flatMap((i) => i.electorates));
  const mps = [];
  const missing = [];
  for (const e of electorates) {
    const mp = state.houseByElectorate.get(norm(e));
    if (mp) mps.push(mp);
    else missing.push(e);
  }
  const states = unique(mps.map((m) => m.state));
  const senators = states.flatMap((st) => state.senateByState.get(st) || []);
  const portfolio = [...state.people.house, ...state.people.senate].filter((p) => (p.portfolio || []).length);
  return { electorates, mps, senators, states, missing, portfolio };
}

function chamberRows(ctx) {
  const byPerson = new Map();
  for (const c of state.chamber.committees) {
    for (const m of c.members) {
      const p = state.byId.get(m.id);
      if (!p) continue;
      if (!byPerson.has(p.id)) {
        byPerson.set(p.id, { person: p, bits: [] });
      }
      byPerson.get(p.id).bits.push({ committee: c.short, role: m.role, why: c.why, url: c.url });
    }
  }
  const rows = [...byPerson.values()];
  const localIds = new Set(ctx.mps.map((m) => m.id));
  const localStates = new Set(ctx.states);
  rows.sort((a, b) => {
    const as = localIds.has(a.person.id) ? 0 : localStates.has(a.person.state) ? 1 : 2;
    const bs = localIds.has(b.person.id) ? 0 : localStates.has(b.person.state) ? 1 : 2;
    if (as !== bs) return as - bs;
    return a.person.surname.localeCompare(b.person.surname);
  });
  return rows;
}

function roleTags(p, extra) {
  const tags = [PARTY_SHORT[p.partyCode] || p.partyCode];
  if (p.chamber === "house") tags.push("MP");
  if (p.chamber === "senate") tags.push("Senator");
  const map = {
    "immigration-minister": "Immigration minister",
    "immigration-assistant": "Assistant immigration",
    "home-affairs": "Home Affairs",
    multicultural: "Multicultural",
    "citizenship-assistant": "Citizenship",
    "shadow-immigration": "Shadow immigration",
    "shadow-citizenship": "Shadow citizenship",
  };
  for (const k of p.portfolio || []) if (map[k]) tags.push(map[k]);
  for (const t of extra || []) tags.push(t);
  return tags;
}

function card(p, extraTags, note) {
  const tags = roleTags(p, extraTags)
    .map((t) => `<span class="tag">${escapeHtml(t)}</span>`)
    .join("");
  const office = [p.officeLines?.[0], p.officeSuburb, p.officePostcode].filter(Boolean).join(", ");
  const telE = telHref(p.phoneElectorate);
  const telP = telHref(p.phoneParliament);
  const where = p.chamber === "house" ? `${p.electorate}, ${p.state}` : `Senator for ${p.electorate}`;
  const contact = p.contactUrl || p.profileUrl || p.profileSearch;
  const profile = p.profileUrl || p.profileSearch;
  return `<article class="card">
    <h3>${escapeHtml(p.name)}</h3>
    <p class="who">${escapeHtml(where)}${note ? ` · ${escapeHtml(note)}` : ""}</p>
    <div class="tags">${tags}</div>
    ${office ? `<p class="office">${escapeHtml(office)}</p>` : ""}
    <div class="actions">
      <a class="primary" href="${escapeHtml(contact)}" target="_blank" rel="noopener">APH contact form</a>
      <a href="${escapeHtml(profile)}" target="_blank" rel="noopener">APH profile</a>
      <button type="button" data-letter="${escapeHtml(p.id)}">Draft first</button>
      ${telE ? `<a href="${telE}">${escapeHtml(p.phoneElectorate)}</a>` : ""}
      ${telP ? `<a href="${telP}">Parliament ${escapeHtml(p.phoneParliament)}</a>` : ""}
    </div>
    <p class="office">If APH says the form is disabled, use the profile or phone — some offices turn the form off.</p>
  </article>`;
}

function bindCards(root) {
  root.querySelectorAll("[data-letter]").forEach((btn) => {
    btn.addEventListener("click", () => openLetter(btn.getAttribute("data-letter")));
  });
}

function renderResults({ label, items, pool, suburbOn }) {
  const all = pool || items;
  const ctx = peopleForItems(items);
  const suburbs = unique(all.map((i) => i.suburb)).sort();
  const split = ctx.electorates.length > 1;
  state.selected = { label, items, pool: all, ...ctx };
  state.step = state.step || "mp";

  const filters =
    suburbs.length > 1
      ? `<div class="filters" id="suburb-filters">
          <button type="button" class="${suburbOn ? "" : "on"}" data-all="1">All suburbs</button>
          ${suburbs
            .map((s) => `<button type="button" class="${suburbOn === s ? "on" : ""}" data-suburb="${escapeHtml(s)}">${escapeHtml(s)}</button>`)
            .join("")}
        </div>`
      : "";

  const warn = split
    ? `<p class="warn">This search covers ${ctx.electorates.length} federal seats (${escapeHtml(
        ctx.electorates.join(", ")
      )}). Choose your suburb, or check the <a href="https://electorate.aec.gov.au/" rel="noopener">AEC</a>. Write the MP for the seat you live in.</p>`
    : "";

  $("results").hidden = false;
  $("results").innerHTML = `
    ${warn}
    ${filters}
    <ol class="how">
      <li><b>1.</b> Email your local MP first.</li>
      <li><b>2.</b> If you want it on the record, write someone on the migration committee or estimates — including opposition and crossbench.</li>
      <li><b>3.</b> Senators and ministers last.</li>
      <li><b>4.</b> Watchdogs, community groups and media can amplify. They do not process visas.</li>
    </ol>
    <nav class="tabs" id="tabs">
      <button type="button" data-step="mp">Your MP</button>
      <button type="button" data-step="parliament">In Parliament</button>
      <button type="button" data-step="senate">Senators</button>
      <button type="button" data-step="ministers">Ministers</button>
      <button type="button" data-step="other">Voices</button>
    </nav>
    <div id="panel"></div>
  `;

  $("status").textContent = split
    ? `${label} · ${ctx.electorates.length} possible seats`
    : `${label} · ${ctx.electorates[0] || "—"}`;

  const filterBar = $("suburb-filters");
  if (filterBar) {
    filterBar.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      if (b.dataset.all) {
        renderResults({ label: all[0]?.postcode || label, items: all, pool: all });
        return;
      }
      const sub = b.dataset.suburb;
      const next = all.filter((i) => i.suburb === sub);
      renderResults({
        label: `${sub} (${next[0]?.postcode || ""})`,
        items: next,
        pool: all,
        suburbOn: sub,
      });
    });
  }

  $("tabs").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-step]");
    if (!b) return;
    showStep(b.dataset.step);
  });

  showStep(split ? "mp" : state.step);
}

function showStep(step) {
  state.step = step;
  const ctx = state.selected;
  if (!ctx) return;
  $("tabs")?.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("on", b.dataset.step === step);
  });
  const panel = $("panel");
  const chamber = chamberRows(ctx);

  if (step === "mp") {
    panel.innerHTML = `
      <p class="panel-note">This is the person whose job it is to take casework from your suburb.</p>
      ${ctx.mps.map((m) => card(m)).join("") || "<p>No House match.</p>"}
      ${ctx.missing.length ? `<p class="office">Unmatched seats: ${escapeHtml(ctx.missing.join(", "))}</p>` : ""}
    `;
  } else if (step === "parliament") {
    panel.innerHTML = `
      <p class="panel-note">These people can raise Direction 117 / 309 delays in committee or at Senate estimates. Sorted with your state first. They are not all in government.</p>
      ${chamber
        .map((row) => {
          const bits = row.bits.map((b) => `${b.role}, ${b.committee}`);
          const local = ctx.mps.some((m) => m.id === row.person.id)
            ? "your MP"
            : ctx.states.includes(row.person.state)
              ? "your state"
              : "";
          return card(row.person, bits, local);
        })
        .join("")}
    `;
  } else if (step === "senate") {
    panel.innerHTML = `
      <p class="panel-note">${escapeHtml(ctx.states.join(", "))} senators — Labor, Coalition, Greens, independents and others. Write one if the MP has not helped. Do not mail all ${ctx.senators.length}.</p>
      ${ctx.senators.map((s) => card(s)).join("")}
    `;
  } else if (step === "ministers") {
    panel.innerHTML = `
      <p class="panel-note">National portfolio. Usually better via your MP, not a cold email to the minister.</p>
      ${ctx.portfolio.map((p) => card(p, [], p.shadowLabel || "")).join("")}
    `;
  } else {
    const pillars = (state.chamber.pillars || [])
      .map((p) => {
        const links = (p.links || [])
          .map(
            (o) => `<li><a href="${escapeHtml(o.url)}" target="_blank" rel="noopener">${escapeHtml(o.title)}</a> — ${escapeHtml(o.blurb)}</li>`
          )
          .join("");
        const go = p.tab
          ? `<p><button type="button" class="ex" data-gotab="${escapeHtml(p.tab)}">Open that tab</button></p>`
          : "";
        return `<article class="card pillar">
          <h3>${escapeHtml(p.title)}</h3>
          <p class="who">${escapeHtml(p.blurb)}</p>
          ${go}
          ${links ? `<ul>${links}</ul>` : ""}
          ${p.note ? `<p class="note">${escapeHtml(p.note)}</p>` : ""}
        </article>`;
      })
      .join("");
    panel.innerHTML = `
      <p class="panel-note">Four places a delay like this gets heard. Parliament first. A rights complaint is a record; your MP is the enquiry.</p>
      ${pillars}
      <article class="card pillar">
        <h3>Official pages</h3>
        <ul class="help-list">${(state.chamber.help || []).map((h) => `<li><a href="${escapeHtml(h.url)}" target="_blank" rel="noopener">${escapeHtml(h.title)}</a></li>`).join("")}</ul>
      </article>
      ${state.chamber.support ? `<p class="note">${escapeHtml(state.chamber.support.blurb)} <a href="${escapeHtml(state.chamber.support.url)}" rel="noopener">${escapeHtml(state.chamber.support.label)}</a></p>` : ""}
    `;
    panel.querySelectorAll("[data-gotab]").forEach((b) => {
      b.addEventListener("click", () => showStep(b.dataset.gotab));
    });
  }
  bindCards(panel);
}

function findPerson(id) {
  return state.byId.get(id);
}

function greeting(p) {
  if (p.chamber === "senate") return `Dear Senator ${p.surname}`;
  const h = (p.honorific || "").replace(/^hon$/i, "").trim();
  if (h && !/senator/i.test(h)) return `Dear ${h} ${p.surname}`;
  return `Dear ${p.name}`;
}

function extraBits() {
  const lodged = $("lodged").value.trim();
  const href = $("href").value.trim();
  const lines = [];
  if (lodged) lines.push(`Lodged: ${lodged}.`);
  if (href) lines.push(`Home Affairs reference: ${href}.`);
  return lines.length ? `\n\nApplication details (for a status enquiry only):\n${lines.join(" ")}` : "";
}

function impactParagraph() {
  const keys = [...document.querySelectorAll('input[name="impact"]:checked')].map((i) => i.value);
  const sentences = keys.map((k) => IMPACT[k]).filter(Boolean);
  if (!sentences.length) return "";
  return `\n\nThis wait is not abstract for us. ${sentences.join(" ")} I say this so the human cost is visible — not as a request to skip the queue.`;
}

function sponsorParagraph() {
  const v = document.querySelector('input[name="sponsor"]:checked')?.value || "citizen";
  return SPONSOR[v] || SPONSOR.citizen;
}

function subjectLine(p) {
  const visitor = document.querySelector('input[name="impact"][value="visitor"]')?.checked;
  const seat = p.electorate || "";
  return visitor
    ? `Subclass 309 and visitor visa — constituent in ${seat}`
    : `Subclass 309 delay — constituent in ${seat}`;
}

function placeLine() {
  const suburb = state.selected?.items?.[0]?.suburb || "[suburb]";
  const postcode = state.selected?.items?.[0]?.postcode || "[postcode]";
  return { suburb, postcode };
}

function letterBody(p, tpl) {
  const sender = $("sender").value.trim() || "[Your name]";
  const { suburb, postcode } = placeLine();
  const extra = extraBits();
  const impact = impactParagraph();
  const who = sponsorParagraph();
  const greet = greeting(p);
  const seat = p.chamber === "house" ? p.electorate : p.electorate;
  const sign = `${sender}\n${suburb} ${postcode}`;

  if (tpl === "followup") {
    return `${greet},

Thank you for looking into this and for the reply. I take the point about the onshore caseload and extra staff. I know the Department is carrying a large load.

The reply still did not deal with the issue I actually raised, so I am writing again on that point — including against public comments the Minister, Tony Burke, made at the National Press Club on 17 September 2026.

Eligibility is not what I am arguing about

Your office said Direction 117 does not change the “fundamental way” family visas are processed. If that means the partner-visa grant test is the same onshore and offshore, I accept that. That was never my concern.

What changed is the order in which files are picked up. After Direction 117 took effect on 25 July 2026, offshore partner applications such as subclass 309 moved from an indicated wait of about 11–18 months, to around 18–30 months, and then to a departmental range in the order of 21–39 months (or longer). If “processing order” is treated as something other than how visas are actually handled, I would like that explained. In lived terms, it is why our wait has more than doubled.

The Minister’s Press Club remarks

I watched the address and the questions. Asked by a Bloomberg journalist about a years-long spouse-visa wait, and whether long family delays were a way to hold net migration down, the Minister said family waiting periods were already “pretty much at the limit” and that people “do go through hardship while they are waiting.” I welcome that being said out loud. He did not, as I heard it, say whether the Direction 117 queue itself is being used as a numbers tool — which is the question I have been putting.

He also contrasted an Australian citizen sponsoring a partner overseas, who may wait “quite some years,” with an international student who can bring a partner from the start. That contrast was used to defend tighter student-family settings. It did not explain why citizens wait this long, or whether Direction 117 made that wait worse.

Industry was answered; families were not

When Direction 119 sent offshore skilled applicants backwards, business objected and the Minister said 119 would be rewritten — construction, health, agriculture, fisheries and teaching restored up the list — within weeks of the original direction.

Direction 117 has done a similar reordering for offshore partners of Australian citizens. Constituents and the Migration Institute had already raised it. It was not spoken of in the same breath as the 119 reversal. I am not saying industry was wrong to speak up. I am asking why that channel produced a rewrite and this one has not.

What I would like your office to take to the Department

I know you cannot decide a visa file, and I am not asking you to. Could you please ask:

1. If the grant rules for family visas are unchanged, why have the Department’s own offshore partner time estimates moved so far (about 11–18 months, then 18–30, now around 21–39+)?
2. Direction 119 was revised quickly after industry pressure. Is Direction 117 being reviewed for Australian citizens kept apart from their partners?

If staff are speaking to the Department anyway, a plain indication of where the file below currently sits would help us plan. I understand that will not change the outcome or the timing.${impact}${extra}

Thank you for the time already given to this. I hope family cases are weighed with the same seriousness as the industry ones.

Kind regards,
${sign}`;
  }

  if (tpl === "chamber") {
    return `${greet},

I live in ${suburb} ${postcode}${p.chamber === "house" ? `, in the seat of ${seat}` : ""}. I am asking you, in your parliamentary role, to put offshore Partner visa (subclass 309) delays on the record.

${who}

Ministerial Direction 117 (25 July 2026) changed the order in which family files are worked. Offshore partner applications now sit behind onshore ones. Published times have moved from about 11–18 months, to 18–30, and more recently into a range around 21–39 months. Direction 119, which reordered skilled visas, was rewritten within weeks after industry objected. Direction 117 has not been treated the same way.${impact}

I am not asking you to grant or refuse any visa. I ask that you:

1. Raise in committee, in the chamber, or at Home Affairs estimates why offshore partner times have blown out if the grant test is unchanged.
2. Ask whether Direction 117 is under review, as Direction 119 was.
3. If you take casework, request a general status note on the application below — not a decision.${extra}

I am writing to you because you can put this on the Hansard record. I have also written to my local MP.

Yours sincerely,
${sign}`;
  }

  if (tpl === "family") {
    return `${greet},

I live in ${suburb} ${postcode}${p.chamber === "house" ? `, in the seat of ${seat}` : ""}.

${who}

I am writing about an offshore Partner visa (subclass 309) and about the closed loop that often comes with it: years of waiting, and often no visitor visa either, so we cannot live together and we cannot visit.

I am not asking you to find a “human rights violation”. I am saying this engages Australia’s commitments on family life. Direction 117 (25 July 2026) pushed offshore partner files behind onshore ones. Published times have moved from about 11–18 months toward 21–39 months. At the same time, a partner with a 309 on foot is often refused a short stay because the Department treats the partner application as a reason they might not leave.

That is a poor return for someone who has made a life here, in a period of high living costs, when people our age are trying to share a home and plan a family.${impact}

I know you cannot grant a visa. I ask your office to:

1. Put an enquiry to Home Affairs on the 309 delay and on whether Direction 117 is being reviewed as Direction 119 was after industry objected.
2. Ask why partners of citizens and permanent residents are locked out of a visitor stay because they applied to join us lawfully.
3. Request a general status note on the application below — not a decision.${extra}

Yours sincerely,
${sign}`;
  }

  return `${greet},

I live in ${suburb} ${postcode}, in ${p.chamber === "house" ? `the electorate of ${seat}` : seat}.

${who}

I am writing about an offshore Partner visa (subclass 309) that I sponsor.

From 25 July 2026, Ministerial Direction 117 changed the order in which family visa files are picked up. Offshore partner applications now wait behind onshore ones. Home Affairs’ published times for this pathway have moved from about 11–18 months, to 18–30 months, and more recently into a range of about 21–39 months for many files.
I am not asking you to decide the visa. I would like your electorate office to:

1. Ask the Department why those published offshore partner times have lengthened so sharply if the eligibility rules are unchanged.
2. Ask whether Direction 117 is being reviewed, in the way Direction 119 (skilled visa order) was rewritten after industry raised concerns.
3. Request a general update on where the application below sits, so we can plan. I know that will not jump the queue.${impact}${extra}

Thank you for taking this up for a household in your electorate.

Yours sincerely,
${sign}`;
}

function defaultTpl() {
  if (document.querySelector('input[name="impact"][value="visitor"]')?.checked) return "family";
  if (state.step === "parliament") return "chamber";
  if (state.step === "senate" || state.step === "ministers") return "chamber";
  return "first";
}

function closeLetter() {
  const el = $("letter");
  el.hidden = true;
  el.classList.remove("is-open");
}

function openLetter(id) {
  const p = findPerson(id);
  if (!p) return;
  state.letterPerson = p;
  const el = $("letter");
  el.hidden = false;
  el.classList.add("is-open");
  $("letter-to").textContent = `${p.name} · ${p.electorate} · ${PARTY_SHORT[p.partyCode] || p.partyCode}`;
  $("aph-link").href = p.contactUrl || p.profileUrl || p.profileSearch;
  $("aph-link").textContent = "APH contact form";
  const prof = $("aph-profile");
  if (prof) {
    prof.href = p.profileUrl || p.profileSearch || "#";
    prof.hidden = !(p.profileUrl || p.profileSearch);
  }
  $("tpl").value = defaultTpl();
  $("tpl-hint").textContent = TPL_HINT[$("tpl").value];
  refreshPreview();
  $("sender").focus();
}

function refreshPreview() {
  const p = state.letterPerson;
  if (!p) return;
  const tpl = $("tpl").value;
  $("tpl-hint").textContent = TPL_HINT[tpl] || "";
  $("preview").value = letterBody(p, tpl);
  const sub = $("subject-line");
  if (sub) sub.textContent = subjectLine(p);
}

function bind() {
  $("search-form").addEventListener("submit", (e) => {
    e.preventDefault();
    $("suggest").hidden = true;
    search($("q").value);
  });
  $("q").addEventListener("input", () => {
    const q = $("q").value.trim();
    if (!state.localities) return;
    if (/^\d{4}$/.test(q) || q.length < 3) {
      $("suggest").hidden = true;
      return;
    }
    renderSuggest(suburbMatches(q).slice(0, 8));
  });
  document.querySelectorAll(".ex").forEach((b) => {
    b.addEventListener("click", () => {
      $("q").value = b.dataset.q;
      search(b.dataset.q);
    });
  });
  $("letter-close").addEventListener("click", closeLetter);
  $("letter").addEventListener("click", (e) => {
    if (e.target.id === "letter") closeLetter();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("letter").classList.contains("is-open")) closeLetter();
  });
  $("tpl").addEventListener("change", refreshPreview);
  ["sender", "lodged", "href"].forEach((id) => $(id).addEventListener("input", refreshPreview));
  document.querySelectorAll('input[name="impact"], input[name="sponsor"]').forEach((c) => {
    c.addEventListener("change", () => {
      if (c.name === "impact" && c.value === "visitor" && c.checked && $("tpl").value === "first") {
        $("tpl").value = "family";
      }
      refreshPreview();
    });
  });
  $("copy-subject").addEventListener("click", async () => {
    await navigator.clipboard.writeText($("subject-line").textContent);
    $("copy-subject").textContent = "Copied";
    setTimeout(() => {
      $("copy-subject").textContent = "Copy subject";
    }, 1200);
  });
  $("copy-letter").addEventListener("click", async () => {
    await navigator.clipboard.writeText($("preview").value);
    $("copy-letter").textContent = "Copied";
    setTimeout(() => {
      $("copy-letter").textContent = "Copy body";
    }, 1200);
  });
}

bind();
load().catch((err) => {
  $("status").textContent = `Could not load data: ${err.message}. Open this folder over http, not as a file.`;
});
