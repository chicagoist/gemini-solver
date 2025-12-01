// 1. Слушаем клик по иконке расширения -> отправляем команду "TOGGLE_PANEL"
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_PANEL" });
});

// 2. Слушаем запросы от content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "CAPTURE_AND_SOLVE") {

    // ШАГ 1: Извлекаем текст изо ВСЕХ фреймов страницы
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id, allFrames: true },
      // Используем textContent как запасной вариант, если innerText скрыт стилями
      func: () => document.body.innerText || document.body.textContent
    }, (results) => {

      let fullPageText = "";
      if (chrome.runtime.lastError || !results) {
        console.error("Ошибка чтения текста:", chrome.runtime.lastError);
        fullPageText = "Не удалось извлечь текст страницы.";
      } else {
        // Склеиваем текст, добавляя маркеры фреймов
        fullPageText = results.map(frame => `--- FRAME START ---\n${frame.result}\n--- FRAME END ---`).join("\n\n");
      }

      // Увеличиваем лимит, так как Gemini 2.0 имеет огромное контекстное окно
      if (fullPageText.length > 100000) fullPageText = fullPageText.substring(0, 100000);

      // ШАГ 2: Делаем скриншот (только видимая часть)
      chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
          return;
        }

        // ШАГ 3: Получаем ключ и шлем в Gemini
        chrome.storage.local.get(['geminiKey'], async (result) => {
          if (!result.geminiKey) {
            sendResponse({ error: "Сначала введите API Key!" });
            return;
          }

          try {
            const answer = await askGemini(result.geminiKey, dataUrl, fullPageText);
            sendResponse({ answer: answer });
          } catch (err) {
            console.error(err);
            sendResponse({ error: err.message });
          }
        });
      });
    });

    return true; // Важно для асинхронности
  }
});

async function askGemini(apiKey, base64Image, pageText) {
  // Используем новейшую доступную модель. 
  // Если 2.0-flash-exp выдаст ошибку, можно откатиться на gemini-1.5-flash
  const modelName = "gemini-2.5-flash"; 
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const cleanBase64 = base64Image.split(',')[1];

  // Улучшенный промпт, решающий проблему "невидимого" текста
  const promptText = `
    Ты эксперт по сетям Cisco (CCNA/CCNP) и IT экзаменам.
    
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
    ${pageText}
  `;

  const payload = {
    contents: [{
      parts: [
        { text: promptText },
        { inline_data: { mime_type: "image/png", data: cleanBase64 } }
      ]
    }]
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  
  if (data.error) {
    if (data.error.code === 404 || data.error.message.includes("not found")) {
         throw new Error("Модель Gemini 2.0 пока недоступна для вашего ключа. Попробуйте сменить модель в коде на gemini-2.5-flash.");
    }
    throw new Error(data.error.message);
  }
  
  if (!data.candidates || !data.candidates[0].content) {
      throw new Error("Gemini не вернул ответ. Возможно, сработал фильтр безопасности.");
  }
  
  return data.candidates[0].content.parts[0].text;
}