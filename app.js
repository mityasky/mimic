// ===== ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====
let currentCameraStream = null;
let bodyPixModel = null;
let emotionModelLoaded = false;
let emotionDetectionInterval = null;
let score = 0;
let lastFaceDetectedTime = 0;
let highScore = parseInt(localStorage.getItem('mimicHighScore')) || 0;
let lastRecordNotificationTime = 0; // Время последнего показа уведомления
const RECORD_COOLDOWN = 5000;       // Задержка 5 секунд между показами
let currentEmotionIndex = 0;
// ===== ПЕРЕМЕННЫЕ ДЛЯ РЕЖИМА "ЭМОЦИОНАЛЬНАЯ ДУЭЛЬ" =====
let emotionDuelStream = null;
let emotionDuelVideo = null;
let emotionDuelAnimFrame = null;
let emotionDuelState = 'idle'; // idle, ready, playing, finished
let emotionDuelTargetEmotion = null; // ключ целевой эмоции
let emotionDuelScores = { p1: 0, p2: 0 };
let emotionDuelTargetScore = 10; // игра до 10 очков
let emotionDuelPlayerData = [
  { id: 0, score: 0, correctStreak: 0, lastCorrectTime: 0, faceBox: null },
  { id: 1, score: 0, correctStreak: 0, lastCorrectTime: 0, faceBox: null }
];
const DUEL_ACCURACY_THRESHOLD = 0.6; // мин. уверенность для засчёта
const DUEL_STREAK_BONUS = 2; // бонусные очки за серию
const DUEL_MAX_STREAK = 5; // макс. бонус за серию
// ===== НАСТРОЙКИ ЗВУКА =====
let soundEnabled = true; // По умолчанию звук включён
// ===== ПЕРЕМЕННЫЕ ДЛЯ ИНДИКАТОРОВ =====
let lowLightWarningDismissed = false;
let lightCheckInterval = null;
const LIGHT_THRESHOLD = 60; // Порог освещённости (0-255)
// Канвас для проверки освещения (переиспользуемый)
let lightCheckCanvas = null;
let lightCheckCtx = null;
let detectionThreshold = 0.5; // Текущий порог (по умолчанию Medium)
const DIFFICULTY_THRESHOLDS = [0.20, 0.5, 0.92];
const DIFFICULTY_LABELS = ['Easy', 'Medium', 'Hard'];
// ===== ДЛЯ КОМБИНИРОВАННОЙ СЛОЖНОСТИ =====
let hardStreakCount = 0;           // Счётчик кадров с правильной эмоцией
const HARD_STREAK_REQUIRED = 4;     // Сколько кадров подряд нужно (4 × 500мс = 2 сек)
const HARD_CLARITY_GAP = 0.35;      // Мин. разрыв между 1-й и 2-й эмоцией для Hard
let frameSkip = 0;
const detectorOptions = new faceapi.TinyFaceDetectorOptions({
  inputSize: 512,
  scoreThreshold: 0.6
});

// Список эмоций для тренировки
const EMOTIONS = [
  { name: 'Радость', key: 'happy', emoji: '😊', imgs: ['emotions/happy.jpg', 'emotions/happy2.jpg', 'emotions/happy3.jpg', 'emotions/happy4.jpg', 'emotions/happy5.jpg', 'emotions/happy6.jpg'] },
  { name: 'Грусть', key: 'sad', emoji: '😢', imgs: ['emotions/sad.jpg', 'emotions/sad2.jpg', 'emotions/sad3.jpg', 'emotions/sad4.jpg', 'emotions/sad5.jpg', 'emotions/sad6.jpg'] },
  { name: 'Злость', key: 'angry', emoji: '😠', imgs: ['emotions/angry.jpg', 'emotions/angry2.jpg', 'emotions/angry3.jpg', 'emotions/angry4.jpg', 'emotions/angry5.jpg', 'emotions/angry6.jpg'] },
  { name: 'Удивление', key: 'surprised', emoji: '😮', imgs: ['emotions/surprised.jpg', 'emotions/surprised2.jpg', 'emotions/surprised3.jpg', 'emotions/surprised4.jpg', 'emotions/surprised5.jpg', 'emotions/surprised6.jpg'] },
  { name: 'Страх', key: 'fearful', emoji: '😨', imgs: ['emotions/fearful.jpg', 'emotions/fearful2.jpg', 'emotions/fearful3.jpg', 'emotions/fearful4.jpg', 'emotions/fearful5.jpg', 'emotions/fearful6.jpg'] },
  { name: 'Отвращение', key: 'disgusted', emoji: '🤢', imgs: ['emotions/disgusted.jpg', 'emotions/disgusted2.jpg', 'emotions/disgusted3.jpg', 'emotions/disgusted4.jpg', 'emotions/disgusted5.jpg', 'emotions/disgusted6.jpg'] }
];

const EMOTION_MODEL_URL = './models';
const EAR_THRESHOLD = 0.25;
const MAR_THRESHOLD = 0.65;

// ===== ДЕМО-РЕЖИМ "ТОЛЬКО КАМЕРА" =====
let isDemoMode = false;

function startDemoMode() {
  isDemoMode = true;
  
  // Переключаемся на экран тренировки
  document.getElementById('home-screen').classList.add('hidden');
  document.getElementById('training-view').classList.remove('hidden');
  
  // 🆕 Показываем кнопку выхода из демо (убираем атрибут hidden)
  const exitDemoBtn = document.getElementById('btn-exit-demo');
  if (exitDemoBtn) exitDemoBtn.hidden = false;
  
  // Запускаем камеру
  const startCamBtn = document.getElementById('btn-start-cam');
  if (startCamBtn && !startCamBtn.disabled) {
    startCamBtn.click();
  }
  
  // Показываем уведомление о демо-режиме
  showDemoModeNotification();
  console.log('🎥 Demo mode: ON');
}

function exitDemoMode() {
  isDemoMode = false;
  
    //  Скрываем кнопку выхода из демо (возвращаем атрибут hidden)
  const exitDemoBtn = document.getElementById('btn-exit-demo');
  if (exitDemoBtn) exitDemoBtn.hidden = true;
  
    stopSessionTimer();
  
  // Останавливаем камеру
  const stopCamBtn = document.getElementById('btn-stop-cam');
  if (stopCamBtn && !stopCamBtn.disabled) {
    stopCamBtn.click();
  }
  
  // Возвращаемся на главный экран
  document.getElementById('training-view').classList.add('hidden');
  document.getElementById('home-screen').classList.remove('hidden');
  
  console.log('🎥 Demo mode: OFF');
}

function showDemoModeNotification() {
  //  1. Получаем актуальный перевод прямо в момент создания уведомления
  const activeText = translations[currentLang]?.demoModeActive || 'Demo mode active';

  const notification = document.createElement('div');
  notification.id = 'demo-mode-notification';
  
  //  2. Вставляем переменную activeText вместо data-i18n
  notification.innerHTML = `
    <div style="position:fixed; top:340px; left:62%; transform:translateX(-50%); background:var(--primary); color:white; padding:12px 24px; border-radius:12px; box-shadow:0 4px 12px rgba(0,0,0,0.2); z-index:10000; font-weight:600; display:flex; align-items:center; gap:12px;">
      <span>🎥</span>
      <span>${activeText}</span>
    </div>
  `;
  
  document.body.appendChild(notification);
  
  // Автоматически скрываем через 5 секунд
  setTimeout(() => {
    const notif = document.getElementById('demo-mode-notification');
    if (notif) {
      notif.style.transition = 'opacity 0.3s';
      notif.style.opacity = '0';
      setTimeout(() => notif.remove(), 300);
    }
  }, 5000);
}

// Обработчик клика на кнопку демо-режима
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="demo-mode"]')) {
    e.preventDefault();
    startDemoMode();
  }
});

//  Обработчик клика на кнопку "Выйти из демо"
document.addEventListener('click', (e) => {
  if (e.target.closest('#btn-exit-demo')) {
    e.preventDefault();
    exitDemoMode();
  }
});

// ===== МОДУЛЬ МОНИТОРИНГА СОСТОЯНИЯ (ИДЕАЛЬНЫЙ БАЛАНС: ЗАКРЫТЫЕ ГЛАЗА + УМНЫЙ ФИЛЬТР УЛЫБКИ) =====
const StateMonitorModule = (() => {
  let monitorInterval = null;
  let blinkHistory = [];
  
  let lastBlinkTime = 0;
  let previousSegmentationMask = null;
  let activityScoreEMA = 0;
  let lastActivityCheck = 0;
  let cachedActivityLevel = "Normal";
  
  let recentEars = [0.30, 0.30, 0.30, 0.30, 0.30, 0.30, 0.30, 0.30, 0.30, 0.30]; 
  const MAX_RECENT_EARS = 10;
  
  let lastFaceSeenTime = 0;
  let facePresentStartTime = 0;
  let eyesClosedStartTime = 0;
  let consecutiveEyesOpenCount = 0;
  
  let pendingState = null;
  let pendingIcon = '';
  let pendingTextKey = '';
  let stateStableCount = 0;
  
  const monitorDetectorOptions = new faceapi.TinyFaceDetectorOptions({
    inputSize: 224,
    scoreThreshold: 0.4
  });
  
  const CONSTANTS = {
    RELATIVE_DROP_RATIO: 0.92,
    BLINK_COOLDOWN: 350,
    BLINK_WINDOW_MS: 60000,
    ACTIVITY_EMA_ALPHA: 0.2,
    CHECK_INTERVAL_MS: 200,
    DISTRACTED_TIMEOUT_MS: 3000,
    FOCUSED_TIMEOUT_MS: 5000,
    LONG_EYES_CLOSED_MS: 10000, 
    EYES_OPEN_CONFIRM_FRAMES: 3,
    STABILITY_THRESHOLD: 3,
    
    // 0.27 достаточно низко, чтобы игнорировать лёгкий прищур (обычно EAR ~0.28-0.29),
    // но достаточно высоко, чтобы надёжно ловить закрытые глаза (обычно EAR < 0.25).
    ABSOLUTE_CLOSED_THRESHOLD: 0.27, 
    DYNAMIC_MULTIPLIER: 0.90          
  };

  function calculateSingleEAR(eye) {
    const v1 = Math.hypot(eye[1].x - eye[5].x, eye[1].y - eye[5].y);
    const v2 = Math.hypot(eye[2].x - eye[4].x, eye[2].y - eye[4].y);
    const h = Math.hypot(eye[0].x - eye[3].x, eye[0].y - eye[3].y);
    return (v1 + v2) / (2.0 * h);
  }

  function calculateEAR(pos) {
    const leftEye = [pos[36], pos[37], pos[38], pos[39], pos[40], pos[41]];
    const rightEye = [pos[42], pos[43], pos[44], pos[45], pos[46], pos[47]];
    return (calculateSingleEAR(leftEye) + calculateSingleEAR(rightEye)) / 2.0;
  }

  function isGazeDownward(pos) {
    const avgEyeY = [36,37,38,39,40,41,42,43,44,45,46,47].reduce((s, i) => s + pos[i].y, 0) / 12;
    const noseTipY = pos[30].y;
    const browY = pos[27].y;
    const faceHeight = pos[8].y - browY;
    if (faceHeight < 20) return false;
    return ((noseTipY - avgEyeY) / faceHeight) > 0.45; 
  }

  // УМНЫЙ ФИЛЬТР: Чувствительность 0.10 ловит даже лёгкую улыбку или приоткрытый рот.
  // используем это не для детекции зевка, а как "предохранитель": 
  // если рот открыт (улыбка), мы НЕ считаем это мгновенной сонливостью, даже если глаза немного прищурены.
  function isMouthOpen(pos) {
    const mouthHeight = Math.hypot(pos[62].x - pos[66].x, pos[62].y - pos[66].y);
    const eyeDist = Math.hypot(pos[36].x - pos[45].x, pos[36].y - pos[45].y);
    return eyeDist > 0 ? (mouthHeight / eyeDist) > 0.10 : false;
  }

  async function checkState() {
    const video = document.getElementById('camera-feed');
    if (!video || video.readyState < 2 || typeof emotionModelLoaded === 'undefined' || !emotionModelLoaded) return;

    try {
      const detections = await faceapi.detectAllFaces(video, monitorDetectorOptions).withFaceLandmarks();
      const now = Date.now();

      if (!detections || detections.length === 0) {
        facePresentStartTime = 0; 
        eyesClosedStartTime = 0;
        consecutiveEyesOpenCount = 0;
        
        if (lastFaceSeenTime > 0 && (now - lastFaceSeenTime > CONSTANTS.DISTRACTED_TIMEOUT_MS)) {
          pendingState = 'distracted';
          stateStableCount = CONSTANTS.STABILITY_THRESHOLD; 
          updateUI('distracted', '🙈', 'stateDistracted');
        }
        return;
      }
      
      if (facePresentStartTime === 0) {
        facePresentStartTime = now;
      }
      lastFaceSeenTime = now;

      const pos = detections[0].landmarks.positions;
      const ear = calculateEAR(pos);
      const mouthOpen = isMouthOpen(pos);

      const sortedEars = [...recentEars].sort((a, b) => a - b);
      const maxRecentEar = sortedEars[Math.max(0, sortedEars.length - 2)];
      
      const dynamicThreshold = maxRecentEar * CONSTANTS.DYNAMIC_MULTIPLIER;
      const eyesClosed = (ear < dynamicThreshold) || (ear < CONSTANTS.ABSOLUTE_CLOSED_THRESHOLD);
      
      if (!eyesClosed && ear > 0.28) {
        recentEars.push(ear);
        if (recentEars.length > MAX_RECENT_EARS) {
          recentEars.shift();
        }
      }
      
      const isBlink = (ear < dynamicThreshold) && (ear < 0.29);

      if (isBlink && (now - lastBlinkTime > CONSTANTS.BLINK_COOLDOWN)) {
        blinkHistory.push(now);
        lastBlinkTime = now;
      }

      const windowStart = now - CONSTANTS.BLINK_WINDOW_MS;
      blinkHistory = blinkHistory.filter(time => time > windowStart);
      
      const blinkRate = blinkHistory.length;

      let activityLevel = cachedActivityLevel;
      if (now - lastActivityCheck > 600 && typeof bodyPixModel !== 'undefined' && bodyPixModel) {
        lastActivityCheck = now;
        try {
          const segmentation = await bodyPixModel.segmentPerson(video, { internalResolution: 'low', segmentationThreshold: 0.6 });
          const currentMask = segmentation.data;
          let changedPixels = 0;
          if (previousSegmentationMask) {
            for (let i = 0; i < currentMask.length; i += 10) {
              if (currentMask[i] !== previousSegmentationMask[i]) changedPixels++;
            }
          }
          const frameActivityRatio = changedPixels / (currentMask.length / 10);
          activityScoreEMA = CONSTANTS.ACTIVITY_EMA_ALPHA * frameActivityRatio + (1 - CONSTANTS.ACTIVITY_EMA_ALPHA) * activityScoreEMA;
          previousSegmentationMask = currentMask;

          if (activityScoreEMA > 0.15) cachedActivityLevel = "High";
          else if (activityScoreEMA < 0.02) cachedActivityLevel = "Low";
          else cachedActivityLevel = "Normal";

          activityLevel = cachedActivityLevel;
        } catch(e) { }
      }

      if (eyesClosed) {
        if (eyesClosedStartTime === 0) {
          eyesClosedStartTime = now;
        }
        consecutiveEyesOpenCount = 0;
      } else {
        consecutiveEyesOpenCount++;
        if (consecutiveEyesOpenCount >= CONSTANTS.EYES_OPEN_CONFIRM_FRAMES) {
          eyesClosedStartTime = 0;
        }
      }
      
      const gazeDown = isGazeDownward(pos);
      
      let newState = 'normal';
      let icon = '😐';
      let textKey = 'stateNormal';

      const isLongEyeClosure = eyesClosedStartTime > 0 && (now - eyesClosedStartTime) >= CONSTANTS.LONG_EYES_CLOSED_MS;

      // ЗАЩИТА ОТ ЛОЖНЫХ СРАБАТЫВАНИЙ:
      // 1. blinkRate > 25: учащённое моргание (независимо от рта).
      // 2. isLongEyeClosure: 10 секунд закрытых глаз (железобетонный аргумент, сработает даже если рот чуть приоткрыт во сне).
      // 3. (eyesClosed && gazeDown && !mouthOpen): мгновенный триггер при "кивке" головой, 
      //    НО ТОЛЬКО если рот закрыт (!mouthOpen). Это полностью блокирует ложную сонливость при улыбке
      if (blinkRate > 25 || isLongEyeClosure || (eyesClosed && gazeDown && !mouthOpen)) {
        newState = 'drowsy';
        icon = '😴';
        textKey = 'stateDrowsy';
      } 
      else if (activityLevel === 'Low' && blinkRate >= 1 && blinkRate < 8 && !gazeDown && !eyesClosed) {
        newState = 'interested';
        icon = '👀';
        textKey = 'stateInterested';
      }
      else if (blinkRate >= 8 && blinkRate <= 25) {
        newState = 'normal';
        icon = '😐';
        textKey = 'stateNormal';
      }
      else {
        newState = 'normal';
        icon = '😐';
        textKey = 'stateNormal';
      }

      const isFocused = (now - facePresentStartTime) >= CONSTANTS.FOCUSED_TIMEOUT_MS;
      
      if (!isFocused && newState !== 'drowsy') {
        newState = 'distracted';
        icon = '🙈';
        textKey = 'stateDistracted';
      }

      if (newState === pendingState) {
        stateStableCount++;
      } else {
        pendingState = newState;
        pendingIcon = icon;
        pendingTextKey = textKey;
        stateStableCount = 1;
      }

      if (stateStableCount >= CONSTANTS.STABILITY_THRESHOLD) {
        updateUI(pendingState, pendingIcon, pendingTextKey);
      }

    } catch (error) {
      // Тихий фолбэк
    }
  }

  function updateUI(state, icon, textKey) {
    const badge = document.getElementById('state-monitor-badge');
    const iconEl = badge?.querySelector('.state-icon');
    const textEl = badge?.querySelector('.state-text');
    
    if (!badge || !iconEl || !textEl) return;

    badge.classList.remove('state-normal', 'state-interested', 'state-drowsy', 'state-distracted');

    if (state === 'drowsy') badge.classList.add('state-drowsy');
    else if (state === 'interested') badge.classList.add('state-interested');
    else if (state === 'distracted') badge.classList.add('state-distracted');
    else badge.classList.add('state-normal');

    iconEl.textContent = icon;
    textEl.textContent = translations[currentLang]?.[textKey] || 'Focused';
  }

  return {
    start: () => {
      if (monitorInterval) return;
      blinkHistory = []; 
      recentEars = Array(MAX_RECENT_EARS).fill(0.30);
      activityScoreEMA = 0; 
      previousSegmentationMask = null;
      lastFaceSeenTime = 0;
      facePresentStartTime = 0; 
      eyesClosedStartTime = 0;
      consecutiveEyesOpenCount = 0;
      pendingState = null;
      stateStableCount = 0;
      
      cachedActivityLevel = "Normal";
      lastActivityCheck = 0;
      
      monitorInterval = setInterval(checkState, CONSTANTS.CHECK_INTERVAL_MS);
      console.log('State Monitor started (Perfect Balance: Closed Eyes + Smart Smile Filter)');
    },
    stop: () => {
      if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
      }
      const badge = document.getElementById('state-monitor-badge');
      if (badge) {
        badge.classList.remove('state-drowsy', 'state-interested', 'state-distracted');
        badge.classList.add('state-normal');
      }
      console.log('State Monitor stopped');
    }
  };
})();

// ===== ИНИЦИАЛИЗАЦИЯ =====
document.addEventListener('DOMContentLoaded', () => {
  initTensorFlow();
  initLanguage();
  initSound();
  loadEmotionImage();
  updateScoreDisplay();
  initThemeToggle();
  initDifficultySlider();
  updateFaceDetectionStatus(false);
  TimeDelayModule.init();
  DynamicBackgroundModule.init();
  initSensoryMode();
  
  //  Обработчик кнопки очистки расширенной статистики с автозакрытием
const clearAdvStatsBtn = document.getElementById('clear-advanced-stats-btn');
if (clearAdvStatsBtn) {
  clearAdvStatsBtn.addEventListener('click', () => {
    const confirmMsg = translations[currentLang]?.confirmClearAdvancedStats || 'Очистить расширенную статистику?';
    
    if (confirm(confirmMsg)) {
      // 1. Очищаем данные
      AdvancedStatsModule.clearData();
      
      // 2. Мгновенно обновляем UI (теперь это сработает, так как мы добавили функции в return)
      AdvancedStatsModule.renderRadarChart();
      AdvancedStatsModule.renderStatsTable();
      
      // 3. Показываем уведомление об успехе
      if (typeof showStatus === 'function') {
        const successMsg = translations[currentLang]?.advancedStatsCleared || '🗑️ Статистика успешно очищена!';
        showStatus(successMsg, 'info');
      }
      
      // 4.  Автоматически закрываем модальное окно с небольшой задержкой
      // (800 мс дают пользователю время заметить уведомление об успехе перед закрытием)
      setTimeout(() => {
        AdvancedStatsModule.closeModal();
      }, 800);
    }
  });
}
  
    // кнопка выхода из демо скрыта при обычной загрузке
  const exitDemoBtn = document.getElementById('btn-exit-demo');
  if (exitDemoBtn && !isDemoMode) {
    exitDemoBtn.hidden = true;
  }
  
  //  Инициализация эмоционального дневника
if (typeof EmotionDiary !== 'undefined') {
  EmotionDiary.init();
}
});

// ===== УПРАВЛЕНИЕ КАМЕРОЙ =====
window.startCamera = async function () {
	//  Запускаем мониторинг скуки/сонливости
if (typeof StateMonitorModule !== 'undefined') {
  StateMonitorModule.start();
}
  const video = document.getElementById('camera-feed');
  const startBtn = document.getElementById('btn-start-cam');
  const stopBtn = document.getElementById('btn-stop-cam');
  const camBadge = document.getElementById('camera-status-badge');

  // ПОКАЗЫВАЕМ ИНДИКАТОР ЗАГРУЗКИ
  showLoadingIndicator(true);

  try {
    currentCameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: 640,
        height: 480,
        facingMode: 'user'
      }
    });

    video.srcObject = currentCameraStream;
    video.style.display = 'block';

    startBtn.style.display = 'none';
    stopBtn.style.display = 'inline-block';
    stopBtn.disabled = false;
    camBadge.style.display = 'block';

    // Запускаем модели и детекцию
    await loadBodyPixModel();
    startPersonDetection();
    await loadEmotionModels();
    startEmotionDetection();

    // ЗАПУСКАЕМ ПРОВЕРКУ ОСВЕЩЕНИЯ
    startLightCheck(video);

    console.log('✅ Camera started');
} catch (err) {
  console.error('❌ Camera error:', err);
  showCriticalFallback('camera');
} finally {
  showLoadingIndicator(false);
}
};

window.stopCamera = function () {
	    // Останавливаем мониторинг
if (typeof StateMonitorModule !== 'undefined') {
  StateMonitorModule.stop();
}
	//  Возвращаем кнопку истории в активное состояние
const progressBtn = document.getElementById('menu-progress');
if (progressBtn) {
  progressBtn.disabled = false;
  progressBtn.style.opacity = '';
  progressBtn.style.cursor = '';
}
	stopSessionTimer();
  lastFaceDetectedTime = 0;
  updateFaceDetectionStatus(false);
  const video = document.getElementById('camera-feed');
  const startBtn = document.getElementById('btn-start-cam');
  const stopBtn = document.getElementById('btn-stop-cam');
  const camBadge = document.getElementById('camera-status-badge');

  if (currentCameraStream) {
    currentCameraStream.getTracks().forEach(track => track.stop());
    currentCameraStream = null;
  }

  stopEmotionDetection();
  stopPersonDetection();
  stopLightCheck(); // ОСТАНАВЛИВАЕМ ПРОВЕРКУ ОСВЕЩЕНИЯ
  video.srcObject = null;
  video.style.display = 'none';

  startBtn.style.display = 'inline-block';
  stopBtn.style.display = 'none';
  stopBtn.disabled = true;
  camBadge.style.display = 'none';

  // СКРЫВАЕМ ВСЕ ПРЕДУПРЕЖДЕНИЯ
  const warning = document.getElementById('lowlight-warning');
  if (warning) {
    warning.classList.remove('active');
  }

  resetLowLightWarning(); // СБРАСЫВАЕМ СОСТОЯНИЕ
  ProgressModule.saveSession();
  console.log('🛑 Camera stopped');
  
  //  Показываем дневник после тренировки (с задержкой, чтобы камера успела закрыться)
  setTimeout(() => {
    const isStillOnTrainingScreen = !document.getElementById('training-view').classList.contains('hidden');
    
    if (typeof EmotionDiary !== 'undefined' && !isDemoMode && isStillOnTrainingScreen) {
      EmotionDiary.show();
    }
  }, 500);
};

  // ===== ТАЙМЕР ТЕКУЩЕЙ СЕССИИ =====
let sessionTimerInterval = null;
let sessionStartTime = null;

function startSessionTimer() {
	  if (isDemoMode) return;
  const timerBar = document.getElementById('session-timer-bar');
  const timerEl = document.getElementById('session-timer');
  if (!timerBar || !timerEl) return;
  
  // Очищаем предыдущий таймер, если был
  stopSessionTimer();
  
  sessionStartTime = Date.now();
  timerBar.hidden = false;
  timerEl.textContent = '0:00';
  
  sessionTimerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    timerEl.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, 1000);
}

function stopSessionTimer() {
  if (sessionTimerInterval) {
    clearInterval(sessionTimerInterval);
    sessionTimerInterval = null;
  }
  const timerBar = document.getElementById('session-timer-bar');
  if (timerBar) timerBar.hidden = true;
  sessionStartTime = null;
}

async function initTensorFlow() {
  try {
    await tf.setBackend('webgl');
    await tf.ready();
    console.log('🚀 TF backend: WebGL');
  } catch (e) {
    await tf.setBackend('cpu');
    await tf.ready();
    console.log('🐢 TF backend: CPU');
  }
}

// ===== ЗАГРУЗКА МОДЕЛЕЙ =====
async function loadBodyPixModel() {
  if (bodyPixModel) return;
  console.log('🔄 Loading BodyPix...');
  try {
    bodyPixModel = await bodyPix.load({
      architecture: 'MobileNetV1',
      outputStride: 16,
      multiplier: 0.75,
      quantBytes: 2
    });
    console.log('✅ BodyPix loaded');
} catch (e) {
  console.error('❌ BodyPix error:', e);
  showCriticalFallback('model');
}
}

async function loadEmotionModels() {
  if (emotionModelLoaded) return;
  console.log('🔄 Loading face-api models...');
  try {
    await faceapi.nets.tinyFaceDetector.loadFromUri(EMOTION_MODEL_URL);
    await faceapi.nets.faceLandmark68Net.loadFromUri(EMOTION_MODEL_URL);
    await faceapi.nets.faceExpressionNet.loadFromUri(EMOTION_MODEL_URL);
    emotionModelLoaded = true;
    console.log('✅ Emotion models loaded');
} catch (e) {
  console.error('❌ Emotion models error:', e);
  showCriticalFallback('model');
}
}

// ===== РАСПОЗНАВАНИЕ ЭМОЦИЙ =====
async function detectEmotion() {
  frameSkip++;
  if (frameSkip % 1 !== 0) return; // множитель 2 равен пропуску одно кадра для снижения нагрузки
  console.log('detect run');
  const video = document.getElementById('camera-feed');
  if (!emotionModelLoaded || !video || video.readyState < 2) return;

  try {
    const detections = await faceapi.detectAllFaces(
      video,
      detectorOptions
    ).withFaceLandmarks().withFaceExpressions();

    if (detections?.[0]?.expressions) {
		lastFaceDetectedTime = Date.now();
		 updateFaceDetectionStatus(true);
      const expressions = detections[0].expressions;
      let dominant = 'neutral', maxScore = 0;

      for (const [emotion, score] of Object.entries(expressions)) {
        if (score > maxScore) { maxScore = score; dominant = emotion; }
      }
	  
	        // Обновляем динамический фон
      DynamicBackgroundModule.updateBackground(dominant);

      // Проверка: совпадает ли с целевой эмоцией?
      const targetKey = EMOTIONS[currentEmotionIndex].key;
      const currentLevel = parseInt(document.getElementById('difficulty-slider')?.value || 1);

      // Базовая проверка для всех уровней
      let isCorrect = (dominant === targetKey && maxScore > detectionThreshold);

      // КОМБИНИРОВАННАЯ ПРОВЕРКА ДЛЯ HARD (уровень 2)
      if (currentLevel === 2) {
        // 1. Сортируем все оценки эмоций для поиска второй по величине
        const scores = Object.values(expressions).sort((a, b) => b - a);
        const secondBest = scores[1] || 0;

        // Четыре условия для Hard (все должны быть true):
        const meetsTarget = (dominant === targetKey);                    // Эмоция совпадает с целевой
        const meetsThreshold = maxScore >= 0.92;                         // Уверенность ≥92%
        const meetsGap = (maxScore - secondBest) >= HARD_CLARITY_GAP;   // Разрыв ≥35 п.п.

        // Инкремент счётчика ТОЛЬКО если первые три условия выполнены
        if (meetsTarget && meetsThreshold && meetsGap) {
          hardStreakCount++;
        } else {
          hardStreakCount = 0; // Сброс при любом провале
        }

        // Удержание: проверяем, набрали ли нужное количество кадров подряд
        const meetsStability = (hardStreakCount >= HARD_STREAK_REQUIRED);

        // Баллы только если ВСЕ четыре условия выполнены
        isCorrect = meetsTarget && meetsThreshold && meetsGap && meetsStability;

        //  Отладка в консоль
        console.log(`🔍 Hard: ${dominant}=${maxScore.toFixed(2)}, 2nd=${secondBest.toFixed(2)}, gap=${(maxScore - secondBest).toFixed(2)}, streak=${hardStreakCount}/${HARD_STREAK_REQUIRED} → ${isCorrect ? '✅' : '❌'}`);
      } else {
        // Для Easy/Medium сбрасываем счётчик
        hardStreakCount = 0;
      }

      updateDetectedEmotion(dominant, maxScore);
	  if (isDemoMode) {
  AvatarController.update(dominant, maxScore);
  return; // Прерываем обработку этого кадра как игрового события
}
      giveFeedback(isCorrect, dominant);
	  
	      // ОБНОВЛЕНИЕ AVATAR
    AvatarController.update(dominant, maxScore);

      if (isCorrect) {
        addScore(10);
        playSuccessSound(); // опционально
      }
    }
} catch (e) {
  // При ошибке тоже считаем, что лицо не обнаружено
  updateFaceDetectionStatus(false);
  if (!e.message?.includes('backend')) {
    console.error('❌ Detection error:', e);
  }
}
}

