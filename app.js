/* VOC アンケート 回答画面（LIFF）
 * - LINE の中で開くと UID だけを自動で取る（表示名などのプロフィールは取得しない）。客に入力させる項目はない
 * - 1画面1問。必須に答えるまで「次へ」は押せない
 * - 1問答えるごとに Supabase に保存する（途中離脱でもそこまで残る）
 * - URL パラメータ: v=来店ID, s=店舗ID, send=配信ID, dev=1（PCでの画面確認）
 */
(function () {
  const C = window.VOC_CONFIG;
  const $ = (id) => document.getElementById(id);
  const screenEl = $("screen"), nextBtn = $("next"), backBtn = $("back"), bar = $("bar");

  const params = new URLSearchParams(location.search);
  const visitId = params.get("v") || null;
  const sendId = params.get("send") || null;
  const storeId = params.get("s") || "default";
  const store = C.STORES[storeId] || C.STORES.default;
  const devMode = C.ALLOW_DEV_MODE && (C.FORCE_DEV === true || params.get("dev") === "1");

  $("storeName").textContent = store.name;
  $("privacy").href = C.PRIVACY_URL;

  // ---- 設問定義 ----------------------------------------------------------
  const ISSUES = ["料理の味", "量や価格", "提供の速さ", "接客", "清潔さ", "注文のしやすさ", "特になし"];
  const BRANCH = {
    "接客": ["入店時の対応", "注文の対応・注文方法の説明", "商品のおすすめ", "料理やドリンクの提供", "スタッフの呼び出し", "皿の片付け", "会計", "お見送り", "その他"],
    "料理の味": ["味付け", "鮮度・温度", "見た目", "品揃え", "特定のメニュー", "その他"],
    "量や価格": ["量が少ない", "量が多すぎる", "価格が高い", "値段のわりに内容が物足りない", "その他"],
    "提供の速さ": ["最初の一品が遅い", "フードが遅い", "ドリンクが遅い", "会計が遅い", "その他"],
    "清潔さ": ["入口", "テーブル・カウンター", "椅子・ソファー", "床", "トイレ・洗面台", "食器・グラス", "その他"],
    "注文のしやすさ": ["メニューが探しにくい", "写真や説明が足りない", "操作が分かりにくい", "QRやログインで困った", "おすすめの表示が多すぎる", "その他"],
  };
  const SOURCES = ["以前から知っている", "通りがかり", "知人の紹介", "Googleマップ・検索", "食べログ・ぐるなび等", "Instagram・TikTok等", "UberEats等の配達アプリ", "その他"];

  // ---- 状態 ----------------------------------------------------------------
  const answers = { q1_overall: null, q2_revisit: null, q3_issues: [], q3_detail: {}, comment: "", staff_name: "", source_channel: null };
  let responseId = crypto.randomUUID();   // 来店IDとUIDが揃えば boot() で決定的なIDに置き換える
  let clientToken = crypto.randomUUID();  // 同上。自分の行だけ読める・更新できるための合言葉（ヘッダーで送る）

  // 「種|来店ID|UID」から毎回同じ UUID を作る。開き直しや二重読み込みでも同じ行・同じ合言葉になる
  async function stableUuid(seed, visit, uid) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${seed}|${visit}|${uid}`));
    const b = Array.from(new Uint8Array(buf)).slice(0, 16);
    b[6] = (b[6] & 0x0f) | 0x50; b[8] = (b[8] & 0x3f) | 0x80;   // UUID v5 風の体裁
    const hex = b.map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  let userId = null;
  let supa = null;
  let steps = [];     // 画面の並び（分岐で増減する）
  let idx = 0;

  function buildSteps() {
    const s = ["intro", "q1", "q2", "q3"];
    for (const a of answers.q3_issues) if (BRANCH[a]) s.push("branch:" + a);
    s.push("q4", "q5", "q6", "done");
    return s;
  }

  // ---- 保存 ----------------------------------------------------------------
  async function save(status, extra) {
    if (!supa) return;
    const payload = Object.assign({
      status,
      last_step: steps[idx],
      q1_overall: answers.q1_overall,
      q2_revisit: answers.q2_revisit,
      q3_issues: answers.q3_issues,
      q3_detail: answers.q3_detail,
      comment: answers.comment || null,
      staff_name: answers.staff_name || null,
      source_channel: answers.source_channel,
      updated_at: new Date().toISOString(),
    }, extra || {});
    const { error } = await supa.from("survey_responses").update(payload).eq("response_id", responseId).eq("client_token", clientToken);
    if (error) console.warn("save failed", error);
  }
  async function createRow() {
    if (!supa) return;
    // response_id は「来店ID|UID」から決定的に作っているので、開き直しや LIFF の二重読み込みでも同じ行を指す。
    // upsert は既存行の読み取り権限（SELECT）を要求するため使わない（客側に回答を読ませない方針）。
    // まず挿入し、既にあれば（主キー重複 23505）合言葉と開いた時刻だけ更新する。status と回答はそのまま残る。
    const now = new Date().toISOString();
    const { error } = await supa.from("survey_responses").insert({
      response_id: responseId,
      client_token: clientToken,
      visit_id: visitId,
      send_id: sendId,
      store_id: storeId,
      line_user_id: userId,
      status: "opened",
      liff_opened_at: now,
      is_dev: devMode,
    });
    if (!error) return;
    if (error.code === "23505") return;   // 既に同じ行がある（開き直し）。合言葉も同じなので、そのまま更新できる
    console.warn("insert failed", error);
    showError("回答の保存先に接続できませんでした。回答は続けられますが、記録されない可能性があります。");
  }
  function showError(msg) {
    const e = document.createElement("div"); e.className = "error"; e.textContent = msg; screenEl.prepend(e);
  }

  // ---- 画面描画 --------------------------------------------------------------
  function h(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstChild; }
  function qHead(num, title, hint, required) {
    return `<div class="num">${num}${required ? '<span class="req">＊</span>' : "　任意"}</div><h2>${title}</h2>${hint ? `<p class="hint">${hint}</p>` : ""}`;
  }
  function scale(key, lo, hi) {
    const wrap = h(`<div><div class="scale"></div><div class="scale-labels"><span>${lo}</span><span>${hi}</span></div></div>`);
    const grid = wrap.querySelector(".scale");
    for (let i = 0; i <= 10; i++) {
      const b = h(`<button type="button">${i}</button>`);
      if (answers[key] === i) b.classList.add("on");
      b.onclick = () => { answers[key] = i; grid.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); refreshNext(); };
      grid.appendChild(b);
    }
    return wrap;
  }
  function choices(list, getSel, setSel, multi) {
    const wrap = h(`<div class="choices"></div>`);
    list.forEach((label) => {
      const b = h(`<button type="button" class="choice ${multi ? "multi" : ""}"><span class="box"></span><span>${label}</span></button>`);
      const sel = getSel();
      if (multi ? sel.includes(label) : sel === label) b.classList.add("on");
      b.onclick = () => {
        if (multi) {
          let cur = getSel().slice();
          if (label === "特になし") cur = cur.includes("特になし") ? [] : ["特になし"];
          else { cur = cur.filter((x) => x !== "特になし"); cur = cur.includes(label) ? cur.filter((x) => x !== label) : cur.concat(label); }
          setSel(cur);
          wrap.querySelectorAll(".choice").forEach((x) => x.classList.toggle("on", cur.includes(x.textContent.trim())));
        } else {
          setSel(label);
          wrap.querySelectorAll(".choice").forEach((x) => x.classList.toggle("on", x === b));
        }
        refreshNext();
      };
      wrap.appendChild(b);
    });
    return wrap;
  }

  function render() {
    const step = steps[idx];
    screenEl.innerHTML = "";
    backBtn.hidden = idx === 0 || step === "done";
    nextBtn.hidden = false;
    nextBtn.textContent = "次へ";
    const qTotal = steps.length - 2; // intro と done を除く
    bar.style.width = `${Math.max(0, Math.min(100, ((idx) / (qTotal + 1)) * 100))}%`;

    if (step === "intro") {
      screenEl.appendChild(h(`<div class="intro"><div class="mark">🍽️</div><h1>ご来店ありがとうございました</h1><p>${store.name}</p><p>30秒で終わる3問のアンケートです。<br>よろしければ昨日のご感想をお聞かせください。</p><p class="notice">ご回答はお店の改善にのみ使い、個人へのご連絡や営業には使いません。お名前などの入力は不要です。</p></div>`));
      nextBtn.textContent = "アンケートに答える";
    } else if (step === "q1") {
      const q = h(`<div class="q">${qHead("01", "昨日のご来店は、全体としていかがでしたか？", "0（とても不満）〜 10（とても満足）でお選びください", true)}</div>`);
      q.appendChild(scale("q1_overall", "とても不満", "とても満足")); screenEl.appendChild(q);
    } else if (step === "q2") {
      const q = h(`<div class="q">${qHead("02", "また来たいと思いますか？", "0（全く思わない）〜 10（ぜひ来たい）でお選びください", true)}</div>`);
      q.appendChild(scale("q2_revisit", "全く思わない", "ぜひ来たい")); screenEl.appendChild(q);
    } else if (step === "q3") {
      const q = h(`<div class="q">${qHead("03", "気になった点があれば教えてください", "いくつでも選べます", true)}</div>`);
      q.appendChild(choices(ISSUES, () => answers.q3_issues, (v) => { answers.q3_issues = v; }, true)); screenEl.appendChild(q);
    } else if (step.startsWith("branch:")) {
      const area = step.slice(7);
      const q = h(`<div class="q">${qHead("03-" + (answers.q3_issues.indexOf(area) + 1), `「${area}」で、特に気になったのはどれですか？`, "1つお選びください", true)}</div>`);
      q.appendChild(choices(BRANCH[area], () => answers.q3_detail[area] || null, (v) => { answers.q3_detail[area] = v; }, false)); screenEl.appendChild(q);
    } else if (step === "q4") {
      const q = h(`<div class="q">${qHead("04", "よろしければ一言お願いします", "良かった点・残念だった点、どちらでも", false)}</div>`);
      const t = h(`<textarea placeholder="いただいたコメントはお店の改善に役立てます">${answers.comment}</textarea>`);
      t.oninput = () => { answers.comment = t.value; }; q.appendChild(t); screenEl.appendChild(q);
    } else if (step === "q5") {
      const q = h(`<div class="q">${qHead("05", "良い対応をしてくれたスタッフがいれば教えてください", "名前や特徴だけでも結構です", false)}</div>`);
      const t = h(`<input type="text" placeholder="例: メガネの男性スタッフ" value="${answers.staff_name.replace(/"/g, "&quot;")}" />`);
      t.oninput = () => { answers.staff_name = t.value; }; q.appendChild(t); screenEl.appendChild(q);
    } else if (step === "q6") {
      const q = h(`<div class="q">${qHead("06", "今回のお店を何で知りましたか？", "", false)}</div>`);
      q.appendChild(choices(SOURCES, () => answers.source_channel, (v) => { answers.source_channel = v; }, false)); screenEl.appendChild(q);
      nextBtn.textContent = "送信する";
    } else if (step === "done") {
      bar.style.width = "100%";
      const review = store.googleReviewUrl
        ? `<a class="review" href="${store.googleReviewUrl}" target="_blank" rel="noopener">Googleマップにも感想を書く<small>よろしければ、お店を探している方のためにご感想をお寄せください</small></a>`
        : "";
      screenEl.appendChild(h(`<div class="done"><div class="mark">🙏</div><h1>ありがとうございました</h1><p>ご回答はお店の改善に役立てます。</p>${review}</div>`));
      nextBtn.textContent = "閉じる";
    }
    refreshNext();
    window.scrollTo(0, 0);
  }

  function refreshNext() {
    const step = steps[idx];
    let ok = true;
    if (step === "q1") ok = answers.q1_overall !== null;
    else if (step === "q2") ok = answers.q2_revisit !== null;
    else if (step === "q3") ok = answers.q3_issues.length > 0;
    else if (step.startsWith("branch:")) ok = !!answers.q3_detail[step.slice(7)];
    nextBtn.disabled = !ok;
  }

  nextBtn.onclick = async () => {
    const step = steps[idx];
    if (step === "done") {
      if (!devMode && window.liff && liff.isInClient()) { liff.closeWindow(); return; }
      // 閉じられない環境（外部ブラウザ・PC）では案内だけ出す。再読み込みはしない
      screenEl.innerHTML = "";
      screenEl.appendChild(h(`<div class="done"><div class="mark">🙏</div><h1>ご回答ありがとうございました</h1><p>この画面を閉じてください。</p></div>`));
      nextBtn.hidden = true;
      return;
    }
    if (step === "q3") { // 分岐を確定し、選ばれなかった領域の詳細は消す
      for (const k of Object.keys(answers.q3_detail)) if (!answers.q3_issues.includes(k)) delete answers.q3_detail[k];
      steps = buildSteps();
    }
    const finishing = step === "q6";
    idx += 1;
    render();
    await save(finishing ? "completed" : (step === "intro" ? "started" : "in_progress"), finishing ? { answered_at: new Date().toISOString() } : {});
  };
  backBtn.onclick = () => { if (idx > 0) { idx -= 1; render(); } };

  // ---- 起動 ----------------------------------------------------------------
  async function boot() {
    try {
      if (devMode) {
        userId = "DEV_" + responseId.slice(0, 8);
      } else {
        // LIFF は liff.line.me 経由の初回読み込みで ?liff.state= 付きの URL を一度開き、liff.init() が本来の URL へ飛び直す。
        // その1回目では何もせず、飛び直し後の読み込みだけで処理する（行の二重作成を防ぐ）
        if (params.has("liff.state")) { await liff.init({ liffId: C.LIFF_ID }); return; }
        await liff.init({ liffId: C.LIFF_ID });
        if (!liff.isLoggedIn()) { liff.login({ redirectUri: location.href }); return; }
        // プロフィール（表示名・アイコン）は取得しない。ID トークンの sub（= LINE userId）だけを使う
        const token = liff.getDecodedIDToken();
        userId = (token && token.sub) || (liff.getContext() && liff.getContext().userId) || null;
        if (!userId) throw new Error("LINEのユーザーIDを取得できませんでした");
      }
      if (visitId && userId) {
        responseId = await stableUuid("voc-id", visitId, userId);
        clientToken = await stableUuid("voc-token", visitId, userId);
      }
      // 合言葉をヘッダーで送る。DB 側は「ヘッダーの合言葉と一致する行だけ読める・更新できる」ルール
      if (C.SUPABASE_URL && !C.SUPABASE_URL.includes("REPLACE_ME")) {
        supa = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { global: { headers: { "x-client-token": clientToken } } });
      }
      steps = buildSteps();
      render();          // 先に画面を出す（保存先の応答を待たせない）
      createRow();       // 行の作成は裏で進める。失敗時は画面上部に注意を出す
    } catch (e) {
      console.error(e);
      screenEl.innerHTML = "";
      showError("画面を開けませんでした。LINEアプリから開き直してください。（" + (e && e.message ? e.message : e) + "）");
      nextBtn.hidden = true;
    }
  }
  boot();
})();
