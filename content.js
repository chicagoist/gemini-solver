// content.js
// =========================
// GEMINI SOLVER 2.2.0 PANEL
// =========================

let panel = null;

chrome.runtime.onMessage.addListener((req) => {
  if (req.action === "TOGGLE_PANEL") {
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
    width: 320px;
    background: #fff;
    border: 1px solid #ccc;
    box-shadow: 0 4px 25px rgba(0,0,0,0.3);
    z-index: 2147483647;
    border-radius: 12px;
    font-family: Segoe UI, sans-serif;
  `;

  panel.innerHTML = `
    <div id="gemini-header" style="padding: 12px; background:#007bff; color:#fff; border-radius:12px 12px 0 0; cursor:move; display:flex; justify-content:space-between;">
      <span><b>🤖 Gemini Solver 2.2.0</b></span>
      <button id="gemini-close" style="background:none;border:none;color:white;font-size:20px;">×</button>
    </div>

    <div style="padding:15px;">
      <div id="setup">
        <input id="gemini-key" type="password" placeholder="API Key" style="width:100%; padding:8px;">
        <button id="save-key" style="margin-top:8px;width:100%; padding:8px; background:#28a745; color:white;">Сохранить ключ</button>
      </div>

      <div id="work" style="display:none;">
        <button id="solve" style="width:100%; padding:10px; background:#007bff; color:white;">📸 Анализировать экран</button>
        <div id="result" style="margin-top:12px; background:#f8f9fa; padding:10px; min-height:60px; max-height:400px; overflow:auto;"></div>
        <button id="reset" style="margin-top:5px;background:none;border:none;color:#999;font-size:12px;">Сбросить ключ</button>
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  const setup = panel.querySelector("#setup");
  const work = panel.querySelector("#work");
  const key = panel.querySelector("#gemini-key");
  const save = panel.querySelector("#save-key");
  const solve = panel.querySelector("#solve");
  const result = panel.querySelector("#result");

  chrome.storage.local.get(["geminiKey"], (r) => {
    if (r.geminiKey) {
      setup.style.display = "none";
      work.style.display = "block";
    }
  });

  save.onclick = () => {
    const v = key.value.trim();
    if (!v) return;
    chrome.storage.local.set({ geminiKey: v }, () => {
      setup.style.display = "none";
      work.style.display = "block";
    });
  };

  solve.onclick = () => {
    result.innerText = "⏳ Анализ…";

    panel.style.visibility = "hidden";

    setTimeout(() => {
      chrome.runtime.sendMessage({ action: "CAPTURE_AND_SOLVE" }, (resp) => {
        panel.style.visibility = "visible";

        if (resp.error) {
          result.innerHTML = `<span style='color:red'>${resp.error}</span>`;
        } else {
          result.innerHTML = resp.answer.replace(/\n/g, "<br>");
        }
      });
    }, 150);
  };

  panel.querySelector("#reset").onclick = () => {
    chrome.storage.local.remove("geminiKey", () => {
      work.style.display = "none";
      setup.style.display = "block";
      result.innerText = "";
    });
  };

  panel.querySelector("#gemini-close").onclick = togglePanel;

  // Drag
  let drag = false, sx, sy, sl, st;
  const header = panel.querySelector("#gemini-header");

  header.onmousedown = (e) => {
    drag = true;
    sx = e.clientX;
    sy = e.clientY;
    sl = panel.offsetLeft;
    st = panel.offsetTop;
    e.preventDefault();
  };

  document.onmousemove = (e) => {
    if (drag) {
      panel.style.left = sl + (e.clientX - sx) + "px";
      panel.style.top = st + (e.clientY - sy) + "px";
      panel.style.right = "auto";
    }
  };

  document.onmouseup = () => drag = false;
}

function togglePanel() {
  if (!panel) return;
  panel.style.display = panel.style.display === "none" ? "block" : "none";
}