let animationRunning = false;
let lastDetectionTime = 0;
const DETECTION_INTERVAL = 500;

function startEmotionDetection() {
  if (animationRunning) return;
  animationRunning = true;
  emotionLoop();
}

function emotionLoop() {
  if (!animationRunning) return;

  const now = Date.now();

  if (now - lastDetectionTime > DETECTION_INTERVAL) {
    detectEmotion();
    lastDetectionTime = now;
  }
  
    // ЛОГИКА ИСЧЕЗНОВЕНИЯ ЛИЦА
  // Если лицо было найдено, но с тех пор прошло > 3 секунд
  if (lastFaceDetectedTime !== 0 && (now - lastFaceDetectedTime > 3000)) {
      updateFaceDetectionStatus(false); // Меняем статус
      lastFaceDetectedTime = 0; // Сбрасываем, чтобы не обновлять статус постоянно
  }

  requestAnimationFrame(emotionLoop);
}

window.addEventListener('beforeunload', () => {
  stopEmotionDetection();
  stopPersonDetection();
  stopLightCheck();
  if (currentCameraStream) {
    currentCameraStream.getTracks().forEach(t => t.stop());
  }
});

function stopEmotionDetection() {
  animationRunning = false;
}

// ===== ЛОГИКА ТРЕНАЖЁРА =====
function loadEmotionImage() {
  const emotion = EMOTIONS[currentEmotionIndex];

  // Случайный выбор изображения из массива imgs
  const randomImage = emotion.imgs[Math.floor(Math.random() * emotion.imgs.length)];
  document.getElementById('emotion-image').src = randomImage;

  // Обновляем название эмоции из словаря переводов
  const emotionKey = emotion.key.charAt(0).toUpperCase() + emotion.key.slice(1);
  const emotionName = translations[currentLang]?.[`emotion${emotionKey}`] || emotion.name;
  document.getElementById('emotion-name').textContent = `${emotionName} ${emotion.emoji}`;

  // Сбрасываем отображение распознанной эмоции и обратную связь
  document.getElementById('detected-emotion').textContent = '--';
  document.getElementById('feedback').textContent = '';
  document.getElementById('feedback').className = 'feedback';
}

function updateDetectedEmotion(emotion, confidence) {
  const emojiMap = { 
    happy: '😊', sad: '😢', angry: '😠', 
    surprised: '😮', fearful: '😨', disgusted: '🤢', neutral: '😐' 
  };

  //  1. Получаем перевод названия эмоции из текущего языка
  const t = translations[currentLang] || {};
  const emotionKey = emotion.charAt(0).toUpperCase() + emotion.slice(1); // "happy" -> "Happy"
  const translatedName = t[`emotion${emotionKey}`] || emotion; // Берём перевод или оставляем оригинал на всякий случай

  //  2. Используем translatedName вместо сырого emotion
  document.getElementById('detected-emotion').innerHTML =
    `${emojiMap[emotion] || '😐'} ${translatedName} <small style="opacity:0.7">(${Math.round(confidence * 100)}%)</small>`;

  const slider = document.getElementById('difficulty-slider');
  if (slider && parseInt(slider.value) === 2 && currentEmotionIndex !== undefined) {
    const progress = Math.min(100, Math.round((hardStreakCount / HARD_STREAK_REQUIRED) * 100));
    const progressEl = document.getElementById('hard-progress');
    if (progressEl) {
      const fillBar = progressEl.firstElementChild; // ← Получаем ВНУТРЕННИЙ блок
      if (fillBar) {
        fillBar.style.width = `${progress}%`; // ← Меняем ширину заполнения
      }
    }
  }
}

function giveFeedback(isCorrect, detected) {
  const feedback = document.getElementById('feedback');
  if (isCorrect) {
    feedback.textContent = translations[currentLang].feedbackCorrect;
    feedback.className = 'feedback correct';
  } else if (detected !== 'neutral' && detected !== 'undefined') {
    // Переводим эмоцию для показа в подсказке
    const emotionKey = EMOTIONS[currentEmotionIndex].key;
    const emotionName = translations[currentLang][`emotion${emotionKey.charAt(0).toUpperCase() + emotionKey.slice(1)}`] || emotionKey;
    feedback.textContent = `${translations[currentLang].feedbackIncorrect} ${emotionName} ${EMOTIONS[currentEmotionIndex].emoji}`;
    feedback.className = 'feedback incorrect';
	ProgressModule.trackIncorrect();
    AdvancedStatsModule.recordFailure(emotionKey);
	
		        // Сохраняем ошибку для Матрицы портрета
        const errors = JSON.parse(localStorage.getItem('mimic_errors') || '[]');
        errors.push({ target: emotionKey, shown: detected, time: Date.now() });
        if (errors.length > 500) errors.shift(); // Храним не более 500 последних
        localStorage.setItem('mimic_errors', JSON.stringify(errors));
  }
}

function addScore(points) {
  score += points;
  ProgressModule.trackCorrect();
  
  const emotionKey = EMOTIONS[currentEmotionIndex].key;
  AdvancedStatsModule.recordSuccess(emotionKey);

  if (score > highScore) {
    highScore = score;
    localStorage.setItem('mimicHighScore', highScore);
    showRecordNotification();
  }

  updateScoreDisplay();
}

function updateScoreDisplay() {
  const scoreEl = document.getElementById('score');
  const highScoreEl = document.getElementById('high-score');

  if (scoreEl) scoreEl.textContent = score;
  if (highScoreEl) highScoreEl.textContent = `🏆 ${highScore}`;
}

function nextEmotion() {
  currentEmotionIndex = (currentEmotionIndex + 1) % EMOTIONS.length;
  loadEmotionImage();
  AdvancedStatsModule.startEmotion(EMOTIONS[currentEmotionIndex].key);
}

function prevEmotion() {
  currentEmotionIndex = (currentEmotionIndex - 1 + EMOTIONS.length) % EMOTIONS.length;
  loadEmotionImage();
  AdvancedStatsModule.startEmotion(EMOTIONS[currentEmotionIndex].key); 
}

function resetScore() {
  if (confirm('Сбросить баллы?')) {
    score = 0;
    updateScoreDisplay();
  }
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====
function playSuccessSound() {
  //  Отключаем звук в sensory-friendly режиме
  if (!soundEnabled || sensoryFriendlyMode) return;
  // Если звук выключен — не воспроизводим
  if (!soundEnabled) return;
  // Опционально: короткий позитивный звук
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(660, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch (e) { }
}

// ===== BODY SEGMENTATION (упрощённо) =====
let bodySegmentationInterval = null;
let bodySegmentationCanvas = null;
let bodySegmentationCtx = null;

function drawPersonContour(canvas, segmentation) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!segmentation?.data) return;

  const { width, height, data } = segmentation;
  // Быстрая проверка: есть ли вообще пиксели человека в кадре
  const hasPerson = data.some(v => v === 1);
  if (!hasPerson) return;
  
    // Если включены динамические фоны, рисуем их
  if (DynamicBackgroundModule.renderBackground(segmentation, canvas)) {
    // Фоны отрисованы, теперь рисуем контур поверх
  }

  // Масштабируем координаты маски под реальный размер canvas (видео)
  const scaleX = canvas.width / width;
  const scaleY = canvas.height / height;

  ctx.fillStyle = 'rgba(67, 97, 238, 0.9)'; // Цвет контура (совпадает с --primary)
  const step = 2; // Пропускаем каждый 2-й пиксель для оптимизации (визуально контур остаётся плавным)

  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      const idx = y * width + x;
      if (data[idx] === 1) {
        // Проверяем 8 соседей. Если хотя бы один фон (0) -> это край фигуры
        const isEdge =
          data[idx - 1] === 0 || data[idx + 1] === 0 ||
          data[idx - width] === 0 || data[idx + width] === 0 ||
          data[idx - width - 1] === 0 || data[idx - width + 1] === 0 ||
          data[idx + width - 1] === 0 || data[idx + width + 1] === 0;

        if (isEdge) {
          ctx.fillRect(x * scaleX, y * scaleY, step * scaleX, step * scaleY);
        }
      }
    }
  }
}

function startPersonDetection() {
  if (bodySegmentationInterval) return;
  const canvas = document.getElementById('body-segmentation-canvas');
  const video = document.getElementById('camera-feed');
  if (canvas && !bodySegmentationCanvas) {
    bodySegmentationCanvas = canvas;
    bodySegmentationCtx = canvas.getContext('2d');
  }
  bodySegmentationInterval = setInterval(async () => {
    // проверяем готовность видео перед работой с videoWidth
    if (!bodyPixModel || !video || video.readyState < 2 || video.videoWidth === 0) return;

    try {
      const segmentation = await bodyPixModel.segmentPerson(video, {
        internalResolution: 'medium',
        segmentationThreshold: 0.7
      });

      // синхронизация размера canvas с видео
      if (bodySegmentationCanvas &&
        (bodySegmentationCanvas.width !== video.videoWidth ||
          bodySegmentationCanvas.height !== video.videoHeight)) {
        bodySegmentationCanvas.width = video.videoWidth;
        bodySegmentationCanvas.height = video.videoHeight;
      }

      // ОТРИСОВКА ТОЛЬКО КОНТУРА (середина остаётся прозрачной)
      if (bodySegmentationCanvas) {
        drawPersonContour(bodySegmentationCanvas, segmentation);
      }

    } catch (e) {
      console.error('Segmentation error:', e);
    }
  }, 100); // ~3 FPS
}

function stopPersonDetection() {
  if (bodySegmentationInterval) {
    clearInterval(bodySegmentationInterval);
    bodySegmentationInterval = null;
  }
  if (bodySegmentationCtx && bodySegmentationCanvas) {
    bodySegmentationCtx.clearRect(0, 0, bodySegmentationCanvas.width, bodySegmentationCanvas.height);
  }
}

// ===== УПРАВЛЕНИЕ ТЕМОЙ =====
function initThemeToggle() {
  const themeBtn = document.getElementById('theme-toggle');
  const html = document.documentElement;
  
  if (!themeBtn) {
    console.warn('⚠️ Theme toggle button not found');
    return;
  }

  //  SVG-иконки для тем
  const sunIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
  
  const moonIcon = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;

  // Вспомогательная функция: обновляет иконку и тултип
  function updateThemeButton(isDark) {
    //  Используем innerHTML для вставки SVG
    themeBtn.innerHTML = isDark ? sunIcon : moonIcon;
    
    // Берём перевод из словаря
    const key = isDark ? 'themeToggleLight' : 'themeToggleDark';
    themeBtn.title = translations[currentLang]?.[key] || (isDark ? 'Switch to light theme' : 'Switch to dark theme');
  }

  // Определяем желаемую тему
  const savedTheme = localStorage.getItem('theme');
  const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  let isDark = false;

  if (savedTheme === 'dark') {
    isDark = true;
  } else if (savedTheme === 'light') {
    isDark = false;
  } else {
    isDark = systemPrefersDark;
  }

  // Применяем тему при загрузке
  if (isDark) {
    html.setAttribute('data-theme', 'dark');
  } else {
    html.removeAttribute('data-theme');
  }
  updateThemeButton(isDark);

  // Обработчик клика по кнопке
  themeBtn.addEventListener('click', () => {
    isDark = !isDark;
    if (isDark) {
      html.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      html.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    }
    updateThemeButton(isDark);
    setTimeout(syncCusdisTheme, 100);
    console.log(`🎨 Theme: ${isDark ? 'dark' : 'light'}`);
  });
}

// ===== УПРАВЛЕНИЕ РАЗМЕРОМ КАМЕРЫ =====
let isCompactCamera = false;

function toggleCameraSize() {
  // Меняем ссылку на обёртку вместо видео
  const overlay = document.querySelector('.video-overlay');
  const wrapper = document.querySelector('.camera-wrapper');
  if (!overlay || !wrapper) return;

  isCompactCamera = !isCompactCamera;

  if (isCompactCamera) {
    overlay.style.maxWidth = '320px';
    wrapper.style.padding = '8px';
    //  используем перевод
    showStatus(translations[currentLang].notifyCompactMode, 'info');
  } else {
    overlay.style.maxWidth = '420px';
    wrapper.style.padding = '';
    //  используем перевод
    showStatus(translations[currentLang].notifyNormalMode, 'info');
  }
}

// ===== ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ ПОКАЗА СТАТУСА =====
function showStatus(message, type = 'info') {
  // Создаём временное уведомление если нет элемента
  let statusEl = document.getElementById('temp-status');

  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = 'temp-status';
    statusEl.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      padding: 10px 20px;
      border-radius: 8px;
      background: var(--bg-card);
      color: var(--text);
      box-shadow: var(--shadow);
      border: 1px solid var(--border);
      font-size: 13px;
      z-index: 1000;
      animation: statusFade 2s ease forwards;
    `;
    document.body.appendChild(statusEl);

    // Добавляем анимацию
    if (!document.getElementById('status-anim-style')) {
      const style = document.createElement('style');
      style.id = 'status-anim-style';
      style.textContent = `
        @keyframes statusFade {
          0%, 100% { opacity: 0; transform: translateX(-50%) translateY(10px); }
          10%, 90% { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }
  }

  // Обновляем текст и цвет
  const colors = {
    success: 'var(--success)',
    error: 'var(--danger)',
    info: 'var(--primary)',
    warning: 'var(--warning)'
  };

  statusEl.textContent = message;
  statusEl.style.borderColor = colors[type] || colors.info;
  statusEl.style.display = 'block';

  // Скрываем через 2 секунды
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 2000);
}

// ===== ФУНКЦИИ ДЛЯ ИНДИКАТОРОВ =====

// Показ/скрытие индикатора загрузки
function showLoadingIndicator(show) {
  const indicator = document.getElementById('loading-indicator');
  if (!indicator) return;

  if (show) {
    indicator.classList.add('active');
  } else {
    setTimeout(() => {
      indicator.classList.remove('active');
    }, 500); // Небольшая задержка для плавности
  }
}

// Проверка уровня освещения
function checkLightLevel(video) {
  if (!video || video.readyState < 2 || video.videoWidth === 0) return;

  // Инициализируем canvas один раз при первом вызове
  if (!lightCheckCanvas) {
    lightCheckCanvas = document.createElement('canvas');
    lightCheckCtx = lightCheckCanvas.getContext('2d', { willReadFrequently: true });
  }

  // Синхронизируем размер только если изменился
  if (lightCheckCanvas.width !== video.videoWidth || lightCheckCanvas.height !== video.videoHeight) {
    lightCheckCanvas.width = video.videoWidth;
    lightCheckCanvas.height = video.videoHeight;
  }

  // Рисуем текущий кадр
  lightCheckCtx.drawImage(video, 0, 0);

  // Получаем данные пикселей (берём центральный участок 50%x50%)
  const width = lightCheckCanvas.width;
  const height = lightCheckCanvas.height;
  const imageData = lightCheckCtx.getImageData(
    Math.floor(width * 0.25),
    Math.floor(height * 0.25),
    Math.floor(width * 0.5),
    Math.floor(height * 0.5)
  );
  const data = imageData.data;

  // Вычисляем среднюю яркость
  let brightness = 0;
  for (let i = 0; i < data.length; i += 4) {
    // Формула яркости: 0.299*R + 0.587*G + 0.114*B
    brightness += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
  }
  brightness /= (data.length / 4);

  // Показываем/скрываем предупреждение
  const warning = document.getElementById('lowlight-warning');
  if (warning) {
    if (brightness < LIGHT_THRESHOLD && !lowLightWarningDismissed) {
      warning.classList.add('active');
    } else {
      warning.classList.remove('active');
    }
  }
}

// Запуск периодической проверки освещения
function startLightCheck(video) {
  // Проверяем каждые 2 секунды
  lightCheckInterval = setInterval(() => {
    checkLightLevel(video);
  }, 2000);

  // Первая проверка через 1 секунду
  setTimeout(() => checkLightLevel(video), 1000);
}

// Остановка проверки освещения
function stopLightCheck() {
  if (lightCheckInterval) {
    clearInterval(lightCheckInterval);
    lightCheckInterval = null;
  }
  // Очищаем переиспользуемый canvas
  if (lightCheckCanvas && lightCheckCtx) {
    lightCheckCtx.clearRect(0, 0, lightCheckCanvas.width, lightCheckCanvas.height);
    lightCheckCanvas = null;
    lightCheckCtx = null;
  }
}

// Закрыть предупреждение о низком освещении
window.dismissLowLightWarning = function () {
  lowLightWarningDismissed = true;
  const warning = document.getElementById('lowlight-warning');
  if (warning) {
    warning.classList.remove('active');
  }
};

// Сброс состояния предупреждения (при перезапуске камеры)
function resetLowLightWarning() {
  lowLightWarningDismissed = false;
}

// ===== УПРАВЛЕНИЕ ЗВУКОМ =====
window.toggleSound = function () {
  soundEnabled = !soundEnabled;

  // Обновляем кнопку
  const btn = document.getElementById('btn-sound-toggle');
  if (btn) {
    btn.textContent = soundEnabled ? '🔊' : '🔇';
    btn.classList.toggle('muted', !soundEnabled);

    // Обновляем текст кнопки через локализацию
    const key = soundEnabled ? 'btnSoundOn' : 'btnSoundOff';
    if (translations[currentLang]?.[key]) {
      btn.setAttribute('data-i18n', key);
      btn.textContent = translations[currentLang][key] + (soundEnabled ? ' 🔊' : ' 🔇');
    }
  }

  // Сохраняем настройку
  localStorage.setItem('soundEnabled', soundEnabled);

  console.log(`🔇 Sound: ${soundEnabled ? 'ON' : 'OFF'}`);
};

