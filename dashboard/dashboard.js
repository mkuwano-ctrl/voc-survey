/* VOC ダッシュボード v0
 * - ログイン（Supabase Auth: メール＋パスワード）した人だけが回答を読める
 * - 店舗スコア一覧 / 店舗詳細 / コメント一覧 / スコア推移 / CSV
 * - ?demo=1 でサンプルデータ表示（ログイン不要・実データは読まない）
 */
(function () {
  const C = window.VOC_CONFIG;
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const demo = params.get("demo") === "1";
  const ISSUES = ["料理の味", "量や価格", "提供の速さ", "接客", "清潔さ", "注文のしやすさ", "特になし"];
  const STORE_NAME = (id) => (C.STORES[id] && C.STORES[id].name) || id;
  const COLORS = { accent: "#d9452b", soft: "#f3b7ab", ink: "#1f2328", muted: "#9ca3af", blue: "#3b6fb6" };

  let supa = null, responses = [], sends = [], charts = {};
  let view = "overview", tab = "report";

  // ---- 認証 ----------------------------------------------------------------
  async function boot() {
    if (demo) { $("demoBanner").hidden = false; $("shell").hidden = false; $("who").textContent = "サンプル表示"; seedDemo(); applyFilters(); return; }
    supa = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { auth: { storageKey: "voc-dashboard-auth" } });
    const { data: { session } } = await supa.auth.getSession();
    if (session) enter(session); else $("login").hidden = false;
    supa.auth.onAuthStateChange((_e, s) => { if (s && $("shell").hidden) enter(s); });
  }
  async function enter(session) {
    $("login").hidden = true; $("shell").hidden = false;
    $("who").textContent = session.user.email;
    await load();
  }
  $("loginForm").onsubmit = async (e) => {
    e.preventDefault(); $("loginError").hidden = true; $("loginBtn").disabled = true;
    const { error } = await supa.auth.signInWithPassword({ email: $("email").value.trim(), password: $("password").value });
    $("loginBtn").disabled = false;
    if (error) { $("loginError").textContent = "ログインできませんでした。メールアドレスとパスワードを確認してください。"; $("loginError").hidden = false; }
  };
  $("reloadBtn").onclick = () => load();
  $("logout").onclick = async () => { if (supa) await supa.auth.signOut(); location.reload(); };

  // ---- 期間 ----------------------------------------------------------------
  function range() {
    const to = new Date(); to.setHours(23, 59, 59, 999);
    const sel = $("rangeSel").value;
    if (sel === "custom") {
      const f = $("fromDate").value ? new Date($("fromDate").value) : new Date(Date.now() - 30 * 864e5);
      const t = $("toDate").value ? new Date($("toDate").value + "T23:59:59") : to;
      return { from: f, to: t };
    }
    const from = new Date(Date.now() - (Number(sel) - 1) * 864e5); from.setHours(0, 0, 0, 0);
    return { from, to };
  }

  // ---- データ取得 ------------------------------------------------------------
  async function load() {
    if (demo) { applyFilters(); return; }
    const { from, to } = range();
    $("status").textContent = "読み込み中…";
    const r = await supa.from("survey_responses").select("response_id,visit_id,send_id,store_id,status,q1_overall,q2_revisit,q3_issues,q3_detail,comment,staff_name,source_channel,is_dev,created_at,answered_at")
      .gte("created_at", from.toISOString()).lte("created_at", to.toISOString()).order("created_at", { ascending: false }).limit(5000);
    const s = await supa.from("survey_sends").select("send_id,visit_id,store_id,holdout_group,status,scheduled_at,sent_at")
      .gte("scheduled_at", from.toISOString()).lte("scheduled_at", to.toISOString()).limit(20000);
    if (r.error) { $("status").textContent = "回答を読めませんでした: " + r.error.message; responses = []; } else responses = r.data || [];
    sends = s.error ? [] : (s.data || []);
    $("status").textContent = "";
    applyFilters();
  }

  // ---- フィルタ ----------------------------------------------------------------
  function filtered() {
    const store = $("storeSel").value, dev = $("includeDev").checked;
    const { from, to } = range();
    const inRange = (d) => { const t = new Date(d); return t >= from && t <= to; };
    const rs = responses.filter((x) => (!store || x.store_id === store) && (dev || !x.is_dev) && inRange(x.created_at));
    const ss = sends.filter((x) => (!store || x.store_id === store) && inRange(x.scheduled_at));
    return { rs, ss };
  }
  function applyFilters() {
    const stores = [...new Set(responses.map((x) => x.store_id).concat(sends.map((x) => x.store_id)))].sort();
    const sel = $("storeSel"); const cur = sel.value;
    sel.innerHTML = '<option value="">すべての店舗</option>' + stores.map((id) => `<option value="${id}">${STORE_NAME(id)}</option>`).join("");
    if (stores.includes(cur)) sel.value = cur;
    render();
  }
  ["storeSel", "rangeSel", "includeDev", "fromDate", "toDate", "lowOnly", "allRows"].forEach((id) => { $(id).onchange = () => { $("customRange").hidden = $("rangeSel").value !== "custom"; if (!demo && ["rangeSel", "fromDate", "toDate"].includes(id)) load(); else render(); }; });

  // ---- 集計 ----------------------------------------------------------------
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const to100 = (v) => v === null ? null : Math.round(v * 10);
  const grade = (v) => v === null ? "N" : v >= 90 ? "S" : v >= 80 ? "A" : v >= 70 ? "B" : v >= 60 ? "C" : "D";
  const fmt = (v, d = 0) => v === null || v === undefined || Number.isNaN(v) ? "–" : Number(v).toFixed(d);
  const pct = (a, b) => b ? Math.round((a / b) * 100) : null;
  function stats(rs, ss) {
    const done = rs.filter((x) => x.status === "completed");
    const sent = ss.filter((x) => x.status === "sent").length;
    const withIssue = done.filter((x) => (x.q3_issues || []).some((i) => i !== "特になし")).length;
    return {
      opened: rs.length, started: rs.filter((x) => x.status !== "opened").length, done: done.length, sent,
      rate: pct(done.length, sent), completeRate: pct(done.length, rs.length),
      overall: to100(avg(done.map((x) => x.q1_overall).filter((v) => v !== null))),
      revisit: to100(avg(done.map((x) => x.q2_revisit).filter((v) => v !== null))),
      issueRate: pct(withIssue, done.length),
      issueCounts: countBy(done.flatMap((x) => x.q3_issues || []), ISSUES),
      sourceCounts: countBy(done.map((x) => x.source_channel).filter(Boolean)),
      staff: countBy(done.map((x) => (x.staff_name || "").trim()).filter(Boolean)),
      dist1: hist(done.map((x) => x.q1_overall)), dist2: hist(done.map((x) => x.q2_revisit)),
      detail: issueDetail(done), done_rows: done,
    };
  }
  function countBy(arr, order) {
    const m = {}; arr.forEach((k) => { m[k] = (m[k] || 0) + 1; });
    const keys = order ? order.filter((k) => m[k]) : Object.keys(m).sort((a, b) => m[b] - m[a]);
    return keys.map((k) => [k, m[k]]);
  }
  function hist(vals) { const h = Array(11).fill(0); vals.forEach((v) => { if (v !== null && v !== undefined) h[v]++; }); return h; }
  function issueDetail(done) {
    const m = {};
    done.forEach((x) => { Object.entries(x.q3_detail || {}).forEach(([area, d]) => { m[area] = m[area] || {}; m[area][d] = (m[area][d] || 0) + 1; }); });
    return m;
  }

  // ---- 描画 ----------------------------------------------------------------
  function tile(k, v, s) { return `<div class="tile"><div class="k">${k}</div><div class="v">${v}</div><div class="s">${s || ""}</div></div>`; }
  function gradeBadge(v) { return `<span class="score"><span class="g g${grade(v)}">${grade(v) === "N" ? "–" : grade(v)}</span>${fmt(v)}</span>`; }

  function render() {
    const { rs, ss } = filtered();
    document.querySelectorAll(".view").forEach((el) => { el.hidden = el.id !== "view-" + view; });
    document.querySelectorAll(".side nav button").forEach((b) => b.classList.toggle("on", b.dataset.view === view));
    if (view === "overview") renderOverview(rs, ss);
    if (view === "detail") renderDetail(rs, ss);
    if (view === "comments") renderComments(rs);
    if (view === "trend") renderTrend(rs, ss);
  }
  document.querySelectorAll(".side nav button").forEach((b) => { b.onclick = () => { view = b.dataset.view; render(); }; });
  document.querySelectorAll("#detailTabs button").forEach((b) => { b.onclick = () => { tab = b.dataset.tab; render(); }; });

  function renderOverview(rs, ss) {
    const t = stats(rs, ss);
    $("kpiTiles").innerHTML = [
      tile("配信数", fmt(t.sent), "ホールドアウトを除く"),
      tile("回答数", fmt(t.done), t.rate !== null ? `回答率 ${t.rate}%` : "配信記録なし"),
      tile("開始→完了", t.completeRate !== null ? t.completeRate + "%" : "–", `開いた ${t.opened} / 完了 ${t.done}`),
      tile("総合満足", fmt(t.overall), "100点換算"),
      tile("再来店意向", fmt(t.revisit), "100点換算"),
      tile("気になった点あり", t.issueRate !== null ? t.issueRate + "%" : "–", "「特になし」以外を選んだ割合"),
    ].join("");
    const stores = [...new Set(rs.map((x) => x.store_id).concat(ss.map((x) => x.store_id)))].sort();
    const rows = stores.map((id) => {
      const s = stats(rs.filter((x) => x.store_id === id), ss.filter((x) => x.store_id === id));
      const top = s.issueCounts.filter(([k]) => k !== "特になし").sort((a, b) => b[1] - a[1])[0];
      return { id, s, top };
    }).sort((a, b) => (b.s.overall ?? -1) - (a.s.overall ?? -1));
    const all = stats(rs, ss);
    $("storeTable").innerHTML = `<thead><tr><th>店舗</th><th class="num">配信</th><th class="num">回答</th><th class="num">回答率</th><th>総合満足</th><th>再来店意向</th><th class="num">気になった点あり</th><th>最多の指摘</th></tr></thead><tbody>` +
      (rows.length ? rows.map((r) => `<tr class="clickable" data-store="${r.id}"><td>${STORE_NAME(r.id)}</td><td class="num">${fmt(r.s.sent)}</td><td class="num">${fmt(r.s.done)}</td><td class="num">${r.s.rate !== null ? r.s.rate + "%" : "–"}</td><td>${gradeBadge(r.s.overall)}</td><td>${gradeBadge(r.s.revisit)}</td><td class="num">${r.s.issueRate !== null ? r.s.issueRate + "%" : "–"}</td><td>${r.top ? `${r.top[0]}（${r.top[1]}件）` : "–"}</td></tr>`).join("") : `<tr><td colspan="8" class="empty">この期間の回答はありません</td></tr>`) +
      (rows.length > 1 ? `<tr><td><b>全店平均</b></td><td class="num">${fmt(all.sent)}</td><td class="num">${fmt(all.done)}</td><td class="num">${all.rate !== null ? all.rate + "%" : "–"}</td><td>${gradeBadge(all.overall)}</td><td>${gradeBadge(all.revisit)}</td><td class="num">${all.issueRate !== null ? all.issueRate + "%" : "–"}</td><td></td></tr>` : "") + `</tbody>`;
    $("storeTable").querySelectorAll("tr.clickable").forEach((tr) => { tr.onclick = () => { $("storeSel").value = tr.dataset.store; view = "detail"; render(); }; });
  }

  function renderDetail(rs, ss) {
    const t = stats(rs, ss);
    document.querySelectorAll("#detailTabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    document.querySelectorAll(".tab").forEach((el) => { el.hidden = el.id !== "tab-" + tab; });
    if (tab === "report") {
      $("detailTiles").innerHTML = [
        tile("回答数", fmt(t.done), t.rate !== null ? `回答率 ${t.rate}%` : ""),
        tile("総合満足", fmt(t.overall), `グレード ${grade(t.overall)}`),
        tile("再来店意向", fmt(t.revisit), `グレード ${grade(t.revisit)}`),
        tile("気になった点あり", t.issueRate !== null ? t.issueRate + "%" : "–", ""),
      ].join("");
      bar("issuesChart", t.issueCounts.map((x) => x[0]), t.issueCounts.map((x) => x[1]), COLORS.accent);
      bar("sourceChart", t.sourceCounts.map((x) => x[0]), t.sourceCounts.map((x) => x[1]), COLORS.blue);
      $("staffList").innerHTML = t.staff.length ? t.staff.map(([k, n]) => `<span class="chip">${esc(k)}${n > 1 ? ` ×${n}` : ""}</span>`).join("") : `<span class="muted">まだありません</span>`;
    }
    if (tab === "overall") {
      bar("overallDist", [...Array(11).keys()].map(String), t.dist1, COLORS.accent);
      $("overallByScore").innerHTML = scoreIssueTable(t.done_rows, "q1_overall");
    }
    if (tab === "revisit") {
      bar("revisitDist", [...Array(11).keys()].map(String), t.dist2, COLORS.blue);
      const n = t.done_rows.length, p = t.done_rows.filter((x) => x.q2_revisit >= 9).length, d = t.done_rows.filter((x) => x.q2_revisit <= 6).length, m = n - p - d;
      $("npsBox").innerHTML = n ? `<div class="nps"><div><div class="k muted small">推奨者（9〜10）</div><div class="v">${pct(p, n)}%</div></div><div><div class="k muted small">中立者（7〜8）</div><div class="v">${pct(m, n)}%</div></div><div><div class="k muted small">批判者（0〜6）</div><div class="v">${pct(d, n)}%</div></div></div><p class="muted small" style="margin-top:10px">推奨者の割合 − 批判者の割合 ＝ <b>${pct(p, n) - pct(d, n)}</b>（NPS相当）</p>` : `<div class="empty">回答がありません</div>`;
    }
    if (tab === "issues") {
      const areas = Object.keys(t.detail);
      $("issueDetail").innerHTML = areas.length ? areas.map((a) => {
        const items = Object.entries(t.detail[a]).sort((x, y) => y[1] - x[1]); const max = items[0][1];
        return `<div class="card"><h3>「${a}」で特に気になった点</h3>${items.map(([k, n]) => `<div style="display:flex;justify-content:space-between;gap:8px"><span>${esc(k)}</span><span class="muted">${n}</span></div><div class="bar"><span style="width:${(n / max) * 100}%;background:${COLORS.accent}"></span></div>`).join("")}</div>`;
      }).join("") : `<div class="card empty">「気になった点」を選んだ回答がまだありません</div>`;
    }
  }
  function scoreIssueTable(rows, key) {
    const bands = [["9〜10", (v) => v >= 9], ["7〜8", (v) => v >= 7 && v <= 8], ["0〜6", (v) => v <= 6]];
    const trs = bands.map(([label, f]) => {
      const sub = rows.filter((x) => f(x[key]));
      const c = countBy(sub.flatMap((x) => x.q3_issues || []).filter((i) => i !== "特になし")).slice(0, 3);
      return `<tr><td>${label}</td><td class="num">${sub.length}</td><td class="wrap">${c.length ? c.map(([k, n]) => `${k}（${n}）`).join("、") : "–"}</td></tr>`;
    }).join("");
    return `<table><thead><tr><th>点数</th><th class="num">人数</th><th>多かった指摘（上位3）</th></tr></thead><tbody>${trs}</tbody></table>`;
  }

  function renderComments(rs) {
    const low = $("lowOnly").checked;
    const all = $("allRows").checked;
    const rows = rs.filter((x) => x.status === "completed" && (all || x.comment || x.staff_name)).filter((x) => !low || (x.q1_overall !== null && x.q1_overall <= 6));
    $("commentTable").innerHTML = `<thead><tr><th>日時</th><th>店舗</th><th>来店ID</th><th class="num">総合</th><th class="num">再来店</th><th>気になった点</th><th>コメント</th><th>スタッフ</th><th>配信ID</th></tr></thead><tbody>` +
      (rows.length ? rows.map((x) => `<tr><td>${fmtDate(x.answered_at || x.created_at)}</td><td>${STORE_NAME(x.store_id)}</td><td>${esc(x.visit_id || "–")}</td><td class="num">${fmt(x.q1_overall)}</td><td class="num">${fmt(x.q2_revisit)}</td><td class="wrap">${(x.q3_issues || []).map((i) => esc(i) + (x.q3_detail && x.q3_detail[i] ? `（${esc(x.q3_detail[i])}）` : "")).join("、") || "–"}</td><td class="wrap">${esc(x.comment || "")}</td><td>${esc(x.staff_name || "")}</td><td class="muted small">${x.send_id ? esc(String(x.send_id).slice(0, 8)) + "…" : "–"}</td></tr>`).join("") : `<tr><td colspan="9" class="empty">該当する回答はありません</td></tr>`) + `</tbody>`;
  }

  function renderTrend(rs, ss) {
    const wk = (d) => { const t = new Date(d); const day = (t.getDay() + 6) % 7; t.setDate(t.getDate() - day); t.setHours(0, 0, 0, 0); return t.toISOString().slice(0, 10); };
    const weeks = {};
    rs.filter((x) => x.status === "completed").forEach((x) => { const w = wk(x.created_at); weeks[w] = weeks[w] || { o: [], r: [], n: 0, s: 0 }; weeks[w].o.push(x.q1_overall); weeks[w].r.push(x.q2_revisit); weeks[w].n++; });
    ss.filter((x) => x.status === "sent").forEach((x) => { const w = wk(x.scheduled_at); weeks[w] = weeks[w] || { o: [], r: [], n: 0, s: 0 }; weeks[w].s++; });
    const labels = Object.keys(weeks).sort();
    line("trendChart", labels.map((l) => l.slice(5)), [
      { label: "総合満足", data: labels.map((l) => to100(avg(weeks[l].o.filter((v) => v !== null)))), borderColor: COLORS.accent, backgroundColor: COLORS.accent },
      { label: "再来店意向", data: labels.map((l) => to100(avg(weeks[l].r.filter((v) => v !== null)))), borderColor: COLORS.blue, backgroundColor: COLORS.blue },
    ], { min: 0, max: 100 });
    bars("volumeChart", labels.map((l) => l.slice(5)), [
      { label: "配信数", data: labels.map((l) => weeks[l].s), backgroundColor: COLORS.soft },
      { label: "回答数", data: labels.map((l) => weeks[l].n), backgroundColor: COLORS.accent },
    ]);
  }

  // ---- Chart.js ラッパー --------------------------------------------------------
  function mk(id, cfg) { if (charts[id]) charts[id].destroy(); charts[id] = new Chart($(id).getContext("2d"), cfg); }
  const base = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } } };
  function bar(id, labels, data, color) { mk(id, { type: "bar", data: { labels, datasets: [{ data, backgroundColor: color, borderRadius: 6 }] }, options: base }); }
  function bars(id, labels, datasets) { mk(id, { type: "bar", data: { labels, datasets: datasets.map((d) => Object.assign({ borderRadius: 4 }, d)) }, options: Object.assign({}, base, { plugins: { legend: { display: true, position: "bottom" } } }) }); }
  function line(id, labels, datasets, y) { mk(id, { type: "line", data: { labels, datasets: datasets.map((d) => Object.assign({ tension: .3, pointRadius: 3, spanGaps: true }, d)) }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: "bottom" } }, scales: { x: { grid: { display: false } }, y: Object.assign({ ticks: { precision: 0 } }, y || {}) } } }); }

  // ---- CSV ----------------------------------------------------------------
  $("csvBtn").onclick = () => {
    const { rs } = filtered();
    const cols = ["response_id", "visit_id", "store_id", "status", "answered_at", "q1_overall", "q2_revisit", "q3_issues", "q3_detail", "comment", "staff_name", "source_channel", "is_dev"];
    const esc2 = (v) => { const s = v === null || v === undefined ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v)); return `"${s.replace(/"/g, '""')}"`; };
    const csv = "﻿" + cols.join(",") + "\n" + rs.map((x) => cols.map((c) => esc2(c === "q3_issues" ? (x[c] || []).join("|") : x[c])).join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `voc_responses_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  // ---- 補助 ----------------------------------------------------------------
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function fmtDate(d) { const t = new Date(d); return `${t.getMonth() + 1}/${t.getDate()} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`; }

  // ---- サンプルデータ（?demo=1） ------------------------------------------------
  function seedDemo() {
    const stores = [["meguro", 8.3, .78], ["shibuya", 7.1, .62], ["ebisu", 8.9, .85]];
    const rnd = mulberry(20261007);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const comments = ["たこ焼きが熱々で美味しかった", "ハイボールの提供が少し遅かった", "店員さんが親切でした", "テーブルが少しベタついていた", "メニューが探しにくかった", "また来ます", "", "", "", "量のわりに価格が高く感じた", "注文がスムーズで良かった"];
    const staff = ["", "", "", "メガネの男性", "佐藤さん", "", "髪の長い女性スタッフ", ""];
    const sources = ["以前から知っている", "通りがかり", "知人の紹介", "Googleマップ・検索", "食べログ・ぐるなび等", "Instagram・TikTok等", "UberEats等の配達アプリ"];
    const now = Date.now();
    responses = []; sends = [];
    for (let day = 0; day < 56; day++) {
      stores.forEach(([sid, mean, friendRate]) => {
        const visitors = 20 + Math.floor(rnd() * 25);
        for (let i = 0; i < visitors; i++) {
          if (rnd() > friendRate) continue;                       // 友だち化していない
          const sched = new Date(now - day * 864e5); sched.setHours(12, 0, 0, 0);
          const hold = rnd() < .1;
          const sendId = `${sid}-${day}-${i}`;
          sends.push({ send_id: sendId, visit_id: `v${day}${i}`, store_id: sid, holdout_group: hold ? "hold" : "send", status: hold ? "hold" : "sent", scheduled_at: sched.toISOString(), sent_at: sched.toISOString() });
          if (hold || rnd() > .22) continue;                      // 回答率 約22%
          const q1 = clamp(Math.round(mean + (rnd() + rnd() - 1) * 2.4)), q2 = clamp(Math.round(q1 + (rnd() - .5) * 2));
          const issues = q1 >= 8 && rnd() < .7 ? ["特になし"] : [pick(["提供の速さ", "接客", "料理の味", "量や価格", "清潔さ", "注文のしやすさ"])];
          if (issues[0] !== "特になし" && rnd() < .3) issues.push(pick(["提供の速さ", "接客", "量や価格"]));
          const detail = {}; issues.filter((x) => x !== "特になし").forEach((a) => { detail[a] = pick({ "提供の速さ": ["ドリンクが遅い", "フードが遅い", "最初の一品が遅い"], "接客": ["スタッフの呼び出し", "会計", "入店時の対応", "商品のおすすめ"], "料理の味": ["味付け", "鮮度・温度"], "量や価格": ["価格が高い", "量が少ない"], "清潔さ": ["テーブル・カウンター", "トイレ・洗面台"], "注文のしやすさ": ["メニューが探しにくい", "操作が分かりにくい"] }[a]); });
          const status = rnd() < .9 ? "completed" : "in_progress";
          const at = new Date(sched.getTime() + Math.floor(rnd() * 6) * 36e5);
          responses.push({ response_id: `r-${sendId}`, visit_id: `v${day}${i}`, send_id: sendId, store_id: sid, status, q1_overall: q1, q2_revisit: q2, q3_issues: status === "completed" ? issues : [], q3_detail: status === "completed" ? detail : {}, comment: status === "completed" ? pick(comments) : "", staff_name: status === "completed" ? pick(staff) : "", source_channel: status === "completed" ? pick(sources) : null, is_dev: false, created_at: at.toISOString(), answered_at: status === "completed" ? at.toISOString() : null });
        }
      });
    }
    C.STORES.shibuya = { name: "たこ焼きや 渋谷店" }; C.STORES.ebisu = { name: "たこ焼きや 恵比寿店" };
  }
  function clamp(v) { return Math.max(0, Math.min(10, v)); }
  function mulberry(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  boot();
})();
