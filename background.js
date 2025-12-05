// background.js
// -----------------------------------------
// Gemini Solver — Background (v2.3.1 Fixed)
// -----------------------------------------

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_PANEL" });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "CAPTURE_AND_SOLVE") {
    processRequest(sender.tab, sendResponse);
    return true; // Важно для асинхронности
  }
});

async function processRequest(tab, sendResponse) {
  try {
    // 1. ИЗВЛЕЧЕНИЕ ТЕКСТА (С поддержкой Shadow DOM для Cisco)
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: getDeepText // Используем мощную функцию обхода
    });

    let fullPageText = "";
    if (injectionResults) {
      fullPageText = injectionResults
        .map(frame => {
          if (!frame.result || frame.result.trim().length < 5) return null;
          return `=== FRAME (${frame.frameId}) ===\n${frame.result}`;
        })
        .filter(t => t !== null)
        .join("\n\n");
    }

    if (!fullPageText) fullPageText = "Текст страницы не найден (возможно, Canvas).";
    if (fullPageText.length > 90000) fullPageText = fullPageText.substring(0, 90000);

    // 2. СКРИНШОТ
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });

    // 3. ЗАПРОС К GEMINI
    const storage = await chrome.storage.local.get(['geminiKey']);
    if (!storage.geminiKey) {
      sendResponse({ error: "Введите API Key в настройках панели!" });
      return;
    }

    const answer = await askGemini(storage.geminiKey, dataUrl, fullPageText);
    sendResponse({ answer });

  } catch (err) {
    console.error(err);
    sendResponse({ error: err.message });
  }
}

// === Функция для внедрения в страницу (Cisco NetAcad Fix) ===
function getDeepText() {
  function traverse(node) {
    let text = "";
    
    // Пропускаем мусор
    const tag = node.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return "";

    // Текстовые узлы
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent.trim() + " ";
    }

    // Shadow DOM (Главное для Cisco!)
    if (node.shadowRoot) {
      text += traverse(node.shadowRoot);
    }

    // Рекурсия по детям
    if (node.childNodes && node.childNodes.length > 0) {
      node.childNodes.forEach(child => text += traverse(child));
    }
    
    // Обработка слотов
    if (tag === 'SLOT') {
      node.assignedNodes().forEach(n => text += traverse(n));
    }

    // Добавляем переносы строк для блочных элементов
    if (node.nodeType === Node.ELEMENT_NODE) {
      const style = window.getComputedStyle(node);
      if (style.display === 'block' || style.display === 'flex' || tag === 'TR' || tag === 'LI') {
        text += "\n";
      }
    }

    return text;
  }
  return traverse(document.body);
}

// === Логика Gemini с перебором актуальных моделей ===
async function askGemini(apiKey, base64Image, pageText) {
  // АКТУАЛЬНЫЕ МОДЕЛИ НА 2025 ГОД (2.5 еще не существует!)
  const MODELS = [
    { name: "gemini-2.0-flash-exp", timeout: 20000 }, // Самая умная экспериментальная
    { name: "gemini-1.5-flash", timeout: 15000 },     // Самая быстрая стабильная
    { name: "gemini-2.5-pro", timeout: 25000 }       // Резервная мощная
  ];

  const cleanBase64 = base64Image.split(',')[1];

  const promptText = `
Ты эксперт по экзаменам и IT-квестам.

    ВХОДНЫЕ ДАННЫЕ:
    1. ИЗОБРАЖЕНИЕ: Скриншот ВИДИМОЙ части экрана. Может быть обрезан снизу/сверху. Используй его для понимания типа вопроса (Drag&Drop, Matching, схемы).
    2. ТЕКСТ: Полный текст страницы, извлеченный из DOM (включая то, что не попало на скриншот).

    ИНСТРУКЦИЯ:
    1. Найди активный вопрос. Обычно он начинается со слов "Question", "Match", или имеет нумерацию.
    2. ВАЖНО: Если на скриншоте вопрос обрезан, ИЩИ ЕГО ПОЛНЫЙ ТЕКСТ И ВАРИАНТЫ В ПЕРЕДАННОМ ТЕКСТЕ ("ПОЛНЫЙ ТЕКСТ СТРАНИЦЫ"). Доверяй ТЕКСТУ больше, чем обрезанной картинке.
    3. Игнорируй элементы интерфейса (меню, футеры, кнопки навигации).
    
    ФОРМАТ ОТВЕТА:
    - Сам вопрос не включай в ответ.
    - Если это Matching (Сопоставление): Напиши пары "Характеристика -> Протокол/Понятие".
    - Если выбор ответа: Напиши только правильный ответ(ы).
    - Если Drag & Drop: Напиши, какой элемент куда перетащить.
 
    
    Дай краткое пояснение на русском (почему этот ответ верен).

    ПОЛНЫЙ ТЕКСТ СТРАНИЦЫ:
    ${pageText}
  `;

  // Функция таймаута
  const fetchWithTimeout = (url, opts, ms) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    return fetch(url, { ...opts, signal: controller.signal })
      .finally(() => clearTimeout(id));
  };

  let lastError = "";

  for (const m of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m.name}:generateContent?key=${apiKey}`;
    
    const payload = {
      contents: [{
        parts: [
          { text: promptText }, // <--- ЗДЕСЬ БЫЛА ОШИБКА (было 'prompt')
          { inline_data: { mime_type: "image/png", data: cleanBase64 } }
        ]
      }]
    };

    try {
      console.log(`Trying model: ${m.name}...`);
      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }, m.timeout);

      const data = await response.json();

      if (data.error) {
        console.warn(`${m.name} error:`, data.error.message);
        lastError = data.error.message;
        continue; 
      }

      if (data.candidates && data.candidates[0].content) {
        return data.candidates[0].content.parts[0].text; 
      }

    } catch (e) {
      console.warn(`${m.name} exception:`, e.message);
      lastError = e.message;
    }
  }

  throw new Error(`Все модели недоступны. Последняя ошибка: ${lastError}`);
}