// ===== СЛОВАРЬ ПЕРЕВОДОВ =====
const translations = {
  ru: {
    // Страница
    pageTitle: 'МИМИК',
    pageDescription: 'Тренажёр для обучения распознаванию эмоций',
    appTitle: 'МИМИК Тренажёр Эмоций',
	sensoryModeTitle: 'Режим снижения сенсорной нагрузки',
	
	filterAllTime: 'За всё время',
filterLast60Days: 'За последние 60 дней',
filterLast30Days: 'За последние 30 дней',
filterLast14Days: 'За последние 14 дней',
filterLast7Days: 'За последние 7 дней',

	
	stateNormal: 'Внимателен',
stateInterested: 'Вовлечён',
stateDrowsy: 'Сонлив',
stateDistracted: 'Отвлечён',

clearAdvancedStatsBtn: '🗑️ Очистить статистику',
confirmClearAdvancedStats: 'Вы уверены, что хотите очистить расширенную статистику? Это действие нельзя отменить.',
advancedStatsCleared: '🗑️ Статистика успешно очищена!',
	
	btnShowDiary: 'Мой дневник настроений',
diaryTitle: 'Как ты себя чувствовал?',
diarySubtitle: 'Выбери эмоцию, которую ты испытывал сегодня',
diaryThanksTitle: 'Спасибо!',
diaryThanksSubtitle: 'Твоё настроение сохранено в дневнике',
diaryHistoryTitle: 'Мой дневник настроений',
diaryHistoryEmpty: 'Пока здесь пусто. Записи появятся после тренировок.',
diaryClearBtn: '🗑️ Очистить дневник',
emotionNeutral: 'Спокойствие',
	
	btnDemoMode: 'Демо-режим (только камера)',
demoModeActive: 'Демо-режим активен',
demoModeExit: 'Выйти',
btnExitDemoText: 'Выйти из демо',
	
	themeToggleLight: 'Переключить на светлую тему',
themeToggleDark: 'Переключить на тёмную тему',
socialBtnTitle: 'Социальные сети',
burgerMenuTitle: 'Меню',
logoTooltip: 'Нажми на меня',
	
	advancedStatsBtn: 'Расширенная статистика',
advancedStatsTitle: 'Расширенная статистика эмоций',
emotionProfileTitle: 'Профиль эмоций',
emotionProfileDesc: 'Точность и скорость реакции по каждой эмоции',
legendAccuracy: 'Точность (%)',
legendSpeed: 'Скорость реакции',
detailedStatsTitle: 'Детальная статистика',
tableEmotion: 'Эмоция',
tableAttempts: 'Попытки',
tableCorrect: 'Верно',
tableAccuracy: 'Точность',
tableAvgTime: 'Ср. время (сек)',
emotionHappy: 'Радость',
emotionSad: 'Грусть',
emotionAngry: 'Злость',
emotionSurprised: 'Удивление',
emotionFearful: 'Страх',
emotionDisgusted: 'Отвращение',
	
	// Эхо-Зеркало
tileEchoMain: 'Временная петля',
tileEchoSub: 'Эмоции из прошлого',
echoTitle: '',
echoSubtitle: 'Выбери сценарий',
echoScenario1Name: 'Повтори свою эмоцию',
echoScenario1Desc: 'Покажи эмоцию → повтори её из окна в прошлое',
echoScenario2Name: 'Обратные эмоции',
echoScenario2Desc: 'Покажи эмоцию → покажи противоположную',
echoScenario3Name: 'Эмо-ритм',
echoScenario3Desc: 'Повторяй последовательность эмоций в ритме',
echoTaskRepeat: 'Повтори из окна в прошлое',
echoTaskOpposite: 'Покажи противоположную',
echoTaskRhythm: 'Повтори',
echoShowAny: 'Подожди...',
echoShowEmotion: 'Покажи эмоцию!',
echoShowEmotionRhythm: 'Покажи эмоцию',
echoHoldHint: 'Удерживай!',
echoFollowEcho: 'Повтори эмоцию и удержи 2 сек',
echoResultTitle: 'Тренировка завершена!',
echoStatScore: 'Баллов',
echoStatAccuracy: 'Точность',
echoStatBest: 'Рекорд',
echoBtnRetry: 'Ещё раз',
echoBtnExit: 'В меню',
echoCameraError: 'Не удалось получить доступ к камере',
echoPhase1: 'Покажи любую эмоцию и удержи 5 сек',
echoEmotionCaptured: 'Распознано',
echoHoldEmotion: 'Удерживай',
echoHold5: 'Удержи 5 сек!',
echoPause: 'Пауза...',
echoNowOpposite: 'Теперь покажи противоположную',
echoTaskNum: 'Задание',
echoShowAgain: 'Снова покажи',
echoHoldEmotionWithName: '✅ Удерживай',
echoLookAtEcho: 'Смотри на окно эхо!',
echoRepeatEmotion: '🔄 Повтори эмоцию',
echoEmotionInterrupted: '⚠️ Эмоция прервалась! Снова покажи',
	
	  // Эффекты камеры
  effectBgLabel: 'Цвет',
  effectBgTitle: 'Динамический фон',
  effectEchoLabel: 'Эхо',
  effectEchoTitle: 'Тайм-Дилей (Эхо)',
	
	saveProgress: 'Сохранить историю',
saveProgressTitle: 'Экспорт истории тренировок',
saveProgressGenerating: 'Генерация PDF...',
saveProgressSuccess: '✅ Файл сохранён!',
saveProgressError: '❌ Ошибка экспорта',
pdfHeader: 'МИМИК — История тренировок',
pdfGenerated: 'Сгенерировано:',
pdfSessions: 'Всего сессий:',
pdfBestStreak: 'Лучшая серия:',
pdfAvgAccuracy: 'Средняя точность:',
pdfFooter: 'Все данные хранятся локально на вашем устройстве.',
pdfSessionsTable: 'Детали сессий',
pdfDate: 'Дата',
pdfMode: 'Режим',
pdfAccuracy: 'Точность',
pdfStreak: 'Серия',
pdfDuration: 'Длительность',
pdfScore: 'Баллы',
pdfTotalAttempts: 'Попытки',
pdfCorrect: 'Верно',
	
    btnInstall: 'Установить',
	
	socialTitle: 'Приложение в соцсетях',
	
	menuProgress: 'История тренировок',
progressTitle: 'История тренировок',
statSessions: 'Сессий',
statBestStreak: 'Лучшая серия',
statAvgAccuracy: 'Средняя точность',
clearProgress: 'Очистить историю',
accuracyLabel: 'Точность (%)',
	
	tileDuelMain: 'Дуэль',
tileDuelSub: 'Соревнование эмоций',
duelStartBtn: 'Начали!',
//duelStatusPlaying: 'Покажите эмоцию: {emotion}!',
duelBannerText: 'Покажите эмоцию: {emotion}!',
duelStatusTwoPeople: '⚠️ Нужны два игрока в кадре',
duelStatusStreak: '🔥 Игрок {player}: серия {streak}!',
duelWinnerP1: '🏆 Победитель: Игрок 2!',
duelWinnerP2: '🏆 Победитель: Игрок 1!',
duelWinnerDraw: '🤝 Ничья! Отлично сыграли!',
duelBtnRetry: 'Ещё раз',
duelBtnExit: 'Выйти',
playerLeft: 'Игрок 1',
playerRight: 'Игрок 2',
vsBadge: 'VS',
duelTargetTo: 'до {score}',
	
	menuHelp: 'Помощь',
menuPrivacy: 'Приватность',
menuNews: 'Новости',
menuScience: 'Наука',
menuContact: 'Контакт',
menuReviews: 'Отзывы',
menuSupport: 'Поддержать',
	
	  tileTrainingMain: "Тренировка",
  tileTrainingSub: "Учимся эмоциям",
  tileDuetMain: "Дуэт",
  tileDuetSub: "Игра с другом",
  backToHome: "←",

    btnNews: 'Новости',
newsTitle: 'Новости и обновления',
newsLatest: 'Последние обновления',
newsItem1: 'Повышена стабильность загрузки нейросетевых моделей для распознавания лиц и эмоций',
newsItem2: 'Добавлен раздел научной литературы и сделаны небольшие улучшения интерфейса',
newsItem3: 'Теперь приложение может работать даже при отсутствии подключения к сети Интернет. Для этого добавлена кнопка Установить приложение. При повторном подключении приложение самостоятельно обновится до самой свежей версии',
newsItem4: 'Добавлен новый игровой режим Эмоциональных Дуэлей. Играйте вместе - кто правильнее, быстрее покажет и удержит эмоцию, тот и победил',
newsItem5: 'В раздел тренировок добавлена история обучения с графиком и метриками эффективности. Все данные хранятся локально и не передаются на сервер',
newsItem6: 'Добавлен эмоциональный аватар на экране видео в режиме тренировок',
newsItem7: 'Сохраняйте отчёты о тренировках в разделе Истории тренировок',
newsItem8: '09.07.2026: В режиме тренировки добавлены динамические фоны - кнопка на экране камеры. Теперь каждая эмоция имеет своё цветовое настроение',
newsItem9: '17.07.2026: Добавлен новый игровой режим "Временная петля", в котором можно увидеть свою эмоцию, показанную несколько секунд тому назад. Несколько сценариев с временной петлёй обучат повторять собственные эмоции быстро и эффективно',
newsItem10: '23.07.2026: Добавлена расширенная статистика в разделе Истории тренировок для терапевта',
newsItem11: '24.07.2026: Добавлен режим снижения сенсорной нагрузки в заголовке главной страницы. При включении данного режима выключаются все отвлекающие элеменnы - анимации и звук, позволяя лучше сосредоточиться на задаче, если это необходимо',
newsItem12: '01.08.2026: Добавлен новый эмоциональный дневник в разделе Истории тренировок. После каждого занятия в режиме тренировки можно оставить обратную связь о своём настроении. Добавлен Демо-режим для демонстрации распознавания эмоций в реальном времени в раздел меню Помощь. Эмоциональный аватар и динамические фоны остаются активны, но отключаются игровой режим и система баллов. Сделаны мелкие улучшения интерфейса и добавлен таймер тренировки',
newsItem13: '16.08.2026: На индикаторе лица в режиме тренировки добавлен новый индикатор текущего состояния внимания и сонливости (тестовый запуск и отладка нового алгоритма). Сделаны оптимизации интерфейса и повышена производительность',
newsPlanned: 'В разработке',
newsPlanned1: 'Новые игровые режимы и улучшения уже имеющихся функций',
newsPlanned2: 'Создание цифрового эмоционального портрета',
newsPlanned3: 'Десктопная версия приложения (PWA) для оффлайн-режима 💻',
newsNote: 'Следите за обновлениями!',

featuresTitle: 'Что ещё планируется сделать?',
featureItem1: 'Интеграция с Yandex/Google/Apple профилями',
featureItem2: '',
featureItem3: '',

faceDetected: 'Лицо обнаружено',
faceNotDetected: 'Лицо не обнаружено',

fallbackTitle: 'Требуется внимание',
fallbackCameraError: 'Камера не работает. Проверьте, подключено ли устройство и разрешён ли доступ к камере в настройках браузера.',
fallbackModelError: 'Нейросетевые модели не загрузились. Проверьте интернет-соединение или перезагрузите страницу.',
fallbackReloadBtn: '🔄 Перезагрузить страницу',

btnScience: 'Наука',
scienceTitle: 'Научные публикации',
scienceIntro: 'Исследования подтверждают эффективность компьютерных и технологических вмешательств для развития навыков распознавания эмоций у детей с РАС. Вот некоторые из рецензируемых научных работ:',
scienceArticle1Title: '1. Систематический обзор и мета-анализ IT-интервенций (2025)',
scienceArticle1Desc: 'Мета-анализ показал, что технологические интервенции имеют отличный эффект (Hedges\' g = 0.897) на социально-эмоциональную компетентность лиц с РАС.',
scienceArticle6Title: '2. Пошаговая цифровая игра для обучения эмоциям (2026)',
scienceArticle6Desc: 'Рандомизированное контролируемое исследование (36 детей, 3–10 лет) показало, что цифровая игра с иерархической структурой (на базе Теории разума) значительно улучшает точность распознавания эмоций, положительно влияет на базовые симптомы аутизма и снижает стресс родителей.',
scienceArticle3Title: '3. Обучение распознаванию эмоций у детей с аутизмом (2012)',
scienceArticle3Desc: 'Рандомизированное контролируемое исследование показало, что компьютерная программа обучения распознаванию эмоций значительно улучшает социальные навыки и понимание эмоций у детей с РАС.',
scienceArticle4Title: '4. Планшетное приложение для тренировки эмоций (2021)',
scienceArticle4Desc: 'Исследование продемонстрировало эффективность геймифицированного планшетного приложения для улучшения распознавания базовых эмоций и снижения тревожности у детей с аутизмом.',
scienceArticle5Title: '5. Автоматическое распознавание прогресса терапии через планшетные игры (2017)',
scienceArticle5Desc: 'Исследование показало, что поведенческие данные, собранные через специально разработанные планшетные игры (сенсоры касания, акселерометр, гироскоп), позволяют с точностью >80% распознавать прогресс терапии у детей с РАС. Выявлены ключевые параметры-предикторы успеха.',
scienceNote: 'Все статьи опубликованы в рецензируемых журналах и подтверждают, что цифровые тренажёры являются научно обоснованным методом поддержки при РАС.',
readArticle: 'Читать статью →',

    loadingModels: 'Загружаем нейросети... Пожалуйста, подождите',
    lowLightWarning: 'Низкое освещение! Модель может работать неточно',
    dismissWarning: 'Понятно',
    btnSoundOn: '',
    btnSoundOff: '',
    difficultyTooltip: `<strong>Настройка сложности</strong><br>Регулирует строгость распознавания мимики:<br>• <b>Easy (0.2)</b> — прощает лёгкие неточности<br>• <b>Medium (0.5)</b> — стандартный режим<br>• <b>Hard (0.92)</b> и удержание не менее 2 секунд — требует чёткого выражения`,
    walletHint: 'Проверьте номер кошелька перед отправкой - 4100119518078231',
    newRecordSuccess: '🏆 Новый рекорд!',
	progressNoData: 'Нет данных. Пройдите тренировку.',

    btnReviews: 'Отзывы',
    reviewsTitle: 'Отзывы и предложения',
    reviewsDesc: 'Поделитесь своим опытом использования тренажёра. Ваше мнение помогает проекту расти!',

    onboardingTitle: 'Добро пожаловать в МИМИК!',
    onboardingStep1: 'Выберите один из режимов и нажмите «Начать», чтобы включить камеру',
    onboardingHint1: 'Кнопка внизу блока с камерой',
    onboardingStep2: 'Посмотрите на эмоцию на экране слева',
    onboardingStep3: 'Постарайтесь показать такую же эмоцию перед камерой',
    onboardingStep4: 'При успехе получите баллы! ⭐',
    onboardingStep5: 'Переключайте эмоции стрелками ⬅️ ➡️',
    onboardingStep6: 'Играйте и тренируйтесь вместе в режиме Дуэт 👥',
    btnBack: 'Назад',
    btnNext: 'Далее',
    btnStart: 'Начать!',
    onboardingSkipped: 'Инструкцию можно открыть в любой момент через кнопку «Помощь» 💡',
    btnShowOnboarding: 'Показать инструкцию заново',

    // Кнопки
    btnStartCam: '🎥 Начать',
    btnStopCam: '⏹ Стоп',
    btnReset: '🔄 Сбросить баллы',
    btnCameraSize: '📐 Размер камеры',
    btnPrev: '⬅️',
    btnNext: '➡️',
    difficultyEasy: 'Легко',
    difficultyHard: 'Сложно',

    // Текст
    scoreLabel: '⭐',
    detectedLabel: 'Твоя эмоция:',
    cameraActive: 'Камера активна',
    footerText: '🔒 Все данные обрабатываются локально. Ничего не отправляется на сервер. © 2026 <a href="https://sites.google.com/view/dlazurenko" target="_blank" rel="noopener noreferrer" class="author-link">Дмитрий ЛАЗУРЕНКО</a>',

    // Обратная связь
    feedbackCorrect: '✅ Отлично! Правильно!',
    feedbackIncorrect: '🔄 Попробуй ещё раз. Показано:',

    // Эмоции (для отображения)
    emotionHappy: 'Радость',
    emotionSad: 'Грусть',
    emotionAngry: 'Злость',
    emotionSurprised: 'Удивление',
    emotionFearful: 'Страх',
    emotionDisgusted: 'Отвращение',

    // Статусы
    emotionNeutral: 'Нейтрально',
    statusHappy: 'Радость',
    statusSad: 'Грусть',
    statusAngry: 'Злость',
    statusSurprised: 'Удивление',
    statusFearful: 'Страх',
    statusDisgusted: 'Отвращение',

    // Уведомления
    notifyCameraError: '❌ Не удалось получить доступ к камере.\n\nПроверьте:\n• Разрешения браузера\n• Подключена ли камера',
    notifyCompactMode: '📐 Компактный режим',
    notifyNormalMode: '📐 Обычный режим',
    notifyScoreReset: 'Сбросить баллы?',

    btnDonate: '❤️ Поддержать',
    donateTitle: 'Поддержать проект',
    donateDesc: 'Использование сайта не требует какой-либо оплаты. Он создаётся одним разработчиком, чтобы помочь детям (в том числе с РАС) лучше понимать эмоции через игру. Ваша поддержка будет дополнительно содействовать росту и развитию проекта, а также позволит добавлять новые эмоции и уровни, улучшать точность распознавания и развивать функции для обучения',
    sbpHint: 'Отсканируйте QR в приложении банка',

    btnFeedback: 'Контакт',
    feedbackTitle: 'Напишите мне, если есть вопросы или предложения',
    btnWrite: '✉️ Написать',

    duelBtn: '👥 Дуэт',
    duelTitle: 'Режим Дуэт',
    duelDesc: 'Покажите эмоцию — партнёр должен повторить! Чем точнее совпадение, тем выше счёт.',
    duelStartBtn: 'Начать игру',
    duelStatusIdle: 'Ждём, пока кто-то покажет эмоцию...',
    duelStatusWaiting: '⏳ Ждём эмоцию от участника {num}...',
    duelStatusTwoPeople: '⚠️ Нужно два человека в кадре',
    duelStatusLost: '⚠️ Участник потерялся в кадре',
    duelResultExcellent: 'Отлично! Вы на одной волне!',
    duelResultGood: '🙂 Неплохо, но можно лучше',
    duelResultFail: '😅 Участник {num} показал {actual} вместо {expected}',
    duelBtnRetry: 'Ещё раз',
    duelBtnExit: 'Выйти',
    playerLeft: 'Участник 1',
    playerRight: 'Участник 2',
    vsBadge: 'VS',
	
		    confirmResetRecord: 'Сбросить рекорд?',
    recordReset: '🗑️ Рекорд сброшен!',
	
		// Портрет - заголовки
portraitTitle: 'Формирование портрета',
portraitProgressTitle: 'Динамика прогресса (Валидные сессии)',
portraitProgressDesc: 'Тренд точности по последним тренировкам длительностью >10 мин.',
portraitMatrixTitle: 'Матрица ошибок (Паттерны восприятия)',
portraitMatrixDesc: 'Какие эмоции путаются чаще всего. Красным выделены системные ошибки.',
portraitReportTitle: 'Заключение',

// Портрет - статус готовности
portraitNeedMore: 'Для формирования комплексного эмоционального профиля необходимо накопить опыт.',
portraitProgressLabel: 'Прогресс:',
portraitSessionsOf: 'из',
portraitValidSessions: 'полноценных тренировок (≥10 мин).',
portraitTotalSessions: 'Всего сессий:',
portraitContinueTraining: 'Продолжайте тренировки, и здесь появится график прогресса, матрица ошибок и заключение для специалиста.',

// Портрет - график тренда
portraitChartAccuracy: 'Точность (%)',
portraitChartSession: 'Номер сессии',

// Портрет - матрица ошибок
portraitNoErrors: 'Ошибок не зафиксировано. Отличный результат!',
portraitMatrixHeader: 'Цель ↓ / Показал →',
portraitEmotionHappy: 'Радость',
portraitEmotionSad: 'Грусть',
portraitEmotionAngry: 'Злость',
portraitEmotionSurprised: 'Удивление',
portraitEmotionFearful: 'Страх',
portraitEmotionDisgusted: 'Отвращение',

// Портрет - отчет
portraitReportIntro: 'Анализ динамики показывает',
portraitTrendImproving: 'стабильный прогресс',
portraitTrendDeclining: 'снижение результатов',
portraitTrendStable: 'стабильные результаты без выраженной динамики',
portraitTrendPercentUp: '(рост точности на',
portraitTrendPercentDown: '(падение на',
portraitTrendPeriod: 'за анализированный период)',
portraitInEmotionalIntelligence: 'в освоении эмоционального интеллекта.',
portraitFatigueDetected: 'Обнаружен признак когнитивного утомления: точность в длинных сессиях',
portraitFatigueShort: 'значительно ниже, чем в коротких подходах',
portraitFatigueRecommendation: 'Рекомендуется дробить тренировки на интервалы по 8-10 минут с перерывами.',
portraitNoFatigue: 'Пользователь демонстрирует высокую резистентность к утомлению, сохраняя концентрацию даже в длительных сессиях.',
portraitDataVolume: 'Общий объем данных:',
portraitDataSessions: 'сессий, из них',
portraitDataValid: 'полноценных тренировок (более 10 мин).',

    // Боковые панели
    btnHelp: "Помощь",
    btnPrivacy: "Приватность",
    helpTitle: "О РАС и тренажёре",
    helpWhatIsAutism: "Что такое РАС?",
    helpAutismDesc: "Расстройство аутистического спектра (РАС) — это особенность развития нервной системы, которая влияет на то, как человек воспринимает мир и взаимодействует с другими. Это не болезнь, а иной способ обработки информации.",
    helpEmotionDifficulty: "Сложности с эмоциями",
    helpEmotionDesc: "Дети с РАС часто испытывают трудности с:",
    helpEmotionItem1: "Распознаванием эмоций на лицах других людей",
    helpEmotionItem2: "Пониманием, что чувствует собеседник",
    helpEmotionItem3: "Выражением собственных эмоций через мимику",
    helpEmotionItem4: "Связью между внутренним состоянием и внешним выражением",
    helpHowTrainerHelps: "Как помогает тренажёр?",
    helpTrainerDesc: "Тренажёр «МИМИК» создан для развития эмоционального интеллекта:",
    helpTrainerItem1: "Показываем эмоцию — учимся её узнавать",
    helpTrainerItem2: "Камера распознаёт вашу мимику в реальном времени",
    helpTrainerItem3: "Система баллов мотивирует и показывает прогресс",
    helpTrainerItem4: "Повторение помогает закрепить навык",
    helpHowToUse: "Как пользоваться?",
    helpUseItem1: "Нажмите «Начать»",
    helpUseItem2: "Посмотрите на эмоцию на экране слева",
    helpUseItem3: "Постарайтесь показать такую же эмоцию",
    helpUseItem4: "При успехе получите баллы и ставьте рекорды! ⭐ Для сброса рекорда используйте комбинацию клавиш Ctrl+Alt+R",
    helpUseItem5: "Переключайте эмоции стрелками ⬅️ ➡️",
    helpUseItem6: "Режимы Дуэт и Дуэль позволит сделать занятия более интерактивными с наставником",
    helpNote: "💡Совет: Не торопитесь. Каждое повторение — маленький шаг к большому успеху!",
    privacyTitle: "🔒 Политика конфиденциальности",
    privacyDataCollection: "Сбор данных",
    privacyDataDesc: "Тренажёр «МИМИК» работает полностью в вашем браузере. Он не собирает, не хранит и не передаёт никакие персональные данные на серверы.",
    privacyCamera: "Использование камеры",
    privacyCameraDesc: "Камера используется только для распознавания эмоций в реальном времени. Видеопоток обрабатывается локально на вашем устройстве и никуда не отправляется.",
    privacyStorage: "Хранение данных",
    privacyStorageDesc: "На устройстве сохраняются только:",
    privacyStorageItem1: "Выбранный язык интерфейса",
    privacyStorageItem2: "Выбранная тема оформления",
    privacyStorageItem3: "Текущий счёт баллов (до перезагрузки страницы) и максимальный результат прошлых тренировок",
    privacyThirdParty: "Сторонние сервисы",
    privacyThirdPartyDesc: "Приложение использует следующие библиотеки:",
    privacyThirdPartyNote: "Эти библиотеки загружаются при первом запуске и работают локально без обращения ко внешним ресурсам. Они предназначены для машинного обучения в браузере, сегментации тела и распознавания лиц и эмоций. Приложение работает как в мобильной, так и в десктопной версии, но может потребоваться некоторое время на загрузку моделей. Просто, немного подождите и всё запустится. Мобильная версия сайта создана для ознакомления, поэтому для обучения и тренировок лучше всего использовать десктопную версию",
    privacyChildren: "Данные детей",
    privacyChildrenDesc: "Тренажёр предназначен для использования под наблюдением взрослых. Данные о детях не собираются.",
    privacyChanges: "Изменения политики",
    privacyChangesDesc: "Оставляю за собой право обновлять данную политику. Актуальная версия всегда доступна на данной странице.",
    privacyContact: "По вопросам конфиденциальности или сотрудничества обращайтесь к разработчику - mityasky@ya.ru",
    privacyVersion: "Версия политики: 1.0 | Обновлено: Апрель 2026",
    "emotion-image-alt": "Целевая эмоция"
  },
  en: {
    // Page
    pageTitle: 'MIMIC',
    pageDescription: 'Trainer for learning emotion recognition',
    appTitle: 'MIMIC Emotion Trainer',
	sensoryModeTitle: 'Sensory-Friendly Mode',
	
	filterAllTime: 'All time',
filterLast60Days: 'Last 60 days',
filterLast30Days: 'Last 30 days',
filterLast14Days: 'Last 14 days',
filterLast7Days: 'Last 7 days',

	
	stateNormal: 'Focused',
stateInterested: 'Involved',
stateDrowsy: 'Drowsy',
stateDistracted: 'Distracted',

clearAdvancedStatsBtn: '🗑️ Clear statistics',
confirmClearAdvancedStats: 'Are you sure you want to clear advanced statistics? This action cannot be undone.',
advancedStatsCleared: '🗑️ Statistics cleared successfully!',
	
	btnShowDiary: 'My Mood Diary',
diaryTitle: 'How did you feel?',
diarySubtitle: 'Choose the emotion you experienced today',
diaryThanksTitle: 'Thank you!',
diaryThanksSubtitle: 'Your mood has been saved to the diary',
diaryHistoryTitle: 'My Mood Diary',
diaryHistoryEmpty: 'Nothing here yet. Entries will appear after training sessions.',
diaryClearBtn: '🗑️ Clear diary',
emotionNeutral: 'Calm',
	
	btnDemoMode: 'Demo Mode (camera only)',
demoModeActive: 'Demo mode active',
demoModeExit: 'Exit',
btnExitDemoText: 'Exit demo',
	
	themeToggleLight: 'Switch to light theme',
themeToggleDark: 'Switch to dark theme',
socialBtnTitle: 'Social media',
burgerMenuTitle: 'Menu',
logoTooltip: 'Click on me',
	
	advancedStatsBtn: 'Advanced Statistics',
advancedStatsTitle: 'Advanced Emotion Statistics',
emotionProfileTitle: 'Emotion Profile',
emotionProfileDesc: 'Accuracy and reaction speed per emotion',
legendAccuracy: 'Accuracy (%)',
legendSpeed: 'Reaction Speed',
detailedStatsTitle: 'Detailed Statistics',
tableEmotion: 'Emotion',
tableAttempts: 'Attempts',
tableCorrect: 'Correct',
tableAccuracy: 'Accuracy',
tableAvgTime: 'Avg Time (sec)',

  emotionHappy: 'Happy',
  emotionSad: 'Sad',
  emotionAngry: 'Angry',
  emotionSurprised: 'Surprised',
  emotionFearful: 'Fear',
  emotionDisgusted: 'Disgust',
	
	// Echo Mirror
tileEchoMain: 'Time Loop',
tileEchoSub: 'Emotions from the past',
echoTitle: '',
echoSubtitle: 'Choose scenario',
echoScenario1Name: 'Repeat your emotion',
echoScenario1Desc: 'Repeat it from the window to the past',
echoScenario2Name: 'Reverse emotions',
echoScenario2Desc: 'Show emotion → show the opposite',
echoScenario3Name: 'Emo-Rhythm',
echoScenario3Desc: 'Follow the sequence of emotions in rhythm',
echoTaskRepeat: 'Repeat from the window into the past',
echoTaskOpposite: 'Show opposite',
echoTaskRhythm: 'Repeat',
echoShowAny: 'Wait...',
echoShowEmotion: 'Show emotion!',
echoShowEmotionRhythm: 'Show emotion',
echoHoldHint: 'Hold it!',
echoFollowEcho: 'Repeat the emotion and hold for 2 seconds',
echoResultTitle: 'Training complete!',
echoStatScore: 'Points',
echoStatAccuracy: 'Accuracy',
echoStatBest: 'Best',
echoBtnRetry: 'Try again',
echoBtnExit: 'To menu',
echoCameraError: 'Could not access camera',
echoPhase1: 'Show any emotion and hold for 5 sec',
echoEmotionCaptured: 'Detected',
echoHoldEmotion: 'Hold',
echoHold5: 'Hold for 5 sec!',
echoPause: 'Pause...',
echoNowOpposite: 'Now show the opposite',
echoTaskNum: 'Task',
echoShowAgain: 'Show again',
echoHoldEmotionWithName: '✅ Hold',
echoLookAtEcho: 'Look at the echo window!',
echoRepeatEmotion: '🔄 Repeat the emotion',
echoEmotionInterrupted: '⚠️ Emotion interrupted! Show again',
	
	  // Camera effects
  effectBgLabel: 'Color',
  effectBgTitle: 'Dynamic Background',
  effectEchoLabel: 'Echo',
  effectEchoTitle: 'Time Delay (Echo)',
	
	saveProgress: 'Save History',
saveProgressTitle: 'Training History Export',
saveProgressGenerating: 'Generating PDF...',
saveProgressSuccess: '✅ File saved!',
saveProgressError: '❌ Export failed',
pdfHeader: 'MIMIC — Training History',
pdfGenerated: 'Generated:',
pdfSessions: 'Total sessions:',
pdfBestStreak: 'Best streak:',
pdfAvgAccuracy: 'Avg accuracy:',
pdfFooter: 'All data is stored locally on your device.',
pdfSessionsTable: 'Session Details',
pdfDate: 'Date',
pdfMode: 'Mode',
pdfAccuracy: 'Accuracy',
pdfStreak: 'Streak',
pdfDuration: 'Duration',
pdfScore: 'Score',
pdfTotalAttempts: 'Attempts',
pdfCorrect: 'Correct',
	
	 btnInstall: 'Install app',
	 socialTitle: 'Follow us',
	 
	 menuProgress: 'Training History',
progressTitle: 'Training History',
statSessions: 'Sessions',
statBestStreak: 'Best Streak',
statAvgAccuracy: 'Avg Accuracy',
clearProgress: 'Clear History',
accuracyLabel: 'Accuracy (%)',
	 
	 tileDuelMain: 'Duel',
tileDuelSub: 'Emotion Challenge',
duelStartBtn: 'Let\'s Go!',
//duelStatusPlaying: 'Show emotion: {emotion}!',
duelBannerText: 'Show emotion: {emotion}!',
duelStatusTwoPeople: '⚠️ Two players needed in frame',
duelStatusStreak: '🔥 Player {player}: {streak} streak!',
duelWinnerP1: '🏆 Winner: Player 2!',
duelWinnerP2: '🏆 Winner: Player 1!',
duelWinnerDraw: '🤝 Draw! Great game!',
duelBtnRetry: 'Play Again',
duelBtnExit: 'Exit',
playerLeft: 'Player 1',
playerRight: 'Player 2',
vsBadge: 'VS',
duelTargetTo: 'to {score}',
	 
	 menuHelp: 'Help',
menuPrivacy: 'Privacy',
menuNews: 'News',
menuScience: 'Science',
menuContact: 'Contact',
menuReviews: 'Reviews',
menuSupport: 'Support',
progressNoData: 'No data yet. Complete a training session.',
	 
	   tileTrainingMain: "Training",
  tileTrainingSub: "Learn Emotions",
  tileDuetMain: "Duet",
  tileDuetSub: "Play with a Friend",
  backToHome: "←",

    btnNews: 'News',
newsTitle: 'News & Updates',
newsLatest: 'Latest Updates',
newsItem1: 'Improved stability of neural network model loading for face and emotion recognition',
newsItem2: 'A scientific literature section has been added and minor interface improvements have been made',
newsItem3: 'The app can now work even without an internet connection. For this purpose, the Install app button has been added. Upon reconnecting, the app will automatically update to the latest version',
newsItem4: 'A new game mode, Emotional Duels, has been added. Play together – whoever is more accurate, shows and maintains their emotion faster wins',
newsItem5: 'The training section now includes a training history with a graph and performance metrics. All data is stored locally and is not transmitted to the server',
newsItem6: 'An emotional avatar has been added to the video screen in training mode',
newsItem7: 'Save your training reports in the progress section',
newsItem8: 'July 9, 2026: Dynamic backgrounds have been added to Training Mode via the button on the camera screen. Now each emotion has its own color mood',
newsItem9: 'July 17, 2026: A new game mode, "Time Loop," has been added, allowing you to see your emote displayed just seconds ago. Several time loop scenarios will teach you how to quickly and effectively replicate your own emotions',
newsItem10: 'July 23, 2026: Expanded statistics added to the Training History section for therapist',
newsItem11: 'July 24, 2026: A Sensory-Friendly mode has been added to the main page header. Enabling this mode turns off all distracting elements such as animations and sound—allowing for better focus on the task at hand when needed',
newsItem12: 'August 01, 2026: A new mood tracker has been added to the Training History section. After each training session, you can provide feedback on your mood. A new Demo mode to showcase real-time emotion recognition in the Help section was added. The emotional avatar and dynamic backgrounds remain active, but the game mode and scoring system are disabled. Minor interface improvements were made, and a training timer was added',
newsItem13: 'August 16, 2026: A new indicator showing the current state of attention and drowsiness has been added to the face display in training mode (test run and debugging of the new algorithm). Interface optimizations have been implemented, and performance has been improved',
newsPlanned: 'In Development',
newsPlanned1: 'New game modes and improvements to existing features',
newsPlanned2: 'Digital emotional portrait creation',
newsPlanned3: 'Desktop app (PWA) for offline mode 💻',
newsNote: 'Stay tuned with update!',

featuresTitle: 'Upcoming Features',
featureItem1: 'Integration with Yandex/Google/Apple profiles',
featureItem2: '',
featureItem3: '',

faceDetected: 'Person detected',
faceNotDetected: 'No person',

fallbackTitle: 'Attention Required',
fallbackCameraError: 'Camera is not working. Please check device connection and browser permissions.',
fallbackModelError: 'Neural network models failed to load. Check your internet connection or reload the page.',
fallbackReloadBtn: '🔄 Reload Page',

btnScience: 'Science',
scienceTitle: 'Scientific Publications',
scienceIntro: 'Research confirms the effectiveness of computer-based and technological interventions for developing emotion recognition skills in children with ASD. Here are some peer-reviewed scientific papers:',
scienceArticle1Title: '1. Systematic Review and Meta-Analysis of IT Interventions (2025)',
scienceArticle1Desc: 'Meta-analysis showed that technology-based interventions have an excellent effect (Hedges\' g = 0.897) on socio-emotional competence in individuals with ASD.',
scienceArticle6Title: '2. Stepped-Care Digital Game for Emotion Training (2026)',
scienceArticle6Desc: 'A randomized controlled trial (36 children, ages 3–10) demonstrated that a hierarchically structured digital game (based on Theory of Mind framework) significantly improves emotion recognition accuracy, positively impacts core autism traits, and reduces parenting stress.',
scienceArticle3Title: '3. Teaching Emotion Recognition to Children with Autism (2012)',
scienceArticle3Desc: 'A randomized controlled trial showed that a computer-based emotion recognition program significantly improves social skills and emotion understanding in children with ASD.',
scienceArticle4Title: '4. Tablet-Based Emotion Training App (2021)',
scienceArticle4Desc: 'The study demonstrated the effectiveness of a gamified tablet app for improving basic emotion recognition and reducing anxiety in children with autism.',
scienceArticle5Title: '5. Automatic Recognition of Therapy Progress via Tablet Games (2017)',
scienceArticle5Desc: 'The study demonstrated that behavioural data collected through specially designed tablet games (touch sensors, accelerometer, gyroscope) can recognise therapy progress in children with ASD with >80% accuracy. Key predictive parameters were identified.',
scienceNote: 'All articles are published in peer-reviewed journals and confirm that digital facial expression trainers are an evidence-based support method for ASD.',
readArticle: 'Read Article →',

    loadingModels: 'Loading neural networks... Please wait',
    lowLightWarning: 'Low light! Model may work inaccurately',
    dismissWarning: 'Got it',
    btnSoundOn: '',
    btnSoundOff: '',
    difficultyTooltip: `<strong>Difficulty Settings</strong><br>Adjusts facial recognition strictness:<br>• <b>Easy (0.2)</b> — forgives slight inaccuracies<br>• <b>Medium (0.5)</b> — standard mode<br>• <b>Hard (0.92)</b> and hold for at least 2 seconds — requires clear expression`,
    walletHint: 'Check the wallet number before sending - 4100119518078231',
    newRecordSuccess: '🏆 New Record!',

    btnReviews: 'Feedback',
    reviewsTitle: 'Reviews & Feedback',
    reviewsDesc: 'Share your experience with the trainer. Your feedback helps the project grow!',

    onboardingTitle: 'Welcome to MIMIC!',
    onboardingStep1: 'Select the mode and click "Start" to enable camera',
    onboardingHint1: 'Button at the bottom of camera panel',
    onboardingStep2: 'Look at the emotion on the left screen',
    onboardingStep3: 'Try to show the same emotion to the camera',
    onboardingStep4: 'Get points on success! ⭐',
    onboardingStep5: 'Switch emotions with arrows ⬅️ ➡️',
    onboardingStep6: 'Play and train together in Duet mode 👥',
    btnBack: 'Back',
    btnNext: 'Next',
    btnStart: 'Let\'s Go!',
    onboardingSkipped: 'You can open this tutorial anytime via "Help" button 💡',
    btnShowOnboarding: 'Show tutorial again',

    // Buttons
    btnStartCam: '🎥 Start',
    btnStopCam: '⏹ Stop',
    btnReset: '🔄 Reset Score',
    btnCameraSize: '📐 Camera Size',
    btnPrev: '⬅️',
    btnNext: '➡️',
    difficultyEasy: 'Easy',
    difficultyHard: 'Hard',

    // Text
    scoreLabel: '⭐',
    detectedLabel: 'Your emotion:',
    cameraActive: 'Camera active',
    footerText: '🔒 All data is processed locally. Nothing is sent to the server. © 2026 prod by <a href="https://sites.google.com/view/dlazurenko" target="_blank" rel="noopener noreferrer" class="author-link">Dmitry LAZURENKO</a>',

    // Feedback
    feedbackCorrect: '✅ Great! Correct!',
    feedbackIncorrect: '🔄 Try again. Shown:',

    // Emotions (for display)
    emotionHappy: 'Happiness',
    emotionSad: 'Sadness',
    emotionAngry: 'Anger',
    emotionSurprised: 'Surprise',
    emotionFearful: 'Fear',
    emotionDisgusted: 'Disgust',

    // Statuses
    emotionNeutral: 'Neutral',
    statusHappy: 'Happy',
    statusSad: 'Sad',
    statusAngry: 'Angry',
    statusSurprised: 'Surprised',
    statusFearful: 'Fearful',
    statusDisgusted: 'Disgusted',

    // Notifications
    notifyCameraError: '❌ Could not access camera.\n\nPlease check:\n• Browser permissions\n• Is camera connected',
    notifyCompactMode: '📐 Compact mode',
    notifyNormalMode: '📐 Normal mode',
    notifyScoreReset: 'Reset score?',

    btnFeedback: 'Contact',
    feedbackTitle: 'Write to me if you have questions or suggestions',
    btnWrite: '✉️ Contact',

    duelBtn: '👥 Duet',
    duelTitle: 'Duet Mode',
    duelDesc: 'Show an emotion — your partner must repeat it! The more accurate the match, the higher the score.',
    duelStartBtn: 'Start Game',
    duelStatusIdle: 'Waiting for someone to show an emotion...',
    duelStatusWaiting: '⏳ Waiting for emotion from player {num}...',
    duelStatusTwoPeople: '⚠️ Two people needed in frame',
    duelStatusLost: '⚠️ Player lost in frame',
    duelResultExcellent: 'Great! You are in sync!',
    duelResultGood: '🙂 Not bad, but can be better',
    duelResultFail: '😅 Player {num} showed {actual} instead of {expected}',
    duelBtnRetry: 'Try Again',
    duelBtnExit: 'Exit',
    playerLeft: 'Player 1',
    playerRight: 'Player 2',
    vsBadge: 'VS',

    btnDonate: '❤️ Support',
    donateTitle: 'Support the project',
    donateDesc: 'Using the site is completely free. It is created by a single developer to help children (including those with ASD) better understand emotions through play. Your support will further contribute to the growth and development of the project, and will help add new emotions and levels, improve recognition accuracy, and expand learning features',
    sbpHint: 'Scan QR in your banking app',
	
		    confirmResetRecord: 'Reset high score?',
    recordReset: '🗑️ High score reset!',
	
		// Portrait - headers
portraitTitle: 'Portrait Formation',
portraitProgressTitle: 'Progress Dynamics (Valid Sessions)',
portraitProgressDesc: 'Accuracy trend for the last training sessions longer than 10 min.',
portraitMatrixTitle: 'Error Matrix (Perception Patterns)',
portraitMatrixDesc: 'Which emotions are confused most often. Systematic errors are highlighted in red.',
portraitReportTitle: 'Report',

// Portrait - readiness status
portraitNeedMore: 'To form a comprehensive emotional profile, experience needs to be accumulated.',
portraitProgressLabel: 'Progress:',
portraitSessionsOf: 'of',
portraitValidSessions: 'complete training sessions (≥10 min).',
portraitTotalSessions: 'Total sessions:',
portraitContinueTraining: 'Continue training, and a progress chart, error matrix, and specialist report will appear here.',

// Portrait - trend chart
portraitChartAccuracy: 'Accuracy (%)',
portraitChartSession: 'Session Number',

// Portrait - error matrix
portraitNoErrors: 'No errors recorded. Excellent result!',
portraitMatrixHeader: 'Target ↓ / Shown →',
portraitEmotionHappy: 'Happiness',
portraitEmotionSad: 'Sadness',
portraitEmotionAngry: 'Anger',
portraitEmotionSurprised: 'Surprise',
portraitEmotionFearful: 'Fear',
portraitEmotionDisgusted: 'Disgust',

// Portrait - report
portraitReportIntro: 'Dynamics analysis shows',
portraitTrendImproving: 'stable progress',
portraitTrendDeclining: 'declining results',
portraitTrendStable: 'stable results without significant dynamics',
portraitTrendPercentUp: '(accuracy increase of',
portraitTrendPercentDown: '(decrease of',
portraitTrendPeriod: 'over the analyzed period)',
portraitInEmotionalIntelligence: 'in emotional intelligence acquisition.',
portraitFatigueDetected: 'Signs of cognitive fatigue detected: accuracy in long sessions',
portraitFatigueShort: 'is significantly lower than in short approaches',
portraitFatigueRecommendation: 'It is recommended to break training into 8-10 minute intervals with breaks.',
portraitNoFatigue: 'The user demonstrates high resistance to fatigue, maintaining concentration even in long sessions.',
portraitDataVolume: 'Total data volume:',
portraitDataSessions: 'sessions, of which',
portraitDataValid: 'are complete training sessions (more than 10 min).',

    btnHelp: "Help",
    btnPrivacy: "Privacy",
    helpTitle: "About ASD & Trainer",
    helpWhatIsAutism: "What is ASD?",
    helpAutismDesc: "Autism Spectrum Disorder (ASD) is a neurological developmental difference that affects how a person perceives the world and interacts with others. It's not a disease, but a different way of processing information.",
    helpEmotionDifficulty: "Emotion Difficulties",
    helpEmotionDesc: "Children with ASD often experience challenges with:",
    helpEmotionItem1: "Recognizing emotions on other people's faces",
    helpEmotionItem2: "Understanding what the other person is feeling",
    helpEmotionItem3: "Expressing their own emotions through facial expressions",
    helpEmotionItem4: "Linking internal state with external expression",
    helpHowTrainerHelps: "How does the trainer help?",
    helpTrainerDesc: "MIMIC trainer is designed to develode an emotional intelligence:",
    helpTrainerItem1: "We show an emotion — you learn to recognize it",
    helpTrainerItem2: "Camera detects your facial expressions in real time",
    helpTrainerItem3: "Scoring system motivates and tracks progress",
    helpTrainerItem4: "Repetition helps consolidate the skill",
    helpHowToUse: "How to use?",
    helpUseItem1: "Click \"Start Cam\"",
    helpUseItem2: "Look at the emotion displayed at the left",
    helpUseItem3: "Try to mirror the same emotion",
    helpUseItem4: "Success earns points and set records! ⭐ To reset the record, use the key combination Ctrl+Alt+R",
    helpUseItem5: "Switch emotions with arrows ⬅️ ➡️",
    helpUseItem6: "Duet and Duel modes makes sessions more interactive with a mentor",
    helpNote: "💡Tip: Take your time. Every repetition is a small step towards big success!",
    privacyTitle: "🔒 Privacy Policy",
    privacyDataCollection: "Data Collection",
    privacyDataDesc: "The MIMIC trainer runs entirely in your browser. We do not collect, store, or transmit any personal data to servers.",
    privacyCamera: "Camera Usage",
    privacyCameraDesc: "The camera is used solely for real-time emotion recognition. The video feed is processed locally on your device and is never sent elsewhere.",
    privacyStorage: "Data Storage",
    privacyStorageDesc: "Only the following are saved locally:",
    privacyStorageItem1: "Selected interface language",
    privacyStorageItem2: "Selected theme",
    privacyStorageItem3: "Current score (until page reload) and the maximum result of previous training sessions",
    privacyThirdParty: "Third-Party Services",
    privacyThirdPartyDesc: "The app uses the following libraries:",
    privacyThirdPartyNote: "These libraries are loaded on first startup and run locally without accessing external resources. They are designed for machine learning in the browser, body segmentation, and facial and emotion recognition. The app works on both mobile and desktop versions, but it may take some time to load the models. Just wait a bit, and everything will start working. The mobile version of the site is designed for informational purposes, so it is best to use the desktop version for learning and practice.",
    privacyChildren: "Children's Data",
    privacyChildrenDesc: "The trainer is intended for use under adult supervision. We do not collect data from children.",
    privacyChanges: "Policy Updates",
    privacyChangesDesc: "I reserve the right to update this policy. The latest version is always available in the app.",
    privacyContact: "Contact: For privacy inquiries or collaboration, please contact the developer - mityasky@ya.ru",
    privacyVersion: "Policy Version: 1.0 | Updated: April 2026",
    "emotion-image-alt": "Target Emotion"
  }
};

