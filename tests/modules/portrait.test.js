// tests/modules/portrait.test.js
// Тесты модуля цифрового эмоционального портрета

describe('EmotionalPortraitModule', () => {
  
  function createPortraitModule() {
    const MIN_SESSIONS = 6;
    const MIN_DURATION_SEC = 60;

    async function getData() {
      const history = await localforage.getItem('mimic_progress_history') || [];
      const errors = await localforage.getItem('mimic_errors') || [];
      return { history, errors };
    }

    async function checkReadiness() {
      const { history } = await getData();
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
        sumX += i;
        sumY += s.accuracy;
        sumXY += i * s.accuracy;
        sumXX += i * i;
      });
      
      const denominator = (n * sumXX - sumX * sumX);
      if (denominator === 0) return { trend: 'stable', percent: 0 };
      
      const slope = (n * sumXY - sumX * sumY) / denominator;
      const avgY = sumY / n;
      const percentChange = avgY > 0 ? (slope / avgY) * 100 : 0;

      if (percentChange > 5) return { trend: 'improving', percent: Math.round(percentChange) };
      if (percentChange < -5) return { trend: 'declining', percent: Math.round(Math.abs(percentChange)) };
      return { trend: 'stable', percent: 0 };
    }

    function analyzeFatigue(history) {
      const longSessions = history.filter(s => (s.time || 0) >= MIN_DURATION_SEC);
      
      if (longSessions.length === 0) {
        return { isFatigued: false, shortAccuracy: '0.0', longAccuracy: '0.0' };
      }

      const shortSessions = history.filter(s => {
        const time = s.time || 0;
        return time < MIN_DURATION_SEC && time > 0;
      });
      
      const avgAccuracyShort = shortSessions.length 
        ? shortSessions.reduce((sum, s) => sum + (s.accuracy || 0), 0) / shortSessions.length 
        : 0;
      
      const avgAccuracyLong = longSessions.length 
        ? longSessions.reduce((sum, s) => sum + (s.accuracy || 0), 0) / longSessions.length 
        : 0;

      const isFatigued = avgAccuracyLong < (avgAccuracyShort * 0.85) 
                      && longSessions.length > 0 
                      && avgAccuracyShort > 0;

      return { 
        isFatigued, 
        shortAccuracy: avgAccuracyShort.toFixed(1), 
        longAccuracy: avgAccuracyLong.toFixed(1) 
      };
    }

    function analyzeErrorMatrix(errors) {
      const emotions = ['happy', 'sad', 'angry', 'surprised', 'fearful', 'disgusted'];
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

      return matrix;
    }

    return {
      getData,
      checkReadiness,
      analyzeTrend,
      analyzeFatigue,
      analyzeErrorMatrix
    };
  }

  let portrait;

  beforeEach(() => {
    portrait = createPortraitModule();
  });

  describe('checkReadiness()', () => {
    it('должен возвращать isReady=false при пустой истории', async () => {
      await localforage.setItem('mimic_progress_history', []);
      
      const readiness = await portrait.checkReadiness();
      
      expect(readiness.isReady).toBe(false);
      expect(readiness.validCount).toBe(0);
      expect(readiness.totalCount).toBe(0);
    });

    it('должен возвращать isReady=false при недостаточном количестве сессий', async () => {
      const history = Array.from({ length: 5 }, (_, i) => ({
        date: `2024-01-0${i + 1}`,
        time: 120,
        accuracy: 80
      }));
      
      await localforage.setItem('mimic_progress_history', history);
      
      const readiness = await portrait.checkReadiness();
      
      expect(readiness.isReady).toBe(false);
      expect(readiness.validCount).toBe(5);
    });

    it('должен возвращать isReady=true при достаточном количестве сессий', async () => {
      const history = Array.from({ length: 10 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        time: 120,
        accuracy: 80
      }));
      
      await localforage.setItem('mimic_progress_history', history);
      
      const readiness = await portrait.checkReadiness();
      
      expect(readiness.isReady).toBe(true);
      expect(readiness.validCount).toBe(10);
    });

    it('должен учитывать только сессии длительностью >= MIN_DURATION_SEC', async () => {
      const history = [
        { date: '2024-01-01', time: 30, accuracy: 80 },  // Короткая
        { date: '2024-01-02', time: 120, accuracy: 85 }, // Длинная
        { date: '2024-01-03', time: 45, accuracy: 90 },  // Короткая
        { date: '2024-01-04', time: 180, accuracy: 88 }, // Длинная
        { date: '2024-01-05', time: 90, accuracy: 92 },  // Длинная
        { date: '2024-01-06', time: 150, accuracy: 87 }, // Длинная
      ];
      
      await localforage.setItem('mimic_progress_history', history);
      
      const readiness = await portrait.checkReadiness();
      
      expect(readiness.validCount).toBe(4); // Только 4 длинные сессии
      expect(readiness.totalCount).toBe(6);
    });

    it('должен корректно обрабатывать сессии без поля time', async () => {
      const history = [
        { date: '2024-01-01', accuracy: 80 }, // time отсутствует
        { date: '2024-01-02', time: 120, accuracy: 85 },
      ];
      
      await localforage.setItem('mimic_progress_history', history);
      
      const readiness = await portrait.checkReadiness();
      
      expect(readiness.validCount).toBe(1);
    });
  });

  describe('analyzeTrend()', () => {
    it('должен возвращать stable для менее чем 3 сессий', () => {
      const trend = portrait.analyzeTrend([
        { accuracy: 80 },
        { accuracy: 85 }
      ]);
      
      expect(trend.trend).toBe('stable');
      expect(trend.percent).toBe(0);
    });

    it('должен определять улучшающийся тренд', () => {
      const sessions = [
        { accuracy: 60 },
        { accuracy: 70 },
        { accuracy: 80 },
        { accuracy: 90 },
        { accuracy: 95 }
      ];
      
      const trend = portrait.analyzeTrend(sessions);
      
      expect(trend.trend).toBe('improving');
      expect(trend.percent).toBeGreaterThan(0);
    });

    it('должен определять ухудшающийся тренд', () => {
      const sessions = [
        { accuracy: 95 },
        { accuracy: 90 },
        { accuracy: 80 },
        { accuracy: 70 },
        { accuracy: 60 }
      ];
      
      const trend = portrait.analyzeTrend(sessions);
      
      expect(trend.trend).toBe('declining');
      expect(trend.percent).toBeGreaterThan(0);
    });

    it('должен определять стабильный тренд', () => {
      const sessions = [
        { accuracy: 80 },
        { accuracy: 82 },
        { accuracy: 78 },
        { accuracy: 81 },
        { accuracy: 79 }
      ];
      
      const trend = portrait.analyzeTrend(sessions);
      
      expect(trend.trend).toBe('stable');
    });

    it('должен корректно работать с одинаковыми значениями', () => {
      const sessions = Array.from({ length: 5 }, () => ({ accuracy: 80 }));
      
      const trend = portrait.analyzeTrend(sessions);
      
      expect(trend.trend).toBe('stable');
      expect(trend.percent).toBe(0);
    });

    it('должен обрабатывать нулевую точность', () => {
      const sessions = Array.from({ length: 5 }, () => ({ accuracy: 0 }));
      
      const trend = portrait.analyzeTrend(sessions);
      
      expect(trend.trend).toBe('stable');
    });
  });

  describe('analyzeFatigue()', () => {
    it('должен возвращать isFatigued=false при пустой истории', () => {
      const fatigue = portrait.analyzeFatigue([]);
      
      expect(fatigue.isFatigued).toBe(false);
      expect(fatigue.shortAccuracy).toBe('0.0');
      expect(fatigue.longAccuracy).toBe('0.0');
    });

    it('должен определять утомление при падении точности', () => {
      const history = [
        // Короткие сессии с высокой точностью
        { time: 30, accuracy: 90 },
        { time: 45, accuracy: 88 },
        { time: 50, accuracy: 92 },
        // Длинные сессии с низкой точностью
        { time: 120, accuracy: 70 },
        { time: 150, accuracy: 65 },
        { time: 180, accuracy: 68 },
      ];
      
      const fatigue = portrait.analyzeFatigue(history);
      
      expect(fatigue.isFatigued).toBe(true);
      expect(parseFloat(fatigue.shortAccuracy)).toBeGreaterThan(parseFloat(fatigue.longAccuracy));
    });

    it('не должен определять утомление при стабильной точности', () => {
      const history = [
        { time: 30, accuracy: 80 },
        { time: 120, accuracy: 82 },
        { time: 150, accuracy: 78 },
      ];
      
      const fatigue = portrait.analyzeFatigue(history);
      
      expect(fatigue.isFatigued).toBe(false);
    });

    it('должен корректно работать только с длинными сессиями', () => {
      const history = [
        { time: 120, accuracy: 80 },
        { time: 150, accuracy: 85 },
      ];
      
      const fatigue = portrait.analyzeFatigue(history);
      
      expect(fatigue.isFatigued).toBe(false);
      expect(fatigue.shortAccuracy).toBe('0.0');
      expect(parseFloat(fatigue.longAccuracy)).toBeGreaterThan(0);
    });
  });

  describe('analyzeErrorMatrix()', () => {
    it('должен создавать пустую матрицу при отсутствии ошибок', () => {
      const matrix = portrait.analyzeErrorMatrix([]);
      
      expect(matrix.happy).toBeDefined();
      expect(matrix.happy.happy).toBe(0);
      expect(matrix.sad.sad).toBe(0);
    });

    it('должен корректно подсчитывать ошибки', () => {
      const errors = [
        { target: 'happy', shown: 'surprised' },
        { target: 'happy', shown: 'surprised' },
        { target: 'sad', shown: 'angry' },
      ];
      
      const matrix = portrait.analyzeErrorMatrix(errors);
      
      expect(matrix.happy.surprised).toBe(2);
      expect(matrix.sad.angry).toBe(1);
      expect(matrix.happy.happy).toBe(0);
    });

    it('должен игнорировать ошибки с неизвестными эмоциями', () => {
      const errors = [
        { target: 'happy', shown: 'unknown' },
        { target: 'unknown', shown: 'happy' },
      ];
      
      const matrix = portrait.analyzeErrorMatrix(errors);
      
      expect(matrix.happy.happy).toBe(0);
    });

    it('должен обрабатывать большое количество ошибок', () => {
      const errors = Array.from({ length: 100 }, () => ({
        target: 'happy',
        shown: 'sad'
      }));
      
      const matrix = portrait.analyzeErrorMatrix(errors);
      
      expect(matrix.happy.sad).toBe(100);
    });
  });
});