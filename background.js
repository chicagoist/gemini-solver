chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "CAPTURE_AND_SOLVE") {
    
    // Получаем текущую активную вкладку, чтобы знать её ID
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      const activeTab = tabs[0];

      // 1. Сначала извлекаем ВЕСЬ текст со страницы (даже скрытый за скроллом)
      chrome.scripting.executeScript({
        target: { tabId: activeTab.id },
        func: () => document.body.innerText // Эта функция выполнится на странице
      }, (results) => {
        
        // Проверка на ошибки доступа к странице
        if (chrome.runtime.lastError || !results || !results[0]) {
           // Если не вышло прочитать текст (например, защищенная страница), шлем пустую строку
           processWithScreenshot(sendResponse, ""); 
        } else {
           const pageText = results[0].result;
           // Обрезаем текст, если он слишком огромный (до 20 000 символов), чтобы не перегружать
           const cleanText = pageText.substring(0, 30000); 
           processWithScreenshot(sendResponse, cleanText);
        }
      });
    });

    return true; // Важно для асинхронности
  }
});

// Вспомогательная функция: делает скриншот и шлет всё в Gemini
function processWithScreenshot(sendResponse, pageText) {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: "Ошибка скриншота: " + chrome.runtime.lastError.message });
        return;
      }

      chrome.storage.local.get(['geminiKey'], async (result) => {
        if (!result.geminiKey) {
          sendResponse({ error: "API ключ не найден." });
          return;
        }

        try {
          // Передаем и ключ, и картинку, и ТЕКСТ
          const answer = await askGemini(result.geminiKey, dataUrl, pageText);
          sendResponse({ answer: answer });
        } catch (err) {
          console.error(err);
          sendResponse({ error: err.message });
        }
      });
    });
}

async function askGemini(apiKey, base64Image, pageText) {
  const modelName = "gemini-1.5-flash-latest"; 
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  
  const cleanBase64 = base64Image.split(',')[1];

  // Формируем УМНЫЙ запрос: Текст + Картинка
  const payload = {
    contents: [{
      parts: [
        { 
          // Мы объясняем ИИ: вот текст всей страницы, а вот картинка того, что видит юзер
          text: `Ты эксперт. Я отправляю тебе:
                 1. СКРИНШОТ видимой части экрана (там могут быть схемы/диаграммы).
                 2. ТЕКСТ всей страницы целиком (там полный текст вопроса и варианты ответов).
                 
                 ТВОЯ ЗАДАЧА:
                 Найти на странице текущий вопрос. Если для него нужна схема — возьми её со скриншота. Если текст вопроса длинный и ушел за экран — возьми его из текста страницы.
                 
                 Выбери правильный ответ. Напиши ТОЛЬКО правильный ответ и очень краткое пояснение на русском языке.
                 
                 ВОТ ТЕКСТ СТРАНИЦЫ:
                 ${pageText}` 
        },
        {
          inline_data: {
            mime_type: "image/png",
            data: cleanBase64
          }
        }
      ]
    }]
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json();

  if (data.error) throw new Error(data.error.message);
  if (!data.candidates || data.candidates.length === 0) throw new Error("ИИ не вернул ответ.");

  return data.candidates[0].content.parts[0].text;
}