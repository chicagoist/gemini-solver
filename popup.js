document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('apiKey');
  const saveKeyBtn = document.getElementById('saveKey');
  const solveBtn = document.getElementById('solveBtn');
  const resetKeyBtn = document.getElementById('resetKey');
  const resultDiv = document.getElementById('result');
  const setupBlock = document.getElementById('setup-block');
  const workBlock = document.getElementById('work-block');
  const statusDiv = document.getElementById('status');

  // Проверяем, есть ли уже ключ
  chrome.storage.local.get(['geminiKey'], (result) => {
    if (result.geminiKey) {
      showWorkMode();
    }
  });

  // Сохранение ключа
  saveKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (key) {
      chrome.storage.local.set({ geminiKey: key }, () => {
        showWorkMode();
      });
    }
  });

  // Сброс ключа
  resetKeyBtn.addEventListener('click', () => {
    chrome.storage.local.remove('geminiKey', () => {
      workBlock.classList.add('hidden');
      setupBlock.classList.remove('hidden');
      resultDiv.innerText = "Ответ появится здесь...";
    });
  });

  // Главная кнопка "РЕШИТЬ"
  solveBtn.addEventListener('click', () => {
    resultDiv.innerText = "Думаю... 🧠";
    statusDiv.innerText = "Делаю скриншот...";
    
    // Отправляем команду в background.js
    chrome.runtime.sendMessage({ action: "CAPTURE_AND_SOLVE" }, (response) => {
      if (chrome.runtime.lastError) {
        resultDiv.innerText = "Ошибка: " + chrome.runtime.lastError.message;
      } else if (response && response.error) {
        resultDiv.innerText = "Ошибка API: " + response.error;
      } else {
        resultDiv.innerText = response.answer;
        statusDiv.innerText = "Готово!";
      }
    });
  });

  function showWorkMode() {
    setupBlock.classList.add('hidden');
    workBlock.classList.remove('hidden');
  }
});