// ===== FALLBACK UX =====
let fallbackShown = false; // Защита от повторных показов
window.showCriticalFallback = function(type) {
  if (fallbackShown) return;
  fallbackShown = true;
  
  const overlay = document.getElementById('critical-fallback');
  const titleEl = document.getElementById('fallback-title');
  const msgEl = document.getElementById('fallback-message');
  if (!overlay) return;

  titleEl.textContent = translations[currentLang].fallbackTitle;
  msgEl.textContent = type === 'camera' ? translations[currentLang].fallbackCameraError : translations[currentLang].fallbackModelError;
  
  overlay.hidden = false;
  console.warn(`⚠️ Critical fallback triggered: ${type}`);
};

// ===== ЛОГИКА БОКОВЫХ ПАНЕЛЕЙ =====
window.toggleInfoPanel = function(type) {
  const panelId = `${type}-panel`;
  const panel = document.getElementById(panelId);
  
  if (!panel) {
    console.warn(`⚠️ Панель с ID "${panelId}" не найдена в DOM. Проверьте HTML.`);
    return;
  }

  const isActive = panel.classList.contains('active');
  
  // Закрываем все открытые панели
  document.querySelectorAll('.info-panel').forEach(p => p.classList.remove('active'));
  
  // Открываем нужную, если она была закрыта
  if (!isActive) {
    panel.classList.add('active');
    console.log(`✅ Панель открыта: ${panelId}`);
  }

  // Автоматически скрываем бургер-меню после выбора
  const mainMenu = document.getElementById('main-menu');
  if (mainMenu) mainMenu.classList.add('hidden');
};

// Делегирование кликов по кнопкам меню (вместо inline onclick)
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.menu-item[data-panel]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const panelType = e.currentTarget.dataset.panel;
      toggleInfoPanel(panelType);
    });
  });
});

// Текущий язык
let currentLang = 'ru';

// ===== ФУНКЦИЯ ПЕРЕВОДА =====
function translatePage(lang) {
  document.documentElement.lang = lang;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[lang]?.[key]) {

      // СПЕЦИАЛЬНО ДЛЯ ФУТЕРА: разрешаем HTML (ссылки)
      if (key === 'footerText' || key === 'difficultyTooltip') {
        el.innerHTML = translations[lang][key];
      }
      // Для input placeholder
      else if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.hasAttribute('placeholder')) {
        el.placeholder = translations[lang][key];
      }
      // Для alt текста
      else if (el.tagName === 'IMG' && el.hasAttribute('alt')) {
        el.alt = translations[lang][key];
      }
      // Обычный текст (безопасно)
      else {
        el.textContent = translations[lang][key];
      }
    }
  });
  
  function applyTranslations() {
  // Обновляем textContent для элементов с data-i18n
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[currentLang] && translations[currentLang][key]) {
      el.textContent = translations[currentLang][key];
    }
  });
  
  //  Обновляем title для элементов с data-i18n-title
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    if (translations[currentLang] && translations[currentLang][key]) {
      el.setAttribute('title', translations[currentLang][key]);
    }
  });
}
  
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
  const key = el.getAttribute('data-i18n-title');
  if (translations[lang]?.[key]) {
    el.title = translations[lang][key];
  }
});

  // Обновляем title страницы
  if (translations[lang]?.pageTitle) {
    document.title = translations[lang].pageTitle;
  }

  // Обновляем кнопку языка
  const langBtn = document.getElementById('lang-toggle');
  if (langBtn) {
    langBtn.textContent = lang === 'ru' ? 'RU' : 'ENG';
    langBtn.title = lang === 'ru' ? 'Switch to English' : 'Переключить на русский';
  }

  const duelStartBtn = document.getElementById('duel-start-btn');
  if (duelStartBtn && translations[lang]?.duelStartBtn) {
    duelStartBtn.innerHTML = `🎥 ${translations[lang].duelStartBtn}`;
  }

  // Сохраняем выбор в localStorage
  localStorage.setItem('preferredLang', lang);

  console.log(`🌐 Language switched to: ${lang}`);
}

// ===== ПЕРЕКЛЮЧЕНИЕ ЯЗЫКА =====
function toggleLanguage() {
  currentLang = currentLang === 'ru' ? 'en' : 'ru';
  translatePage(currentLang);

  // ОБНОВЛЯЕМ ТОЛЬКО ТЕКСТ эмоции, не меняя картинку
  const emotion = EMOTIONS[currentEmotionIndex];
  const emotionKey = emotion.key.charAt(0).toUpperCase() + emotion.key.slice(1);
  const emotionName = translations[currentLang]?.[`emotion${emotionKey}`] || emotion.name;

  // Обновляем заголовок эмоции
  document.getElementById('emotion-name').textContent = `${emotionName} ${emotion.emoji}`;

  // Если была активная обратная связь, обновим её текст на новом языке
  const feedbackEl = document.getElementById('feedback');
  if (feedbackEl.textContent && !feedbackEl.classList.contains('correct')) {
    const emotionNameForFeedback = translations[currentLang][`emotion${emotionKey}`];
    feedbackEl.textContent = `${translations[currentLang].feedbackIncorrect} ${emotionNameForFeedback} ${emotion.emoji}`;
  }
}

// ===== SENSORY-FRIENDLY MODE =====
let sensoryFriendlyMode = false;

function initSensoryMode() {
  const saved = localStorage.getItem('sensoryFriendlyMode');
  if (saved !== null) {
    sensoryFriendlyMode = saved === 'true';
  }
  
  // Применяем режим при загрузке
  if (sensoryFriendlyMode) {
    document.body.classList.add('sensory-friendly');
    const btn = document.getElementById('sensory-toggle');
    if (btn) btn.classList.add('active');
  }
}

window.toggleSensoryMode = function() {
  sensoryFriendlyMode = !sensoryFriendlyMode;
  localStorage.setItem('sensoryFriendlyMode', sensoryFriendlyMode);
  
  // Переключаем класс на body
  document.body.classList.toggle('sensory-friendly', sensoryFriendlyMode);
  
  // Обновляем кнопку
  const btn = document.getElementById('sensory-toggle');
  if (btn) btn.classList.toggle('active', sensoryFriendlyMode);
  
  // Если включаем режим — отключаем динамические фоны
  if (sensoryFriendlyMode && typeof DynamicBackgroundModule !== 'undefined') {
    DynamicBackgroundModule.disable();
  }
  
  console.log(`🌿 Sensory-Friendly Mode: ${sensoryFriendlyMode ? 'ON' : 'OFF'}`);
};

// ===== ИНИЦИАЛИЗАЦИЯ ЗВУКА =====
function initSound() {
  const saved = localStorage.getItem('soundEnabled');
  if (saved !== null) {
    soundEnabled = saved === 'true';
  }

  // Обновляем кнопку при старте
  const btn = document.getElementById('btn-sound-toggle');
  if (btn) {
    btn.textContent = soundEnabled ? '🔊' : '🔇';
    btn.classList.toggle('muted', !soundEnabled);
    const key = soundEnabled ? 'btnSoundOn' : 'btnSoundOff';
    if (translations[currentLang]?.[key]) {
      btn.setAttribute('data-i18n', key);
    }
  }
}


// ===== ИНИЦИАЛИЗАЦИЯ ЯЗЫКА =====
function initLanguage() {
  const savedLang = localStorage.getItem('preferredLang');
  const browserLang = navigator.language?.split('-')[0] || 'ru';

  // Приоритет: сохранённый > браузерный > русский по умолчанию
  if (savedLang && translations[savedLang]) {
    currentLang = savedLang;
  } else if (translations[browserLang]) {
    currentLang = browserLang;
  } else {
    currentLang = 'ru';
  }

  // Применяем перевод
  translatePage(currentLang);

  // Добавляем обработчик кнопки
  const langBtn = document.getElementById('lang-toggle');
  if (langBtn) {
    langBtn.addEventListener('click', toggleLanguage);
  }

if (typeof AdvancedStatsModule !== 'undefined') {
  AdvancedStatsModule.onLanguageChange();
}

  console.log(`🌐 Language initialized: ${currentLang}`);
}

// ===== ИНИЦИАЛИЗАЦИЯ ПОЛЗУНКА СЛОЖНОСТИ =====
function initDifficultySlider() {
  const slider = document.getElementById('difficulty-slider');
  const tooltip = document.getElementById('diff-tooltip');
  const infoBtn = document.getElementById('diff-info-btn');

  if (!slider) return;

  // Обновление порога при перетаскивании
  slider.addEventListener('input', (e) => {
    const level = parseInt(e.target.value);
    detectionThreshold = DIFFICULTY_THRESHOLDS[level];
  });

  // Показ/скрытие подсказки по кнопке ℹ️
  if (infoBtn && tooltip) {
    infoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      tooltip.classList.toggle('active');
    });
    // Закрыть при клике в любом месте страницы
    document.addEventListener('click', () => tooltip.classList.remove('active'));
    tooltip.addEventListener('click', (e) => e.stopPropagation()); // Не закрывать при клике внутри
  }
}

// ===== МОДАЛЬНОЕ ОКНО ОБРАТНОЙ СВЯЗИ =====
document.addEventListener('DOMContentLoaded', () => {
  const feedbackBtn = document.getElementById('menu-feedback');
  const feedbackModal = document.getElementById('feedback-modal');
  const feedbackClose = feedbackModal?.querySelector('.modal-close');
  const feedbackWriteBtn = document.getElementById('feedback-write-btn');
  
  if (!feedbackBtn || !feedbackModal) return;

  // Открытие
  feedbackBtn.addEventListener('click', () => feedbackModal.classList.add('active'));
  
  // Закрытие
  const closeModal = () => feedbackModal.classList.remove('active');
  feedbackClose?.addEventListener('click', closeModal);
  feedbackModal.addEventListener('click', (e) => { if (e.target === feedbackModal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  
  //  Кнопка "Написать" -> открывает почтовый клиент
if (feedbackWriteBtn) {
  feedbackWriteBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const subject = encodeURIComponent('MIMIC App - вопрос или предложение');
    const body = encodeURIComponent('\n\n---\nПользователь МИМИК');
    
    // Надёжный способ открытия mailto
    const mailtoLink = `mailto:mityasky@ya.ru?subject=${subject}&body=${body}`;
    
    // Пробуем открыть в новом окне, фоллбэк на текущее
    const newWindow = window.open(mailtoLink, '_blank');
    if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
      window.location.href = mailtoLink;
    }
    
    // Закрываем модальное окно после клика
    const modal = document.getElementById('feedback-modal');
    if (modal) modal.classList.remove('active');
  });
}
});

// ===== МОДАЛЬНОЕ ОКНО ДОНАТА =====
document.addEventListener('DOMContentLoaded', () => {
  const donateBtn = document.getElementById('donate-btn');
  const donateModal = document.getElementById('donate-modal');
  const donateClose = donateModal?.querySelector('.modal-close');
  const sbpToggleBtn = document.getElementById('sbp-toggle-btn');
  const sbpContainer = document.getElementById('sbp-qr-container');

  if (donateBtn && donateModal) {
    // Открытие
    donateBtn.addEventListener('click', () => donateModal.classList.add('active'));

    // Закрытие
    const closeDonate = () => donateModal.classList.remove('active');
    donateClose?.addEventListener('click', closeDonate);
    donateModal.addEventListener('click', (e) => { if (e.target === donateModal) closeDonate(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && donateModal.classList.contains('active')) closeDonate(); });
  }
});

// ===== ONBOARDING / ИНСТРУКЦИЯ ПРИ ПЕРВОМ ЗАПУСКЕ =====

const Onboarding = (() => {
  let currentStep = 1;
  const totalSteps = 6;
  const STORAGE_KEY = 'mimic_onboarding_seen';

  // Проверка: показывать ли инструкцию
  function shouldShow() {
    return !localStorage.getItem(STORAGE_KEY);
  }

  // Показать оверлей
  function show() {
    const overlay = document.getElementById('onboarding-overlay');
    if (!overlay) return;

    overlay.hidden = false;
    currentStep = 1;
    updateStep();

    // Блокируем прокрутку фона
    document.body.style.overflow = 'hidden';

    console.log('🎬 Onboarding started');
  }

  // Скрыть оверлей
  function hide() {
    const overlay = document.getElementById('onboarding-overlay');
    if (!overlay) return;

    overlay.hidden = true;

    // Разблокируем прокрутку
    document.body.style.overflow = '';

    // Запоминаем, что пользователь прошёл инструкцию
    localStorage.setItem(STORAGE_KEY, 'true');

    console.log('✅ Onboarding completed');
  }

  // Обновить отображение шага
  function updateStep() {
    // Скрыть все шаги
    document.querySelectorAll('.onboarding-step').forEach(step => {
      step.classList.remove('active');
    });

    // Показать текущий
    const activeStep = document.querySelector(`.onboarding-step[data-step="${currentStep}"]`);
    if (activeStep) {
      activeStep.classList.add('active');
    }

    // Обновить точки-индикаторы
    document.querySelectorAll('.dot').forEach(dot => {
      dot.classList.remove('active');
    });
    const activeDot = document.querySelector(`.dot[data-dot="${currentStep}"]`);
    if (activeDot) {
      activeDot.classList.add('active');
    }

    // Управление кнопками
    const prevBtn = document.getElementById('onboarding-prev');
    const nextBtn = document.getElementById('onboarding-next');
    const finishBtn = document.getElementById('onboarding-finish');

    if (prevBtn) prevBtn.disabled = (currentStep === 1);
    if (nextBtn) nextBtn.hidden = (currentStep === totalSteps);
    if (finishBtn) finishBtn.hidden = (currentStep !== totalSteps);

    // Обновляем текст кнопок через локализацию
    if (nextBtn && translations[currentLang]?.btnNext) {
      nextBtn.textContent = translations[currentLang].btnNext;
    }
    if (finishBtn && translations[currentLang]?.btnStart) {
      finishBtn.textContent = translations[currentLang].btnStart;
    }
  }

  // Переход к следующему шагу
  function next() {
    if (currentStep < totalSteps) {
      currentStep++;
      updateStep();
    }
  }

  // Переход к предыдущему шагу
  function prev() {
    if (currentStep > 1) {
      currentStep--;
      updateStep();
    }
  }

  // Инициализация обработчиков
  function init() {
    // Кнопка "Пропустить" (крестик)
    const skipBtn = document.getElementById('onboarding-skip');
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        hide();
        // Мягкое уведомление, что инструкцию можно открыть позже
        if (translations[currentLang]?.onboardingSkipped) {
          showTemporaryHint(translations[currentLang].onboardingSkipped);
        }
      });
    }
	
	const sensoryBtn = document.getElementById('sensory-toggle');
