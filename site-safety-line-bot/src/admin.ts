import { LANGS } from './translate'

export function renderAdminPage(origin: string): string {
  const langs = LANGS.map((item) => ({ code: item.code, label: item.label }))
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>工程bot 後台</title>
  <style>
    :root {
      --bg: #f3efe6;
      --card: #fff;
      --ink: #1c1917;
      --muted: #6b635b;
      --line: #e7e0d5;
      --orange: #ea580c;
      --green: #15803d;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "PingFang TC", "Noto Sans TC", sans-serif;
      background: var(--bg);
      color: var(--ink);
    }
    header {
      position: sticky;
      top: 0;
      background: #1c1917;
      color: #fff;
      padding: 16px 20px 18px;
      z-index: 2;
    }
    header h1 { margin: 0 0 4px; font-size: 22px; }
    header p { margin: 0; color: #d6d3d1; font-size: 14px; }
    main { max-width: 760px; margin: 0 auto; padding: 16px; }
    .panel, .card {
      background: var(--card);
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 12px;
      box-shadow: 0 1px 2px rgb(0 0 0 / 6%);
    }
    .card { padding: 0; overflow: hidden; }
    label { display: block; font-weight: 700; margin: 12px 0 6px; }
    input[type="password"], input[type="text"], select, textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 10px;
      font-size: 16px;
      font-family: inherit;
    }
    textarea { min-height: 88px; resize: vertical; }
    textarea.paste { min-height: 72px; font-size: 14px; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    .row > * { flex: 1; min-width: 120px; }
    button {
      border: 0;
      border-radius: 10px;
      padding: 10px 12px;
      font-size: 15px;
      cursor: pointer;
      background: #292524;
      color: #fff;
    }
    button.secondary { background: #e7e0d5; color: #1c1917; }
    button.orange { background: var(--orange); }
    button.blue { background: #2563eb; }
    button.red { background: #dc2626; }
    button.green { background: var(--green); }
    .hint { color: var(--muted); font-size: 13px; line-height: 1.5; }
    .status { min-height: 1.4em; color: var(--muted); font-size: 13px; margin-top: 8px; white-space: pre-wrap; }
    .card-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      width: 100%;
      background: transparent;
      color: inherit;
      text-align: left;
      padding: 14px 16px;
      border-radius: 0;
    }
    .card-head h2 { margin: 0 0 4px; font-size: 18px; }
    .chevron {
      color: var(--muted);
      font-size: 16px;
      line-height: 1;
      transform: rotate(0deg);
      transition: transform .15s;
      flex: 0 0 auto;
      padding-top: 4px;
    }
    .card:not(.collapsed) .chevron { transform: rotate(90deg); }
    .card-body { display: none; padding: 0 16px 16px; }
    .card:not(.collapsed) .card-body { display: block; }
    .meta { color: var(--muted); font-size: 12px; word-break: break-all; }
    .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .chip {
      display: inline-block;
      background: #e7e0d5;
      color: #44403c;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 12px;
      font-weight: 600;
    }
    .chip.on { background: #dcfce7; color: #166534; }
    .chip.off { background: #f5f5f4; color: #a8a29e; }
    .feature {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 10px 0;
      border-top: 1px solid var(--line);
    }
    .switch { position: relative; width: 44px; height: 26px; flex: 0 0 44px; }
    .switch input { opacity: 0; width: 0; height: 0; }
    .slider {
      position: absolute; inset: 0;
      background: #d6d3d1; border-radius: 999px; transition: .15s;
    }
    .slider:before {
      content: "";
      position: absolute; height: 20px; width: 20px; left: 3px; top: 3px;
      background: #fff; border-radius: 50%; transition: .15s;
    }
    .switch input:checked + .slider { background: var(--green); }
    .switch input:checked + .slider:before { transform: translateX(18px); }
    .feature-body { flex: 1; min-width: 0; }
    .feature-body strong { display: block; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .actions button { flex: 1; min-width: 30%; }
    .empty { text-align: center; color: var(--muted); padding: 28px 8px; }
    .cal-box { display: none; margin-top: 8px; }
    .cal-box.open { display: block; }
    .cal-nav { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
    .cal-nav strong { flex: 1; text-align: center; }
    .cal-nav button { flex: 0 0 auto; min-width: 44px; }
    .cal-day {
      display: grid;
      grid-template-columns: 92px 1fr;
      gap: 8px;
      align-items: center;
      padding: 4px 6px;
      border-radius: 8px;
    }
    .cal-day.has { background: #fff7ed; }
    .cal-day.today { outline: 1px solid var(--orange); }
    .cal-date { font-size: 13px; color: var(--muted); }
    .cal-day input { padding: 8px 10px; font-size: 15px; }
  </style>
</head>
<body>
  <header>
    <h1>工程bot 後台</h1>
    <p>同一個 bot，不同群組可以開不同功能。</p>
  </header>
  <main>
    <section class="panel">
      <label for="token">管理 token</label>
      <div class="row">
        <input id="token" type="password" autocomplete="off" placeholder="ADMIN_TOKEN">
        <button id="reload" type="button">重新整理</button>
      </div>
      <p class="hint">把工程bot 拉進群組，並在群裡說一句話，這個群就會出現在下面。後台只顯示群組，同事的 1:1 私訊不會出現。<br>群組卡片預設收合，點標題即可展開。夜間值班與日間上班是兩套獨立月曆，不要填在同一份名單。<br>沒打開的功能不會在群裡回話，也不會排程推播。預覽只顯示在後台，不會發到 LINE。</p>
      <div class="status" id="topStatus"></div>
    </section>

    <section class="panel">
      <label>手動新增群組</label>
      <div class="row">
        <input id="newId" type="text" placeholder="群組 ID，通常是 C 開頭">
        <input id="newName" type="text" placeholder="備註名稱（可空）">
        <button id="addChat" type="button" class="secondary">新增</button>
      </div>
    </section>

    <div id="list"><div class="empty">載入中…</div></div>
  </main>
  <script>
    const origin = ${JSON.stringify(origin)};
    const langs = ${JSON.stringify(langs)};
    const tokenInput = document.getElementById('token');
    const topStatus = document.getElementById('topStatus');
    const list = document.getElementById('list');
    tokenInput.value = sessionStorage.getItem('adminToken') || '';
    tokenInput.addEventListener('change', () => {
      sessionStorage.setItem('adminToken', tokenInput.value);
    });

    function token() {
      sessionStorage.setItem('adminToken', tokenInput.value);
      return tokenInput.value;
    }

    async function api(path, options) {
      const headers = { 'content-type': 'application/json', authorization: 'Bearer ' + token() };
      const res = await fetch(origin + path, Object.assign({ headers: headers }, options || {}));
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch (e) { data = { error: text }; }
      if (!res.ok) throw new Error(data.error || text || ('HTTP ' + res.status));
      return data;
    }

    function el(tag, attrs, children) {
      const node = document.createElement(tag);
      Object.entries(attrs || {}).forEach(([key, value]) => {
        if (key === 'class') node.className = value;
        else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2).toLowerCase(), value);
        else if (key === 'checked') node.checked = value;
        else if (value != null) node.setAttribute(key, value);
      });
      (children || []).forEach((child) => {
        if (child == null) return;
        node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
      });
      return node;
    }

    function typeLabel(type) {
      return type === 'group' ? '群組' : type === 'room' ? '聊天室' : '1:1';
    }

    function whenText(ts) {
      if (!ts) return '尚未活動';
      const d = new Date(ts);
      return d.toLocaleString('zh-TW', { hour12: false });
    }

    function pad2(n) { return String(n).padStart(2, '0'); }
    function ymd(y, m, d) { return y + '-' + pad2(m) + '-' + pad2(d); }
    function daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }
    function weekdayLabel(y, m, d) {
      return ['日','一','二','三','四','五','六'][new Date(y, m - 1, d).getDay()];
    }
    function taipeiYmd() {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
    }
    function taipeiYearMonth() {
      const [y, m] = taipeiYmd().split('-').map(Number);
      return { year: y, month: m };
    }
    function parseNames(text) {
      return String(text || '').split(/[,，、;；|/／\\n]+/).map((s) => s.trim()).filter(Boolean).slice(0, 8);
    }
    function parsePaste(text, year, month) {
      const days = {};
      String(text || '').split(/\\n+/).forEach((raw) => {
        const line = raw.trim();
        if (!line || line.charAt(0) === '#') return;
        let match = line.match(/^(\\d{4}-\\d{2}-\\d{2})(?:\\s+|[:：]\\s*)(.+)$/);
        if (match) {
          const names = parseNames(match[2]);
          if (names.length) days[match[1]] = names;
          return;
        }
        match = line.match(/^(\\d{1,2})[/.－-](\\d{1,2})(?:\\s+|[:：]\\s*)(.+)$/);
        if (match) {
          const names = parseNames(match[3]);
          if (names.length) days[ymd(year, Number(match[1]), Number(match[2]))] = names;
          return;
        }
        match = line.match(/^(\\d{1,2})(?:\\s+|[:：]\\s*)(.+)$/);
        if (match) {
          const names = parseNames(match[2]);
          if (names.length) days[ymd(year, month, Number(match[1]))] = names;
        }
      });
      return days;
    }
    function langLabel(code) {
      const item = langs.find((row) => row.code === code);
      return item ? item.label : '';
    }
    function featureChips(f) {
      const chips = [];
      if (f.translate) chips.push(el('span', { class: 'chip on' }, ['翻譯' + (langLabel(f.translateLang) ? '・' + langLabel(f.translateLang) : '')]));
      if (f.imageSearch) chips.push(el('span', { class: 'chip on' }, ['搜圖']));
      if (f.infoSearch) chips.push(el('span', { class: 'chip on' }, ['查資料']));
      if (f.weather) chips.push(el('span', { class: 'chip on' }, ['氣象']));
      if (f.nightDuty && f.nightDuty.enabled) chips.push(el('span', { class: 'chip on' }, ['夜間值班']));
      if (f.dayShift && f.dayShift.enabled) chips.push(el('span', { class: 'chip on' }, ['日間上班']));
      if (f.safety) chips.push(el('span', { class: 'chip on' }, ['工安']));
      if (!chips.length) chips.push(el('span', { class: 'chip off' }, ['尚未開啟功能']));
      return chips;
    }
    function openKey(id) { return 'adminOpen:' + id; }
    function isOpen(id) { return sessionStorage.getItem(openKey(id)) === '1'; }
    function setOpen(id, open) {
      if (open) sessionStorage.setItem(openKey(id), '1');
      else sessionStorage.removeItem(openKey(id));
    }

    function hourSelect(selected) {
      const select = el('select', {});
      for (let i = 0; i < 24; i += 1) {
        const opt = el('option', { value: String(i) }, [String(i).padStart(2, '0') + ' 時']);
        if (i === selected) opt.selected = true;
        select.appendChild(opt);
      }
      return select;
    }

    function minuteSelect(selected) {
      const select = el('select', {});
      for (let i = 0; i < 60; i += 1) {
        const opt = el('option', { value: String(i) }, [String(i).padStart(2, '0') + ' 分']);
        if (i === selected) opt.selected = true;
        select.appendChild(opt);
      }
      return select;
    }

    function rosterEditor(key, roster, defaultPeriod) {
      const now = taipeiYearMonth();
      const state = {
        year: now.year,
        month: now.month,
        days: Object.assign({}, (roster && roster.days) || {}),
      };
      const hidden = el('input', { type: 'hidden', 'data-k': key + 'Days' });
      const monthLabel = el('strong', {}, []);
      const cal = el('div', {});
      const today = taipeiYmd();
      function syncHidden() {
        hidden.value = JSON.stringify(state.days);
      }
      function renderCal() {
        cal.innerHTML = '';
        monthLabel.textContent = state.year + '年' + state.month + '月';
        const n = daysInMonth(state.year, state.month);
        for (let d = 1; d <= n; d += 1) {
          const id = ymd(state.year, state.month, d);
          const names = state.days[id] || [];
          const input = el('input', {
            type: 'text',
            value: names.join('、'),
            placeholder: '空＝當天不通知；兩人用頓號或逗號',
          });
          const row = el('div', { class: 'cal-day' + (names.length ? ' has' : '') + (id === today ? ' today' : '') }, [
            el('span', { class: 'cal-date' }, [d + '日（' + weekdayLabel(state.year, state.month, d) + '）']),
            input,
          ]);
          input.addEventListener('input', () => {
            const next = parseNames(input.value);
            if (next.length) state.days[id] = next;
            else delete state.days[id];
            syncHidden();
            row.classList.toggle('has', next.length > 0);
          });
          cal.appendChild(row);
        }
      }
      syncHidden();
      renderCal();
      const paste = el('textarea', {
        class: 'paste',
        placeholder: '可批次貼上本月，例如：\\n8/1 陳學鴻\\n8/21 范士朋,田啟均',
      });
      const calBox = el('div', { class: 'cal-box' }, [
        el('div', { class: 'cal-nav' }, [
          el('button', { class: 'secondary', type: 'button', onClick: () => {
            state.month -= 1;
            if (state.month < 1) { state.month = 12; state.year -= 1; }
            renderCal();
          } }, ['‹']),
          monthLabel,
          el('button', { class: 'secondary', type: 'button', onClick: () => {
            state.month += 1;
            if (state.month > 12) { state.month = 1; state.year += 1; }
            renderCal();
          } }, ['›']),
        ]),
        cal,
        el('div', { class: 'hint' }, ['也可貼上 Excel 對應的日期與姓名，再按套用。']),
        paste,
        el('button', { class: 'secondary', type: 'button', onClick: () => {
          Object.assign(state.days, parsePaste(paste.value, state.year, state.month));
          syncHidden();
          renderCal();
        } }, ['套用到月曆']),
      ]);
      const toggle = el('button', { class: 'secondary', type: 'button', onClick: () => {
        calBox.classList.toggle('open');
        toggle.textContent = calBox.classList.contains('open') ? '收合月曆' : '展開月曆';
      } }, ['展開月曆']);
      const hour = hourSelect(roster && Number.isInteger(roster.hour) ? roster.hour : 7);
      hour.setAttribute('data-k', key + 'Hour');
      const minute = minuteSelect(roster && Number.isInteger(roster.minute) ? roster.minute : 0);
      minute.setAttribute('data-k', key + 'Minute');
      const period = el('input', {
        type: 'text',
        'data-k': key + 'Period',
        value: (roster && roster.period) || defaultPeriod || '',
        placeholder: defaultPeriod || '可填時段說明，可空',
      });
      return el('div', {}, [
        el('div', { class: 'row' }, [hour, minute]),
        period,
        hidden,
        toggle,
        calBox,
      ]);
    }

    function readRoster(card, key) {
      let days = {};
      const hidden = card.querySelector('[data-k=' + key + 'Days]');
      try { days = JSON.parse((hidden && hidden.value) || '{}') || {}; } catch (e) { days = {}; }
      return {
        enabled: card.querySelector('[data-k=' + key + ']').checked,
        hour: Number(card.querySelector('[data-k=' + key + 'Hour]').value),
        minute: Number(card.querySelector('[data-k=' + key + 'Minute]').value),
        period: card.querySelector('[data-k=' + key + 'Period]').value.trim(),
        days: days,
      };
    }

    function readFeatures(card) {
      return {
        translate: card.querySelector('[data-k=translate]').checked,
        translateLang: card.querySelector('[data-k=translateLang]').value,
        imageSearch: card.querySelector('[data-k=imageSearch]').checked,
        infoSearch: card.querySelector('[data-k=infoSearch]').checked,
        weather: card.querySelector('[data-k=weather]').checked,
        weatherPlace: card.querySelector('[data-k=weatherPlace]').value.trim() || '台北',
        weatherHour: Number(card.querySelector('[data-k=weatherHour]').value),
        weatherMinute: Number(card.querySelector('[data-k=weatherMinute]').value),
        nightDuty: readRoster(card, 'nightDuty'),
        dayShift: readRoster(card, 'dayShift'),
        safety: card.querySelector('[data-k=safety]').checked,
      };
    }

    async function saveCard(card, silent) {
      const status = card.querySelector('.status');
      try {
        await api('/api/admin/save', {
          method: 'POST',
          body: JSON.stringify({
            chat: { id: card.dataset.id, type: card.dataset.type, note: card.querySelector('[data-k=note]').value },
            features: readFeatures(card),
          }),
        });
        if (!silent) status.textContent = '已儲存';
      } catch (error) {
        status.textContent = error.message;
        throw error;
      }
    }

    async function sendKind(card, kind) {
      const status = card.querySelector('.status');
      if (!confirm('確定發到這個群？')) return;
      status.textContent = '發送中…';
      try {
        await saveCard(card, true);
        const data = await api('/api/admin/send', {
          method: 'POST',
          body: JSON.stringify({ chatId: card.dataset.id, kind: kind }),
        });
        status.textContent = '已發到此群\\n' + (data.preview || '');
      } catch (error) {
        status.textContent = error.message;
        alert(error.message);
      }
    }

    async function previewKind(card, kind, extraQuery) {
      const status = card.querySelector('.status');
      status.textContent = '預覽中…';
      try {
        const payload = { kind: kind, chatId: card.dataset.id, features: readFeatures(card) };
        if (kind === 'weather') payload.place = card.querySelector('[data-k=weatherPlace]').value.trim() || '台北';
        if (extraQuery) payload.q = extraQuery;
        const data = await api('/api/admin/preview', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        status.textContent = data.preview || JSON.stringify(data, null, 2);
      } catch (error) {
        status.textContent = error.message;
        alert(error.message);
      }
    }

    function featureRow(key, title, hint, extra) {
      const checkbox = el('input', { type: 'checkbox', 'data-k': key });
      return el('div', { class: 'feature' }, [
        el('label', { class: 'switch' }, [checkbox, el('span', { class: 'slider' })]),
        el('div', { class: 'feature-body' }, [
          el('strong', {}, [title]),
          el('div', { class: 'hint' }, [hint]),
          extra,
        ]),
      ]);
    }

    function renderCard(state) {
      const chat = state.chat;
      const f = state.features;
      const langSelect = el('select', { 'data-k': 'translateLang' });
      langs.forEach((item) => {
        const opt = el('option', { value: item.code }, [item.label]);
        if (item.code === f.translateLang) opt.selected = true;
        langSelect.appendChild(opt);
      });
      const weatherHour = hourSelect(f.weatherHour);
      weatherHour.setAttribute('data-k', 'weatherHour');
      const weatherMinute = minuteSelect(Number.isInteger(f.weatherMinute) ? f.weatherMinute : 0);
      weatherMinute.setAttribute('data-k', 'weatherMinute');
      const night = f.nightDuty || { enabled: false, hour: 21, minute: 0, period: '05:30-07:30（如遇工班加班配合工班時段）', days: {} };
      const day = f.dayShift || { enabled: false, hour: 7, minute: 0, period: '', days: {} };
      const onlyTranslate = !!f.translate && !f.imageSearch && !f.infoSearch && !f.weather && !night.enabled && !day.enabled && !f.safety;
      const card = el('article', { class: 'card collapsed', 'data-id': chat.id, 'data-type': chat.type }, [
        el('button', { class: 'card-head', type: 'button', onClick: () => {
          const open = card.classList.contains('collapsed');
          card.classList.toggle('collapsed', !open);
          setOpen(chat.id, open);
        } }, [
          el('div', {}, [
            el('h2', {}, [chat.note || chat.name || chat.id]),
            el('div', { class: 'meta' }, [typeLabel(chat.type) + ' · 最後活動 ' + whenText(chat.lastSeenAt)]),
            el('div', { class: 'chips' }, featureChips(f)),
          ]),
          el('span', { class: 'chevron' }, ['▶']),
        ]),
        el('div', { class: 'card-body' }, [
          onlyTranslate ? el('p', { class: 'hint' }, ['目前僅即時翻譯。沒開的功能不會在此群發話，排程也不會推播。']) : null,
          el('label', {}, ['顯示名稱（只有後台看得到）']),
          el('input', { type: 'text', 'data-k': 'note', value: chat.note || '', placeholder: chat.name || '例如：外籍工人群' }),
          featureRow('translate', '即時翻譯', '群內中文 ↔ 外語。也可傳「翻譯 泰文」。', langSelect),
          featureRow('imageSearch', '搜尋圖片', '群內傳：*搜圖 安全帽。沒開則當一般訊息處理。', null),
          featureRow('infoSearch', '搜尋資料', '群內傳：*查 鋼筋搭接。沒開則當一般訊息處理。', null),
          featureRow('weather', '氣象播報', '先按「儲存此群設定」。會在設定的那一分鐘自動播（最多晚約 3 分鐘）。要立刻看效果請用「立即播報天氣」。群內查詢請傳「*天氣」。', el('div', { class: 'row' }, [
            el('input', { type: 'text', 'data-k': 'weatherPlace', value: f.weatherPlace || '台北', placeholder: '台北 / 台中 / 工地附近地名' }),
            weatherHour,
            weatherMinute,
          ])),
          featureRow('nightDuty', '夜間值班', '與日間上班分開。依日期指定 1～2 人，當天沒人就不推播。群內查詢請傳「*值班」。', rosterEditor('nightDuty', night, '05:30-07:30（如遇工班加班配合工班時段）')),
          featureRow('dayShift', '日間上班人員', '不要和夜間值班混用。依日期指定當天上班的人，可每天一人或兩人。群內查詢請傳「*上班」。', rosterEditor('dayShift', day, '')),
          featureRow('safety', '工安提醒推播', '允許後台對此群發送熱危害／高處／降雨。沒開按了也不會發到群裡。', null),
          el('div', { class: 'actions' }, [
            el('button', { class: 'green', type: 'button', onClick: () => saveCard(card) }, ['儲存此群設定']),
            el('button', { class: 'secondary', type: 'button', onClick: () => previewKind(card, 'weather') }, ['預覽天氣']),
            el('button', { class: 'secondary', type: 'button', onClick: () => previewKind(card, 'nightDuty') }, ['預覽夜間值班']),
            el('button', { class: 'secondary', type: 'button', onClick: () => previewKind(card, 'dayShift') }, ['預覽日間上班']),
            el('button', { class: 'secondary', type: 'button', onClick: () => previewKind(card, 'image', '安全帽') }, ['預覽搜圖']),
            el('button', { class: 'secondary', type: 'button', onClick: () => previewKind(card, 'info', '熱危害') }, ['預覽查資料']),
          ]),
          el('div', { class: 'actions' }, [
            el('button', { class: 'blue', type: 'button', onClick: () => sendKind(card, 'weather') }, ['立即播報天氣']),
            el('button', { class: 'orange', type: 'button', onClick: () => sendKind(card, 'nightDuty') }, ['立即通知夜間值班']),
            el('button', { class: 'orange', type: 'button', onClick: () => sendKind(card, 'dayShift') }, ['立即通知日間上班']),
          ]),
          el('div', { class: 'actions' }, [
            el('button', { class: 'orange', type: 'button', onClick: () => sendKind(card, 'heat') }, ['熱危害']),
            el('button', { class: 'red', type: 'button', onClick: () => sendKind(card, 'height') }, ['高處作業']),
            el('button', { class: 'blue', type: 'button', onClick: () => sendKind(card, 'rain') }, ['降雨']),
          ]),
          el('div', { class: 'actions' }, [
            el('button', { class: 'secondary', type: 'button', onClick: async () => {
              if (!confirm('從後台移除這個聊天，並關閉它的功能？')) return;
              try {
                await api('/api/admin/remove', { method: 'POST', body: JSON.stringify({ id: card.dataset.id }) });
                await load();
              } catch (error) {
                card.querySelector('.status').textContent = error.message;
              }
            } }, ['從後台移除']),
          ]),
          el('div', { class: 'status' }, ['尚未操作']),
        ]),
      ]);
      card.querySelector('[data-k=translate]').checked = !!f.translate;
      card.querySelector('[data-k=imageSearch]').checked = !!f.imageSearch;
      card.querySelector('[data-k=infoSearch]').checked = !!f.infoSearch;
      card.querySelector('[data-k=weather]').checked = !!f.weather;
      card.querySelector('[data-k=nightDuty]').checked = !!night.enabled;
      card.querySelector('[data-k=dayShift]').checked = !!day.enabled;
      card.querySelector('[data-k=safety]').checked = !!f.safety;
      if (!f.translateLang && langs[0]) langSelect.value = langs[2] ? langs[2].code : langs[0].code;
      if (isOpen(chat.id)) card.classList.remove('collapsed');
      return card;
    }

    async function load() {
      topStatus.textContent = '載入中…';
      try {
        const data = await api('/api/admin/state');
        list.innerHTML = '';
        if (!data.chats || data.chats.length === 0) {
          list.appendChild(el('div', { class: 'empty' }, ['還沒有群組。把 bot 拉進群並說句話，或上面貼上群組 ID。']));
        } else {
          data.chats.forEach((state) => list.appendChild(renderCard(state)));
        }
        topStatus.textContent = data.adminProtected ? '已載入 ' + data.chats.length + ' 個聊天' : '已載入（尚未設定 ADMIN_TOKEN）';
      } catch (error) {
        list.innerHTML = '';
        list.appendChild(el('div', { class: 'empty' }, [error.message]));
        topStatus.textContent = error.message;
      }
    }

    document.getElementById('reload').addEventListener('click', load);
    document.getElementById('addChat').addEventListener('click', async () => {
      try {
        await api('/api/admin/register', {
          method: 'POST',
          body: JSON.stringify({
            id: document.getElementById('newId').value.trim(),
            name: document.getElementById('newName').value.trim(),
            type: 'group',
          }),
        });
        document.getElementById('newId').value = '';
        document.getElementById('newName').value = '';
        await load();
      } catch (error) {
        topStatus.textContent = error.message;
        alert(error.message);
      }
    });
    tokenInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') load();
    });
    load();
  </script>
</body>
</html>`
}
