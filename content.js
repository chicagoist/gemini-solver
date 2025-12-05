// content.js
// =========================
// GEMINI SOLVER 2.3.1 PANEL
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
  `;

  panel.innerHTML = `
    <div id="gemini-header" style="background:#007bff; color:#fff; padding:10px 14px; border-radius:12px 12px 0 0; cursor:move; font-weight:600;">
      Gemini Solver
      <button id="gemini-close" style="float:right;background:none;color:white;border:none;font-size:18px;cursor:pointer;">×</button>
    </div>

    <div style="padding:12px;">
      <div id="gemini-setup">
        <input type="password" id="gemini-key" placeholder="API Key..." style="width:100%;padding:8px;border-radius:6px;border:1px solid #ddd;margin-bottom:6px;">
        <button id="gemini-save" style="width:100%;padding:9px;background:#28a745;color:white;border:none;border-radius:6px;font-weight:600;cursor:pointer;">Сохранить ключ</button>
      </div>

      <div id="gemini-work" style="display:none;">
        <button id="gemini-solve" style="width:100%;padding:10px;background:#007bff;color:white;border:none;border-radius:6px;font-weight:600;cursor:pointer;">
          📸 Анализировать экран
        </button>

        <div id="gemini-result" style="margin-top:12px;padding:10px;background:#f7f7f7;border-radius:6px;border:1px solid #eee;max-height:420px;overflow-y:auto;">
          Нажмите кнопку...
        </div>

        <button id="gemini-reset" style="margin-top:6px;font-size:12px;color:#777;background:none;border:none;text-decoration:underline;cursor:pointer;">
          Сброс ключа
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  const header = document.getElementById("gemini-header");
  const closeBtn = document.getElementById("gemini-close");
  const saveBtn = document.getElementById("gemini-save");
  const solveBtn = document.getElementById("gemini-solve");
  const resetBtn = document.getElementById("gemini-reset");
  const keyInput = document.getElementById("gemini-key");
  const setupDiv = document.getElementById("gemini-setup");
  const workDiv = document.getElementById("gemini-work");
  const resultDiv = document.getElementById("gemini-result");

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
    });
  };

  closeBtn.onclick = togglePanel;

  // --- Анализ ---
  solveBtn.onclick = () => {
    resultDiv.innerText = "⏳ Анализ...";

    panel.style.display = "none";

    setTimeout(() => {
      chrome.runtime.sendMessage({ action: "CAPTURE_AND_SOLVE" }, (response) => {
        panel.style.display = "block";

        if (!response) {
          resultDiv.innerText = "Ошибка: нет ответа от background.";
          return;
        }

        if (response.error) {
          resultDiv.innerHTML = `<b style="color:red;">Ошибка:</b> ${response.error}`;
          return;
        }

        resultDiv.innerHTML = `<b>Ответ:</b><br>${response.answer.replace(/\n/g, "<br>")}`;
      });
    }, 100);
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
  panel.style.display =
    panel.style.display === "none" ? "block" : "none";
}