if (sensoryBtn) {
  sensoryBtn.addEventListener('click', toggleSensoryMode);
}

    // Кнопка "Далее"
    const nextBtn = document.getElementById('onboarding-next');
    if (nextBtn) {
      nextBtn.addEventListener('click', next);
    }

    // Кнопка "Назад"
    const prevBtn = document.getElementById('onboarding-prev');
    if (prevBtn) {
      prevBtn.addEventListener('click', prev);
    }

    // Кнопка "Начать!" (финиш)
    const finishBtn = document.getElementById('onboarding-finish');
    if (finishBtn) {
      finishBtn.addEventListener('click', () => {
        hide();
        // Опционально: автоматически кликнуть по кнопке "Начать" камеры
        // setTimeout(() => {
        //   const startCamBtn = document.getElementById('btn-start-cam');
        //   if (startCamBtn && !startCamBtn.disabled) {
        //     startCamBtn.click();
        //   }
        // }, 300);
      });
    }

    // Клик по точкам-индикаторам
    document.querySelectorAll('.dot').forEach(dot => {
      dot.addEventListener('click', (e) => {
        const step = parseInt(e.target.dataset.dot);
        if (step && step >= 1 && step <= totalSteps) {
          currentStep = step;
          updateStep();
        }
      });
    });

    // Закрытие по клику вне модального окна
    const overlay = document.getElementById('onboarding-overlay');
    const modal = document.querySelector('.onboarding-modal');
    if (overlay && modal) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          hide();
        }
      });
    }

    // Закрытие по Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !overlay?.hidden) {
        hide();
      }
    });

    // Авто-показ при загрузке, если нужно
    if (shouldShow()) {
      // Небольшая задержка, чтобы страница успела отрендериться
      setTimeout(show, 500);
    }
  }

  // Вспомогательная функция для временной подсказки
  function showTemporaryHint(text) {
    const hint = document.createElement('div');
    hint.style.cssText = `
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--bg-card);
      color: var(--text);
      padding: 12px 20px;
      border-radius: 12px;
      border: 1px solid var(--border);
      box-shadow: var(--shadow);
      font-size: 13px;
      z-index: 15000;
      animation: hintFade 3s ease forwards;
      max-width: 90%;
      text-align: center;
    `;
    hint.textContent = text;
    document.body.appendChild(hint);

    // Добавляем анимацию, если ещё нет
    if (!document.getElementById('hint-anim-style')) {
      const style = document.createElement('style');
      style.id = 'hint-anim-style';
      style.textContent = `
        @keyframes hintFade {
          0%, 100% { opacity: 0; transform: translateX(-50%) translateY(10px); }
          10%, 90% { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }

    setTimeout(() => hint.remove(), 3000);
  }

  // Публичный метод для ручного показа (например, из кнопки "Помощь")
  function showManual() {
    // Показываем даже если уже видели
    localStorage.removeItem(STORAGE_KEY);
    show();
  }

  return {
    init,
    showManual,
    isVisible: () => !document.getElementById('onboarding-overlay')?.hidden
  };
})();

// Инициализация onboarding после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
  Onboarding.init();
});

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.altKey && e.key === 'o') {
    e.preventDefault();
    localStorage.removeItem('mimic_onboarding_seen');
    Onboarding.showManual();
    console.log('🔄 Onboarding reset (dev mode)');
  }
});

/* // ===== МОДАЛЬНОЕ ОКНО ОТЗЫВОВ (CUSDIS) =====
document.addEventListener('DOMContentLoaded', () => {
  const reviewsBtn = document.getElementById('reviews-btn');
  const reviewsModal = document.getElementById('reviews-modal');
  const reviewsClose = reviewsModal?.querySelector('.modal-close');

  if (!reviewsBtn || !reviewsModal) return;

  // Открытие модалки
  reviewsBtn.addEventListener('click', () => {
    reviewsModal.classList.add('active');
    // Синхронизируем тему Cusdis при открытии
    syncCusdisTheme();
    // принудительный ресайз виджета после анимации
    setTimeout(() => {
      if (window.CUSDIS && typeof window.CUSDIS.resize === 'function') {
        window.CUSDIS.resize();
      }
    }, 300); // Ждём завершения анимации появления модалки
  });

  // Закрытие
  const closeReviews = () => reviewsModal.classList.remove('active');
  reviewsClose?.addEventListener('click', closeReviews);
  reviewsModal.addEventListener('click', (e) => {
    if (e.target === reviewsModal) closeReviews();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && reviewsModal.classList.contains('active')) closeReviews();
  });
});

// Вспомогательная функция: синхронизация темы Cusdis
function syncCusdisTheme() {
  if (!window.CUSDIS) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  window.CUSDIS.setTheme(isDark ? 'dark' : 'light');
}*/

function showRecordNotification() {
  const notif = document.getElementById('record-notification');
  if (!notif) return;

  notif.hidden = false;
  // Сброс анимации для повторного запуска
  void notif.offsetHeight;
  notif.style.animation = 'recordPopIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards';

  // Автоскрытие через 3 сек
  clearTimeout(notif._hideTimer);
  notif._hideTimer = setTimeout(() => {
    notif.hidden = true;
  }, 3000);
}

function resetHighScore() {
  if (confirm(translations[currentLang].confirmResetRecord || 'Сбросить рекорд?')) {
    highScore = 0;
    localStorage.setItem('mimicHighScore', 0);
    updateScoreDisplay();
    showStatus(translations[currentLang].recordReset || '🗑️ Рекорд сброшен!', 'info');
  }
}

// Комбинация клавиш: Ctrl + Alt + R
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.altKey && e.key.toLowerCase() === 'r') {
    e.preventDefault();
    resetHighScore();
  }
  // Сохраняем вашу старую комбинацию для онбординга
  if (e.ctrlKey && e.altKey && e.key === 'o') {
    e.preventDefault();
    localStorage.removeItem('mimic_onboarding_seen');
    Onboarding.showManual();
    console.log('🔄 Onboarding reset (dev mode)');
  }
});

// ===== ЛОГИКА РЕЖИМА ДУЭТ =====
let duelStream = null;
let duelVideo = null;
let duelAnimFrame = null;
let duelState = 'idle'; // idle, waiting_second, result
let lockedEmotion = null; // эмоция первого участника, который показал эмоцию
let firstParticipantIndex = null; // 0 или 1 - кто первый показал эмоцию

// Вспомогательная функция для форматирования статуса с подстановкой чисел
function formatStatus(key, params = {}) {
  let text = translations[currentLang]?.[key] || key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(`{${k}}`, v);
  }
  return text;
}

window.openDuelMode = async function () {
  const modal = document.getElementById('duel-modal');

  if (!emotionModelLoaded) {
    showLoadingIndicator(true);
    try {
      await loadEmotionModels();
    } catch (e) {
      console.error('❌ Failed to load emotion models:', e);
      alert('Не удалось загрузить модели распознавания. Попробуйте обновить страницу.');
      showLoadingIndicator(false);
      return;
    }
    showLoadingIndicator(false);
  }

  // Обновляем тексты модалки при открытии
  const statusEl = document.getElementById('duel-status-text');
  const startBtn = document.getElementById('duel-start-btn');
  const p1Label = document.querySelector('.player-score.p1');
  const p2Label = document.querySelector('.player-score.p2');
  const vsBadge = document.querySelector('.vs-badge');

  if (statusEl) statusEl.textContent = translations[currentLang]?.duelStatusIdle || 'Waiting...';
  if (startBtn) {
    startBtn.innerHTML = `🎥 ${translations[currentLang]?.duelStartBtn || 'Start Game'}`;
    startBtn.setAttribute('data-i18n', 'duelStartBtn');
  }
  if (p1Label) p1Label.textContent = translations[currentLang]?.playerLeft || 'Player 1 (Left)';
  if (p2Label) p2Label.textContent = translations[currentLang]?.playerRight || 'Player 2 (Right)';
  if (vsBadge) vsBadge.textContent = translations[currentLang]?.vsBadge || 'VS';


  modal.classList.add('active');
  modal.style.display = 'flex';
  duelState = 'idle';
  lockedEmotion = null;
  firstParticipantIndex = null;
  updateDuelUI();
};

// Закрытие модалки
window.closeDuelMode = function () {
  const modal = document.getElementById('duel-modal');
  modal.classList.remove('active');
  setTimeout(() => { modal.style.display = 'none'; }, 300);
  stopDuelCamera();
};

// Старт камеры для дуэта
window.startDuelCamera = async function () {
  const video = document.getElementById('duel-video');
  const startBtn = document.getElementById('duel-start-btn');

  if (startBtn) startBtn.style.display = 'none';

  if (!emotionModelLoaded) {
    await loadEmotionModels();
  }

  if (navigator.mediaDevices?.getUserMedia) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' }
      });

      duelStream = stream;
      duelVideo = video;
      video.srcObject = stream;
      video.style.display = 'block';

      video.onloadedmetadata = () => {
        video.play().then(() => runDuelLoop()).catch(e => console.error('Video play error:', e));
      };
    } catch (err) {
      console.error('Camera error:', err);
      alert(translations[currentLang]?.notifyCameraError || 'Camera error');
      if (startBtn) startBtn.style.display = 'block';
    }
  }
};

// Остановка камеры
function stopDuelCamera() {
  if (duelAnimFrame) { cancelAnimationFrame(duelAnimFrame); duelAnimFrame = null; }
  if (duelStream) { duelStream.getTracks().forEach(t => t.stop()); duelStream = null; }
  if (duelVideo) { duelVideo.srcObject = null; duelVideo.style.display = 'none'; }

  duelState = 'idle';
  lockedEmotion = null;
  firstParticipantIndex = null;

  const startBtn = document.getElementById('duel-start-btn');
  if (startBtn) startBtn.style.display = 'block';
  const statusEl = document.getElementById('duel-status-text');
  if (statusEl) statusEl.textContent = '';
}

// ===== ГЛАВНЫЙ ЦИКЛ ДУЭТА =====
async function runDuelLoop() {
  if (!duelVideo || duelVideo.paused || duelVideo.ended) return;

  if (!emotionModelLoaded || !faceapi.nets.tinyFaceDetector.isLoaded) {
    await loadEmotionModels();
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  try {
    const detections = await faceapi.detectAllFaces(
      duelVideo,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.6 })
    ).withFaceLandmarks().withFaceExpressions();

    if (detections.length >= 2) {
      detections.sort((a, b) => a.detection.box.x - b.detection.box.x);
      const expressions = [detections[0].expressions, detections[1].expressions];
      processDuelLogic(expressions);
    } else {
      if (duelState === 'idle' || duelState === 'waiting_second') {
        setStatusText(formatStatus('duelStatusTwoPeople'));
      }
    }
  } catch (e) {
    if (!e.message?.includes('backend')) console.error('❌ Duel detection error:', e);
  }

  if (duelState !== 'result') {
    duelAnimFrame = requestAnimationFrame(runDuelLoop);
  }
}

// Логика сравнения — кто первый показал эмоцию, тот и "задаёт тон"
function processDuelLogic(expressions) {
  const dom0 = getDominant(expressions[0]);
  const dom1 = getDominant(expressions[1]);

  if (duelState === 'idle') {
    if (dom0.key !== 'neutral' && dom0.val > 0.6) {
      lockedEmotion = dom0.key;
      firstParticipantIndex = 0;
      duelState = 'waiting_second';
      setStatusText(`✨ ${translations[currentLang]?.playerLeft || 'Player 1'}: ${translateEmotion(dom0.key)}! ${translations[currentLang]?.duelStatusWaiting?.replace('{num}', '2') || 'Waiting...'}`);
      return;
    }
    if (dom1.key !== 'neutral' && dom1.val > 0.6) {
      lockedEmotion = dom1.key;
      firstParticipantIndex = 1;
      duelState = 'waiting_second';
      setStatusText(`✨ ${translations[currentLang]?.playerRight || 'Player 2'}: ${translateEmotion(dom1.key)}! ${translations[currentLang]?.duelStatusWaiting?.replace('{num}', '1') || 'Waiting...'}`);
      return;
    }
    setStatusText(formatStatus('duelStatusIdle'));
  }
  else if (duelState === 'waiting_second') {
    const secondIndex = firstParticipantIndex === 0 ? 1 : 0;
    const secondDom = secondIndex === 0 ? dom0 : dom1;

    if (secondDom.key !== 'neutral' && secondDom.val > 0.4) {
      calculateDuelScore(lockedEmotion, expressions[secondIndex]);
    } else {
      setStatusText(formatStatus('duelStatusWaiting', { num: secondIndex + 1 }));
    }
  }
}

// Подсчет очков
function calculateDuelScore(targetEmotion, p2Expressions) {
  const p2Dom = getDominant(p2Expressions).key;
  let score = 0;

  if (p2Dom === targetEmotion) {
    score = Math.round(p2Expressions[targetEmotion] * 10);
    if (score > 10) score = 10;
  }
  showDuelResult(score, targetEmotion, p2Dom);
}

function showDuelResult(score, expected, actual) {
  duelState = 'result';
  cancelAnimationFrame(duelAnimFrame);

  const resCard = document.getElementById('duel-result-card');
  const resScore = document.getElementById('result-score');
  const resText = document.getElementById('result-text');

  resScore.textContent = `${score}/10`;

  const t = translations[currentLang];
  if (score >= 8) {
    resText.textContent = t?.duelResultExcellent || '🎉 Great!';
    resScore.style.color = '#2ecc71';
  } else if (score >= 5) {
    resText.textContent = t?.duelResultGood || '🙂 Good';
    resScore.style.color = '#f1c40f';
  } else {
    const secondIdx = firstParticipantIndex === 0 ? 2 : 1;
    resText.textContent = formatStatus('duelResultFail', {
      num: secondIdx,
      actual: translateEmotion(actual),
      expected: translateEmotion(expected)
    });
    resScore.style.color = '#e74c3c';
  }

  // Обновляем текст кнопок результата
  const retryBtn = resCard.querySelector('.duel-btn-primary');
  const exitBtn = resCard.querySelector('.duel-btn-secondary');
  if (retryBtn) {
    retryBtn.innerHTML = `🔄 ${t?.duelBtnRetry || 'Retry'}`;
    retryBtn.setAttribute('data-i18n', 'duelBtnRetry');
  }
  if (exitBtn) {
    exitBtn.innerHTML = `🚪 ${t?.duelBtnExit || 'Exit'}`;
    exitBtn.setAttribute('data-i18n', 'duelBtnExit');
  }

  resCard.classList.remove('hidden');
}


// Утилиты
window.nextDuelRound = function () {
  const resCard = document.getElementById('duel-result-card');
  resCard.classList.add('hidden');
  duelState = 'idle';
  lockedEmotion = null;
  firstParticipantIndex = null;
  runDuelLoop();
};

function setStatusText(text) {
  const el = document.getElementById('duel-status-text');
  if (el) el.textContent = text;
}

function getDominant(expressions) {
  let maxVal = 0, maxKey = 'neutral';
  for (const [key, val] of Object.entries(expressions)) {
    if (val > maxVal) { maxVal = val; maxKey = key; }
  }
  return { key: maxKey, val: maxVal };
}

function translateEmotion(key) {
  const mapRu = { happy: 'Радость', sad: 'Грусть', angry: 'Злость', surprised: 'Удивление', fearful: 'Страх', disgusted: 'Отвращение', neutral: 'Нейтрально' };
  const mapEn = { happy: 'Happy', sad: 'Sad', angry: 'Angry', surprised: 'Surprised', fearful: 'Fear', disgusted: 'Disgust', neutral: 'Neutral' };
  return currentLang === 'ru' ? (mapRu[key] || key) : (mapEn[key] || key);
}

// ===== ОБНОВЛЕНИЕ ИНТЕРФЕЙСА ДУЭТ-РЕЖИМА =====
function updateDuelUI() {
  const statusEl = document.getElementById('duel-status-text');
  const resultCard = document.getElementById('duel-result-card');
  if (!statusEl) return;
  if (resultCard) resultCard.classList.add('hidden');

  const t = translations[currentLang];
  switch (duelState) {
    case 'idle':
      statusEl.textContent = t?.duelDesc || 'Show an emotion — your partner must repeat it! The more accurate the match, the higher the score.';
      break;
    case 'waiting_second':
      const waitingFor = firstParticipantIndex === 0 ? 2 : 1;
      statusEl.textContent = formatStatus('duelStatusWaiting', { num: waitingFor });
      break;
    case 'result':
      // Текст уже установлен в showDuelResult
      break;
  }
}

// ===== ОБНОВЛЕНИЕ СТАТУСА ОБНАРУЖЕНИЯ ЛИЦА =====
function updateFaceDetectionStatus(isDetected) {
  const badge = document.getElementById('face-detection-status');
  const textEl = badge?.querySelector('.status-text');
  if (!badge || !textEl) return;
  
  if (isDetected) {
    badge.classList.add('detected');
    textEl.textContent = translations[currentLang]?.faceDetected || 'Лицо обнаружено';
    textEl.setAttribute('data-i18n', 'faceDetected');
  } else {
    badge.classList.remove('detected');
    textEl.textContent = translations[currentLang]?.faceNotDetected || 'Лицо не обнаружено';
    textEl.setAttribute('data-i18n', 'faceNotDetected');
  }
}
// ===== PWA INSTALL & AUTO-UPDATE LOGIC =====
(() => {
  let deferredPrompt = null;
  const installBtn = document.getElementById('pwa-install-btn');
  const updateBanner = document.getElementById('update-banner');
  const applyUpdateBtn = document.getElementById('update-apply-btn');

  // 1. Регистрация Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js')
        .then(reg => {
          console.log('✅ SW registered');
          // Отслеживаем обновление SW
          reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                if (updateBanner) updateBanner.hidden = false;
              }
            });
          });
        })
        .catch(err => console.warn('⚠️ SW registration failed:', err));
    });
  }

  // 2. Обработка события установки (Убрано лишнее логирование варнинга)
  window.addEventListener('beforeinstallprompt', (e) => {
    // Останавливаем всплывающее окно браузера по умолчанию
    e.preventDefault();
    // Сохраняем событие, чтобы показать его позже по клику
    deferredPrompt = e;
    // Показываем нашу кастомную кнопку
    if (installBtn) installBtn.style.display = 'flex';
  });

  // 3. Клик по кнопке установки
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      
      // Показываем нативный диалог установки
      deferredPrompt.prompt();
      
      // Ждем выбора пользователя
      const { outcome } = await deferredPrompt.userChoice;
      console.log(`User choice: ${outcome}`);
      
      // Если пользователь отказался или установил — скрываем кнопку, она больше не нужна
      if (outcome === 'accepted') {
        deferredPrompt = null;
      }
      installBtn.style.display = 'none';
    });
  }

  // 4. Скрытие кнопки после успешной установки (через событие appinstalled)
  window.addEventListener('appinstalled', () => {
    if (installBtn) installBtn.style.display = 'none';
    deferredPrompt = null;
    console.log('📲 PWA installed successfully');
  });

  // 5. Применение обновления
  if (applyUpdateBtn && updateBanner) {
    applyUpdateBtn.addEventListener('click', () => {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage('SKIP_WAITING');
        window.location.reload();
      }
    });
  }

  // 6. Обработка перехода на новый SW после перезагрузки
  window.addEventListener('load', () => {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage('SKIP_WAITING');
    }
  });
})();

// ===== ЛОГИКА ПЕРЕКЛЮЧЕНИЯ ЭКРАНОВ =====
const homeScreen = document.getElementById('home-screen');
const trainingView = document.getElementById('training-view');
const tileTraining = document.getElementById('tile-training');
const tileDuet = document.getElementById('tile-duet');
const btnBackHome = document.getElementById('btn-back-home');
const TRANSITION_MS = 300; // Длительность анимации в мс

function switchView(fromEl, toEl) {
  // 1. Запускаем анимацию ухода
  fromEl.classList.add('screen-out');
  
  // 2. Ждём завершения, меняем видимость и запускаем анимацию появления
  setTimeout(() => {
    fromEl.classList.add('hidden');
    fromEl.classList.remove('screen-out');
    
    toEl.classList.remove('hidden');
    toEl.classList.add('screen-in');
    
    // Убираем класс анимации после завершения, чтобы не мешал при следующих переходах
    setTimeout(() => toEl.classList.remove('screen-in'), TRANSITION_MS);
  }, TRANSITION_MS);
}

// 1. Клик по ТРЕНИРОВКЕ
if (tileTraining) {
  tileTraining.addEventListener('click', () => switchView(homeScreen, trainingView));
}

// 2. Клик по ДУЭТУ (модалка поверх, фон не скрываем)
if (tileDuet) {
  tileDuet.addEventListener('click', () => {
    if (typeof window.openDuelMode === 'function') window.openDuelMode();
  });
}

const tileEmotionDuel = document.getElementById('tile-emotion-duel');
if (tileEmotionDuel) {
  tileEmotionDuel.addEventListener('click', () => {
    if (typeof window.openEmotionDuel === 'function') window.openEmotionDuel();
  });
}

// 3. Кнопка "НА ГЛАВНУЮ"
if (btnBackHome) {
  btnBackHome.addEventListener('click', () => {
    switchView(trainingView, homeScreen);
    if (typeof window.stopCamera === 'function') window.stopCamera();
  });
}

const burgerBtn = document.getElementById('burger-btn');
const mainMenu = document.getElementById('main-menu');

burgerBtn.addEventListener('click', () => {
  mainMenu.classList.toggle('hidden');
});

document.getElementById('menu-feedback').onclick = () => {
  document.getElementById('feedback-modal').classList.add('active');
};

// document.getElementById('menu-reviews').onclick = () => {
 //  document.getElementById('reviews-modal').classList.add('active');
// };

document.getElementById('menu-donate').onclick = () => {
  document.getElementById('donate-modal').classList.add('active');
};

// ===== УНИВЕРСАЛЬНОЕ УПРАВЛЕНИЕ ЗАКРЫТИЕМ (ПАНЕЛИ + МОДАЛКИ) =====
// Вставьте этот код в самый конец app.js
document.addEventListener('click', (e) => {
  // 1. Закрытие боковых панелей при клике вне
  const activePanel = document.querySelector('.info-panel.active');
  if (activePanel) {
    const isInside = activePanel.contains(e.target);
    const isTrigger = e.target.closest('[data-panel]');
    if (!isInside && !isTrigger) {
      activePanel.classList.remove('active');
    }
  }

  // 2. Закрытие модалок по крестику (делегирование + защита от сабмита формы)
  const closeBtn = e.target.closest('.modal-close, .onboarding-close, .duel-close-btn');
  if (closeBtn) {
    const overlay = closeBtn.closest('.modal-overlay, .onboarding-overlay, .critical-fallback-overlay, #duel-modal');
    if (overlay) {
      if (overlay.id === 'duel-modal') {
        window.closeDuelMode();
      } else if (overlay.classList.contains('onboarding-overlay') || overlay.classList.contains('critical-fallback-overlay')) {
        overlay.hidden = true;
        document.body.style.overflow = '';
      } else {
        overlay.classList.remove('active');
      }
      e.preventDefault(); // Предотвращает перезагрузку, если кнопка внутри <form>
      e.stopPropagation();
      return;
    }
  }

  // 3. Закрытие модалок по клику на затемнённый фон (overlay)
  const bg = e.target.closest('.modal-overlay, .onboarding-overlay, .critical-fallback-overlay');
  if (bg && bg.classList.contains('active') && !bg.hidden) {
    const content = bg.querySelector('.modal-content, .onboarding-modal, .critical-fallback-content');
    if (content && !content.contains(e.target)) {
      if (bg.classList.contains('onboarding-overlay') || bg.classList.contains('critical-fallback-overlay')) {
        bg.hidden = true;
        document.body.style.overflow = '';
      } else {
        bg.classList.remove('active');
      }
    }
  }
});

// ===== КНОПКА "ПОКАЗАТЬ ИНСТРУКЦИЮ ЗАНОВО" =====
document.addEventListener('DOMContentLoaded', () => {
  const onboardingBtn = document.querySelector('[data-action="show-onboarding"]');
  if (onboardingBtn) {
    onboardingBtn.addEventListener('click', (e) => {
      e.preventDefault();      // Отменяет стандартное поведение
      e.stopPropagation();     // Останавливает всплытие, чтобы не сработали другие обработчики
      if (typeof Onboarding !== 'undefined') {
        Onboarding.showManual();
      }
    });
  }
});

// ===== ЗАКРЫТИЕ МЕНЮ ПРИ КЛИКЕ ВНЕ =====
document.addEventListener('click', (e) => {
  if (mainMenu && !mainMenu.classList.contains('hidden')) {
    const isClickInsideMenu = mainMenu.contains(e.target);
    const isClickOnBurger = e.target === burgerBtn || burgerBtn.contains(e.target);
    
    if (!isClickInsideMenu && !isClickOnBurger) {
      mainMenu.classList.add('hidden');
    }
  }
});

// ===== ЛОГИКА РЕЖИМА "ЭМОЦИОНАЛЬНАЯ ДУЭЛЬ" =====

// Открытие модального окна дуэли
window.openEmotionDuel = async function() {
  console.log('Emotion Duel: openEmotionDuel called');
  const modal = document.getElementById('emotion-duel-modal');
  if (!modal) {
    console.error('Emotion Duel: Modal element not found!');
    return;
  }
  console.log('Emotion Duel: modal element found.');
  
  // Загружаем модели, если нужно
  if (!emotionModelLoaded) {
    console.log('Emotion Duel: Emotion models not yet loaded, attempting to load...');
    showLoadingIndicator(true);
    try {
      await loadEmotionModels();
    } catch (e) {
      console.error('❌ Failed to load emotion models:', e);
      alert(translations[currentLang]?.notifyModelError || 'Ошибка загрузки моделей');
      showLoadingIndicator(false);
      return;
    }
    showLoadingIndicator(false);
  }
  
  // Выбираем случайную эмоцию для дуэли
  emotionDuelTargetEmotion = EMOTIONS[Math.floor(Math.random() * EMOTIONS.length)];
  
  // Обновляем UI целевой эмоции
  updateDuelTargetDisplay();
    updateDuelEmotionBanner();
  
  // Сбрасываем состояние
  emotionDuelState = 'ready';
  emotionDuelScores = { p1: 0, p2: 0 };
  emotionDuelPlayerData.forEach(p => {
    p.score = 0;
    p.correctStreak = 0;
    p.lastCorrectTime = 0;
    p.faceBox = null;
  });
  
  // Обновляем табло
  updateDuelScoreboard();
  

  // Показываем модалку
  modal.hidden = false;
  modal.style.display = 'flex';
  modal.classList.add('active'); // Добавляем класс 'active' для отображения
  
  // Скрываем результат, показываем кнопку старта
  document.getElementById('duel-result-screen').classList.add('hidden');
  document.getElementById('duel-start-btn').classList.remove('hidden');
  document.getElementById('duel-status').classList.remove('visible');
  
  // Обновляем тексты через локализацию
  updateDuelUITexts();
  
  console.log('🎮 Emotion Duel: ready');
};

// Обновление отображения целевой эмоции
function updateDuelTargetDisplay() {
  const img = document.getElementById('duel-emotion-image');
  const name = document.getElementById('duel-emotion-name');
  if (!img || !name || !emotionDuelTargetEmotion) return;
  
  // Случайное изображение из массива
  const randomImg = emotionDuelTargetEmotion.imgs[
    Math.floor(Math.random() * emotionDuelTargetEmotion.imgs.length)
  ];
  img.src = randomImg;
  img.alt = translations[currentLang]?.['emotion-image-alt'] || 'Target Emotion';
  
  // Название с переводом
  const emotionKey = emotionDuelTargetEmotion.key.charAt(0).toUpperCase() + 
                     emotionDuelTargetEmotion.key.slice(1);
  const emotionName = translations[currentLang]?.[`emotion${emotionKey}`] || 
                      emotionDuelTargetEmotion.name;
  name.textContent = `${emotionName} ${emotionDuelTargetEmotion.emoji}`;
}

// Обновление текста баннера с целевой эмоцией
function updateDuelEmotionBanner() {
  const banner = document.getElementById('duel-emotion-banner');
  const bannerText = document.getElementById('duel-emotion-banner-text');
  if (!banner || !bannerText || !emotionDuelTargetEmotion) return;
  
  // Получаем название эмоции с учётом перевода
  const emotionKey = emotionDuelTargetEmotion.key.charAt(0).toUpperCase() + 
                     emotionDuelTargetEmotion.key.slice(1);
  const emotionName = translations[currentLang]?.[`emotion${emotionKey}`] || 
                      emotionDuelTargetEmotion.name;
  
  // Формируем текст с подстановкой
  let text = translations[currentLang]?.duelBannerText || 'Show emotion: {emotion}!';
  text = text.replace('{emotion}', `${emotionName} ${emotionDuelTargetEmotion.emoji}`);
  
  bannerText.textContent = text;
  banner.hidden = false;
}

// Обновление текстов интерфейса
function updateDuelUITexts() {
  const t = translations[currentLang];
  if (!t) return;
  
  // Кнопки
  const startBtn = document.getElementById('duel-start-btn');
  if (startBtn && t.duelStartBtn) {
    startBtn.innerHTML = `🎯 ${t.duelStartBtn}`;
  }
  
  // Имена игроков
  document.querySelectorAll('.player-name')[1]?.setAttribute('data-i18n', 'playerLeft');
  document.querySelectorAll('.player-name')[0]?.setAttribute('data-i18n', 'playerRight');
  
  // VS и цель
  document.querySelector('.vs-text')?.setAttribute('data-i18n', 'vsBadge');
  const targetToEl = document.getElementById('duel-target-to');
  if (targetToEl) {
    targetToEl.textContent = emotionDuelTargetScore;
  }
}

// Старт камеры для дуэли
window.startEmotionDuelCamera = async function() {
  let video = document.getElementById('emotion-duel-video');
  const startBtn = document.getElementById('duel-start-btn');
  
  if (startBtn) startBtn.classList.add('hidden');
  
  console.log('Emotion Duel Camera: Attempting to start camera...');
  try {
    if (!video) {
      console.log('Emotion Duel Camera: Video element was null, re-acquiring.');
      video = document.getElementById('emotion-duel-video');
    }
    if (!video) {
      console.error('Emotion Duel Camera: Failed to acquire video element.');
      return;
    }
    video.style.display = 'block'; // Ensure video is visible

    console.log('Emotion Duel Camera: Calling getUserMedia...');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { 
        width: { ideal: 1280 }, 
        height: { ideal: 720 }, 
        facingMode: 'user' 
      }
    });
    console.log('Emotion Duel Camera: getUserMedia successful, stream obtained.');
    
    emotionDuelStream = stream;
    emotionDuelVideo = video;
    video.srcObject = stream;
    
    console.log('Emotion Duel Camera: Attempting to play video...');
    await video.play();
    console.log('Emotion Duel Camera: Video playback started.');
    
    // Синхронизация размера канваса
    syncDuelCanvasSize();
    
    // Запускаем игровой цикл
    emotionDuelState = 'playing';
	updateDuelEmotionBanner();
    showDuelStatus('duelStatusPlaying', { emotion: emotionDuelTargetEmotion.name }, 'info');
    runEmotionDuelLoop();
    
    console.log('🎬 Emotion Duel: camera started');
  } catch (err) {
    console.error('❌ Emotion Duel Camera Error:', err);
    alert(translations[currentLang]?.notifyCameraError || 'Ошибка камеры');
    if (startBtn) startBtn.classList.remove('hidden');
    closeEmotionDuel();
  }
};

// Синхронизация размера канваса с видео
function syncDuelCanvasSize() {
  const canvas = document.getElementById('emotion-duel-canvas');
  const video = document.getElementById('emotion-duel-video');
  if (canvas && video && video.videoWidth > 0) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
}

// Главный игровой цикл
async function runEmotionDuelLoop() {
  if (emotionDuelState !== 'playing' || !emotionDuelVideo || emotionDuelVideo.paused) return;
  
  try {
    // Детекция лиц и эмоций
    const detections = await faceapi.detectAllFaces(
      emotionDuelVideo,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.5 })
    ).withFaceLandmarks().withFaceExpressions();
    
    if (detections.length >= 2) {
      // Сортируем по позиции слева направо
      detections.sort((a, b) => a.detection.box.x - b.detection.box.x);
      
      // Обрабатываем каждого игрока
      detections.forEach((detection, idx) => {
        if (idx < 2) {
          processDuelPlayer(idx, detection.expressions, detection.detection.box);
        }
      });
      
      // Проверка условия победы
      checkDuelWinCondition();
    } else {
      // Если игроков меньше 2 — показываем подсказку
      if (detections.length < 2) {
        showDuelStatus('duelStatusTwoPeople', {}, 'warning');
      }
    }
  } catch (e) {
    if (!e.message?.includes('backend')) {
      console.error('❌ Duel detection error:', e);
    }
  }
  
  // Продолжаем цикл
  emotionDuelAnimFrame = requestAnimationFrame(runEmotionDuelLoop);
}

// Обработка данных игрока
function processDuelPlayer(playerIdx, expressions, faceBox) {
  const player = emotionDuelPlayerData[playerIdx];
  player.faceBox = faceBox;
  
  // Находим доминирующую эмоцию
  let dominant = 'neutral', maxScore = 0;
  for (const [emotion, score] of Object.entries(expressions)) {
    if (score > maxScore) { maxScore = score; dominant = emotion; }
  }
  
  // Проверка: совпадает ли с целевой?
  const targetKey = emotionDuelTargetEmotion.key;
  const isCorrect = (dominant === targetKey && maxScore >= DUEL_ACCURACY_THRESHOLD);
  
  // Обновляем визуальный индикатор
  updatePlayerIndicator(playerIdx, isCorrect);
  
  // Обновляем полосу точности
  updateAccuracyBar(playerIdx, maxScore);
  
  if (isCorrect) {
    // Увеличиваем серию
    player.correctStreak = Math.min(player.correctStreak + 1, DUEL_MAX_STREAK);
    player.lastCorrectTime = Date.now();
    
    // Начисляем очки: 1 базовое + бонус за серию
    const bonus = Math.floor(player.correctStreak / 2);
    player.score += 1 + bonus;
    
    // Обновляем общее табло
    // playerIdx 0 (слева) теперь Игрок 2 (p2), playerIdx 1 (справа) теперь Игрок 1 (p1)
    if (playerIdx === 0) {
      emotionDuelScores.p2 = player.score;
    } else {
      emotionDuelScores.p1 = player.score;
    }
    
    updateDuelScoreboard();
    
    // Визуальный фидбек при серии
    if (player.correctStreak >= 3) {
      showDuelStatus('duelStatusStreak', { 
        player: playerIdx + 1, 
        streak: player.correctStreak 
      }, 'success');
    }
  } else {
    // Сбрасываем серию при ошибке
    player.correctStreak = 0;
  }
}

// Обновление визуального индикатора игрока
function updatePlayerIndicator(playerIdx, isActive) {
  // playerIdx 0 (левый) -> p2, playerIdx 1 (правый) -> p1
  const suffix = playerIdx === 0 ? '2' : '1';
  const indicatorId = `duel-indicator-p${suffix}`;
  
  // Создаём индикатор, если нет
  let indicator = document.getElementById(indicatorId);
  if (!indicator) {
    indicator = document.createElement('div');
    indicator.id = indicatorId;
    indicator.className = `player-correct-indicator p${suffix}`;
    document.getElementById('emotion-duel-ui').appendChild(indicator);
  }
  
  if (isActive) {
    indicator.classList.add('active');
  } else {
    indicator.classList.remove('active');
  }
}

// Обновление полосы точности
function updateAccuracyBar(playerIdx, accuracy) {
  const barId = playerIdx === 0 ? 'accuracy-p2' : 'accuracy-p1';
  const bar = document.getElementById(barId);
  if (bar) {
    const percent = Math.min(100, Math.round(accuracy * 100));
    // Просто меняем ширину элемента напрямую (без CSS-переменных)
    bar.style.width = `${percent}%`;
    // Добавляем цветовую индикацию
    bar.style.background = playerIdx === 0 
      ? `linear-gradient(90deg, #4361ee, #4cc9f0)` 
      : `linear-gradient(90deg, #f72585, #b5179e)`;
  }
}

// Обновление табло счёта
function updateDuelScoreboard() {
  const p1Score = document.getElementById('duel-score-p1');
  const p2Score = document.getElementById('duel-score-p2');
  
  if (p1Score) p1Score.textContent = emotionDuelScores.p1;
  if (p2Score) p2Score.textContent = emotionDuelScores.p2;
  
  // Подсветка лидера
  if (emotionDuelScores.p1 > emotionDuelScores.p2) {
    p1Score?.classList.add('leading');
    p2Score?.classList.remove('leading');
  } else if (emotionDuelScores.p2 > emotionDuelScores.p1) {
    p2Score?.classList.add('leading');
    p1Score?.classList.remove('leading');
  } else {
    p1Score?.classList.remove('leading');
    p2Score?.classList.remove('leading');
  }
}

// Проверка условия победы
function checkDuelWinCondition() {
  const { p1, p2 } = emotionDuelScores;
  
  if (p1 >= emotionDuelTargetScore || p2 >= emotionDuelTargetScore) {
    endEmotionDuel(p1 > p2 ? 1 : p2 > p1 ? 2 : 0);
  }
}

// Завершение дуэли
function endEmotionDuel(winnerIdx) {
  emotionDuelState = 'finished';
  if (emotionDuelAnimFrame) {
    cancelAnimationFrame(emotionDuelAnimFrame);
    emotionDuelAnimFrame = null;
  }
  
  // Показываем экран результатов
  const resultScreen = document.getElementById('duel-result-screen');
  const winnerText = document.getElementById('duel-winner-text');
  const finalScore = document.getElementById('duel-final-score');
  
  const t = translations[currentLang];
  
  if (winnerIdx === 1) {
    winnerText.textContent = t?.duelWinnerP1 || '🏆 Победитель: Игрок 1!';
    winnerText.style.color = '#4361ee';
  } else if (winnerIdx === 2) {
    winnerText.textContent = t?.duelWinnerP2 || '🏆 Победитель: Игрок 2!';
    winnerText.style.color = '#f72585';
  } else {
    winnerText.textContent = t?.duelWinnerDraw || '🤝 Ничья!';
    winnerText.style.color = 'var(--warning)';
  }
  
  finalScore.textContent = `${emotionDuelScores.p1} : ${emotionDuelScores.p2}`;
  
  // Обновляем тексты кнопок
  const retryBtn = resultScreen.querySelector('.duel-btn-primary');
  const exitBtn = resultScreen.querySelector('.duel-btn-secondary');
  if (retryBtn && t?.duelBtnRetry) {
    retryBtn.innerHTML = `🔄 ${t.duelBtnRetry}`;
    retryBtn.setAttribute('data-i18n', 'duelBtnRetry');
  }
  if (exitBtn && t?.duelBtnExit) {
    exitBtn.innerHTML = `🚪 ${t.duelBtnExit}`;
    exitBtn.setAttribute('data-i18n', 'duelBtnExit');
  }
  
  // Показываем результат
  setTimeout(() => {
    resultScreen.classList.remove('hidden');
  }, 500);
  
  console.log(`🏁 Emotion Duel finished. Winner: ${winnerIdx || 'draw'}`);
}

// Показ статуса игры
function showDuelStatus(key, params = {}, type = 'info') {
  const statusEl = document.getElementById('duel-status');
  if (!statusEl) return;
  
  let text = translations[currentLang]?.[key] || key;
  for (const [k, v] of Object.entries(params)) {
    text = text.replace(`{${k}}`, v);
  }
  
  statusEl.textContent = text;
  statusEl.className = `duel-status visible ${type === 'warning' ? 'warning' : ''}`;
  
  // Автоскрытие через 2.5 сек
  clearTimeout(statusEl._hideTimer);
  statusEl._hideTimer = setTimeout(() => {
    statusEl.classList.remove('visible');
  }, 2500);
}

// Перезапуск дуэли
window.restartEmotionDuel = function() {
  // Скрываем результат
  document.getElementById('duel-result-screen').classList.add('hidden');
  
  // Сбрасываем счёт
  emotionDuelScores = { p1: 0, p2: 0 };
  emotionDuelPlayerData.forEach(p => {
    p.score = 0;
    p.correctStreak = 0;
  });
  updateDuelScoreboard();
  
  // Новая эмоция
  emotionDuelTargetEmotion = EMOTIONS[Math.floor(Math.random() * EMOTIONS.length)];
  updateDuelTargetDisplay();
  updateDuelEmotionBanner();
  
  // Возвращаемся в режим ready
  emotionDuelState = 'ready';
  document.getElementById('duel-start-btn').classList.remove('hidden');
  document.getElementById('duel-status').classList.remove('visible');
  
  // Обновляем тексты
  updateDuelUITexts();
  
  console.log('🔄 Emotion Duel: restarted');
};

// Закрытие режима дуэли
window.closeEmotionDuel = function() {
  const modal = document.getElementById('emotion-duel-modal');
  if (!modal) return;
  
  // Останавливаем цикл
  if (emotionDuelAnimFrame) {
    cancelAnimationFrame(emotionDuelAnimFrame);
    emotionDuelAnimFrame = null;
  }
  
  // Останавливаем камеру
  if (emotionDuelStream) {
    emotionDuelStream.getTracks().forEach(track => track.stop());
    emotionDuelStream = null;
  }
  
  if (emotionDuelVideo) {
    emotionDuelVideo.srcObject = null;
    emotionDuelVideo.style.display = 'none';
  }
  
  // Очищаем индикаторы
  document.querySelectorAll('.player-correct-indicator').forEach(el => el.remove());
  
  // Скрываем модалку
  modal.classList.remove('active'); // Удаляем класс 'active'
  modal.hidden = true;
  modal.style.display = 'none';

  // Очищаем ссылку на видеоэлемент
  emotionDuelVideo = null;  
  console.log('🔚 Emotion Duel: closed');
  
  // Скрываем баннер эмоции
const banner = document.getElementById('duel-emotion-banner');
if (banner) banner.hidden = true;
};

// Обработчик кнопки "Начали!"
document.addEventListener('DOMContentLoaded', () => {
  const duelStartBtn = document.getElementById('duel-start-btn');
  if (duelStartBtn) {
    duelStartBtn.addEventListener('click', () => {
      if (emotionDuelState === 'ready') {
        startEmotionDuelCamera();
      }
    });
  }
  
  // Обработчик плитки режима
  const tileDuel = document.getElementById('tile-emotion-duel');
  if (tileDuel) {
    tileDuel.addEventListener('click', () => {
      openEmotionDuel();
    });
  }
});

// ===== МОДУЛЬ УПРАВЛЕНИЯ AVATAR =====
const AvatarController = (() => {
  const container = document.getElementById('avatar-container');
  const mouth = document.querySelector('.avatar-mouth');
  const browL = document.querySelector('.brow-left');
  const browR = document.querySelector('.brow-right');
  const eyeL = document.querySelector('.eye-left');
  const eyeR = document.querySelector('.eye-right');
  const cheekL = document.querySelector('.cheek-left');
  const cheekR = document.querySelector('.cheek-right');

  let currentEmotion = 'neutral';
  let idleTimer = null;

  // Конфигурация состояний
const states = {
  neutral: {
    mouth: 'M 35 65 Q 50 65 65 65', mouthFill: 'none',
    eyeR: 4, cheekOp: 0
  },
  happy: {
    mouth: 'M 35 62 Q 50 80 65 62', mouthFill: 'none',
    eyeR: 4, cheekOp: 0.6
  },
  sad: {
    mouth: 'M 35 75 Q 50 55 65 75', mouthFill: 'none',
    eyeR: 4, cheekOp: 0
  },
  angry: {
    mouth: 'M 40 70 L 60 70', mouthFill: 'none',
    eyeR: 3, cheekOp: 0.2
  },
  surprised: {
    mouth: 'M 45 60 C 45 75 55 75 55 60 Z', mouthFill: 'var(--text)',
    eyeR: 7, cheekOp: 0.3
  },
  fearful: {
    mouth: 'M 35 72 Q 50 58 65 72', mouthFill: 'none',
    eyeR: 5, cheekOp: 0.1
  },
  disgusted: {
    mouth: 'M 35 68 Q 45 65 50 68 Q 55 71 65 68', mouthFill: 'none',
    eyeR: 4, cheekOp: 0
  }
};

  function applyState(name) {
    const s = states[name] || states.neutral;
    if (mouth) { mouth.setAttribute('d', s.mouth); mouth.style.fill = s.mouthFill; }
 setBrows(name);
    if (eyeL) eyeL.setAttribute('r', s.eyeR);
    if (eyeR) eyeR.setAttribute('r', s.eyeR);
    if (cheekL) cheekL.style.opacity = s.cheekOp;
    if (cheekR) cheekR.style.opacity = s.cheekOp;
  }

  function update(detected, confidence) {
    if (!container) return;
    
    // Если камера не активна, скрываем аватара
    const video = document.getElementById('camera-feed');
    if (video.style.display === 'none') {
      container.hidden = true;
      return;
    } else {
      container.hidden = false;
    }

    clearTimeout(idleTimer);

    // Логика: если уверенность низкая или эмоция нейтральная -> сброс через 2 сек
    if (confidence < 0.45 || detected === 'neutral') {
      if (currentEmotion !== 'neutral') {
        currentEmotion = 'neutral';
        applyState('neutral');
      }
      idleTimer = setTimeout(() => {
        currentEmotion = 'neutral';
        applyState('neutral');
      }, 2000);
      return;
    }

    // Маппинг эмоций
let newState = 'neutral';
switch (detected) {
  case 'happy': newState = 'happy'; break;
  case 'sad': newState = 'sad'; break;
  case 'angry': newState = 'angry'; break;
  case 'surprised': newState = 'surprised'; break;
  case 'fearful': newState = 'fearful'; break;
  case 'disgusted': newState = 'disgusted'; break;
  default: newState = 'neutral';
}

    if (newState !== currentEmotion) {
      currentEmotion = newState;
      applyState(newState);
    }
  }

  return { update };
})();

const mouth = document.querySelector('.avatar-mouth');


window.setAvatarEmotion = (emotion) => {
  if (!mouth) return;

  // Конфигурация эмоций для рта
const mouths = {
  neutral: "M 35 65 Q 50 65 65 65",
  happy: "M 35 62 Q 50 80 65 62",              // 😊 широкая улыбка
  sad: "M 35 75 Q 50 55 65 75",                // 😢 грустная дуга
  surprised: "M 45 60 C 45 75 55 75 55 60 Z",  // 😮 открытый овал
  angry: "M 40 70 L 60 70",                    // 😠 прямая линия
  fearful: "M 35 72 Q 50 58 65 72",            // 😨 мягкая грусть
  disgusted: "M 35 68 Q 45 65 50 68 Q 55 71 65 68" // 🤢 волнистая асимметрия
};


  // 1. Меняем рот
  if (mouths[emotion]) {
    mouth.setAttribute('d', mouths[emotion]);
  }


  // 3. Меняем щёчки
  const cheeks = document.querySelectorAll('.avatar-cheeks circle');
if (cheeks.length) {
  cheeks.forEach(c => {
    c.style.opacity = (emotion === 'happy' || emotion === 'surprised') ? '0.6' : '0';
  });
}
};

const browL = document.getElementById('brow-left');
const browR = document.getElementById('brow-right');

function setBrows(emotion) {

  const presets = {

    // 😐
    neutral: {
      left:  [30,35, 42,35],
      right: [58,35, 70,35]
    },

    // 😊 внешние края вверх
    happy: {
      left:  [30,32, 42,36],
      right: [58,36, 70,32]
    },

    // 😢 внутренние края вверх
    sad: {
      left:  [30,37, 42,31],
      right: [58,31, 70,37]
    },

    // 😮 обе вверх
    surprised: {
      left:  [30,29, 42,29],
      right: [58,29, 70,29]
    },

    // 😠 внутренние края вниз
    angry: {
      left:  [30,31, 42,38],
      right: [58,38, 70,31]
    },

    // 😨 как sad, но мягче
    fearful: {
      left:  [30,36, 42,32],
      right: [58,32, 70,36]
    },

    // 🤢 асимметрия
    disgusted: {
      left:  [30,33, 42,36],
      right: [58,34, 70,31]
    }
  };

  const p = presets[emotion] || presets.neutral;

  // Левая
  browL.setAttribute('x1', p.left[0]);
  browL.setAttribute('y1', p.left[1]);
  browL.setAttribute('x2', p.left[2]);
  browL.setAttribute('y2', p.left[3]);

  // Правая
  browR.setAttribute('x1', p.right[0]);
  browR.setAttribute('y1', p.right[1]);
  browR.setAttribute('x2', p.right[2]);
  browR.setAttribute('y2', p.right[3]);
}

// ===== МОДАЛКА СОЦСЕТЕЙ =====
document.addEventListener('DOMContentLoaded', () => {
  const socialBtn = document.getElementById('social-btn');
  const socialModal = document.getElementById('social-modal');
  const socialClose = socialModal?.querySelector('.modal-close');
  
  if (!socialBtn || !socialModal) return;
  
  // Открытие
  socialBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    socialModal.hidden = false;
    socialModal.classList.add('active');
    document.body.style.overflow = 'hidden'; // Блокируем скролл
  });
  
  // Закрытие по крестику
  if (socialClose) {
    socialClose.addEventListener('click', closeSocialModal);
  }
  
  // Закрытие по клику на фон
  socialModal.addEventListener('click', (e) => {
    if (e.target === socialModal) closeSocialModal();
  });
  
  // Закрытие по Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !socialModal.hidden) {
      closeSocialModal();
    }
  });
  
  // Функция закрытия
  function closeSocialModal() {
    socialModal.classList.remove('active');
    setTimeout(() => {
      socialModal.hidden = true;
      document.body.style.overflow = '';
    }, 200);
  }
  
  // Остановка всплытия для ссылок (чтобы не закрывалась модалка при клике)
  socialModal.querySelectorAll('.social-link').forEach(link => {
    link.addEventListener('click', (e) => e.stopPropagation());
  });
});

