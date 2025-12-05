// background.js
// -----------------------------------------
// Gemini Solver — Background (v2.4.0 Audio)
// -----------------------------------------

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_PANEL" });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // === СЦЕНАРИЙ 1: СКРИНШОТ ===
  if (request.action === "CAPTURE_AND_SOLVE") {
    processVisualRequest(sender.tab, sendResponse);
    return true; 
  }
  
  // === СЦЕНАРИЙ 2: АУДИО ===
  if (request.action === "AUDIO_SOLVE") {
    processAudioRequest(request.audioData, sendResponse);
    return true;
  }
});

// --- Обработка скрина ---
async function processVisualRequest(tab, sendResponse) {
  try {
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      func: getDeepText
    });

    let fullPageText = "";
    if (injectionResults) {
      fullPageText = injectionResults
        .map(frame => frame.result && frame.result.trim().length > 5 ? `=== FRAME ===\n${frame.result}` : null)
        .filter(t => t !== null)
        .join("\n\n");
    }
    if (fullPageText.length > 90000) fullPageText = fullPageText.substring(0, 90000);

    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: "png" });

    const storage = await chrome.storage.local.get(['geminiKey']);
    if (!storage.geminiKey) {
      sendResponse({ error: "Введите API Key!" });
      return;
    }

    const answer = await askGemini(storage.geminiKey, {
      type: 'image',
      image: dataUrl,
      text: fullPageText
    });
    sendResponse({ answer });

  } catch (err) {
    sendResponse({ error: err.message });
  }
}

// --- Обработка аудио ---
async function processAudioRequest(base64Audio, sendResponse) {
  try {
    const storage = await chrome.storage.local.get(['geminiKey']);
    if (!storage.geminiKey) {
      sendResponse({ error: "Введите API Key!" });
      return;
    }

    const answer = await askGemini(storage.geminiKey, {
      type: 'audio',
      audio: base64Audio
    });
    sendResponse({ answer });
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

// --- Универсальная функция запроса к Gemini ---
async function askGemini(apiKey, inputData) {
  const MODELS = [
    { name: "gemini-2.5-flash", timeout: 15000 },     // Самая быстрая стабильная
    { name: "gemini-2.5-pro", timeout: 25000 }       // Резервная мощная     
  ];

  let contents = [];

  if (inputData.type === 'image') {
    // Формируем payload для картинки + текста
    const cleanImage = inputData.image.split(',')[1];
    contents = [{
      parts: [
        { text: `
Ты эксперт по экзаменам и IT-квестам(Cisco,DevOps,Networking,Linux,Windows,Java,Perl).

    ВХОДНЫЕ ДАННЫЕ:
    1. ИЗОБРАЖЕНИЕ: Скриншот ВИДИМОЙ части экрана. Может быть обрезан снизу/сверху. Используй его для понимания типа вопроса (Drag&Drop, Matching, схемы).
    2. ТЕКСТ: Полный текст страницы, извлеченный из DOM (включая то, что не попало на скриншот).

    ИНСТРУКЦИЯ:
    1. Найди активный вопрос. Обычно он начинается со слов "Question", "Match", или имеет нумерацию.
    2. ВАЖНО: Если на скриншоте вопрос обрезан, ИЩИ ЕГО ПОЛНЫЙ ТЕКСТ И ВАРИАНТЫ В ПЕРЕДАННОМ ТЕКСТЕ ("ПОЛНЫЙ ТЕКСТ СТРАНИЦЫ"). Доверяй ТЕКСТУ больше, чем обрезанной картинке.
    3. Игнорируй элементы интерфейса (меню, футеры, кнопки навигации).
    
    ФОРМАТ ОТВЕТА:
    - Если это Matching (Сопоставление): Напиши пары "Характеристика -> Протокол/Понятие".
    - Если выбор ответа: Напиши только правильный ответ(ы).
    - Если Drag & Drop: Напиши, какой элемент куда перетащить.
 
    
    Дай краткое пояснение на русском (почему этот ответ верен).

    ПОЛНЫЙ ТЕКСТ СТРАНИЦЫ:
          ${inputData.text || "Нет текста"}
        `},
        { inline_data: { mime_type: "image/png", data: cleanImage } }
      ]
    }];
  } else if (inputData.type === 'audio') {
    // Формируем payload для аудио
    // inputData.audio приходит в формате "data:audio/webm;base64,..."
    const cleanAudio = inputData.audio.split(',')[1];
    
    // Важно: Gemini принимает audio/webm или audio/mp3. Мы шлем webm (стандарт браузера).
    contents = [{
      parts: [
        { text: `
          Послушай этот вопрос (он может быть на немецком,английском или русском). 
          Ты эксперт по экзаменам и IT-квестам(Cisco,DevOps,Networking,Linux,Windows,Java,Perl).
          Дай правильный ответ текстом на русском языке. 
          Дай краткое пояснение на русском (почему этот ответ верен).
          ` },
        { inline_data: { mime_type: "audio/webm", data: cleanAudio } }
      ]
    }];
  }

  // Запрос с перебором моделей
  let lastError = "";
  for (const m of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m.name}:generateContent?key=${apiKey}`;
    
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), m.timeout);
      
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents }),
        signal: controller.signal
      });
      clearTimeout(id);

      const data = await response.json();
      if (data.error) {
        lastError = data.error.message;
        continue;
      }
      if (data.candidates && data.candidates[0].content) {
        return data.candidates[0].content.parts[0].text;
      }
    } catch (e) {
      lastError = e.message;
    }
  }

  throw new Error(`Ошибка Gemini: ${lastError}`);
}

// Хелпер для текста (тот же, что и был)
function getDeepText() {
  function traverse(n) {
    if (['SCRIPT','STYLE'].includes(n.tagName)) return "";
    if (n.nodeType === 3) return n.textContent.trim() + " ";
    if (n.shadowRoot) return traverse(n.shadowRoot);
    let t = "";
    if (n.childNodes) n.childNodes.forEach(c => t+=traverse(c));
    return t;
  }
  return traverse(document.body);
}