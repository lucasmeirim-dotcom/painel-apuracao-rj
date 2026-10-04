/* Painel de Apuração 2026 — lê os arquivos gerados pelo coletor (pasta dados/) */
(function () {
  "use strict";
  const REFRESH_MS = 60000;
  const POR_PAGINA = 25;
  const fmt = new Intl.NumberFormat("pt-BR");
  const fmtP = (v, d = 2) => (v == null || isNaN(v) ? "–" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }) + "%");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const $ = (s, el = document) => el.querySelector(s);

  const S = { cargo: null, sel: {}, busca: "", partido: "", situacao: "", pagina: 0, modoMapa: "votos" };
  const D = { resumo: null, cargos: {}, serie: {}, geo: null };

  try { const m = JSON.parse(localStorage.getItem("painel-estado") || "{}"); Object.assign(S, { cargo: m.cargo || null, modoMapa: m.modoMapa || "votos" }); } catch (e) {}
  const guardar = () => { try { localStorage.setItem("painel-estado", JSON.stringify({ cargo: S.cargo, modoMapa: S.modoMapa })); } catch (e) {} };

  async function obter(nome) {
    if (window.__DADOS__) return window.__DADOS__[nome];
    const r = await fetch(nome + "?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error(nome + ": HTTP " + r.status);
    return r.json();
  }

  async function carregar() {
    D.resumo = await obter("dados/resumo.json");
    for (const c of D.resumo.cargos) {
      try {
        const dc = await obter(`dados/cargo_${c.cd}.json`);
        D.cargos[c.cd] = dc && (!dc.ambiente || dc.ambiente === D.resumo.ambiente) ? dc : null;   // nunca mistura simulado com oficial
      } catch (e) { D.cargos[c.cd] = null; }
    }
    try { D.serie = (await obter("dados/serie.json")) || {}; } catch (e) { D.serie = {}; }
    if (!D.geo) {
      try { D.geo = await obter(`geo/${D.resumo.uf.toLowerCase()}_municipios.geojson`); } catch (e) { D.geo = null; }
    }
    if (!S.cargo || !D.resumo.cargos.some((c) => c.cd === S.cargo)) S.cargo = D.resumo.cargos[0].cd;
  }

  // ---------- auxiliares de dados ----------
  const dest = () => D.resumo.destaque || { partidos: [], numeros: [] };
  const ehDestaque = (c) => dest().partidos.includes(String(c.sg).toUpperCase()) || dest().numeros.includes(String(c.n));
  const situacao = (c) => {
    const st = c.st || "";
    if (c.e === "s" || /^eleito/i.test(st)) return `<span class="sit eleito">${esc(st || "Eleito")}</span>`;
    if (/suplente/i.test(st)) return `<span class="sit suplente">${esc(st)}</span>`;
    return st ? `<span class="sit outro">${esc(st)}</span>` : "";
  };
  const munPorCd = () => Object.fromEntries(D.resumo.municipios.map((m) => [m.cd, m]));
  const titulo = (s) => String(s || "").toLowerCase().replace(/(^|\s|-)(\p{L})/gu, (a, b, c) => b + c.toUpperCase()).replace(/(?<=\s)(De|Da|Do|Das|Dos|E)(?=\s)/g, (w) => w.toLowerCase());

  function candidatoSel() {
    const dc = D.cargos[S.cargo];
    if (!dc || !dc.candidatos.length) return null;
    let c = dc.candidatos.find((x) => x.n === S.sel[S.cargo]);
    if (!c) c = dc.candidatos.find(ehDestaque) || dc.candidatos[0];
    S.sel[S.cargo] = c.n;
    return c;
  }

  // ---------- render ----------
  function render() {
    const R = D.resumo, U = R.uf_status || {};
    const sim = R.ambiente !== "oficial";
    const dc = D.cargos[S.cargo];
    const atual = dc ? `${dc.dt} às ${dc.ht}` : "aguardando primeira totalização";
    $("#app").innerHTML = `
      <header class="top">
        <div class="brand">
          <h1>${esc(R.titulo)}</h1>
          <div class="sub">Eleições Gerais 2026 · 1º turno · ${esc(R.uf)} · fonte: TSE (dados oficiais de divulgação)</div>
        </div>
        <div class="meta">
          <span class="pill ${sim ? "sim" : "ofi"} live">${sim ? "Ambiente de simulação" : "Resultado oficial"}</span>
          <span>Totalização TSE: <b>${esc(atual)}</b></span>
        </div>
      </header>

      <section class="status" aria-label="Andamento da apuração">
        <div class="hero">
          <div class="lbl">Seções totalizadas no estado</div>
          <div class="hero-num">${fmtP(U.pst).replace("%", "")}<small>%</small></div>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${U.pst || 0}"><i style="width:${Math.min(100, U.pst || 0)}%"></i></div>
        </div>
        <div class="kpi"><div class="lbl">Seções</div><div class="v">${fmt.format(U.st || 0)}</div><div class="d">de ${fmt.format(U.ts || 0)}</div></div>
        <div class="kpi"><div class="lbl">Comparecimento</div><div class="v">${fmtP(U.pc)}</div><div class="d">${fmt.format(U.c || 0)} eleitores</div></div>
        <div class="kpi"><div class="lbl">Abstenção</div><div class="v">${fmtP(U.pa)}</div><div class="d">${fmt.format(U.a || 0)} eleitores</div></div>
        <div class="kpi"><div class="lbl">${U.vb != null ? "Brancos · Nulos" : "Eleitorado"}</div>
          <div class="v">${U.vb != null ? fmtP(U.pvb, 1) + " · " + fmtP(U.ptvn ?? U.pvn, 1) : fmt.format(U.te || 0)}</div>
          <div class="d">${U.vb != null ? fmt.format(U.vb) + " brancos" : "aptos a votar"}</div></div>
      </section>

      <nav class="tabs" role="tablist">
        ${R.cargos.map((c) => `<button class="tab" role="tab" data-cargo="${c.cd}" aria-selected="${c.cd === S.cargo}">${esc(c.nm)}<span class="n">${D.cargos[c.cd] ? fmt.format(D.cargos[c.cd].candidatos.length) + " candidatos" : ""}</span></button>`).join("")}
      </nav>
      ${dc ? corpoCargo(dc) : `<div class="panel"><p class="empty">O TSE ainda não divulgou resultado para este cargo. O painel atualiza sozinho assim que os primeiros boletins forem totalizados.</p></div>`}
      <footer>
        Painel independente de visualização. Votos, percentuais e situação dos candidatos são copiados sem alteração dos arquivos oficiais do TSE
        (resultados.tse.jus.br). Cadeiras e situação só são definitivas ao fim da totalização. Página atualizada às ${new Date(R.gerado_em).toLocaleTimeString("pt-BR")}; recarrega sozinha a cada minuto.
      </footer>`;
    ligar();
    if (dc) { desenharMapa(); desenharCurva(); }
  }

  function corpoCargo(dc) {
    const c = candidatoSel();
    const hl = dc.candidatos.filter(ehDestaque);
    const partidos = [...new Set(dc.candidatos.map((x) => x.sg))].sort();
    const totalVag = dc.agremiacoes.reduce((s, a) => s + (a.vag || 0), 0);
    return `
    <div class="grid">
      <div class="col">
        <section class="panel">
          <div class="panel-h"><h2>Em destaque · ${esc(dest().partidos.join(", ") || "candidatos selecionados")}</h2>
            <span class="note">${hl.length} candidatos · ${fmt.format(hl.reduce((s, x) => s + x.vap, 0))} votos</span></div>
          ${hl.length ? `<div class="hl-list">${hl.slice(0, 12).map((x) => `
            <button class="hl" data-n="${esc(x.n)}" aria-pressed="${x.n === c.n}">
              <span class="nm">${esc(x.nm)}</span>
              <span class="sub">${esc(x.n)} · ${esc(x.sg)} · ${posicao(dc, x)}º no geral</span>
              <span class="row"><span class="v">${fmt.format(x.vap)}</span>${situacao(x)}</span>
            </button>`).join("")}</div>${hl.length > 12 ? `<p class="empty">Mais ${hl.length - 12} na tabela abaixo (linhas destacadas).</p>` : ""}`
            : `<p class="empty">Nenhum candidato em destaque. Ajuste "destaque_partidos" ou "destaque_numeros" no config.ini.</p>`}
        </section>

        ${["3", "5"].includes(dc.cargo) ? "" : `<section class="panel">
          <div class="panel-h"><h2>Cadeiras por partido ou federação</h2>
            <span class="note">${totalVag ? totalVag + " vagas distribuídas" : "distribuição ainda não informada"}${dc.qe ? " · quociente eleitoral " + fmt.format(dc.qe) : ""}</span></div>
          <div class="seats">${dc.agremiacoes.filter((a) => a.vag > 0).map((a) => {
            const dst = dc.candidatos.some((x) => ehDestaque(x) && (x.ag || x.fed) === a.nm);
            const max = Math.max(...dc.agremiacoes.map((z) => z.vag || 0), 1);
            return `<div class="seat ${dst ? "dest" : ""}"><span class="nm" title="${esc(a.nm)} ${esc(a.com)}">${esc(titulo(a.nm))}</span><span class="bar"><i style="width:${(100 * a.vag) / max}%"></i></span><span class="q">${a.vag}</span></div>`;
          }).join("") || `<p class="empty">As vagas aparecem aqui quando o TSE começar a projetar a distribuição.</p>`}</div>
        </section>`}

        <section class="panel">
          <div class="panel-h"><h2>Ranking de candidatos</h2><span class="note">clique numa linha para ver no mapa</span></div>
          <div class="filters">
            <input id="f-busca" type="search" placeholder="Buscar por nome ou número" value="${esc(S.busca)}" aria-label="Buscar candidato">
            <select id="f-partido" aria-label="Partido"><option value="">Todos os partidos</option>${partidos.map((p) => `<option ${p === S.partido ? "selected" : ""}>${esc(p)}</option>`).join("")}</select>
            <select id="f-sit" aria-label="Situação">
              <option value="">Qualquer situação</option>
              <option value="eleito" ${S.situacao === "eleito" ? "selected" : ""}>Eleitos</option>
              <option value="suplente" ${S.situacao === "suplente" ? "selected" : ""}>Suplentes</option>
            </select>
          </div>
          <div id="ranking"></div>
        </section>
      </div>

      <div class="col">
        <section class="panel" id="cand">
          <div class="cand-head">
            <div class="lbl">Candidato selecionado</div>
            <div class="nm">${esc(c.nm)}</div>
            <div class="sub">${esc(c.n)} · ${esc(c.sg)}${c.fed ? " · " + esc(titulo(c.fed)) : ""} &nbsp;${situacao(c)}</div>
          </div>
          <div class="cand-stats">
            <div><div class="lbl">Votos no estado</div><div class="v">${fmt.format(c.vap)}</div></div>
            <div><div class="lbl">% votos válidos</div><div class="v">${fmtP(c.pvap)}</div></div>
            <div><div class="lbl">Posição</div><div class="v">${posicao(dc, c)}º</div></div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-h"><h2>Votos por município</h2>
            <div class="seg" role="group" aria-label="O que o mapa mostra">
              <button data-modo="votos" aria-pressed="${S.modoMapa === "votos"}">Votos</button>
              <button data-modo="pct" aria-pressed="${S.modoMapa === "pct"}">% no município</button>
              <button data-modo="pst" aria-pressed="${S.modoMapa === "pst"}">Apuração</button>
            </div></div>
          <div class="map-box" id="mapa"></div>
          <div class="legend" id="legenda"></div>
          <div class="top-mun" id="top-mun"></div>
        </section>

        <section class="panel">
          <div class="panel-h"><h2>Curva da apuração</h2><span class="note">votos de ${esc(c.nm)} no estado ao longo da noite</span></div>
          <div class="chart" id="curva"></div>
        </section>

        <section class="panel">
          <div class="panel-h"><h2>Votos por bairro · Rio de Janeiro (capital)</h2></div>
          <div class="pending">
            <b>Disponível depois da eleição.</b>
            <span>Durante a apuração o TSE divulga resultados só até o nível de município. O resultado por seção eleitoral, que permite chegar ao bairro, sai nos Dados Abertos do TSE alguns dias depois. Esta seção será preenchida nessa etapa, cruzando as seções com os locais de votação e a malha de bairros da Prefeitura do Rio.</span>
          </div>
        </section>
      </div>
    </div>`;
  }

  function posicao(dc, c) { return dc.candidatos.findIndex((x) => x.n === c.n) + 1; }

  function filtrados() {
    const dc = D.cargos[S.cargo];
    const b = norm(S.busca);
    return dc.candidatos.map((c, i) => ({ ...c, pos: i + 1 })).filter((c) =>
      (!b || norm(c.nm).includes(b) || c.n.startsWith(b)) &&
      (!S.partido || c.sg === S.partido) &&
      (!S.situacao || (S.situacao === "eleito" ? c.e === "s" || /^eleito/i.test(c.st) : /suplente/i.test(c.st))));
  }

  function renderRanking() {
    const lista = filtrados();
    const pags = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
    S.pagina = Math.min(S.pagina, pags - 1);
    const fatia = lista.slice(S.pagina * POR_PAGINA, (S.pagina + 1) * POR_PAGINA);
    const sel = S.sel[S.cargo];
    $("#ranking").innerHTML = `
      <div class="tbl-wrap"><table>
        <thead><tr><th class="r">#</th><th>Candidato</th><th class="r">Votos</th><th class="r">%</th><th>Situação</th></tr></thead>
        <tbody>${fatia.map((c) => `<tr data-n="${esc(c.n)}" class="${ehDestaque(c) ? "dest" : ""} ${c.n === sel ? "sel" : ""}">
          <td class="r">${c.pos}</td>
          <td><div class="nm">${esc(c.nm)}</div><div class="sg">${esc(c.n)} · ${esc(c.sg)}</div></td>
          <td class="r">${fmt.format(c.vap)}</td><td class="r">${fmtP(c.pvap)}</td><td>${situacao(c)}</td></tr>`).join("") ||
          `<tr><td colspan="5" class="empty">Nenhum candidato encontrado com esses filtros.</td></tr>`}</tbody>
      </table></div>
      <div class="pager"><button class="btn" id="pg-ant" ${S.pagina === 0 ? "disabled" : ""}>← Anterior</button>
        <span>${fmt.format(lista.length)} candidatos · página ${S.pagina + 1} de ${pags}</span>
        <button class="btn" id="pg-prox" ${S.pagina >= pags - 1 ? "disabled" : ""}>Próxima →</button></div>`;
    $("#pg-ant").onclick = () => { S.pagina--; renderRanking(); };
    $("#pg-prox").onclick = () => { S.pagina++; renderRanking(); };
    $("#ranking tbody").onclick = (e) => { const tr = e.target.closest("tr[data-n]"); if (tr) selecionar(tr.dataset.n); };
  }

  function selecionar(n) {
    S.sel[S.cargo] = n;
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
    if (window.innerWidth < 1000) $("#cand").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function ligar() {
    document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => { S.cargo = b.dataset.cargo; S.pagina = 0; S.partido = ""; guardar(); render(); }));
    if (!D.cargos[S.cargo]) return;
    document.querySelectorAll(".hl").forEach((b) => (b.onclick = () => selecionar(b.dataset.n)));
    document.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => { S.modoMapa = b.dataset.modo; guardar(); document.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-pressed", x === b)); desenharMapa(); }));
    $("#f-busca").oninput = (e) => { S.busca = e.target.value; S.pagina = 0; renderRanking(); };
    $("#f-partido").onchange = (e) => { S.partido = e.target.value; S.pagina = 0; renderRanking(); };
    $("#f-sit").onchange = (e) => { S.situacao = e.target.value; S.pagina = 0; renderRanking(); };
    renderRanking();
  }

  // ---------- tooltip ----------
  const tip = () => document.getElementById("tip");
  function mostrarTip(ev, html) {
    const t = tip(); t.innerHTML = html; t.hidden = false;
    const w = t.offsetWidth, h = t.offsetHeight;
    let x = ev.clientX + 14, y = ev.clientY + 14;
    if (x + w > window.innerWidth - 8) x = ev.clientX - w - 14;
    if (y + h > window.innerHeight - 8) y = ev.clientY - h - 14;
    t.style.left = x + "px"; t.style.top = y + "px";
  }
  const esconderTip = () => { tip().hidden = true; };

  // ---------- mapa ----------
  function desenharMapa() {
    const box = $("#mapa"); if (!box) return;
    const dc = D.cargos[S.cargo], c = candidatoSel(), muns = munPorCd();
    if (!D.geo || !window.d3) { box.innerHTML = `<p class="empty">Mapa indisponível (malha municipal não carregada).</p>`; return; }
    const porIbge = {};
    D.resumo.municipios.forEach((m) => (porIbge[m.cdi] = m));
    const votos = {};
    (dc.por_municipio[c.n] || []).forEach(([cd, v, p]) => (votos[cd] = { v, p }));
    const modo = S.modoMapa;
    const valor = (m) => !m ? null : modo === "pst" ? m.pst : modo === "pct" ? (votos[m.cd]?.p ?? 0) : (votos[m.cd]?.v ?? 0);
    const vals = D.resumo.municipios.map(valor).filter((v) => v != null);
    const max = modo === "pst" ? 100 : Math.max(...vals, 0);
    const css = getComputedStyle(document.documentElement);
    const ramp = [0, 1, 2, 3, 4, 5].map((i) => css.getPropertyValue(`--${modo === "pst" ? "prog" : "seq"}-${i}`).trim());
    // apuração: faixas fixas de 20 pontos; votos e %: quintis dos municípios com voto (a capital não achata o resto)
    const pos = vals.filter((v) => v > 0).sort((a, b) => a - b);
    const cortes = modo === "pst" ? [20, 40, 60, 80] : [0.2, 0.4, 0.6, 0.8].map((q) => d3.quantileSorted(pos, q) ?? 0);
    const cor = (v) => (v == null ? css.getPropertyValue("--surface-2") : v <= 0 ? ramp[0] : ramp[1 + d3.bisectRight(cortes, v - 1e-9)]);

    const W = 640, H = 400;
    const proj = d3.geoMercator().fitExtent([[6, 6], [W - 6, H - 6]], D.geo);
    const path = d3.geoPath(proj);
    const idDe = (f) => String(f.properties.id || f.properties.codarea || f.properties.CD_MUN || "");
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa dos municípios do estado">${D.geo.features.map((f) => {
      const m = porIbge[idDe(f)];
      return `<path class="mun" d="${path(f)}" fill="${cor(valor(m))}" data-cdi="${idDe(f)}"></path>`;
    }).join("")}</svg>`;
    box.querySelectorAll("path.mun").forEach((p) => {
      p.onmousemove = (ev) => {
        const m = porIbge[p.dataset.cdi];
        const nome = m ? titulo(m.nm) : "Município";
        const vt = m && votos[m.cd];
        mostrarTip(ev, `<b>${esc(nome)}</b><br>${esc(c.nm)}: ${fmt.format(vt?.v || 0)} votos (${fmtP(vt?.p || 0)})<br>Seções totalizadas: ${fmtP(m?.pst || 0)}`);
      };
      p.onmouseleave = esconderTip;
    });
    const nomeModo = { votos: "votos do candidato", pct: "% do candidato nos votos válidos do município", pst: "% de seções totalizadas" }[modo];
    const f = (v) => (modo === "votos" ? fmt.format(Math.round(v)) : fmtP(v, modo === "pst" ? 0 : 2));
    const faixas = [`<span class="lg"><i style="background:${ramp[0]}"></i>${modo === "pst" ? "0" : "sem votos"}</span>`]
      .concat([0, 1, 2, 3, 4].map((i) => `<span class="lg"><i style="background:${ramp[i + 1]}"></i>${i === 4 ? "> " + f(cortes[3]) : "até " + f(cortes[i] ?? max)}</span>`));
    $("#legenda").innerHTML = faixas.join("") + `<span class="lg-t">${nomeModo}${modo === "pst" ? "" : " · faixas com o mesmo número de municípios"}</span>`;

    const top = Object.entries(votos).sort((a, b) => b[1].v - a[1].v).slice(0, 10);
    $("#top-mun").innerHTML = top.length
      ? top.map(([cd, x]) => `<div><span>${esc(titulo(muns[cd]?.nm || cd))}</span><span>${fmt.format(x.v)}</span></div>`).join("")
      : `<p class="empty">Ainda sem votos totalizados por município para este candidato.</p>`;
  }

  // ---------- curva ----------
  function desenharCurva() {
    const box = $("#curva"); if (!box || !window.d3) return;
    const s = D.serie[S.cargo], c = candidatoSel();
    if (!s || !s.t || s.t.length < 2) { box.innerHTML = `<p class="empty">A curva aparece a partir da segunda atualização do TSE.</p>`; return; }
    const parse = d3.timeParse("%d/%m/%Y %H:%M:%S");
    const pts = s.t.map((t, i) => ({ t: parse(t), v: (s.v[c.n] || [])[i], pst: s.pst[i] })).filter((p) => p.t && p.v != null).sort((a, b) => a.t - b.t);
    if (pts.length < 2) { box.innerHTML = `<p class="empty">Ainda não há pontos suficientes para este candidato.</p>`; return; }
    const W = 620, H = 240, m = { t: 12, r: 16, b: 26, l: 62 };
    const x = d3.scaleTime().domain(d3.extent(pts, (p) => p.t)).range([m.l, W - m.r]);
    const y = d3.scaleLinear().domain([0, d3.max(pts, (p) => p.v) || 1]).nice().range([H - m.b, m.t]);
    const svg = d3.create("svg").attr("viewBox", `0 0 ${W} ${H}`).attr("role", "img").attr("aria-label", "Evolução dos votos ao longo da apuração");
    svg.append("g").attr("class", "grid").selectAll("line").data(y.ticks(4)).join("line").attr("x1", m.l).attr("x2", W - m.r).attr("y1", y).attr("y2", y);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat(d3.timeFormat("%H:%M")).tickSizeOuter(0));
    svg.append("g").attr("class", "axis").attr("transform", `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickFormat((v) => fmt.format(v)).tickSize(0)).call((g) => g.select(".domain").remove());
    svg.append("path").datum(pts).attr("class", "area").attr("d", d3.area().x((p) => x(p.t)).y0(y(0)).y1((p) => y(p.v)));
    svg.append("path").datum(pts).attr("class", "ln").attr("d", d3.line().x((p) => x(p.t)).y((p) => y(p.v)));
    const ult = pts[pts.length - 1];
    svg.append("circle").attr("class", "dot").attr("r", 5).attr("cx", x(ult.t)).attr("cy", y(ult.v));
    const cross = svg.append("line").attr("class", "cross").attr("y1", m.t).attr("y2", H - m.b).style("display", "none");
    const foco = svg.append("circle").attr("class", "dot").attr("r", 5).style("display", "none");
    svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", W - m.l - m.r).attr("height", H - m.t - m.b).attr("fill", "transparent")
      .on("mousemove", (ev) => {
        const [mx] = d3.pointer(ev);
        const i = d3.bisector((p) => p.t).center(pts, x.invert(mx)), p = pts[i];
        cross.style("display", null).attr("x1", x(p.t)).attr("x2", x(p.t));
        foco.style("display", null).attr("cx", x(p.t)).attr("cy", y(p.v));
        mostrarTip(ev, `<b>${d3.timeFormat("%H:%M")(p.t)}</b> · ${fmtP(p.pst)} das seções<br>${esc(c.nm)}: ${fmt.format(p.v)} votos`);
      })
      .on("mouseleave", () => { cross.style("display", "none"); foco.style("display", "none"); esconderTip(); });
    box.innerHTML = ""; box.append(svg.node());
  }

  // ---------- ciclo ----------
  async function ciclo(primeira) {
    try {
      await carregar();
      const ativo = document.activeElement && document.activeElement.id;
      const y = window.scrollY;
      render();
      if (!primeira) { window.scrollTo(0, y); if (ativo && document.getElementById(ativo)) document.getElementById(ativo).focus(); }
    } catch (e) {
      if (primeira) $("#app").innerHTML = `<p class="loading">Os dados do painel ainda não estão disponíveis. Verifique se o coletor já rodou pelo menos uma vez. (${esc(e.message)})</p>`;
    }
  }
  ciclo(true);
  if (!window.__DADOS__) setInterval(() => { if (!document.hidden) ciclo(false); }, REFRESH_MS);
  let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (D.resumo) { desenharMapa(); } }, 200); });
  if (window.matchMedia) window.matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => D.resumo && render());
})();