// === АНИМАЦИИ ЛОГОТИПА ПРИ КЛИКЕ ===
(() => {
  const logo = document.querySelector('.app-icon');
  if (!logo) return;

  // Список классов анимаций
  const effects = ['anim-pulse', 'anim-spin3d', 'anim-jelly', 'anim-glitch', 'anim-magnet'];
  let isAnimating = false;

  logo.addEventListener('click', (e) => {
    if (isAnimating) return; // Защита от спама кликов
    isAnimating = true;

    // Выбираем случайную анимацию
    const randomEffect = effects[Math.floor(Math.random() * effects.length)];
    logo.classList.add(randomEffect);

    // Удаляем класс после завершения, чтобы вернуться к gentleFloat
    const handleEnd = () => {
      logo.classList.remove(randomEffect);
      isAnimating = false;
      logo.removeEventListener('animationend', handleEnd);
      logo.removeEventListener('webkitAnimationEnd', handleEnd);
    };
    logo.addEventListener('animationend', handleEnd);
    logo.addEventListener('webkitAnimationEnd', handleEnd); // для старых Safari/iOS
  });
})();

// ===== МОДУЛЬ ИСТОРИИ ПРОГРЕССА =====
const ProgressModule = (() => {
  const STORAGE_KEY = 'mimic_progress_history';
  const MAX_ENTRIES = 100;
  let chartInstance = null;

  // 1. Управление данными
  const Storage = {
    get: () => {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } 
      catch { return []; }
    },
    save: (data) => {
      const history = Storage.get();
      history.push(data);
      if (history.length > MAX_ENTRIES) history.shift();
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history)); } 
      catch (e) { console.warn('⚠️ Progress storage quota exceeded'); }
    },
    clear: () => {
      localStorage.removeItem(STORAGE_KEY);
      updateSummary();
      renderChart();
    }
  };

  // 2. Трекер текущей сессии
  const Session = {
    data: { startTime: null, correct: 0, total: 0, streak: 0, maxStreak: 0, score: 0, mode: 'training' },
    start: (mode = 'training') => {
      Session.data = { startTime: Date.now(), correct: 0, total: 0, streak: 0, maxStreak: 0, score: 0, mode };
    },
    correct: () => {
      Session.data.correct++; Session.data.total++; Session.data.score += 10;
      Session.data.streak++;
      if (Session.data.streak > Session.data.maxStreak) Session.data.maxStreak = Session.data.streak;
    },
    incorrect: () => {
      Session.data.total++; Session.data.streak = 0;
    },
end: () => {
  const duration = Math.max(0, Math.round((Date.now() - (Session.data.startTime || Date.now())) / 1000));
  const accuracy = Session.data.total > 0 
    ? Math.round((Session.data.correct / Session.data.total) * 100) 
    : 0;

  return { 
    date: new Date().toISOString(), 
    mode: Session.data.mode, 
    accuracy, 
    streak: Session.data.maxStreak, 
    time: duration, 
    score: Session.data.score,
    total: Session.data.total,
    correct: Session.data.correct
  };
}
  };

  // 3. UI Обновления
  const UI = {
    open: () => {
      document.getElementById('progress-modal').classList.add('active');
      updateSummary();
      renderChart();
    },
    close: () => document.getElementById('progress-modal').classList.remove('active')
  };

  function updateSummary() {
    const history = Storage.get();
    const total = history.length;
    const bestStreak = total ? Math.max(...history.map(h => h.streak)) : 0;
    const avgAcc = total ? Math.round(history.reduce((a, h) => a + h.accuracy, 0) / total) : 0;

    document.getElementById('stat-sessions').textContent = total;
    document.getElementById('stat-streak').textContent = bestStreak;
    document.getElementById('stat-accuracy').textContent = `${avgAcc}%`;
  }

function renderChart() {
  const history = Storage.get();
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
  const textColor = isDark ? '#eaeaea' : '#212529';
  const primary = isDark ? '#5a76ff' : '#4361ee';
  const primaryAlpha = isDark ? 'rgba(90,118,255,0.2)' : 'rgba(67,97,238,0.2)';

  // 🆕 Уничтожаем старые графики перед перерисовкой, чтобы не было наложения
  if (window.chartYInstance) window.chartYInstance.destroy();
  if (window.chartDataInstance) window.chartDataInstance.destroy();

  const labels = history.map(h => new Date(h.date).toLocaleDateString());
  const dataValues = history.map(h => h.accuracy);

  // ==========================================
  // 1. ГРАФИК ТОЛЬКО ДЛЯ ОСИ Y
  // ==========================================
  const ctxY = document.getElementById('progress-chart-y');
  if (ctxY) {
    window.chartYInstance = new Chart(ctxY, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{ data: [] }] // Пустые данные, рисуем только ось
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false }, // Скрываем ось X
          y: {
            display: true,
            min: 0,
            max: 100,
            grid: { color: gridColor, drawOnChartArea: false }, // Не рисуем линии вправо, они будут на правом графике
            ticks: { color: textColor, stepSize: 20, font: { size: 11 } }
          }
        }
      }
    });
  }

  // ==========================================
  // 2. ГРАФИК С ДАННЫМИ
  // ==========================================
  const ctxData = document.getElementById('progress-chart-data');
  
  if (ctxData) {
    //  1. Рассчитываем необходимую ширину: минимум 1000px, либо 100px на каждую точку
    const pointWidth = 50;
    const calculatedWidth = Math.max(1000, history.length * pointWidth);
    
    // 2. Задаем ширину и высоту напрямую через атрибуты канваса (не через style)
    ctxData.width = calculatedWidth;
    ctxData.height = ctxData.parentElement.clientHeight || 250; // Высота берется из родителя или фиксированная
    
    //  3. Создаём график
    window.chartDataInstance = new Chart(ctxData, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: translations[currentLang]?.accuracyLabel || 'Accuracy',
          data: dataValues,
          borderColor: primary,
          backgroundColor: primaryAlpha,
          tension: 0.4,
          pointRadius: 5,
          pointHoverRadius: 8,
          pointBackgroundColor: primary,
          pointBorderColor: '#ffffff',
          pointBorderWidth: 2,
          fill: true,
          borderWidth: 2
        }]
      },
      options: {
        responsive: false, // отключаем авто-сжатие под узкого родителя
        maintainAspectRatio: false,
        layout: {
          padding: { right: 20 }
        },
        interaction: {
          mode: 'nearest',
          axis: 'x',
          intersect: false
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            mode: 'nearest',
            intersect: false,
            position: 'nearest',
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            titleColor: '#ffffff',
            bodyColor: '#ffffff',
            borderColor: primary,
            borderWidth: 1,
            caretPadding: 12,
            caretSize: 6,
            displayColors: false,
            cornerRadius: 8,
            titleFont: { size: 13, weight: 'bold' },
            bodyFont: { size: 13 },
            callbacks: {
              title: (context) => {
                return context[0].label;
              },
label: (context) => {
  const t = translations[currentLang] || {};
  return `${t.accuracyLabel || 'Точность'}: ${context.parsed.y}%`;
}
            }
          }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { 
              color: textColor, 
              maxTicksLimit: 15,
              font: { size: 11 }
            }
          },
          y: {
            display: false,
            min: 0,
            max: 100,
            grid: { 
              color: gridColor, 
              drawOnChartArea: true 
            }
          }
        }
      }
    });
	    initChartPanning();
  }
}

// 🆕 Функция для включения перетаскивания и скролла графика
function initChartPanning() {
  const container = document.querySelector('.chart-data-container');
  if (!container) return;

  // 1. Прокрутка колесиком мыши (превращаем вертикальный скролл в горизонтальный)
  container.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault(); // Предотвращаем стандартную прокрутку страницы
      container.scrollLeft += e.deltaY;
    }
  }, { passive: false }); // passive: false ОБЯЗАТЕЛЕН для работы preventDefault

  // 2. Перетаскивание мышью (Desktop)
  let isDown = false;
  let startX;
  let scrollLeft;

  container.addEventListener('mousedown', (e) => {
    isDown = true;
    startX = e.pageX - container.offsetLeft;
    scrollLeft = container.scrollLeft;
  });

  container.addEventListener('mouseleave', () => {
    isDown = false;
  });

  container.addEventListener('mouseup', () => {
    isDown = false;
  });

  container.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - container.offsetLeft;
    const walk = (x - startX) * 1.5; // Множитель 1.5 делает перетаскивание более отзывчивым
    container.scrollLeft = scrollLeft - walk;
  });

  // 3. Перетаскивание пальцем (Mobile)
  // Примечание: современные браузеры и так поддерживают нативный тач-скролл для overflow-x.
  // Этот код делает его более явным и плавным, синхронизируя с движением пальца.
  let touchStartX = 0;
  let touchScrollLeft = 0;

  container.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].pageX;
    touchScrollLeft = container.scrollLeft;
  }, { passive: true });

  container.addEventListener('touchmove', (e) => {
    const x = e.touches[0].pageX;
    const walk = (touchStartX - x);
    container.scrollLeft = touchScrollLeft + walk;
  }, { passive: true });
}

  function hookExistingFunctions() {
    // Запуск сессии при старте камеры
    const originalStart = window.startCamera;
    window.startCamera = async function() {
		  
		  //  Делаем кнопку истории неактивной во время работы камеры
const progressBtn = document.getElementById('menu-progress');
if (progressBtn) {
  progressBtn.disabled = true;
  progressBtn.style.opacity = '0.5';
  progressBtn.style.cursor = 'not-allowed';
}
      Session.start('training');
	  startSessionTimer();
      if (typeof originalStart === 'function') await originalStart();
    };

    // Запуск сессии в дуэте
    const originalDuel = window.openEmotionDuel;
    window.openEmotionDuel = async function() {
      Session.start('duel');
      if (typeof originalDuel === 'function') await originalDuel();
    };

    // Запись правильного ответа
    const originalAddScore = window.addScore || (() => {});
    // Поскольку addScore вызывается только при успехе, вешаемся на него через proxy или просто вызываем Session.correct()
    // Безопаснее: добавим вызов прямо в существующую функцию addScore
    // Но чтобы не трогать код, используем MutationObserver или просто расширим логику:
    // Проще: в функции addScore добавить ProgressModule.trackCorrect();
  }

  // Публичный API
  return {
    trackCorrect: Session.correct.bind(Session),
    trackIncorrect: Session.incorrect.bind(Session),
saveSession: () => {
  const data = Session.end();
  
  // ФИЛЬТР: сохраняем только если:
  // • Было хотя бы одно ПРАВИЛЬНОЕ действие (correct > 0) ИЛИ
  // • Сессия длилась > 15 секунд И было хоть одно действие (любое) ИЛИ
  // • Были набраны очки (score > 0)
  const hasMeaningfulActivity = 
    data.correct > 0 || 
    (data.time > 15 && data.total > 0) || 
    data.score > 0;
  
  //  Отладка (можно убрать после тестов)
  console.log('📊 Session end:', { 
    time: data.time, 
    total: data.total, 
    correct: data.correct, 
    score: data.score,
    save: hasMeaningfulActivity 
  });
  
  if (hasMeaningfulActivity) {
    Storage.save(data);
	Session.start(data.mode);
    if (document.getElementById('progress-modal')?.classList.contains('active')) {
      updateSummary();
    }
  }
},
Session: Session,
    init: () => {
      // Обработчики UI
      document.getElementById('menu-progress')?.addEventListener('click', UI.open);
      document.getElementById('progress-close')?.addEventListener('click', UI.close);
      document.getElementById('clear-progress-btn')?.addEventListener('click', () => {
        if (confirm(currentLang === 'ru' ? 'Удалить всю историю?' : 'Clear all history?')) Storage.clear();
      });
      
      // Закрытие по клику на фон
      document.getElementById('progress-modal')?.addEventListener('click', e => {
        if (e.target.id === 'progress-modal') UI.close();
      });

      hookExistingFunctions();
      console.log('📊 Progress Module initialized');
    }
  };
})();

// Инициализация после загрузки DOM
document.addEventListener('DOMContentLoaded', ProgressModule.init);

// ===== ЭКСПОРТ ПРОГРЕССА В PDF =====
const ProgressExport = (() => {
  let jsPDF, html2canvas;

  // Ленивая загрузка библиотек
  async function loadLibs() {
    if (jsPDF && html2canvas) return;
    
    // Проверка глобальных объектов (для UMD-сборок)
    if (window.jspdf?.jsPDF) {
      jsPDF = window.jspdf.jsPDF;
    } else if (typeof window.jsPDF !== 'undefined') {
      jsPDF = window.jsPDF;
    }
    
    html2canvas = window.html2canvas;
    
    if (!jsPDF || !html2canvas) {
      throw new Error('PDF libraries not loaded');
    }
  }

  // Форматирование даты для имени файла
  function getFilenameDate() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  // Основная функция экспорта
// ===== ИСПРАВЛЕННАЯ ФУНКЦИЯ ЭКСПОРТА (график + таблица) =====
async function exportProgress() {
  const t = translations[currentLang];
  const btn = document.getElementById('save-progress-btn');
  
  // Объявляем переменную ДО try
  let originalText = '';

  try {
    if (!btn) return;
    
    await loadLibs();
    
    originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `⏳ ${t.saveProgressGenerating || 'Generating...'}`;

    // Получаем данные
    const history = JSON.parse(localStorage.getItem('mimic_progress_history') || '[]');
    const total = history.length;
    const bestStreak = total ? Math.max(...history.map(h => h.streak || 0)) : 0;
    const avgAcc = total ? Math.round(history.reduce((a, h) => a + (h.accuracy || 0), 0) / total) : 0;

    // Форматирование
    const formatDate = (iso) => new Date(iso).toLocaleDateString(currentLang === 'ru' ? 'ru-RU' : 'en-US', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
    const formatTime = (iso) => new Date(iso).toLocaleTimeString(currentLang === 'ru' ? 'ru-RU' : 'en-US', {
      hour: '2-digit', minute: '2-digit'
    });
    const formatDuration = (sec) => sec < 60 ? `${sec}с` : `${Math.floor(sec/60)}м ${sec%60}с`;

    // Создаём временный контейнер
    const exportContainer = document.createElement('div');
    exportContainer.style.cssText = `
      position: fixed; left: -9999px; top: 0; width: 800px; padding: 30px;
      background: white; color: #212529; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: -1; font-size: 13px;
    `;
    
    const dateStr = new Date().toLocaleString(currentLang === 'ru' ? 'ru-RU' : 'en-US');

    // Сводные карточки
    const summaryCards = `
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 20px;">
        <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; text-align: center; border: 1px solid #dee2e6;">
          <div style="font-size: 24px; font-weight: 700; color: #4361ee;">${total}</div>
          <div style="font-size: 11px; color: #6c757d;">${t.pdfSessions || 'Sessions'}</div>
        </div>
        <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; text-align: center; border: 1px solid #dee2e6;">
          <div style="font-size: 24px; font-weight: 700; color: #2ecc71;">${bestStreak}</div>
          <div style="font-size: 11px; color: #6c757d;">${t.pdfBestStreak || 'Best Streak'}</div>
        </div>
        <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; text-align: center; border: 1px solid #dee2e6;">
          <div style="font-size: 24px; font-weight: 700; color: #f72585;">${avgAcc}%</div>
          <div style="font-size: 11px; color: #6c757d;">${t.pdfAvgAccuracy || 'Avg Accuracy'}</div>
        </div>
      </div>
    `;

    //  ГРАФИК: показываем, если есть хоть какие-то данные
    let chartSection = '';
    if (history.length > 0) {
      chartSection = `
        <div style="margin-bottom: 20px; page-break-inside: avoid;">
          <div style="font-weight: 600; margin-bottom: 8px; color: #4361ee;">📊 ${t.accuracyLabel || 'Accuracy'}:</div>
          <canvas id="export-chart" width="740" height="280"></canvas>
        </div>
      `;
    }

    // Таблица сессий
    let tableSection = '';
    if (history.length > 0) {
      const sortedHistory = [...history].sort((a, b) => new Date(b.date) - new Date(a.date));
      const tableRows = sortedHistory.map(h => {
        const modeLabel = h.mode === 'duel' 
          ? (currentLang === 'ru' ? 'Дуэль' : 'Duel') 
          : (currentLang === 'ru' ? 'Тренировка' : 'Training');
        return `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 6px 4px; font-size: 12px;">${formatDate(h.date)}<br><small style="color:#6c757d">${formatTime(h.date)}</small></td>
            <td style="padding: 6px 4px; font-size: 12px;">${modeLabel}</td>
            <td style="padding: 6px 4px; font-weight: 600; color: ${h.accuracy >= 70 ? '#2ecc71' : h.accuracy >= 40 ? '#f1c40f' : '#e74c3c'};">${h.accuracy || 0}%</td>
            <td style="padding: 6px 4px; font-size: 12px;">${h.streak || 0}</td>
            <td style="padding: 6px 4px; font-size: 12px;">${formatDuration(h.time || 0)}</td>
            <td style="padding: 6px 4px; font-size: 12px;">${h.score || 0}</td>
            <td style="padding: 6px 4px; font-size: 11px; color: #6c757d;">${h.correct || 0}/${h.total || 0}</td>
          </tr>
        `;
      }).join('');

      tableSection = `
        <div style="page-break-inside: avoid;">
          <div style="font-weight: 600; margin: 16px 0 8px; color: #4361ee; display: flex; align-items: center; gap: 6px;">
            📋 ${t.pdfSessionsTable || 'Session Details'}
            <span style="font-weight: 400; color: #6c757d; font-size: 12px;">(${sortedHistory.length})</span>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
              <tr style="background: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                <th style="padding: 8px 4px; text-align: left; font-weight: 600; color: #495057;">${t.pdfDate}</th>
                <th style="padding: 8px 4px; text-align: left; font-weight: 600; color: #495057;">${t.pdfMode}</th>
                <th style="padding: 8px 4px; text-align: left; font-weight: 600; color: #495057;">${t.pdfAccuracy}</th>
                <th style="padding: 8px 4px; text-align: left; font-weight: 600; color: #495057;">${t.pdfStreak}</th>
                <th style="padding: 8px 4px; text-align: left; font-weight: 600; color: #495057;">${t.pdfDuration}</th>
                <th style="padding: 8px 4px; text-align: left; font-weight: 600; color: #495057;">${t.pdfScore}</th>
                <th style="padding: 8px 4px; text-align: left; font-weight: 600; color: #495057;">${t.pdfTotalAttempts}</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table>
        </div>
      `;
    }

    // Футер
    const footer = `
      <div style="font-size: 10px; color: #6c757d; border-top: 1px solid #dee2e6; padding-top: 12px; margin-top: 20px; text-align: center;">
        <div>${t.pdfGenerated || 'Generated:'} ${dateStr}</div>
        <div style="margin-top: 4px;">${t.pdfFooter || 'All data is stored locally on your device.'}</div>
        <div style="margin-top: 4px; font-weight: 500;">mimic-trainer • v1.0</div>
      </div>
    `;

    // Собираем HTML
    exportContainer.innerHTML = `
      <h2 style="margin: 0 0 16px; color: #4361ee; font-size: 22px; border-bottom: 2px solid #4361ee; padding-bottom: 10px;">${t.pdfHeader || 'MIMIC — Training History'}</h2>
      ${summaryCards}
      ${chartSection}
      ${tableSection}
      ${footer}
    `;

    document.body.appendChild(exportContainer);

    //  Рендерим график если есть данные
    let exportChart = null;
    if (history.length > 0) {
      // Ждём, чтобы канвас точно появился в DOM
      await new Promise(resolve => setTimeout(resolve, 150));
      
      const exportCtx = document.getElementById('export-chart')?.getContext('2d');
      if (exportCtx) {
        exportChart = new Chart(exportCtx, {
          type: 'line',
          data: {
            // 🔧 Используем ВСЮ историю для графика
            labels: history.map(h => formatDate(h.date)),
            datasets: [{
              label: t.accuracyLabel || 'Accuracy (%)',
              data: history.map(h => h.accuracy || 0),
              borderColor: '#4361ee',
              backgroundColor: 'rgba(67, 97, 238, 0.1)',
              tension: 0.4,
              pointRadius: 3,
              fill: true,
              borderWidth: 2
            }]
          },
          options: {
            responsive: false,
            maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { enabled: false } },
            scales: {
              x: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#6c757d', maxTicksLimit: 6, font: { size: 10 } } },
              y: { grid: { color: 'rgba(0,0,0,0.05)' }, ticks: { color: '#6c757d', font: { size: 10 } }, beginAtZero: true, max: 100, title: { display: true, text: '%', font: { size: 10 } } }
            }
          }
        });

        //  Ждём ПОЛНОЙ отрисовки графика (Canvas рендерится асинхронно)
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    //  Делаем "снимок" ПОСЛЕ полной отрисовки графика
    const canvas = await html2canvas(exportContainer, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 800,
      windowHeight: exportContainer.scrollHeight
    });

    //  Уничтожаем график ПОСЛЕ создания снимка
    if (exportChart) {
      exportChart.destroy();
    }

    // Очищаем временный элемент
    document.body.removeChild(exportContainer);

    // Создаём PDF
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

    const imgWidth = 210;
    const pageHeight = 297;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;

    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    const filename = `mimic-history-${getFilenameDate()}.pdf`;
    pdf.save(filename);
    showStatus(t.saveProgressSuccess || '✅ Saved!', 'success');

  } catch (err) {
    console.error('Export error:', err);
    showStatus(t.saveProgressError || '❌ Export failed', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

  // Инициализация обработчика
  function init() {
    const saveBtn = document.getElementById('save-progress-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', exportProgress);
    }
  }

  return { init };
})();

// Инициализируем после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
  ProgressExport.init();
});

// ===== МОДУЛЬ ТАЙМ-ДИЛЕЯ (ЭХО) =====
const TimeDelayModule = (() => {
  const DELAY_SECONDS = 3;
  const FPS = 10; // Кадров в секунду для буфера
  const BUFFER_SIZE = DELAY_SECONDS * FPS;
  
  let frameBuffer = [];
  let canvas = null;
  let ctx = null;
  let isActive = false;
  let intervalId = null;
  
  function init() {
    canvas = document.getElementById('time-delay-canvas');
    if (!canvas) return;
    
    ctx = canvas.getContext('2d');
    
    // Обработчик кнопки
    const btn = document.getElementById('btn-time-delay');
    if (btn) {
      btn.addEventListener('click', toggle);
    }
    
    console.log('⏱️ TimeDelay Module initialized');
  }
  
function toggle() {
  isActive = !isActive;
  const btn = document.getElementById('btn-dynamic-bg');
  
  if (isActive) {
    // задаём фон по умолчанию СРАЗУ при включении
    currentBg = BACKGROUNDS.neutral;
    btn?.classList.add('active');
    console.log('🎨 DynamicBackground: ON');
  } else {
    btn?.classList.remove('active');
    currentBg = null;
    console.log('🎨 DynamicBackground: OFF');
    
    //  Убираем внешнее сияние при выключении
    const cameraWrapper = document.querySelector('.camera-wrapper');
    if (cameraWrapper) {
      cameraWrapper.classList.remove(
        'glow-happy', 'glow-sad', 'glow-angry', 
        'glow-surprised', 'glow-fearful', 'glow-disgusted', 'glow-neutral'
      );
    }
  }
}
  
  function start() {
    const video = document.getElementById('camera-feed');
    if (!video) return;
    
    // Синхронизируем размер canvas с видео
    canvas.width = 320;
    canvas.height = 240;
    
    // Запускаем захват кадров
    intervalId = setInterval(() => {
      if (video.readyState < 2) return;
      
      // Создаём временный canvas для захвата кадра
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      
      // Рисуем текущий кадр видео
      tempCtx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Добавляем в буфер
      frameBuffer.push(tempCanvas);
      
      // Ограничиваем размер буфера
      if (frameBuffer.length > BUFFER_SIZE) {
        frameBuffer.shift();
      }
      
      // Отображаем самый старый кадр (задержка)
      if (frameBuffer.length === BUFFER_SIZE) {
        const delayedFrame = frameBuffer[0];
        ctx.drawImage(delayedFrame, 0, 0);
      }
    }, 1000 / FPS);
  }
  
  function stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
    frameBuffer = [];
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }
  
  return { init, toggle };
})();

