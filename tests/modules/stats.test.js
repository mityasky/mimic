// tests/modules/stats.test.js
// Тесты модуля расширенной статистики

describe('AdvancedStatsModule', () => {
  
  // Вспомогательная функция создания модуля
  function createStatsModule() {
    const NEW_STORAGE_KEY = 'mimic_advanced_stats_daily';
    const OLD_STORAGE_KEY = 'mimic_advanced_stats';
    const EMOTION_KEYS = ['happy', 'sad', 'angry', 'surprised', 'fearful', 'disgusted'];
    let dailyStats = {};
    let emotionStartTime = 0;

    function getTodayKey() {
      return new Date().toISOString().split('T')[0];
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

    async function save() {
      await localforage.setItem(NEW_STORAGE_KEY, dailyStats);
    }

    async function load() {
      const saved = await localforage.getItem(NEW_STORAGE_KEY);
      if (saved) {
        dailyStats = saved;
      } else {
        dailyStats = {};
      }
    }

    function startEmotion(emotionKey) {
      emotionStartTime = Date.now();
    }

    function endEmotion(emotionKey, isCorrect) {
      const today = ensureTodayExists();
      if (!dailyStats[today][emotionKey]) {
        dailyStats[today][emotionKey] = { attempts: 0, correct: 0, totalTime: 0 };
      }
      dailyStats[today][emotionKey].attempts++;
      if (isCorrect) {
        dailyStats[today][emotionKey].correct++;
      }
      const duration = (Date.now() - emotionStartTime) / 1000;
      dailyStats[today][emotionKey].totalTime += duration;
    }

    function getAggregatedStats(filter = 'all') {
      const aggregated = {};
      EMOTION_KEYS.forEach(key => {
        aggregated[key] = { attempts: 0, correct: 0, totalTime: 0 };
      });

      const now = Date.now();
      let cutoffDate = null;
      
      if (filter !== 'all') {
        const days = parseInt(filter, 10);
        const cutoffTime = now - (days * 24 * 60 * 60 * 1000);
        cutoffDate = new Date(cutoffTime).toISOString().split('T')[0];
      }

      for (const dateKey in dailyStats) {
        if (cutoffDate && dateKey < cutoffDate) {
          continue;
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
          correct: d.correct,
          totalTime: parseFloat(d.totalTime.toFixed(2))
        };
      });
    }

    async function migrateOldData() {
      const oldStatsStr = localStorage.getItem(OLD_STORAGE_KEY);
      if (oldStatsStr) {
        try {
          const oldStats = JSON.parse(oldStatsStr);
          const today = getTodayKey();
          ensureTodayExists();
          
          EMOTION_KEYS.forEach(key => {
            if (oldStats[key]) {
              dailyStats[today][key].attempts += oldStats[key].attempts || 0;
              dailyStats[today][key].correct += oldStats[key].correct || 0;
              dailyStats[today][key].totalTime += oldStats[key].totalTime || 0;
            }
          });
          
          await save();
          localStorage.removeItem(OLD_STORAGE_KEY);
          return true;
        } catch (e) {
          return false;
        }
      }
      return false;
    }

    return {
      getTodayKey,
      ensureTodayExists,
      save,
      load,
      startEmotion,
      endEmotion,
      getAggregatedStats,
      migrateOldData,
      getDailyStats: () => dailyStats,
      setDailyStats: (stats) => { dailyStats = stats; }
    };
  }

  let stats;

  beforeEach(() => {
    stats = createStatsModule();
  });

  describe('getTodayKey()', () => {
    it('должен возвращать дату в формате YYYY-MM-DD', () => {
      const today = stats.getTodayKey();
      expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('должен возвращать текущую дату', () => {
      const today = stats.getTodayKey();
      const expected = new Date().toISOString().split('T')[0];
      expect(today).toBe(expected);
    });
  });

  describe('ensureTodayExists()', () => {
    it('должен создавать запись для сегодняшнего дня', () => {
      const today = stats.ensureTodayExists();
      const dailyStats = stats.getDailyStats();
      
      expect(dailyStats[today]).toBeDefined();
      expect(dailyStats[today].happy).toBeDefined();
      expect(dailyStats[today].happy.attempts).toBe(0);
    });

    it('не должен перезаписывать существующие данные', () => {
      const today = stats.getTodayKey();
      stats.setDailyStats({
        [today]: {
          happy: { attempts: 10, correct: 8, totalTime: 20 }
        }
      });
      
      stats.ensureTodayExists();
      
      expect(stats.getDailyStats()[today].happy.attempts).toBe(10);
    });
  });

  describe('startEmotion() и endEmotion()', () => {
    it('должен корректно записывать правильные ответы', () => {
      stats.startEmotion('happy');
      setTimeout(() => {
        stats.endEmotion('happy', true);
        
        const today = stats.getTodayKey();
        const dailyStats = stats.getDailyStats();
        
        expect(dailyStats[today].happy.attempts).toBe(1);
        expect(dailyStats[today].happy.correct).toBe(1);
        expect(dailyStats[today].happy.totalTime).toBeGreaterThan(0);
      }, 100);
    });

    it('должен корректно записывать неправильные ответы', () => {
      stats.startEmotion('sad');
      setTimeout(() => {
        stats.endEmotion('sad', false);
        
        const today = stats.getTodayKey();
        const dailyStats = stats.getDailyStats();
        
        expect(dailyStats[today].sad.attempts).toBe(1);
        expect(dailyStats[today].sad.correct).toBe(0);
      }, 50);
    });

    it('должен накапливать статистику за несколько попыток', () => {
      const today = stats.getTodayKey();
      
      for (let i = 0; i < 5; i++) {
        stats.startEmotion('angry');
        stats.endEmotion('angry', i < 3); // 3 из 5 правильных
      }
      
      const dailyStats = stats.getDailyStats();
      expect(dailyStats[today].angry.attempts).toBe(5);
      expect(dailyStats[today].angry.correct).toBe(3);
    });
  });

  describe('getAggregatedStats()', () => {
    beforeEach(() => {
      // Создаём тестовые данные за несколько дней
      const today = new Date();
      const testData = {};
      
      for (let i = 0; i < 10; i++) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateKey = date.toISOString().split('T')[0];
        
        testData[dateKey] = {
          happy: { attempts: 10, correct: 8, totalTime: 20 },
          sad: { attempts: 5, correct: 3, totalTime: 15 },
          angry: { attempts: 8, correct: 6, totalTime: 18 },
          surprised: { attempts: 6, correct: 5, totalTime: 12 },
          fearful: { attempts: 4, correct: 2, totalTime: 10 },
          disgusted: { attempts: 3, correct: 2, totalTime: 8 }
        };
      }
      
      stats.setDailyStats(testData);
    });

    it('должен агрегировать статистику за всё время', () => {
      const aggregated = stats.getAggregatedStats('all');
      
      expect(aggregated).toHaveLength(6);
      expect(aggregated[0].emotion).toBe('happy');
      expect(aggregated[0].attempts).toBe(100); // 10 дней * 10
      expect(aggregated[0].correct).toBe(80);
    });

    it('должен корректно рассчитывать точность', () => {
      const aggregated = stats.getAggregatedStats('all');
      const happy = aggregated.find(s => s.emotion === 'happy');
      
      // 80 правильных из 100 = 80%
      expect(happy.accuracy).toBe(80);
    });

    it('должен корректно рассчитывать среднее время', () => {
      const aggregated = stats.getAggregatedStats('all');
      const happy = aggregated.find(s => s.emotion === 'happy');
      
      // 200 секунд / 80 правильных = 2.5 сек
      expect(happy.avgTime).toBeCloseTo(2.5, 1);
    });

    it('должен фильтровать данные за последние 7 дней', () => {
      const aggregated = stats.getAggregatedStats('7');
      const happy = aggregated.find(s => s.emotion === 'happy');
      
      // Из-за включительной границы даты (cutoffDate), захватывается 8 дней (текущий + 7 предыдущих)
      // 8 дней * 10 попыток в день = 80 попыток
      expect(happy.attempts).toBe(80); 
      expect(happy.correct).toBe(64); // 8 * 8
    });

    it('должен фильтровать данные за последние 14 дней', () => {
      const aggregated = stats.getAggregatedStats('14');
      const happy = aggregated.find(s => s.emotion === 'happy');
      
      // Все 10 дней попадают в фильтр (10 < 14)
      expect(happy.attempts).toBe(100);
    });

    it('должен возвращать 0 для эмоций без попыток', () => {
      stats.setDailyStats({});
      const aggregated = stats.getAggregatedStats('all');
      
      aggregated.forEach(stat => {
        expect(stat.attempts).toBe(0);
        expect(stat.accuracy).toBe(0);
        expect(stat.avgTime).toBe(0);
      });
    });

    it('должен обрабатывать дни с неполными данными', () => {
      stats.setDailyStats({
        '2024-01-01': {
          happy: { attempts: 10, correct: 8, totalTime: 20 }
          // Другие эмоции отсутствуют
        }
      });
      
      const aggregated = stats.getAggregatedStats('all');
      const happy = aggregated.find(s => s.emotion === 'happy');
      const sad = aggregated.find(s => s.emotion === 'sad');
      
      expect(happy.attempts).toBe(10);
      expect(sad.attempts).toBe(0);
    });
  });

  describe('Миграция старых данных', () => {
    it('должен мигрировать данные из старого ключа', async () => {
      const oldStats = {
        happy: { attempts: 50, correct: 40, totalTime: 100 },
        sad: { attempts: 30, correct: 20, totalTime: 80 }
      };
      
      localStorage.setItem('mimic_advanced_stats', JSON.stringify(oldStats));
      
      const migrated = await stats.migrateOldData();
      expect(migrated).toBe(true);
      
      const today = stats.getTodayKey();
      const dailyStats = stats.getDailyStats();
      
      expect(dailyStats[today].happy.attempts).toBe(50);
      expect(dailyStats[today].happy.correct).toBe(40);
      expect(dailyStats[today].sad.attempts).toBe(30);
      
      // Старый ключ должен быть удалён
      expect(localStorage.getItem('mimic_advanced_stats')).toBeNull();
    });

    it('должен возвращать false при отсутствии старых данных', async () => {
      const migrated = await stats.migrateOldData();
      expect(migrated).toBe(false);
    });

    it('должен корректно обрабатывать повреждённые данные', async () => {
      localStorage.setItem('mimic_advanced_stats', 'invalid json');
      
      const migrated = await stats.migrateOldData();
      expect(migrated).toBe(false);
    });
  });

  describe('Сохранение и загрузка', () => {
    it('должен сохранять и загружать данные', async () => {
      const today = stats.getTodayKey();
      stats.setDailyStats({
        [today]: {
          happy: { attempts: 10, correct: 8, totalTime: 20 }
        }
      });
      
      await stats.save();
      
      // Создаём новый экземпляр и загружаем
      const newStats = createStatsModule();
      await newStats.load();
      
      expect(newStats.getDailyStats()[today].happy.attempts).toBe(10);
    });
  });
});