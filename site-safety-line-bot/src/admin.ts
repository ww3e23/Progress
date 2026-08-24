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
    }
    header h1 { margin: 0 0 4px; font-size: 22px; }
    header p { margin: 0; color: #d6d3d1; font-size: 14px; }
    main { max-width: 760px; margin: 0 auto; padding: 16px; }
    .panel, .card {
      background: var(--card);
      border-radius: 16px;
      padding: 16px;
      margin-bottom: 16px;
      box-shadow: 0 1px 2px rgb(0 0 0 / 6%);
    }
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
    .card h2 { margin: 0 0 4px; font-size: 18px; }
    .meta { color: var(--muted); font-size: 12px; word-break: break-all; margin-bottom: 10px; }
    .feature {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      padding: 10px 0;
      border-top: 1px solid var(--line);
    }
    .feature:first-of-type { border-top: 0; }
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
    .feature-body { flex: 1; }
    .feature-body strong { display: block; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .actions button { flex: 1; min-width: 30%; }
    .empty { text-align: center; color: var(--muted); padding: 28px 8px; }
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
      <p class="hint">把工程bot 拉進群組，並在群裡說一句話，這個群就會出現在下面。再開關功能、填地點與值班名單。</p>
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

    function hourSelect(selected) {
      const select = el('select', {});
      for (let i = 0; i < 24; i += 1) {
        const opt = el('option', { value: String(i) }, [String(i).padStart(2, '0') + ':00']);
        if (i === selected) opt.selected = true;
        select.appendChild(opt);
      }
      return select;
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
        duty: card.querySelector('[data-k=duty]').checked,
        dutyPeople: card.querySelector('[data-k=dutyPeople]').value.split(/\\n+/).map((s) => s.trim()).filter(Boolean),
        dutyHour: Number(card.querySelector('[data-k=dutyHour]').value),
        dutyMode: card.querySelector('[data-k=dutyMode]').value,
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
      const dutyHour = hourSelect(f.dutyHour);
      dutyHour.setAttribute('data-k', 'dutyHour');
      const card = el('article', { class: 'card', 'data-id': chat.id, 'data-type': chat.type }, [
        el('h2', {}, [chat.note || chat.name || chat.id]),
        el('div', { class: 'meta' }, [typeLabel(chat.type) + ' · ' + chat.id + ' · 最後活動 ' + whenText(chat.lastSeenAt)]),
        el('label', {}, ['顯示名稱（只有後台看得到）']),
        el('input', { type: 'text', 'data-k': 'note', value: chat.note || '', placeholder: chat.name || '例如：外籍工人群' }),
        featureRow('translate', '即時翻譯', '群內中文 ↔ 外語。也可傳「翻譯 泰文」。', langSelect),
        featureRow('imageSearch', '搜尋圖片', '群內傳：搜圖 安全帽', null),
        featureRow('infoSearch', '搜尋資料', '群內傳：查 鋼筋搭接', null),
        featureRow('weather', '氣象播報', '群內傳「天氣」。到點會自動推播。', el('div', { class: 'row' }, [
          el('input', { type: 'text', 'data-k': 'weatherPlace', value: f.weatherPlace || '台北', placeholder: '台北 / 台中 / 工地附近地名' }),
          weatherHour,
        ])),
        featureRow('duty', '排班／夜間值班通知', '到點自動通知今晚值班。輪值則每天換一人。', el('div', {}, [
          el('div', { class: 'row' }, [
            dutyHour,
            el('select', { 'data-k': 'dutyMode' }, [
              el('option', { value: 'all' }, ['每晚通知全部名單']),
              el('option', { value: 'rotate' }, ['輪值（每天一人）']),
            ]),
          ]),
          el('textarea', { 'data-k': 'dutyPeople', placeholder: '一行一個姓名' }, [(f.dutyPeople || []).join('\\n')]),
        ])),
        el('div', { class: 'actions' }, [
          el('button', { class: 'green', type: 'button', onClick: () => saveCard(card) }, ['儲存此群設定']),
          el('button', { class: 'blue', type: 'button', onClick: () => sendKind(card, 'weather') }, ['立即播報天氣']),
          el('button', { class: 'orange', type: 'button', onClick: () => sendKind(card, 'duty') }, ['立即通知值班']),
        ]),
        el('div', { class: 'actions' }, [
          el('button', { class: 'orange', type: 'button', onClick: () => sendKind(card, 'heat') }, ['熱危害']),
          el('button', { class: 'red', type: 'button', onClick: () => sendKind(card, 'height') }, ['高處作業']),
          el('button', { class: 'blue', type: 'button', onClick: () => sendKind(card, 'rain') }, ['降雨']),
        ]),
        el('div', { class: 'status' }, ['尚未操作']),
      ]);
      card.querySelector('[data-k=translate]').checked = !!f.translate;
      card.querySelector('[data-k=imageSearch]').checked = !!f.imageSearch;
      card.querySelector('[data-k=infoSearch]').checked = !!f.infoSearch;
      card.querySelector('[data-k=weather]').checked = !!f.weather;
      card.querySelector('[data-k=duty]').checked = !!f.duty;
      card.querySelector('[data-k=dutyMode]').value = f.dutyMode || 'all';
      if (!f.translateLang && langs[0]) langSelect.value = langs[2] ? langs[2].code : langs[0].code;
      card.querySelectorAll('input[type=checkbox]').forEach((box) => {
        box.addEventListener('change', () => saveCard(card, true).catch(() => {}));
      });
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