// ===== МОДУЛЬ ДИНАМИЧЕСКИХ ФОНОВ =====
const DynamicBackgroundModule = (() => {
  // Фоны для каждой эмоции
  const BACKGROUNDS = {
    happy: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)',
    sad: 'linear-gradient(135deg, #4A90E2 0%, #5F6FAF 100%)',
    angry: 'linear-gradient(135deg, #FF4500 0%, #8B0000 100%)',
    surprised: 'linear-gradient(135deg, #9B59B6 0%, #E91E63 100%)',
    fearful: 'linear-gradient(135deg, #2C3E50 0%, #000000 100%)',
    disgusted: 'linear-gradient(135deg, #8B4513 0%, #556B2F 100%)',
    neutral: 'linear-gradient(135deg, #95A5A6 0%, #7F8C8D 100%)'
  };
  
  let isActive = false;
  let currentBg = null;
  let bgCanvas = null;
  let bgCtx = null;
  
  function init() {
    bgCanvas = document.createElement('canvas');
    bgCtx = bgCanvas.getContext('2d');
    
    const btn = document.getElementById('btn-dynamic-bg');
    if (btn) {
      btn.addEventListener('click', toggle);
    }
    console.log('🎨 DynamicBackground Module initialized');
  }
  
    //  Метод для отключения режима
  function disable() {
    const cameraWrapper = document.querySelector('.camera-wrapper');
    if (cameraWrapper) {
      cameraWrapper.style.background = '';
      cameraWrapper.style.animation = '';
    }
    currentEmotion = null;
  }
  
  function toggle() {
    isActive = !isActive;
    const btn = document.getElementById('btn-dynamic-bg');
    
    if (isActive) {
      // ✅ ИСПРАВЛЕНИЕ #1: задаём фон по умолчанию СРАЗУ
      currentBg = BACKGROUNDS.neutral;
      btn?.classList.add('active');
      console.log('🎨 DynamicBackground: ON');
    } else {
      btn?.classList.remove('active');
      currentBg = null;
      console.log('🎨 DynamicBackground: OFF');
      
      // Убираем внешнее сияние при выключении
      const cameraWrapper = document.querySelector('.camera-wrapper');
      if (cameraWrapper) {
        cameraWrapper.classList.remove(
          'glow-happy', 'glow-sad', 'glow-angry', 
          'glow-surprised', 'glow-fearful', 'glow-disgusted', 'glow-neutral'
        );
      }
    }
  }
  
  function updateBackground(emotionKey) {
    if (!isActive) return;
    
    const bg = BACKGROUNDS[emotionKey] || BACKGROUNDS.neutral;
    if (currentBg === bg) return;
    
    currentBg = bg;
    console.log(`🎨 Background changed to: ${emotionKey}`);
    
    // Управление внешним сиянием через CSS-классы
    const cameraWrapper = document.querySelector('.camera-wrapper');
    if (cameraWrapper) {
      cameraWrapper.classList.remove(
        'glow-happy', 'glow-sad', 'glow-angry',
        'glow-surprised', 'glow-fearful', 'glow-disgusted', 'glow-neutral'
      );
      cameraWrapper.classList.add(`glow-${emotionKey}`);
    }
  }
  
  function renderBackground(segmentation, canvas) {
    //  добавили проверку !currentBg
    if (!isActive || !segmentation?.data || !currentBg) return false;
	  //  проверяем, что canvas имеет валидные размеры
	 if (!canvas || canvas.width === 0 || canvas.height === 0) return false;
    
    const ctx = canvas.getContext('2d');
    const { width, height, data } = segmentation;
    
    if (bgCanvas.width !== width || bgCanvas.height !== height) {
      bgCanvas.width = width;
      bgCanvas.height = height;
    }
    
    // Анимация времени для пульсации
    const time = performance.now() / 1000;
    
    // Рисуем градиентный фон
    const gradient = bgCtx.createLinearGradient(0, 0, width, height);
    const colors = currentBg.match(/#[A-Fa-f0-9]{6}/g) || ['#95A5A6', '#7F8C8D'];
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(1, colors[1]);
    bgCtx.fillStyle = gradient;
    bgCtx.fillRect(0, 0, width, height);
    
    // ЭФФЕКТ СИЯНИЯ: пульсирующий radial-gradient в центре
    const centerX = width / 2;
    const centerY = height / 2;
    const pulseRadius = width * (0.3 + 0.1 * Math.sin(time * 1.5));
    
    const glowGradient = bgCtx.createRadialGradient(
      centerX, centerY, 0,
      centerX, centerY, pulseRadius
    );
    
    const glowOpacity = 0.15 + 0.1 * Math.sin(time * 2);
    glowGradient.addColorStop(0, `rgba(255, 255, 255, ${glowOpacity})`);
    glowGradient.addColorStop(0.5, `rgba(255, 255, 255, ${glowOpacity * 0.5})`);
    glowGradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    bgCtx.fillStyle = glowGradient;
    bgCtx.fillRect(0, 0, width, height);
    
    // ВТОРОЕ СИЯНИЕ: меньшее, смещённое
    const offsetX = width * 0.3 * Math.cos(time * 0.8);
    const offsetY = height * 0.2 * Math.sin(time * 0.6);
    const smallRadius = width * 0.2;
    
    const glow2 = bgCtx.createRadialGradient(
      centerX + offsetX, centerY + offsetY, 0,
      centerX + offsetX, centerY + offsetY, smallRadius
    );
    
    const glow2Opacity = 0.1 + 0.08 * Math.cos(time * 2.5);
    glow2.addColorStop(0, `rgba(255, 255, 255, ${glow2Opacity})`);
    glow2.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    bgCtx.fillStyle = glow2;
    bgCtx.fillRect(0, 0, width, height);
	
	  // проверяем размеры перед getImageData
	  if (canvas.width === 0 || canvas.height === 0) return false;
    
    // Применяем маску: рисуем фон только там, где НЕТ человека
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const bgImageData = bgCtx.getImageData(0, 0, width, height);
    const scaleX = canvas.width / width;
    const scaleY = canvas.height / height;
    
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const segIdx = y * width + x;
        if (data[segIdx] === 0) {
          const canvasX = Math.floor(x * scaleX);
          const canvasY = Math.floor(y * scaleY);
          const canvasIdx = (canvasY * canvas.width + canvasX) * 4;
          const bgIdx = segIdx * 4;
          imageData.data[canvasIdx] = bgImageData.data[bgIdx];
          imageData.data[canvasIdx + 1] = bgImageData.data[bgIdx + 1];
          imageData.data[canvasIdx + 2] = bgImageData.data[bgIdx + 2];
          imageData.data[canvasIdx + 3] = 255;
        }
      }
    }
    
    ctx.putImageData(imageData, 0, 0);
    return true;
  }
  
  return { init, toggle, updateBackground, renderBackground, disable };
})();

// ===== РЕЖИМ "ЭХО-ЗЕРКАЛО" =====
const EchoMirrorMode = (() => {
  // Конфигурация
  const ECHO_DELAY_SEC = 5;
  const TASKS_PER_ROUND = 5;
  const HOLD_DURATION_SEC = 5;           // Удержание для repeat/opposite
  const RHYTHM_HOLD_DURATION_SEC = 2;    // Удержание для rhythm (быстрее)
  const PAUSE_DURATION_SEC = 3;
  const CONFIDENCE_THRESHOLD = 0.5;
  
  // Противоположные эмоции
  const OPPOSITE_EMOTIONS = {
    happy: 'sad',
    sad: 'happy',
    angry: 'fearful',
    fearful: 'angry',
    surprised: 'neutral',
    disgusted: 'happy'
  };
  
// Функция для получения рандомных эмоций
function getRandomEmotions(count) {
  const allEmotions = ['happy', 'sad', 'angry', 'surprised', 'fearful', 'disgusted'];
  const shuffled = allEmotions.sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}
  
  // Состояние
  let stream = null;
  let video = null;
  let echoCanvas = null;
  let echoCtx = null;
  let currentScenario = null;
  let frameBuffer = [];
  let captureInterval = null;
  let taskIndex = 0;
  let score = 0;
  let correctCount = 0;
  let totalAttempts = 0;
  let roundStartTime = 0;
  let lastDetectedEmotion = 'neutral';
let rhythmEmotions = []; // Массив рандомных эмоций для текущего раунда
let bigTimerInterval = null; // Интервал для обновления таймера
let bigTimerValue = 5; // Текущее значение таймера
let rhythmRecordedFrames = []; // Буфер записанных кадров для эхо
let rhythmRecordInterval = null; // Интервал записи кадров
let echoPlaybackInterval = null; // Интервал воспроизведения в эхо
//  Offscreen canvas для оптимизации захвата кадров
let offscreenCanvas = null;
let offscreenCtx = null;

  
  // Машина состояний
  let currentPhase = 'idle';
  let phaseStartTime = 0;
  let holdStartTime = 0;
  let capturedEmotion = null;
  let currentTarget = null;
  let animationFrameId = null;
  
  function ensureOffscreenCanvas() {
  const targetWidth = echoCanvas?.width || 320;
  const targetHeight = echoCanvas?.height || 240;
  
  // Создаём canvas один раз
  if (!offscreenCanvas) {
    offscreenCanvas = document.createElement('canvas');
    // willReadFrequently — оптимизация для частых getImageData
    offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
  }
  
  // Синхронизируем размеры при изменении
  if (offscreenCanvas.width !== targetWidth || offscreenCanvas.height !== targetHeight) {
    offscreenCanvas.width = targetWidth;
    offscreenCanvas.height = targetHeight;
  }
}
  
  // ===== Открытие/закрытие =====
  function open() {
    const modal = document.getElementById('echo-mirror-modal');
    if (!modal) return;
    modal.hidden = false;
    showScreen('scenario-select');
  }
  
  function close() {
    stopTraining();
    const modal = document.getElementById('echo-mirror-modal');
    if (modal) modal.hidden = true;
  }
  
  function showScreen(name) {
    ['scenario-select', 'training-screen', 'result-screen'].forEach(s => {
      const el = document.getElementById(`echo-${s}`);
      if (el) el.hidden = (s !== name);
    });
  }
  
  // ===== Запуск сценария =====
 async function startScenario(scenario) {
  currentScenario = scenario;
  taskIndex = 0;
  score = 0;
  correctCount = 0;
  totalAttempts = 0;
  updateUI();
  
  // 🎵 Генерируем рандомные эмоции для rhythm
  if (scenario === 'rhythm') {
    rhythmEmotions = getRandomEmotions(TASKS_PER_ROUND);
    console.log('🎵 Rhythm emotions:', rhythmEmotions);
  }
  
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' }
    });
  } catch (e) {
    console.error('Echo: camera error', e);
    alert(translations[currentLang]?.echoCameraError || 'Не удалось получить доступ к камере');
    return;
  }
  
  video = document.getElementById('echo-video');
  echoCanvas = document.getElementById('echo-echo-canvas');
  
  if (!video || !echoCanvas) return;
  
  video.srcObject = stream;
  await video.play();
  
  echoCanvas.width = 320;
  echoCanvas.height = 240;
  echoCtx = echoCanvas.getContext('2d');
  
  frameBuffer = [];
  captureInterval = setInterval(captureFrame, 100);
  
  showScreen('training-screen');
  roundStartTime = Date.now();
  
  if (!emotionModelLoaded) {
    await loadEmotionModels();
  }
  
  startDetectionLoop();
  startNextTask();
}
  
function captureFrame() {
  // Не захватываем кадры во время воспроизведения в эхо
  if (echoPlaybackInterval) return;
  
  if (!video || video.readyState < 2 || !echoCtx) return;
  
  //  Инициализируем offscreen canvas лениво
  ensureOffscreenCanvas();
  
  // Рисуем кадр во временный canvas (переиспользуемый!)
  offscreenCtx.drawImage(video, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
  
  //  Получаем ImageData — легковесный объект с пикселями
  const imageData = offscreenCtx.getImageData(
    0, 0, 
    offscreenCanvas.width, 
    offscreenCanvas.height
  );
  
  // Храним ImageData, а не Canvas
  frameBuffer.push(imageData);
  
  const maxFrames = ECHO_DELAY_SEC * 10;
  if (frameBuffer.length > maxFrames) {
    frameBuffer.shift(); // GC легко освободит Uint8ClampedArray
  }
  
  if (frameBuffer.length >= maxFrames) {
    echoCtx.clearRect(0, 0, echoCanvas.width, echoCanvas.height);
    // putImageData вместо drawImage
    echoCtx.putImageData(frameBuffer[0], 0, 0);
  }
}
  
  // ===== Цикл распознавания =====
  function startDetectionLoop() {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    
    async function loop() {
      if (!video || video.paused || !currentScenario) return;
      
      try {
        const detections = await faceapi.detectAllFaces(
          video,
          new faceapi.TinyFaceDetectorOptions({ inputSize: 512, scoreThreshold: 0.5 })
        ).withFaceLandmarks().withFaceExpressions();
        
        if (detections?.[0]?.expressions) {
          const expr = detections[0].expressions;
          let dominant = 'neutral', maxScore = 0;
          for (const [e, s] of Object.entries(expr)) {
            if (s > maxScore) { maxScore = s; dominant = e; }
          }
          lastDetectedEmotion = dominant;
          processDetection(dominant, maxScore);
        }
      } catch (e) {
        // ignore
      }
      
      animationFrameId = requestAnimationFrame(loop);
    }
    
    loop();
  }
  
  // Машина состояний с поддержкой всех 3 сценариев
function processDetection(detected, confidence) {
  const now = Date.now();
  
  switch (currentPhase) {
    // ── ФАЗА 1: Распознавание эмоции (repeat/opposite) ──
    case 'phase1_detect':
      if (confidence >= CONFIDENCE_THRESHOLD && detected !== 'neutral') {
        capturedEmotion = detected;
        currentPhase = 'phase1_hold';
        holdStartTime = now;
        showHint(
          `${translations[currentLang]?.echoEmotionCaptured || 'Распознано'}: ${getEmotionName(detected)}. ${translations[currentLang]?.echoHold5 || 'Удержи 5 сек!'}`
        );
        setTaskText(
          `${translations[currentLang]?.echoHoldEmotion || 'Удерживай'}: ${getEmotionName(detected)}`
        );
        
        // ДЛЯ СЦЕНАРИЯ REPEAT: запускаем цепочку таймеров
        if (currentScenario === 'repeat') {
          moveTimerToMain();
          startBigTimer(HOLD_DURATION_SEC, () => {
            currentPhase = 'pause';
            phaseStartTime = Date.now();
            hideHint();
            setTaskText(translations[currentLang]?.echoPause || 'Пауза...');
            
            moveTimerToEcho();
            startBigTimer(PAUSE_DURATION_SEC, () => {
              currentTarget = capturedEmotion;
              currentPhase = 'phase2_hold';
              holdStartTime = Date.now();
              setTaskText(
                `${translations[currentLang]?.echoTaskRepeat || 'Повтори из эха'}: ${getEmotionName(currentTarget)}`
              );
              showHint(translations[currentLang]?.echoHold5 || 'Удержи 5 сек!');
              
              moveTimerToMain();
              startBigTimer(HOLD_DURATION_SEC, () => {
                completeTask(true);
              });
            });
          });
        } 
        // ДЛЯ СЦЕНАРИЯ OPPOSITE: запускаем таймер на 5 сек
        else if (currentScenario === 'opposite') {
          moveTimerToMain(); // Таймер всегда в основном окне
          startBigTimer(HOLD_DURATION_SEC, () => {
            currentPhase = 'pause';
            phaseStartTime = Date.now();
            hideHint();
            const opposite = OPPOSITE_EMOTIONS[capturedEmotion] || 'neutral';
            setTaskText(
              `${translations[currentLang]?.echoNowOpposite || 'Теперь покажи противоположную'}: ${getEmotionName(opposite)}`
            );
          });
        }
      }
      break;
    
    // ── ФАЗА 1: Удержание эмоции (repeat/opposite) ──
    case 'phase1_hold':
      if (currentScenario === 'repeat' || currentScenario === 'opposite') {
        if (detected === capturedEmotion && confidence >= CONFIDENCE_THRESHOLD) {
          // Успешно удерживает, таймер продолжает тикать
        } else {
          // Эмоция прервалась! Сбрасываем таймер и возвращаемся к распознаванию
          if (bigTimerInterval) { clearInterval(bigTimerInterval); bigTimerInterval = null; }
          const timerEl = document.getElementById('echo-big-timer');
          if (timerEl) timerEl.classList.remove('visible', 'pulse');
          
          currentPhase = 'phase1_detect';
          showHint(`${translations[currentLang]?.echoShowAgain || 'Снова покажи'}: ${getEmotionName(capturedEmotion)}`);
        }
      } else {
        // Оригинальная логика (на всякий случай)
        if (detected === capturedEmotion && confidence >= CONFIDENCE_THRESHOLD) {
          const held = (now - holdStartTime) / 1000;
          if (held >= HOLD_DURATION_SEC) {
            currentPhase = 'pause';
            phaseStartTime = now;
            hideHint();
            if (currentScenario === 'opposite') {
              const opposite = OPPOSITE_EMOTIONS[capturedEmotion] || 'neutral';
              setTaskText(
                `${translations[currentLang]?.echoNowOpposite || 'Теперь покажи противоположную'}: ${getEmotionName(opposite)}`
              );
            }
          }
        } else {
          holdStartTime = now;
        }
      }
      break;
    
    // ── ПАУЗА (repeat/opposite) ──
    case 'pause':
      if (currentScenario === 'repeat') {
        // Для repeat переходом надёжно управляет callback таймера startBigTimer.
      } else if (currentScenario === 'opposite') {
        const pauseElapsed = (now - phaseStartTime) / 1000;
        if (pauseElapsed >= PAUSE_DURATION_SEC) {
          currentTarget = OPPOSITE_EMOTIONS[capturedEmotion] || 'neutral';
          currentPhase = 'phase2_hold';
          holdStartTime = Date.now();
          setTaskText(
            `${translations[currentLang]?.echoTaskOpposite || 'Покажи противоположную'}: ${getEmotionName(currentTarget)}`
          );
          showHint(translations[currentLang]?.echoHold5 || 'Удержи 5 сек!');
          
          moveTimerToMain(); // Таймер всегда в основном окне
          startBigTimer(HOLD_DURATION_SEC, () => {
            completeTask(true);
          });
        }
      } else {
        // Оригинальная логика (на всякий случай)
        const pauseElapsed = (now - phaseStartTime) / 1000;
        if (pauseElapsed >= PAUSE_DURATION_SEC) {
          if (currentScenario === 'opposite') {
            currentTarget = OPPOSITE_EMOTIONS[capturedEmotion] || 'neutral';
            currentPhase = 'phase2_hold';
            holdStartTime = now;
            setTaskText(
              `${translations[currentLang]?.echoTaskOpposite || 'Покажи противоположную'}: ${getEmotionName(currentTarget)}`
            );
            showHint(translations[currentLang]?.echoHold5 || 'Удержи 5 сек!');
          }
        }
      }
      break;
    
    // ── ФАЗА 2: Удержание целевой эмоции (repeat/opposite) ──
case 'phase2_hold':
  if (currentScenario === 'repeat' || currentScenario === 'opposite') {
    if (detected === currentTarget && confidence >= CONFIDENCE_THRESHOLD) {
      // 🆕 Если таймер ещё не запущен — запускаем при первом обнаружении
      if (!bigTimerInterval) {
        moveTimerToMain();
        startBigTimer(HOLD_DURATION_SEC, () => {
          completeTask(true);
        });
      }
      // Эмоция удерживается, таймер продолжает тикать
    } else {
      // ⚠️ Эмоция прервалась! Очищаем таймер, ждём нового обнаружения
      if (bigTimerInterval) {
        clearInterval(bigTimerInterval);
        bigTimerInterval = null;
      }
      const timerEl = document.getElementById('echo-big-timer');
      if (timerEl) timerEl.classList.remove('visible', 'pulse');
      
      showHint(
        `${translations[currentLang]?.echoShowAgain || 'Снова покажи'}: ${getEmotionName(currentTarget)}`
      );
      // Таймер НЕ перезапускаем — ждём, пока пользователь снова покажет эмоцию
    }
  } else {
    // Оригинальная логика (на всякий случай)
    if (detected === currentTarget && confidence >= CONFIDENCE_THRESHOLD) {
      const held = (now - holdStartTime) / 1000;
      if (held >= HOLD_DURATION_SEC) {
        completeTask(true);
      }
    } else {
      holdStartTime = now;
    }
  }
  break;

    // РИТМ: Фазы сценария ──
    case 'rhythm_phase1_detect':
      if (detected === currentTarget && confidence >= CONFIDENCE_THRESHOLD) {
        currentPhase = 'rhythm_phase1_hold';
        holdStartTime = now;
        const emotionName = getEmotionName(currentTarget);
        showHint(`${translations[currentLang]?.echoHoldEmotionWithName || '✅ Удерживай'}: ${emotionName}`);
        
        startRhythmRecording();
        startBigTimer(5, () => {
          stopRhythmRecording();
          currentPhase = 'rhythm_echo_show';
          holdStartTime = Date.now();
          showHint(translations[currentLang]?.echoLookAtEcho || '👀 Смотри на окно эхо!');
          moveTimerToEcho();
          startEchoPlayback();
          startBigTimer(5, () => {
            stopEchoPlayback();
            currentPhase = 'rhythm_phase2_detect';
            holdStartTime = Date.now();
            const emotionName = getEmotionName(currentTarget);
            showHint(`${translations[currentLang]?.echoRepeatEmotion || '🔄 Повтори эмоцию'}: ${emotionName}!`);
            moveTimerToMain();
          });
        });
      }
      break;

    case 'rhythm_phase1_hold':
      if (detected === currentTarget && confidence >= CONFIDENCE_THRESHOLD) {
        // Эмоция удерживается
      } else {
        stopRhythmRecording();
        if (bigTimerInterval) { clearInterval(bigTimerInterval); bigTimerInterval = null; }
        const timerEl = document.getElementById('echo-big-timer');
        if (timerEl) timerEl.classList.remove('visible', 'pulse');
        
        currentPhase = 'rhythm_phase1_detect';
        showHint(`${translations[currentLang]?.echoEmotionInterrupted || '⚠️ Эмоция прервалась! Снова покажи'}: ${getEmotionName(currentTarget)}`);
      }
      break;

    case 'rhythm_echo_show':
      break;

    case 'rhythm_phase2_detect':
      if (detected === currentTarget && confidence >= CONFIDENCE_THRESHOLD) {
        currentPhase = 'rhythm_phase2_hold';
        holdStartTime = now;
        const emotionName = getEmotionName(currentTarget);
        showHint(`${translations[currentLang]?.echoHoldEmotionWithName || '✅ Удерживай'}: ${emotionName}`);
        
        startBigTimer(5, () => {
          completeTask(true);
        });
      }
      break;

    case 'rhythm_phase2_hold':
      if (detected === currentTarget && confidence >= CONFIDENCE_THRESHOLD) {
        // Эмоция удерживается
      } else {
        if (bigTimerInterval) { clearInterval(bigTimerInterval); bigTimerInterval = null; }
        const timerEl = document.getElementById('echo-big-timer');
        if (timerEl) timerEl.classList.remove('visible', 'pulse');
        
        currentPhase = 'rhythm_phase2_detect';
        showHint(`${translations[currentLang]?.echoEmotionInterrupted || '⚠️ Эмоция прервалась! Снова покажи'}: ${getEmotionName(currentTarget)}`);
      }
      break;
  }
}
  
  // ===== Управление заданиями =====
function startNextTask() {
  if (taskIndex >= TASKS_PER_ROUND) {
    finishTraining();
    return;
  }
  
  taskIndex++;
  totalAttempts++;
  capturedEmotion = null;
  currentTarget = null;
  holdStartTime = 0;
  phaseStartTime = 0;
  updateUI();
  
  if (currentScenario === 'repeat' || currentScenario === 'opposite') {
    // Для repeat/opposite: запускаем Фазу 1 (распознавание)
    currentPhase = 'phase1_detect';
    setTaskText(
      `${translations[currentLang]?.echoTaskNum || 'Задание'} ${taskIndex} / ${TASKS_PER_ROUND}`
    );
    showHint(translations[currentLang]?.echoPhase1 || 'Покажи любую эмоцию и удержи 5 сек');
} else if (currentScenario === 'rhythm') {
  // Для rhythm: показываем баннер, ждём распознавания эмоции
  currentTarget = rhythmEmotions[taskIndex - 1];
  currentPhase = 'rhythm_phase1_detect';
  holdStartTime = 0;
  setTaskText(
    `${translations[currentLang]?.echoTaskNum || 'Задание'} ${taskIndex} / ${TASKS_PER_ROUND}`
  );
  const emotionName = getEmotionName(currentTarget);
  // ИСПОЛЬЗУЕМ ПЕРЕВОД С ФОЛЛБЭКОМ
  showHint(`${translations[currentLang]?.echoShowEmotionRhythm || 'Покажи эмоцию'}: ${emotionName}!`);
  // Таймер НЕ запускаем — ждём, пока камера распознает эмоцию
}
}
function startBigTimer(duration, onComplete) {
  const timerEl = document.getElementById('echo-big-timer');
  const timerValueEl = document.getElementById('echo-big-timer-value');
  
  if (!timerEl || !timerValueEl) return;
  
  // Показываем таймер
  timerEl.classList.add('visible', 'pulse');
  bigTimerValue = duration;
  timerValueEl.textContent = bigTimerValue;
  
  // Очищаем предыдущий интервал
  if (bigTimerInterval) {
    clearInterval(bigTimerInterval);
  }
  
  // Запускаем обратный отсчёт
  bigTimerInterval = setInterval(() => {
    bigTimerValue--;
    timerValueEl.textContent = bigTimerValue;
    
    if (bigTimerValue <= 0) {
      clearInterval(bigTimerInterval);
      bigTimerInterval = null;
      
      // Скрываем таймер
      timerEl.classList.remove('visible', 'pulse');
      
      // Вызываем callback
      if (onComplete) onComplete();
    }
  }, 1000);
}

function moveTimerToEcho() {
  const timerEl = document.getElementById('echo-big-timer');
  if (timerEl) {
    timerEl.classList.add('in-echo');
  }
}

function moveTimerToMain() {
  const timerEl = document.getElementById('echo-big-timer');
  if (timerEl) {
    timerEl.classList.remove('in-echo');
  }
}

function startRhythmRecording() {
  rhythmRecordedFrames = [];
  ensureOffscreenCanvas();
  
  rhythmRecordInterval = setInterval(() => {
    if (!video || video.readyState < 2) return;
    
    offscreenCtx.drawImage(video, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
    const imageData = offscreenCtx.getImageData(
      0, 0, offscreenCanvas.width, offscreenCanvas.height
    );
    rhythmRecordedFrames.push(imageData);
  }, 100);
}

function stopRhythmRecording() {
  if (rhythmRecordInterval) {
    clearInterval(rhythmRecordInterval);
    rhythmRecordInterval = null;
  }
}

function startEchoPlayback() {
  let frameIndex = 0;
  echoPlaybackInterval = setInterval(() => {
    if (frameIndex >= rhythmRecordedFrames.length) {
      clearInterval(echoPlaybackInterval);
      echoPlaybackInterval = null;
      rhythmRecordedFrames = [];
      return;
    }
    echoCtx.clearRect(0, 0, echoCanvas.width, echoCanvas.height);
    //  putImageData для ImageData
    echoCtx.putImageData(rhythmRecordedFrames[frameIndex], 0, 0);
    frameIndex++;
  }, 100);
}

function stopEchoPlayback() {
  if (echoPlaybackInterval) {
    clearInterval(echoPlaybackInterval);
    echoPlaybackInterval = null;
  }
  rhythmRecordedFrames = [];
}
  
function completeTask(success) {
  currentPhase = 'idle';
  holdStartTime = 0;
  hideHint();
  
  // Очищаем запись и воспроизведение
  stopRhythmRecording();
  stopEchoPlayback();
  
  if (success) {
    correctCount++;
    score += 10;
    playSuccessSound();
  }
  updateUI();
  setTimeout(() => {
    startNextTask();
  }, 1500);
}
  
  function finishTraining() {
    stopCapture();
    stopDetectionLoop();
    showScreen('result-screen');
    
    const accuracy = totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 100) : 0;
    
    const bestKey = `echoMirrorBest_${currentScenario}`;
    const best = parseInt(localStorage.getItem(bestKey) || '0');
    const newBest = Math.max(best, score);
    localStorage.setItem(bestKey, newBest);
    
    document.getElementById('echo-result-score').textContent = score;
    document.getElementById('echo-result-accuracy').textContent = `${accuracy}%`;
    document.getElementById('echo-result-best').textContent = newBest;
  }
  
  function stopCapture() {
    if (captureInterval) {
      clearInterval(captureInterval);
      captureInterval = null;
    }
    frameBuffer = [];
  }
  
  function stopDetectionLoop() {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  }
  
function stopTraining() {
  stopCapture();
  stopDetectionLoop();
  
    //  Очистка offscreen canvas
  if (offscreenCtx && offscreenCanvas) {
    offscreenCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
  }
  
  // Очищаем таймер
if (bigTimerInterval) {
  clearInterval(bigTimerInterval);
  bigTimerInterval = null;
}

const timerEl = document.getElementById('echo-big-timer');
if (timerEl) {
  timerEl.classList.remove('visible', 'pulse', 'in-echo');
}

// Очищаем запись и воспроизведение
stopRhythmRecording();
stopEchoPlayback();
rhythmRecordedFrames = [];
  
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  
  if (video) {
    video.srcObject = null;
  }
  
  currentScenario = null;
  currentPhase = 'idle';
  holdStartTime = 0;
  phaseStartTime = 0;
  capturedEmotion = null;
  currentTarget = null;
  rhythmEmotions = [];
}
  
  // ===== UI =====
  function updateUI() {
    const scoreEl = document.getElementById('echo-score');
    const progressEl = document.getElementById('echo-task-progress');
    const timerEl = document.getElementById('echo-timer');
    
    if (scoreEl) scoreEl.textContent = score;
    if (progressEl) progressEl.textContent = `${Math.min(taskIndex, TASKS_PER_ROUND)} / ${TASKS_PER_ROUND}`;
    if (timerEl) timerEl.textContent = Math.round((Date.now() - roundStartTime) / 1000);
  }
  
  function setTaskText(text) {
    const el = document.getElementById('echo-task-text');
    if (el) el.textContent = text;
  }
  
  function showHint(text) {
    const hint = document.getElementById('echo-hint');
    const hintText = document.getElementById('echo-hint-text');
    if (hint && hintText) {
      hintText.textContent = text;
      hint.hidden = false;
    }
  }
  
  function hideHint() {
    const hint = document.getElementById('echo-hint');
    if (hint) hint.hidden = true;
  }
  
function getEmotionName(key) {
  const map = {
    happy: translations[currentLang]?.emotionHappy || 'Радость',
    sad: translations[currentLang]?.emotionSad || 'Грусть',
    angry: translations[currentLang]?.emotionAngry || 'Злость',
    surprised: translations[currentLang]?.emotionSurprised || 'Удивление',
    fearful: translations[currentLang]?.emotionFearful || 'Страх',
    disgusted: translations[currentLang]?.emotionDisgusted || 'Отвращение',
    neutral: translations[currentLang]?.emotionNeutral || 'Нейтрально' // 
  };
  return map[key] || key;
}
  
  // ===== Инициализация =====
  function init() {
    const tile = document.getElementById('tile-echo-mirror');
    if (tile) {
      tile.addEventListener('click', open);
    }
    
    document.querySelectorAll('.echo-scenario-card').forEach(card => {
      card.addEventListener('click', () => {
        const scenario = card.dataset.scenario;
        if (scenario) startScenario(scenario);
      });
    });
    
    console.log('🪞 Echo Mirror Mode initialized');
  }
  
  return { init, open, close };
})();

