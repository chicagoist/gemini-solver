let panel = null;

// Слушаем сообщения от background.js (открытие панели по клику на иконку)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "TOGGLE_PANEL") {
    if (panel) {
      togglePanel();
    } else {
      createPanel();
    }
  }
});

function createPanel() {
  panel = document.createElement('div');
  panel.id = 'gemini-floating-panel';
  
  // Улучшенные стили + Z-INDEX побольше, чтобы перекрывать все
  panel.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    width: 320px;
    background: #fff;
    border: 1px solid #ccc;
    box-shadow: 0 4px 25px rgba(0,0,0,0.3);
    z-index: 2147483647; /* Максимальный Z-index */
    border-radius: 12px;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    color: #333;
    display: block;
    font-size: 14px;
    line-height: 1.5;
  `;

  // HTML панели
  panel.innerHTML = `
    <div id="gemini-header" style="padding: 12px; background: #007bff; color: #fff; border-radius: 12px 12px 0 0; cursor: move; display: flex; justify-content: space-between; align-items: center;">
      <span style="font-weight: 600;">🤖 Gemini Solver</span>
      <button id="gemini-close" style="background:none; border:none; color:#fff; cursor:pointer; font-size:18px; line-height: 1;">&times;</button>
    </div>
    <div style="padding: 15px;">
      <div id="gemini-setup">
        <input type="password" id="gemini-key" placeholder="Вставь Google API Key..." style="width: 100%; padding: 8px; margin-bottom: 8px; box-sizing: border-box; border: 1px solid #ddd; border-radius: 4px;">
        <button id="gemini-save" style="width: 100%; padding: 8px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">Сохранить ключ</button>
        <div style="margin-top: 5px; font-size: 12px; color: #666;">Ключ сохранится в браузере.</div>
      </div>
      
      <div id="gemini-work" style="display: none;">
        <button id="gemini-solve" style="width: 100%; padding: 10px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; display: flex; align-items: center; justify-content: center; gap: 8px;">
           📸 Анализировать экран
        </button>
        <div id="gemini-result" style="margin-top: 15px; padding: 10px; background: #f8f9fa; border-radius: 6px; min-height: 60px; font-size: 14px; white-space: pre-wrap; border: 1px solid #eee; max-height: 400px; overflow-y: auto;">Нажми кнопку, чтобы ИИ нашел ответ...</div>
        <div style="text-align: right; margin-top: 5px;">
            <button id="gemini-reset" style="background: none; border: none; color: #999; font-size: 11px; text-decoration: underline; cursor: pointer;">Сброс ключа</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(panel);

  const header = panel.querySelector('#gemini-header');
  const closeBtn = panel.querySelector('#gemini-close');
  const keyInput = panel.querySelector('#gemini-key');
  const saveBtn = panel.querySelector('#gemini-save');
  const solveBtn = panel.querySelector('#gemini-solve');
  const resultDiv = panel.querySelector('#gemini-result');
  const setupDiv = panel.querySelector('#gemini-setup');
  const workDiv = panel.querySelector('#gemini-work');
  const resetBtn = panel.querySelector('#gemini-reset');

  // Инициализация ключа
  chrome.storage.local.get(['geminiKey'], (res) => {
    if (res.geminiKey) {
      setupDiv.style.display = 'none';
      workDiv.style.display = 'block';
    }
  });

  saveBtn.onclick = () => {
    const k = keyInput.value.trim();
    if(k) chrome.storage.local.set({geminiKey: k}, () => {
      setupDiv.style.display = 'none';
      workDiv.style.display = 'block';
    });
  };

  resetBtn.onclick = () => {
    chrome.storage.local.remove('geminiKey', () => {
      workDiv.style.display = 'none';
      setupDiv.style.display = 'block';
      resultDiv.innerText = "Нажми кнопку...";
    });
  };

  closeBtn.onclick = togglePanel;

  // ЛОГИКА РЕШЕНИЯ
  solveBtn.onclick = () => {
    resultDiv.innerText = "⏳ Анализирую страницу и скриншот...";
    
    // 1. Скрываем панель
    panel.style.display = 'none';

    // 2. Ждем отрисовки скрытия (100мс)
    setTimeout(() => {
      // 3. Отправляем сигнал "Работай!" в background (текст теперь собирает он сам)
      chrome.runtime.sendMessage({ 
        action: "CAPTURE_AND_SOLVE" 
      }, (response) => {
        
        // 4. Показываем панель обратно
        panel.style.display = 'block';

        if (chrome.runtime.lastError) {
          resultDiv.innerText = "🔴 Ошибка расширения: " + chrome.runtime.lastError.message;
        } else if (response && response.error) {
          resultDiv.innerText = "🔴 Ошибка API: " + response.error;
        } else {
          // Красивый вывод ответа
          resultDiv.innerHTML = `<b>Ответ:</b><br/>${response.answer.replace(/\n/g, '<br/>')}`;
        }
      });
    }, 100);
  };

  // Drag & Drop
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  header.onmousedown = (e) => {
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    initialLeft = panel.offsetLeft;
    initialTop = panel.offsetTop;
    header.style.cursor = 'grabbing';
  };

  document.onmousemove = (e) => {
    if (isDragging) {
      e.preventDefault();
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      panel.style.left = `${initialLeft + dx}px`;
      panel.style.top = `${initialTop + dy}px`;
      panel.style.right = 'auto';
    }
  };

  document.onmouseup = () => {
    isDragging = false;
    header.style.cursor = 'move';
  };
}

function togglePanel() {
  if (panel.style.display === 'none') {
    panel.style.display = 'block';
  } else {
    panel.style.display = 'none';
  }
}