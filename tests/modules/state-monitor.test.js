// tests/modules/state-monitor.test.js
// Тесты модуля мониторинга состояния

describe('StateMonitorModule', () => {
  
  function createMonitorModule() {
    const CONSTANTS = {
      ABSOLUTE_CLOSED_THRESHOLD: 0.27,
      DYNAMIC_MULTIPLIER: 0.90,
      MOUTH_OPEN_RATIO: 0.10,
      BLINK_RATE_DROWSY: 25,
      LONG_EYES_CLOSED_MS: 10000,
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

    function isMouthOpen(pos) {
      const mouthHeight = Math.hypot(pos[62].x - pos[66].x, pos[62].y - pos[66].y);
      const eyeDist = Math.hypot(pos[36].x - pos[45].x, pos[36].y - pos[45].y);
      return eyeDist > 0 ? (mouthHeight / eyeDist) > CONSTANTS.MOUTH_OPEN_RATIO : false;
    }

    function determineState(ear, blinkRate, gazeDown, mouthOpen, eyesClosedDuration) {
      const eyesClosed = ear < CONSTANTS.ABSOLUTE_CLOSED_THRESHOLD;
      const isLongEyeClosure = eyesClosedDuration >= CONSTANTS.LONG_EYES_CLOSED_MS;

      if (blinkRate > CONSTANTS.BLINK_RATE_DROWSY || 
          isLongEyeClosure || 
          (eyesClosed && gazeDown && !mouthOpen)) {
        return 'drowsy';
      }
      
      return 'normal';
    }

    return {
      calculateSingleEAR,
      calculateEAR,
      isGazeDownward,
      isMouthOpen,
      determineState,
      CONSTANTS
    };
  }

  let monitor;

  beforeEach(() => {
    monitor = createMonitorModule();
  });

  describe('calculateSingleEAR()', () => {
    it('должен возвращать высокое значение для открытых глаз', () => {
      const eye = [
        { x: 0, y: 0 },   // 0: левый угол
        { x: 5, y: -5 },  // 1: верх
        { x: 10, y: -5 }, // 2: верх
        { x: 20, y: 0 },  // 3: правый угол
        { x: 10, y: 5 },  // 4: низ
        { x: 5, y: 5 },   // 5: низ
      ];
      
      const ear = monitor.calculateSingleEAR(eye);
      expect(ear).toBeGreaterThan(0.2);
    });

    it('должен возвращать низкое значение для закрытых глаз', () => {
      const eye = [
        { x: 0, y: 0 },
        { x: 5, y: 0 },   // Верх и низ совпадают
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 0 },
      ];
      
      const ear = monitor.calculateSingleEAR(eye);
      expect(ear).toBeCloseTo(0, 1);
    });
  });

  describe('calculateEAR()', () => {
    it('должен усреднять EAR обоих глаз', () => {
      const pos = {};
      // Левый глаз (открыт)
      pos[36] = { x: 0, y: 0 };
      pos[37] = { x: 5, y: -5 };
      pos[38] = { x: 10, y: -5 };
      pos[39] = { x: 20, y: 0 };
      pos[40] = { x: 10, y: 5 };
      pos[41] = { x: 5, y: 5 };
      
      // Правый глаз (открыт)
      pos[42] = { x: 30, y: 0 };
      pos[43] = { x: 35, y: -5 };
      pos[44] = { x: 40, y: -5 };
      pos[45] = { x: 50, y: 0 };
      pos[46] = { x: 40, y: 5 };
      pos[47] = { x: 35, y: 5 };
      
      const ear = monitor.calculateEAR(pos);
      expect(ear).toBeGreaterThan(0.2);
    });
  });

  describe('isGazeDownward()', () => {
    it('должен определять взгляд вниз', () => {
      const pos = {
        27: { y: 50 },   // Бровь
        30: { y: 150 },  // Кончик носа (сильно ниже глаз)
        8: { y: 200 },   // Подбородок
      };
      
      // Глаза на высоте 60
      for (let i = 36; i <= 47; i++) {
        pos[i] = { y: 60 };
      }
      
      // Расчет: (150 - 60) / (200 - 50) = 90 / 150 = 0.6 (что > 0.45)
      const result = monitor.isGazeDownward(pos);
      expect(result).toBe(true);
    });

    it('должен возвращать false для прямого взгляда', () => {
      const pos = {
        27: { y: 50 },
        30: { y: 70 },   // Нос на уровне глаз
        8: { y: 200 },
      };
      
      for (let i = 36; i <= 47; i++) {
        pos[i] = { y: 60 };
      }
      
      const result = monitor.isGazeDownward(pos);
      expect(result).toBe(false);
    });

    it('должен возвращать false при малой высоте лица', () => {
      const pos = {
        27: { y: 50 },
        30: { y: 100 },
        8: { y: 60 },    // Малая высота лица
      };
      
      for (let i = 36; i <= 47; i++) {
        pos[i] = { y: 60 };
      }
      
      const result = monitor.isGazeDownward(pos);
      expect(result).toBe(false);
    });
  });

  describe('isMouthOpen()', () => {
    it('должен определять открытый рот', () => {
      const pos = {
        36: { x: 0, y: 50 },
        45: { x: 100, y: 50 },  // Расстояние между глазами = 100
        62: { x: 50, y: 60 },   // Верхняя губа
        66: { x: 50, y: 80 },   // Нижняя губа (высота = 20)
      };
      
      const result = monitor.isMouthOpen(pos);
      expect(result).toBe(true); // 20/100 = 0.2 > 0.1
    });

    it('должен возвращать false для закрытого рта', () => {
      const pos = {
        36: { x: 0, y: 50 },
        45: { x: 100, y: 50 },
        62: { x: 50, y: 70 },   // Губы близко
        66: { x: 50, y: 72 },   // Высота = 2
      };
      
      const result = monitor.isMouthOpen(pos);
      expect(result).toBe(false); // 2/100 = 0.02 < 0.1
    });

    it('должен возвращать false при нулевом расстоянии между глазами', () => {
      const pos = {
        36: { x: 0, y: 50 },
        45: { x: 0, y: 50 },  // Нулевое расстояние
        62: { x: 50, y: 60 },
        66: { x: 50, y: 80 },
      };
      
      const result = monitor.isMouthOpen(pos);
      expect(result).toBe(false);
    });
  });

  describe('determineState()', () => {
    it('должен определять сонливость при частом моргании', () => {
      const state = monitor.determineState(
        0.25,  // ear
        30,    // blinkRate > 25
        false, // gazeDown
        false, // mouthOpen
        0      // eyesClosedDuration
      );
      
      expect(state).toBe('drowsy');
    });

    it('должен определять сонливость при долгом закрытии глаз', () => {
      const state = monitor.determineState(
        0.25,  // ear (закрыты)
        5,     // blinkRate
        false, // gazeDown
        false, // mouthOpen
        15000  // eyesClosedDuration > 10000
      );
      
      expect(state).toBe('drowsy');
    });

    it('должен определять сонливость при закрытых глазах и взгляде вниз', () => {
      const state = monitor.determineState(
        0.25,  // ear (закрыты)
        5,     // blinkRate
        true,  // gazeDown
        false, // mouthOpen
        0      // eyesClosedDuration
      );
      
      expect(state).toBe('drowsy');
    });

    it('не должен определять сонливость при улыбке (рот открыт)', () => {
      const state = monitor.determineState(
        0.25,  // ear (прищур от улыбки)
        5,     // blinkRate
        true,  // gazeDown (наклон при улыбке)
        true,  // mouthOpen (улыбка!)
        0      // eyesClosedDuration
      );
      
      expect(state).toBe('normal'); // Не сонливость!
    });

    it('должен возвращать normal при нормальных показателях', () => {
      const state = monitor.determineState(
        0.30,  // ear (открыты)
        10,    // blinkRate
        false, // gazeDown
        false, // mouthOpen
        0      // eyesClosedDuration
      );
      
      expect(state).toBe('normal');
    });
  });
});