// Глобальные функции для onclick в HTML
function closeEchoMirror() { EchoMirrorMode.close(); }
function restartEchoMirror() {
  EchoMirrorMode.close();
  setTimeout(() => EchoMirrorMode.open(), 100);
}

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
  EchoMirrorMode.init();
});

// ===== МОДУЛЬ РАСШИРЕННОЙ СТАТИСТИКИ (С МИГРАЦИЕЙ И ФИЛЬТРАЦИЕЙ ПО ДАТАМ) =====
const AdvancedStatsModule = (() => {
  const NEW_STORAGE_KEY = 'mimic_advanced_stats_daily';
  const OLD_STORAGE_KEY = 'mimic_advanced_stats'; // 🆕 Ключ для миграции старых данных
  const EMOTION_KEYS = ['happy', 'sad', 'angry', 'surprised', 'fearful', 'disgusted'];
  
  let dailyStats = {};
  let emotionStartTime = 0;
  let radarChartInstance = null;
  let currentFilter = 'all'; // 'all', '60', '30', '14', '7'

  function getTodayKey() {
    return new Date().toISOString().split('T')[0];
  }

  function init() {
    try {
      // 1. Загружаем новые данные, если они уже есть
      const savedDaily = localStorage.getItem(NEW_STORAGE_KEY);
      if (savedDaily) {
        dailyStats = JSON.parse(savedDaily);
      } else {
        dailyStats = {};
      }

      // 2. 🆕 ПРОВЕРКА И МИГРАЦИЯ СТАРОЙ СТАТИСТИКИ
      const oldStatsStr = localStorage.getItem(OLD_STORAGE_KEY);
      if (oldStatsStr) {
        try {
          const oldStats = JSON.parse(oldStatsStr);
          const today = getTodayKey();
          
          // Инициализируем сегодняшний день, если его еще нет
          if (!dailyStats[today]) {
            dailyStats[today] = {};
            EMOTION_KEYS.forEach(key => {
              dailyStats[today][key] = { attempts: 0, correct: 0, totalTime: 0 };
            });
          }

          // Переносим накопленные данные в "сегодняшнюю" запись
          EMOTION_KEYS.forEach(key => {
            if (oldStats[key]) {
              dailyStats[today][key].attempts += oldStats[key].attempts || 0;
              dailyStats[today][key].correct += oldStats[key].correct || 0;
              dailyStats[today][key].totalTime += oldStats[key].totalTime || 0;
            }
          });

          // Сохраняем обновленную структуру в новый ключ
          save();

          // Удаляем старый ключ, чтобы миграция произошла только один раз
          localStorage.removeItem(OLD_STORAGE_KEY);
          console.log('✅ Старая статистика успешно мигрирована в новый формат.');
        } catch (e) {
          console.warn('⚠️ Ошибка при миграции старой статистики:', e);
        }
      }
    } catch (e) {
      console.error('❌ Ошибка инициализации статистики:', e);
      dailyStats = {};
    }
  }

  function ensureTodayExists() {
    const today = getTodayKey();
    if (!dailyStats[today]) {
      dailyStats[today] = {};
      EMOTION_KEYS.forEach(key => {
        dailyStats[today][key] = { attempts: 0, correct: 0, totalTime: 0 };
      });
    }
    return today;
  }

  function save() {
    try {
      localStorage.setItem(NEW_STORAGE_KEY, JSON.stringify(dailyStats));
    } catch (e) {
      console.warn('⚠️ Advanced stats storage quota exceeded');
    }
  }

  function startEmotion(emotionKey) {
    emotionStartTime = Date.now();
  }
  
  function recordSuccess(emotionKey) {
    const today = ensureTodayExists();
    dailyStats[today][emotionKey].attempts++;
    dailyStats[today][emotionKey].correct++;
    
    let timeTaken = (Date.now() - emotionStartTime) / 1000;
    if (timeTaken > 0 && timeTaken <= 30) {
      dailyStats[today][emotionKey].totalTime += timeTaken;
    }
    save();
    emotionStartTime = Date.now();
  }

  function recordFailure(emotionKey) {
    const today = ensureTodayExists();
    dailyStats[today][emotionKey].attempts++;
    save();
    emotionStartTime = Date.now();
  }

  // АГРЕГАЦИЯ ДАННЫХ С УЧЁТОМ ФИЛЬТРА
  function getAggregatedData() {
    const aggregated = {};
    EMOTION_KEYS.forEach(key => {
      aggregated[key] = { attempts: 0, correct: 0, totalTime: 0 };
    });

    const now = Date.now();
    let cutoffDate = null;
    
    if (currentFilter !== 'all') {
      const days = parseInt(currentFilter, 10);
      const cutoffTime = now - (days * 24 * 60 * 60 * 1000);
      cutoffDate = new Date(cutoffTime).toISOString().split('T')[0]; // 'YYYY-MM-DD'
    }

    // Суммируем только те дни, которые >= cutoffDate
    for (const dateKey in dailyStats) {
      if (cutoffDate && dateKey < cutoffDate) {
        continue; // Пропускаем старые дни
      }
      
      const dayData = dailyStats[dateKey];
      EMOTION_KEYS.forEach(key => {
        if (dayData[key]) {
          aggregated[key].attempts += dayData[key].attempts || 0;
          aggregated[key].correct += dayData[key].correct || 0;
          aggregated[key].totalTime += dayData[key].totalTime || 0;
        }
      });
    }

    return EMOTION_KEYS.map(key => {
      const d = aggregated[key];
      const accuracy = d.attempts > 0 ? (d.correct / d.attempts) * 100 : 0;
      const avgTime = d.correct > 0 ? (d.totalTime / d.correct) : 0;
      return {
        emotion: key,
        accuracy: Math.round(accuracy),
        avgTime: parseFloat(avgTime.toFixed(2)),
        attempts: d.attempts,
        correct: d.correct
      };
    });
  }
  
  function clearData() {
    dailyStats = {};
    save();
  }

  function setFilter(days) {
    currentFilter = days;
    renderRadarChart();
    renderStatsTable();
  }

  function openModal() {
    const modal = document.getElementById('advanced-stats-modal');
    if (!modal) return;
    
    modal.hidden = false;
    setTimeout(() => modal.classList.add('active'), 10);
    
    if (typeof translatePage === 'function') translatePage(currentLang);
    
    setTimeout(() => {
      renderRadarChart();
      renderStatsTable();
      // Вызов модуля цифрового портрета
      if (typeof EmotionalPortraitModule !== 'undefined') {
          EmotionalPortraitModule.render();
      }
    }, 100);
  }

  function closeModal() {
    const modal = document.getElementById('advanced-stats-modal');
    if (modal) {
      modal.classList.remove('active');
      setTimeout(() => { modal.hidden = true; }, 300);
    }
    if (radarChartInstance) {
      radarChartInstance.destroy();
      radarChartInstance = null;
    }
  }

  function renderRadarChart() {
    const data = getAggregatedData();
    const ctx = document.getElementById('advanced-emotion-radar-chart');
    if (!ctx) return;

    if (radarChartInstance) radarChartInstance.destroy();

    const t = translations[currentLang] || {};
    const emotionNames = {
      happy: t.emotionHappy || 'Радость',
      sad: t.emotionSad || 'Грусть',
      angry: t.emotionAngry || 'Злость',
      surprised: t.emotionSurprised || 'Удивление',
      fearful: t.emotionFearful || 'Страх',
      disgusted: t.emotionDisgusted || 'Отвращение'
    };

    const labels = data.map(d => emotionNames[d.emotion] || d.emotion);
    const accuracyData = data.map(d => d.accuracy);
    const speedData = data.map(d => d.avgTime > 0 ? Math.min(100, Math.max(0, (5 - d.avgTime) * 25)) : 0);

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
    const textColor = isDark ? 'rgba(255,255,255,0.9)' : '#212529';
    const legendColor = isDark ? 'rgba(255,255,255,0.8)' : '#212529';

    radarChartInstance = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: labels,
        datasets: [
          { 
            label: t.legendAccuracy || 'Точность (%)', 
            data: accuracyData, 
            backgroundColor: 'rgba(76, 201, 240, 0.2)', 
            borderColor: 'rgba(76, 201, 240, 1)', 
            borderWidth: 2 
          },
          { 
            label: t.legendSpeed || 'Скорость реакции', 
            data: speedData, 
            backgroundColor: 'rgba(255, 107, 107, 0.2)', 
            borderColor: 'rgba(255, 107, 107, 1)', 
            borderWidth: 2, 
            borderDash: [5, 5] 
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            angleLines: { color: gridColor },
            grid: { color: gridColor },
            pointLabels: { color: textColor, font: { size: 13, weight: '600' } },
            ticks: { display: false, backdropColor: 'transparent' },
            suggestedMin: 0, suggestedMax: 100
          }
        },
        plugins: { 
          legend: { 
            display: true,
            labels: { color: legendColor, font: { size: 12, weight: '500' }, padding: 15 }
          } 
        }
      }
    });
    
    setTimeout(() => {
      if (radarChartInstance) { radarChartInstance.resize(); radarChartInstance.update(); }
    }, 50);
  }

  function renderStatsTable() {
    const data = getAggregatedData();
    const tbody = document.getElementById('advanced-emotion-stats-tbody');
    if (!tbody) return;

    const t = translations[currentLang] || {};
    const names = {
      happy: `${t.emotionHappy || 'Радость'} 😊`,
      sad: `${t.emotionSad || 'Грусть'} 😢`,
      angry: `${t.emotionAngry || 'Злость'} 😠`,
      surprised: `${t.emotionSurprised || 'Удивление'} 😮`,
      fearful: `${t.emotionFearful || 'Страх'} 😨`,
      disgusted: `${t.emotionDisgusted || 'Отвращение'} 🤢`
    };

    tbody.innerHTML = data.map(d => {
      const accClass = d.accuracy >= 80 ? 'acc-good' : (d.accuracy >= 50 ? 'acc-mid' : 'acc-bad');
      return `<tr>
        <td class="emotion-name">${names[d.emotion]}</td>
        <td>${d.attempts}</td>
        <td>${d.correct}</td>
        <td class="${accClass}">${d.accuracy}%</td>
        <td>${d.avgTime > 0 ? d.avgTime.toFixed(2) : '—'}</td>
      </tr>`;
    }).join('');
  }

  function onLanguageChange() {
    const modal = document.getElementById('advanced-stats-modal');
    if (modal && modal.classList.contains('active')) {
      renderRadarChart();
      renderStatsTable();
    }
    
    // Обновляем текст опций селектора при смене языка
    const filterSelect = document.getElementById('stats-time-filter');
    if (filterSelect) {
      Array.from(filterSelect.options).forEach(option => {
        const key = option.getAttribute('data-i18n');
        if (key && translations[currentLang]?.[key]) {
          option.textContent = translations[currentLang][key];
        }
      });
    }
  }

  // Инициализация событий
  document.addEventListener('DOMContentLoaded', () => {
    init();
    
    const btn = document.getElementById('advanced-stats-btn');
    const closeBtn = document.getElementById('advanced-stats-close');
    const modal = document.getElementById('advanced-stats-modal');

    if (btn) btn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (modal) {
      modal.addEventListener('click', e => {
        if (e.target.id === 'advanced-stats-modal') closeModal();
      });
    }

    // Обработчик изменения фильтра
    const statsFilter = document.getElementById('stats-time-filter');
    if (statsFilter) {
      statsFilter.addEventListener('change', (e) => {
        setFilter(e.target.value);
      });
    }
  });

  // Наблюдатель за сменой темы
  const themeObserver = new MutationObserver(() => {
    const modal = document.getElementById('advanced-stats-modal');
    if (modal && modal.classList.contains('active')) {
      renderRadarChart();
    }
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  return { 
    init, startEmotion, recordSuccess, recordFailure, clearData, 
    openModal, closeModal, setFilter, onLanguageChange, 
    renderRadarChart, renderStatsTable 
  };
})();


// ===== МОДУЛЬ: ЭМОЦИОНАЛЬНЫЙ ДНЕВНИК =====
const EmotionDiary = (() => {
  const STORAGE_KEY = 'mimicEmotionDiary';
  const EMOJI_MAP = {
    happy: '😊',
    sad: '😢',
    angry: '😠',
    surprised: '😮',
    fearful: '😨',
    neutral: '😐'
  };
  
  // Получить все записи
  function getAll() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.warn('Diary: error reading storage', e);
      return [];
    }
  }
  
  // Сохранить новую запись
  function save(emotionKey) {
    const entries = getAll();
    entries.unshift({
      emotion: emotionKey,
      emoji: EMOJI_MAP[emotionKey] || '😐',
      timestamp: Date.now(),
      date: new Date().toISOString()
    });
    // Храним максимум 100 последних записей
    if (entries.length > 100) entries.length = 100;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }
  
  // Очистить дневник
  function clear() {
    localStorage.removeItem(STORAGE_KEY);
  }
  
  // Показать модалку выбора эмоции
  function show() {
    const modal = document.getElementById('emotion-diary-modal');
    const chooseScreen = document.getElementById('diary-choose-screen');
    const thanksScreen = document.getElementById('diary-thanks-screen');
    
    if (!modal) return;
    
    // Сбрасываем экраны
    chooseScreen.classList.remove('hidden');
    thanksScreen.classList.add('hidden');
    
    // Обновляем переводы в кнопках
    if (typeof updateDiaryTranslations === 'function') {
      updateDiaryTranslations();
    }
    
    modal.classList.add('active');
  }
  
  // Скрыть модалку
  function hide() {
    const modal = document.getElementById('emotion-diary-modal');
    if (modal) modal.classList.remove('active');
  }
  
  // Показать экран благодарности
  function showThanks() {
    const chooseScreen = document.getElementById('diary-choose-screen');
    const thanksScreen = document.getElementById('diary-thanks-screen');
    if (chooseScreen) chooseScreen.classList.add('hidden');
    if (thanksScreen) thanksScreen.classList.remove('hidden');
    
    // Автозакрытие через 2 секунды
    setTimeout(() => {
      hide();
    }, 2000);
  }
  
  // Показать историю
  function showHistory() {
    const modal = document.getElementById('diary-history-modal');
    const list = document.getElementById('diary-history-list');
    const empty = document.getElementById('diary-history-empty');
    const clearBtn = document.getElementById('diary-clear-btn');
    
    if (!modal || !list) return;
    
    const entries = getAll();
    
    if (entries.length === 0) {
      list.classList.add('hidden');
      empty.classList.remove('hidden');
      clearBtn.classList.add('hidden');
    } else {
      list.classList.remove('hidden');
      empty.classList.add('hidden');
      clearBtn.classList.remove('hidden');
      
      // Рендерим список
      list.innerHTML = entries.map(entry => {
        const date = new Date(entry.timestamp);
        const dateStr = date.toLocaleDateString(currentLang === 'ru' ? 'ru-RU' : 'en-US', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        const emotionName = translations[currentLang]?.[`emotion${entry.emotion.charAt(0).toUpperCase() + entry.emotion.slice(1)}`] || entry.emotion;
        
        return `
          <div class="diary-history-item">
            <span class="diary-history-emoji">${entry.emoji}</span>
            <div class="diary-history-info">
              <span class="diary-history-emotion">${emotionName}</span>
              <span class="diary-history-date">${dateStr}</span>
            </div>
          </div>
        `;
      }).join('');
    }
    
    modal.classList.add('active');
  }
  
  // Скрыть историю
  function hideHistory() {
    const modal = document.getElementById('diary-history-modal');
    if (modal) modal.classList.remove('active');
  }
  
  // Инициализация обработчиков
  function init() {
    // Кнопки выбора эмоции
    document.querySelectorAll('.diary-emotion-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emotion = btn.dataset.emotion;
        if (emotion) {
          save(emotion);
          showThanks();
        }
      });
    });
    
    // Закрытие модалки выбора
    const closeBtn = document.getElementById('diary-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', hide);
    }
    
    // Закрытие модалки истории
    const historyCloseBtn = document.getElementById('diary-history-close');
    if (historyCloseBtn) {
      historyCloseBtn.addEventListener('click', hideHistory);
    }
    
    // Кнопка просмотра истории
    const showDiaryBtn = document.getElementById('btn-show-diary');
    if (showDiaryBtn) {
      showDiaryBtn.addEventListener('click', () => {
        // Закрываем панель помощи
        if (typeof toggleInfoPanel === 'function') {
          toggleInfoPanel('help');
        }
        showHistory();
      });
    }
    
    // Кнопка очистки дневника
    const clearBtn = document.getElementById('diary-clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        const confirmText = currentLang === 'ru' 
          ? 'Вы уверены, что хотите очистить дневник?' 
          : 'Are you sure you want to clear the diary?';
        if (confirm(confirmText)) {
          clear();
          showHistory(); // Обновляем отображение
        }
      });
    }
    
    // Закрытие по клику вне модалки
    document.getElementById('emotion-diary-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'emotion-diary-modal') hide();
    });
    document.getElementById('diary-history-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'diary-history-modal') hideHistory();
    });
  }
  
  return { init, show, hide, showHistory, hideHistory, getAll, save, clear };
})();

// Вспомогательная функция для обновления переводов в дневнике
function updateDiaryTranslations() {
  document.querySelectorAll('#emotion-diary-modal [data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[currentLang]?.[key]) {
      el.textContent = translations[currentLang][key];
    }
  });
}

// ===== МОДУЛЬ: ЦИФРОВОЙ ЭМОЦИОНАЛЬНЫЙ ПОРТРЕТ =====
const EmotionalPortraitModule = (() => {
    const MIN_SESSIONS = 10;
    const MIN_DURATION_SEC = 60; // 600 (10 минут); 60 (1 минута) для теста

    function getData() {
        const history = JSON.parse(localStorage.getItem('mimic_progress_history') || '[]');
        const errors = JSON.parse(localStorage.getItem('mimic_errors') || '[]');
        return { history, errors };
    }

    function checkReadiness() {
        const { history } = getData();
        const validSessions = history.filter(s => (s.time || 0) >= MIN_DURATION_SEC);
        return {
            isReady: validSessions.length >= MIN_SESSIONS,
            validCount: validSessions.length,
            totalCount: history.length
        };
    }

    function analyzeTrend(sessions) {
        if (sessions.length < 3) return { trend: 'stable', percent: 0 };
        const n = sessions.length;
        let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
        sessions.forEach((s, i) => {
            sumX += i; sumY += s.accuracy;
            sumXY += i * s.accuracy; sumXX += i * i;
        });
        const denominator = (n * sumXX - sumX * sumX);
        if (denominator === 0) return { trend: 'stable', percent: 0 };
       
	   const slope = (n * sumXY - sumX * sumY) / denominator;
        const avgY = sumY / n;
        const periodChange = slope * (n - 1);
const percentChange = avgY > 0
    ? (periodChange / avgY) * 100
    : 0;

        if (percentChange > 5) return { trend: 'improving', percent: Math.round(percentChange) };
        if (percentChange < -5) return { trend: 'declining', percent: Math.round(Math.abs(percentChange)) };
        return { trend: 'stable', percent: 0 };
    }

function analyzeFatigue(history) {
    const longSessions = history.filter(s => (s.time || 0) >= MIN_DURATION_SEC); // Используем константу
    
    if (longSessions.length === 0) {
        return { isFatigued: false, shortAccuracy: '0.0', longAccuracy: '0.0' };
    }

    // Для тестового режима (MIN_DURATION_SEC = 60) сравниваем с сессиями < 60 сек
    // Для продакшена (MIN_DURATION_SEC = 600) сравниваем с сессиями 60-600 сек
    const shortSessions = history.filter(s => {
        const time = s.time || 0;
        if (MIN_DURATION_SEC <= 60) {
            // Тестовый режим: короткие сессии < MIN_DURATION_SEC
            return time < MIN_DURATION_SEC;
        } else {
            // Продакшен: короткие сессии 60-600 сек
            return time < MIN_DURATION_SEC && time > 60;
        }
    });
    
    const avgAccuracyShort = shortSessions.length 
        ? shortSessions.reduce((sum, s) => sum + (s.accuracy || 0), 0) / shortSessions.length 
        : 0;
    
    const avgAccuracyLong = longSessions.length 
        ? longSessions.reduce((sum, s) => sum + (s.accuracy || 0), 0) / longSessions.length 
        : 0;

    // Утомление, если точность в длинных сессиях падает на 15%+
    const isFatigued = avgAccuracyLong < (avgAccuracyShort * 0.85) 
                    && longSessions.length > 0 
                    && avgAccuracyShort > 0;

    return { 
        isFatigued, 
        shortAccuracy: avgAccuracyShort.toFixed(1), 
        longAccuracy: avgAccuracyLong.toFixed(1) 
    };
}

function generateReport(trend, fatigue, readiness) {
    const t = translations[currentLang];
    
    let trendText;
    if (trend.trend === 'improving') {
        trendText = `${t.portraitTrendImproving} ${t.portraitTrendPercentUp} ${trend.percent}% ${t.portraitTrendPeriod}`;
    } else if (trend.trend === 'declining') {
        trendText = `${t.portraitTrendDeclining} ${t.portraitTrendPercentDown} ${trend.percent}% ${t.portraitTrendPeriod}`;
    } else {
        trendText = t.portraitTrendStable;
    }

    let report = `${t.portraitReportIntro} ${trendText} ${t.portraitInEmotionalIntelligence} `;
    
    if (fatigue.isFatigued) {
        report += `${t.portraitFatigueDetected} (${fatigue.longAccuracy}%) ${t.portraitFatigueShort} (${fatigue.shortAccuracy}%). ${t.portraitFatigueRecommendation}`;
    } else {
        report += t.portraitNoFatigue;
    }

    report += `\n\n${t.portraitDataVolume} ${readiness.totalCount} ${t.portraitDataSessions} ${readiness.validCount} ${t.portraitDataValid}`;
    
    return report;
}

function renderTrendChart(sessions) {
    const ctx = document.getElementById('portrait-trend-chart');
    if (!ctx) return;

    const existingChart = Chart.getChart(ctx);
    if (existingChart) existingChart.destroy();

    const t = translations[currentLang];
    const labels = sessions.map((s, i) => `#${i + 1}`);
    const data = sessions.map(s => s.accuracy);

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: t.portraitChartAccuracy,
                data: data,
                borderColor: '#4361ee',
                backgroundColor: 'rgba(67, 97, 238, 0.1)',
                fill: true, tension: 0.3, pointRadius: 4, pointBackgroundColor: '#4361ee'
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: { 
                y: { beginAtZero: true, max: 100 }, 
                x: { title: { display: true, text: t.portraitChartSession } } 
            },
            plugins: { legend: { display: false } }
        }
    });
}

function renderErrorMatrix(errors) {
    const container = document.getElementById('error-matrix-container');
    if (!container) return;
    container.innerHTML = '';

    const t = translations[currentLang];

    if (errors.length === 0) {
        container.innerHTML = `<p style="text-align:center; color:var(--text-secondary);">${t.portraitNoErrors}</p>`;
        return;
    }

    const emotions = ['happy', 'sad', 'angry', 'surprised', 'fearful', 'disgusted'];
    const names = { 
        happy: t.portraitEmotionHappy, 
        sad: t.portraitEmotionSad, 
        angry: t.portraitEmotionAngry, 
        surprised: t.portraitEmotionSurprised, 
        fearful: t.portraitEmotionFearful, 
        disgusted: t.portraitEmotionDisgusted 
    };
    
    const matrix = {};
    emotions.forEach(target => { 
        matrix[target] = {}; 
        emotions.forEach(shown => matrix[target][shown] = 0); 
    });

    errors.forEach(e => {
        if (matrix[e.target] && matrix[e.target][e.shown] !== undefined) {
            matrix[e.target][e.shown]++;
        }
    });

    let html = `<table class="error-matrix-table"><thead><tr><th>${t.portraitMatrixHeader}</th>`;
    emotions.forEach(e => html += `<th>${names[e]}</th>`);
    html += '</tr></thead><tbody>';

    emotions.forEach(target => {
        html += `<tr><td class="matrix-row-header">${names[target]}</td>`;
        emotions.forEach(shown => {
            const count = matrix[target][shown];
            const isTarget = target === shown;
            
            // 🆕 ОДИН ФИКСИРОВАННЫЙ КРАСНЫЙ ЦВЕТ для всех ошибок
            let style = '';
            if (count > 0 && !isTarget) {
                style = `background: rgba(231, 76, 60, 0.6); color: white; font-weight: bold;`;
            }
            
            html += `<td style="${style}">${count > 0 ? count : '-'}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

    function render() {
        const readiness = checkReadiness();
        const readinessBlock = document.getElementById('portrait-readiness-block');
        const contentBlock = document.getElementById('portrait-content-block');
        if (!readinessBlock || !contentBlock) return;
		
		// Обновляем переводы в заголовках
if (typeof translatePage === 'function') {
    const contentBlock = document.getElementById('portrait-content-block');
    if (contentBlock) {
        contentBlock.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (translations[currentLang]?.[key]) {
                el.textContent = translations[currentLang][key];
            }
        });
    }
}

if (!readiness.isReady) {
    readinessBlock.style.display = 'block';
    contentBlock.style.display = 'none';
    const t = translations[currentLang];
    readinessBlock.innerHTML = `
        <h3>${t.portraitTitle}</h3>
        <p>${t.portraitNeedMore}</p>
        <div class="progress-info">
            <strong>${t.portraitProgressLabel}</strong> ${readiness.validCount} ${t.portraitSessionsOf} ${MIN_SESSIONS} ${t.portraitValidSessions}<br>
            <strong>${t.portraitTotalSessions}</strong> ${readiness.totalCount}.
        </div>
        <p style="font-size: 0.9em; color: var(--text-secondary); margin-top: 10px;">
            ${t.portraitContinueTraining}
        </p>
    `;
    return;
}

        readinessBlock.style.display = 'none';
        contentBlock.style.display = 'block';

        const { history, errors } = getData();
        
        const validSessions = history.filter(s => (s.time || 0) >= MIN_DURATION_SEC)
            .sort((a, b) => new Date(a.date || Date.now()).getTime() - new Date(b.date || Date.now()).getTime());
        
        const last15Sessions = validSessions.slice(-15);

        const trend = analyzeTrend(last15Sessions);
        const fatigue = analyzeFatigue(history);
        const report = generateReport(trend, fatigue, readiness);

        document.getElementById('psychologist-report').innerText = report;
        renderTrendChart(last15Sessions);
        renderErrorMatrix(errors);
    }

    return { render, checkReadiness };
})();

