export function renderAdminPage(origin: string): string {
  return `<!DOCTYPE html>
<html lang="zh-Hant">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>工程bot</title>
  <style>
    body {
      font-family: sans-serif;
      padding: 30px;
      background: #f5f5f5;
      max-width: 520px;
      margin: 0 auto;
    }
    h1 { margin-bottom: 12px; }
    p { color: #555; }
    label { display: block; margin: 16px 0 8px; font-weight: 600; }
    input[type="password"] {
      width: 100%;
      box-sizing: border-box;
      padding: 12px;
      border: 1px solid #ccc;
      border-radius: 8px;
      font-size: 16px;
    }
    button {
      width: 100%;
      padding: 20px;
      margin-bottom: 16px;
      font-size: 20px;
      border: none;
      border-radius: 12px;
      cursor: pointer;
    }
    .heat { background: #ff9800; color: white; }
    .height { background: #f44336; color: white; }
    .rain { background: #2196f3; color: white; }
    .preview { background: #607d8b; color: white; font-size: 16px; padding: 12px; }
    pre {
      background: #fff;
      padding: 12px;
      border-radius: 8px;
      white-space: pre-wrap;
      min-height: 3em;
    }
  </style>
</head>
<body>
  <h1>工程bot</h1>
  <p>此為開發版，不會覆蓋正式機。</p>
  <label for="token">管理 token</label>
  <input id="token" type="password" autocomplete="off" placeholder="ADMIN_TOKEN">

  <button class="heat" onclick="sendType('heat')">發送熱危害提醒</button>
  <button class="height" onclick="sendType('height')">發送高處作業提醒</button>
  <button class="rain" onclick="sendType('rain')">發送降雨提醒</button>
  <button class="preview" onclick="previewType()">預覽目前類型（不發送）</button>
  <pre id="result">尚未操作</pre>
  <p>群組即時翻譯：把工程bot拉進外籍群組，傳送「翻譯 越南」（也可印尼／泰文／英文）。關閉傳「翻譯 關」。</p>

  <script>
    const origin = ${JSON.stringify(origin)};
    const tokenInput = document.getElementById('token');
    const result = document.getElementById('result');
    tokenInput.value = sessionStorage.getItem('adminToken') || '';
    tokenInput.addEventListener('change', () => {
      sessionStorage.setItem('adminToken', tokenInput.value);
    });

    let lastType = 'heat';

    async function sendType(type) {
      lastType = type;
      sessionStorage.setItem('adminToken', tokenInput.value);
      const url = origin + '/send?type=' + encodeURIComponent(type) + '&token=' + encodeURIComponent(tokenInput.value);
      const res = await fetch(url);
      result.textContent = await res.text();
      if (!res.ok) alert(result.textContent);
      else alert(result.textContent);
    }

    async function previewType() {
      const url = origin + '/send?type=' + encodeURIComponent(lastType) + '&preview=1';
      const res = await fetch(url);
      result.textContent = await res.text();
    }
  </script>
</body>
</html>`
}
