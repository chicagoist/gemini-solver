// background.js
// -----------------------------------------
// Gemini Solver — Background (v2.2.1)
// -----------------------------------------

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_PANEL" });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "CAPTURE_AND_SOLVE") {

    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id, allFrames: true },
      func: () => document.body.innerText || document.body.textContent
    }, (results) => {

      let fullPageText = "";

      if (chrome.runtime.lastError || !results) {
        fullPageText = "Ошибка чтения DOM.";
      } else {
        fullPageText = results
          .map(frame => `--- FRAME START ---\n${frame.result}\n--- FRAME END ---`)
          .join("\n\n");
      }

      // safety limit
      if (fullPageText.length > 100000)
        fullPageText = fullPageText.substring(0, 100000);

      chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ error: chrome.runtime.lastError.message });
          return;
        }

        chrome.storage.local.get(['geminiKey'], async (result) => {
          if (!result.geminiKey) {
            sendResponse({ error: "Нет API-ключа!" });
            return;
          }

          try {
            const answer = await askGemini(result.geminiKey, dataUrl, fullPageText);
            sendResponse({ answer });
          } catch (err) {
            sendResponse({ error: err.message });
          }
        });
      });
    });

    return true;
  }
});


// ============================================================================
//   askGemini() — версия 2.2.0
//   Авто-переключение моделей, таймауты, логирование, фильтр качества
// ============================================================================

async function askGemini(apiKey, base64Image, pageText) {
  const MODELS = [
    { name: "gemini-2.0-flash-thinking", timeout: 10000 },
    { name: "gemini-2.0-pro", timeout: 20000 },
    { name: "gemini-1.5-pro", timeout: 25000 }
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
    - Если это Matching (Сопоставление): Напиши пары "Характеристика -> Протокол/Понятие".
    - Если выбор ответа: Напиши только правильный ответ(ы).
    - Если Drag & Drop: Напиши, какой элемент куда перетащить.
    
    Дай краткое пояснение на русском (почему этот ответ верен).

    ПОЛНЫЙ ТЕКСТ СТРАНИЦЫ:
${pageText}
`;

  // --- Проверка качества ответа ---
  function isBadAnswer(a) {
    if (!a) return true;
    const t = a.trim().toLowerCase();

    if (t.length < 20) return true;
    if (t.includes("not sure") || t.includes("cannot answer")) return true;

    const hasAbcd = /(^|\s)[abcd][).:-]/i.test(a);
    const hasArrow = /->/.test(a);

    if (!hasAbcd && !hasArrow && t.split(" ").length <= 3)
      return true;

    return false;
  }

  // --- Таймаут обёртка ---
  async function fetchWithTimeout(url, options, timeoutMs) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return res;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  }

  const saveLog = (obj) => chrome.storage.local.set({ lastGeminiLog: obj });

  // -----------------------------------------
  // ПЕРЕБОР МОДЕЛЕЙ (лучшие → старшие)
  // -----------------------------------------
  for (const m of MODELS) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${m.name}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [{
        parts: [
          { text: promptText },
          { inline_data: { mime_type: "image/png", data: cleanBase64 } }
        ]
      }]
    };

    try {
      const t0 = performance.now();

      const response = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }, m.timeout);

      const data = await response.json();
      const t1 = performance.now();

      if (data.error) {
        saveLog({
          ok: false,
          model: m.name,
          error: data.error.message,
          duration: t1 - t0
        });
        continue;
      }

      const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!isBadAnswer(answer)) {
        saveLog({
          ok: true,
          model: m.name,
          preview: answer.slice(0, 60),
          duration: t1 - t0
        });
        return answer;
      }

      saveLog({
        ok: false,
        model: m.name,
        error: "bad_answer",
        preview: answer?.slice(0, 80)
      });

    } catch (e) {
      saveLog({
        ok: false,
        model: m.name,
        error: e.message
      });
      continue;
    }
  }

  throw new Error("Все модели Gemini вернули ошибку или плохой ответ.");
}
