// background.js
// =========================
// GEMINI SOLVER 2.2.0 checkout
// =========================

// Клик по иконке → открыть/закрыть панель
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: "TOGGLE_PANEL" });
});

// Основной обработчик запросов
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === "CAPTURE_AND_SOLVE") {
    
    // --- ШАГ 1. Сбор текста с фреймов и shadow-root ---
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id, allFrames: true },
      func: extractDeepText
    }, (results) => {

      if (!results || chrome.runtime.lastError) {
        sendResponse({ error: "Не удалось прочитать DOM: " + chrome.runtime.lastError?.message });
        return;
      }

      // Склеиваем все фреймы с ID
      let fullPageText = "";
      results.forEach((frame, i) => {
        fullPageText += `\n\n----- FRAME ${i + 1} START -----\n`;
        fullPageText += frame.result || "";
        fullPageText += `\n----- FRAME ${i + 1} END -----\n`;
      });

      if (fullPageText.length > 200000) {
        fullPageText = fullPageText.substring(0, 200000);
      }

      // --- ШАГ 2. Делаем скриншот ---
      chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError || !dataUrl) {
          sendResponse({ error: "Ошибка скриншота: " + chrome.runtime.lastError?.message });
          return;
        }

        // --- ШАГ 3. Отправляем в Gemini ---
        chrome.storage.local.get(["geminiKey"], async (conf) => {
          if (!conf.geminiKey) {
            sendResponse({ error: "Введите API ключ в панели" });
            return;
          }

          try {
            const answer = await askGemini(conf.geminiKey, dataUrl, fullPageText);
            sendResponse({ answer });
          } catch (e) {
            sendResponse({ error: e.message });
          }
        });
      });
    });

    return true; // async response
  }
});


// =========================================================
//  DOM Extractor 2.2.0 — Shadow DOM + Iframe-safe extractor
// =========================================================
function extractDeepText() {

  function getText(node) {
    let out = "";

    if (!node) return "";

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.replace(/\s+/g, " ").trim();
      if (text.length > 0) out += text + " ";
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      // Если ShadowRoot
      if (node.shadowRoot) {
        out += getText(node.shadowRoot);
      }
    }

    // Рекурсивный обход
    let child = node.firstChild;
    while (child) {
      out += getText(child);
      child = child.nextSibling;
    }
    return out;
  }

  let text = "";

  try {
    text += getText(document.body);
  } catch (e) {}

  // Попытка обработать iframe, если они доступны
  const iframes = document.querySelectorAll("iframe");
  iframes.forEach((f, i) => {
    try {
      const doc = f.contentDocument;
      if (doc) {
        text += `\n[IFRAME #${i}]\n`;
        text += getText(doc.body);
      }
    } catch (e) {
      // CORS → пропускаем
    }
  });

  return text;
}


// =========================================================
// Gemini Request 2.2.0
// =========================================================
async function askGemini(apiKey, base64, text) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const clean = base64.split(",")[1];

  const prompt = `
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
${text}
`;

  const payload = {
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: {
            mime_type: "image/png",
            data: clean
        }}
      ]
    }]
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await res.json();

  if (data.error) throw new Error(data.error.message);
  if (!data.candidates?.[0]?.content?.parts?.[0]?.text)
    throw new Error("Gemini вернул пустой ответ");

  return data.candidates[0].content.parts[0].text;
}
