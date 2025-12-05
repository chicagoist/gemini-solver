// content.js
// =========================
// GEMINI SOLVER 2.3.2 (Linter Safe)
// =========================

let panel = null;

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "TOGGLE_PANEL") {
    if (panel) togglePanel();
    else createPanel();
  }
});

function createPanel() {
  panel = document.createElement("div");
  panel.id = "gemini-floating-panel";

  // Стили
  panel.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 330px;
    background: #fff;
    border-radius: 12px;
    z-index: 2147483647;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
    font-family: Segoe UI, sans-serif;
    border: 1px solid #ccc;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  `;

  // HTML Шаблон (строка)
  const htmlTemplate = `
    <div id="gemini-header" style="background:#007bff; color:#fff; padding:10px 14px; cursor:move; font-weight:600; display: flex; justify-content: space-between; align-items: center;">
      <span>Gemini Solver</span>
      <button id="gemini-close" style="background:none; color:white; border:none; font-size:18px; cursor:pointer; line-height: 1;">&times;</button>
    </div>

    <div style="padding:12px;">
      <div id="gemini-setup">
        <input type="password" id="gemini-key" placeholder="API Key..." style="width:100%; box-sizing: border-box; padding:8px; border-radius:6px; border:1px solid #ddd; margin-bottom:6px;">
        <button id="gemini-save" style="width:100%; padding:9px; background:#28a745; color:white; border:none; border-radius:6px; font-weight:600; cursor:pointer;">Сохранить ключ</button>
      </div>

      <div id="gemini-work" style="display:none;">
        <button id="gemini-solve" style="width:100%; padding:10px; background:#007bff; color:white; border:none; border-radius:6px; font-weight:600; cursor:pointer;">
          📸 Анализировать экран
        </button>

        <div id="gemini-result" style="margin-top:12px; padding:10px; background:#f7f7f7; border-radius:6px; border:1px solid #eee; max-height:420px; overflow-y:auto; font-size: 14px; white-space: pre-wrap;">Нажмите кнопку...</div>

        <button id="gemini-reset" style="margin-top:6px; font-size:12px; color:#777; background:none; border:none; text-decoration:underline; cursor:pointer; width: 100%; text-align: right;">
          Сброс ключа
        </button>
      </div>
    </div>
  `;

  // БЕЗОПАСНЫЙ СПОСОБ СОЗДАНИЯ HTML (Через DOMParser)
  // Это убирает ошибку "Unsafe assignment to innerHTML"
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlTemplate, 'text/html');
  
  // Переносим элементы из парсера в нашу панель
  Array.from(doc.body.children).forEach(child => {
    panel.appendChild(child);
  });

  document.body.appendChild(panel);

  // Получаем ссылки на элементы
  const header = panel.querySelector("#gemini-header");
  const closeBtn = panel.querySelector("#gemini-close");
  const saveBtn = panel.querySelector("#gemini-save");
  const solveBtn = panel.querySelector("#gemini-solve");
  const resetBtn = panel.querySelector("#gemini-reset");
  const keyInput = panel.querySelector("#gemini-key");
  const setupDiv = panel.querySelector("#gemini-setup");
  const workDiv = panel.querySelector("#gemini-work");
  const resultDiv = panel.querySelector("#gemini-result");

  // Восстанавливаем ключ
  chrome.storage.local.get(["geminiKey"], (res) => {
    if (res.geminiKey) {
      setupDiv.style.display = "none";
      workDiv.style.display = "block";
    }
  });

  saveBtn.onclick = () => {
    const k = keyInput.value.trim();
    if (k) {
      chrome.storage.local.set({ geminiKey: k }, () => {
        setupDiv.style.display = "none";
        workDiv.style.display = "block";
      });
    }
  };

  resetBtn.onclick = () => {
    chrome.storage.local.remove("geminiKey", () => {
      setupDiv.style.display = "block";
      workDiv.style.display = "none";
      resultDiv.innerText = "Нажмите кнопку...";
    });
  };

  closeBtn.onclick = togglePanel;

  // --- Логика анализа ---
  solveBtn.onclick = () => {
    resultDiv.innerText = "⏳ Анализ...";
    resultDiv.style.color = "#333";

    panel.style.display = "none";

    // Небольшая задержка, чтобы панель успела исчезнуть
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: "CAPTURE_AND_SOLVE" }, (response) => {
        panel.style.display = "block";

        if (!response) {
          resultDiv.innerText = "Ошибка: нет ответа от background.";
          resultDiv.style.color = "red";
          return;
        }

        if (response.error) {
          resultDiv.innerText = `Ошибка: ${response.error}`;
          resultDiv.style.color = "red";
          return;
        }
        
        // Успех
        resultDiv.style.color = "#000"; 
        resultDiv.innerText = `Ответ:\n${response.answer}`;
      });
    }, 150);
  };

  // --- Drag & Drop ---
  let drag = false;
  let sx = 0, sy = 0, startLeft = 0, startTop = 0;

  header.onmousedown = (e) => {
    drag = true;
    sx = e.clientX;
    sy = e.clientY;
    startLeft = panel.offsetLeft;
    startTop = panel.offsetTop;
  };

  document.onmousemove = (e) => {
    if (drag) {
      e.preventDefault(); // Важно, чтобы текст не выделялся
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      panel.style.left = startLeft + dx + "px";
      panel.style.top = startTop + dy + "px";
      panel.style.right = "auto";
    }
  };

  document.onmouseup = () => drag = false;
}

function togglePanel() {
  panel.style.display = (panel.style.display === "none") ? "block" : "none";
}