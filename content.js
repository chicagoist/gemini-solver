// content.js
// =========================
// GEMINI SOLVER 2.4.2 (Model Display Fix)
// =========================

let panel = null;
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;

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

  // HTML
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
        <div style="display: flex; gap: 8px; margin-bottom: 10px;">
          <button id="gemini-solve" style="flex: 1; padding:10px; background:#007bff; color:white; border:none; border-radius:6px; font-weight:600; cursor:pointer; display: flex; align-items: center; justify-content: center; gap: 5px;">📸 Экран</button>
          <button id="gemini-mic" style="flex: 1; padding:10px; background:#6c757d; color:white; border:none; border-radius:6px; font-weight:600; cursor:pointer; display: flex; align-items: center; justify-content: center; gap: 5px;">🎙️ Голос</button>
        </div>

        <div id="gemini-result" style="padding:10px; background:#f7f7f7; border-radius:6px; border:1px solid #eee; max-height:420px; overflow-y:auto; font-size: 14px; white-space: pre-wrap;">Выберите действие...</div>

        <button id="gemini-reset" style="margin-top:6px; font-size:12px; color:#777; background:none; border:none; text-decoration:underline; cursor:pointer; width: 100%; text-align: right;">Сброс ключа</button>
      </div>
    </div>
  `;

  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlTemplate, 'text/html');
  Array.from(doc.body.children).forEach(child => panel.appendChild(child));

  document.body.appendChild(panel);

  const closeBtn = panel.querySelector("#gemini-close");
  const saveBtn = panel.querySelector("#gemini-save");
  const solveBtn = panel.querySelector("#gemini-solve");
  const micBtn = panel.querySelector("#gemini-mic");
  const resetBtn = panel.querySelector("#gemini-reset");
  const keyInput = panel.querySelector("#gemini-key");
  const setupDiv = panel.querySelector("#gemini-setup");
  const workDiv = panel.querySelector("#gemini-work");
  const resultDiv = panel.querySelector("#gemini-result");

  chrome.storage.local.get(["geminiKey"], (res) => {
    if (res.geminiKey) {
      setupDiv.style.display = "none";
      workDiv.style.display = "block";
    }
  });

  saveBtn.onclick = () => {
    const k = keyInput.value.trim();
    if (k) chrome.storage.local.set({ geminiKey: k }, () => { setupDiv.style.display = "none"; workDiv.style.display = "block"; });
  };

  resetBtn.onclick = () => {
    chrome.storage.local.remove("geminiKey", () => { setupDiv.style.display = "block"; workDiv.style.display = "none"; resultDiv.innerText = "Вставьте ключ..."; });
  };

  closeBtn.onclick = togglePanel;

  // ЛОГИКА
  solveBtn.onclick = () => {
    if (isRecording) stopRecording(false);
    resultDiv.innerText = "⏳ Анализирую экран...";
    resultDiv.style.color = "#333";
    panel.style.display = "none";

    setTimeout(() => {
      chrome.runtime.sendMessage({ action: "CAPTURE_AND_SOLVE" }, (response) => {
        panel.style.display = "block";
        handleResponse(response, resultDiv);
      });
    }, 150);
  };

  micBtn.onclick = async () => {
    if (!isRecording) startRecording(micBtn, resultDiv);
    else stopRecording(true, micBtn, resultDiv);
  };

  // Drag & Drop
  let drag = false, sx = 0, sy = 0, startLeft = 0, startTop = 0;
  const header = panel.querySelector("#gemini-header");
  header.onmousedown = (e) => { drag = true; sx = e.clientX; sy = e.clientY; startLeft = panel.offsetLeft; startTop = panel.offsetTop; };
  document.onmousemove = (e) => { if (drag) { e.preventDefault(); panel.style.left = (startLeft + e.clientX - sx) + "px"; panel.style.top = (startTop + e.clientY - sy) + "px"; } };
  document.onmouseup = () => drag = false;
}

// AUDIO
async function startRecording(btn, resultDiv) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    audioChunks = [];
    mediaRecorder.ondataavailable = (e) => audioChunks.push(e.data);
    mediaRecorder.onstop = () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      stream.getTracks().forEach(track => track.stop());
      processAudio(audioBlob, resultDiv);
    };
    mediaRecorder.start();
    isRecording = true;
    btn.style.background = "#dc3545";
    btn.innerHTML = "⏹ Стоп";
    resultDiv.innerText = "🎙️ Говорите... (Нажмите Стоп для отправки)";
  } catch (err) {
    resultDiv.innerText = "Ошибка микрофона: " + err.message;
    resultDiv.style.color = "red";
  }
}

function stopRecording(shouldProcess, btn, resultDiv) {
  if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
  isRecording = false;
  if (btn) { btn.style.background = "#6c757d"; btn.innerHTML = "🎙️ Голос"; }
}

function processAudio(blob, resultDiv) {
  resultDiv.innerText = "⏳ Отправляю аудио...";
  const reader = new FileReader();
  reader.readAsDataURL(blob);
  reader.onloadend = () => {
    chrome.runtime.sendMessage({ action: "AUDIO_SOLVE", audioData: reader.result }, (response) => handleResponse(response, resultDiv));
  };
}

// ОТРИСОВКА ОТВЕТА
function handleResponse(response, div) {
  if (!response) {
    div.innerText = "Ошибка: нет ответа.";
    div.style.color = "red";
    return;
  }
  if (response.error) {
    div.innerText = `Ошибка: ${response.error}`;
    div.style.color = "red";
    return;
  }

  // Сброс контента
  div.innerText = "";
  div.style.color = "#000";

  // 1. Сам ответ
  const textNode = document.createTextNode(`Ответ:\n${response.answer}`);
  div.appendChild(textNode);

  // 2. Имя модели (Если оно пришло, рисуем его внизу)
  if (response.model) {
    const modelBadge = document.createElement("div");
    modelBadge.style.cssText = `
      margin-top: 20px;
      padding-top: 10px;
      border-top: 1px solid #ccc;
      font-size: 11px;
      color: #777;
      text-align: right;
      font-family: monospace;
      font-style: italic;
    `;
    modelBadge.innerText = `⚡ Model: ${response.model}`;
    div.appendChild(modelBadge);
  } else {
    // Для отладки, если модели нет
    console.warn("Model name is missing in response");
  }
}

function togglePanel() {
  panel.style.display = (panel.style.display === "none") ? "block" : "none";
}