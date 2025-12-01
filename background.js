chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "CAPTURE_AND_SOLVE") {
    
    // 1. Делаем скриншот видимой части вкладки
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message });
        return;
      }

      // 2. Получаем ключ и отправляем в Gemini
      chrome.storage.local.get(['geminiKey'], async (result) => {
        if (!result.geminiKey) {
          sendResponse({ error: "Нет API ключа" });
          return;
        }

        try {
          const answer = await askGemini(result.geminiKey, dataUrl);
          sendResponse({ answer: answer });
        } catch (err) {
          sendResponse({ error: err.toString() });
        }
      });
    });

    return true; // Нужно для асинхронного ответа
  }
});

async function askGemini(apiKey, base64Image) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
  // Убираем префикс "data:image/png;base64," для отправки
  const cleanBase64 = base64Image.split(',')[1];

  const payload = {
    contents: [{
      parts: [
        { 
          text: "Ты эксперт по экзаменам. Посмотри на скриншот. Найди вопрос и варианты ответов. Если это технический вопрос (например, Cisco, Linux, Coding), реши его. Верни ТОЛЬКО правильный ответ и краткое объяснение (1-2 предложения) на русском языке." 
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

  if (data.error) {
    throw new Error(data.error.message);
  }

  // Парсим ответ
  return data.candidates[0].content.parts[0].text;
}