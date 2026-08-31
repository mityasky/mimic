// tests/integration/full-cycle.test.js
// Интеграционные тесты полного цикла тренировки

describe('Integration: Полный цикл тренировки', () => {
  
  function createFullSystem() {
    // Модуль DB
    const DB = {
      get: async (key) => {
        let data = await localforage.getItem(key);
        if (data === null) {
          const oldData = localStorage.getItem(key);
          if (oldData !== null) {
            const parsed = JSON.parse(oldData);
            await localforage.setItem(key, parsed);
            localStorage.removeItem(key);
            return parsed;
          }
        }
        return data;
      },
      set: async (key, value) => {
        await localforage.setItem(key, value);
      },
      remove: async (key) => {
        await localforage.removeItem(key);
      }
    };

    // Модуль статистики
    const EMOTION_KEYS = ['happy', 'sad', 'angry', 'surprised', 'fearful', 'disgusted'];
    let dailyStats = {};

    const Stats = {
      getTodayKey: () => new Date().toISOString().split('T')[0],
      recordSuccess: async (emotionKey) => {
        const today = Stats.getTodayKey();
        if (!dailyStats[today]) {
          dailyStats[today] = {};
          EMOTION_KEYS.forEach(key => {
            dailyStats[today][key] = { attempts: 0, correct: 0, totalTime: 0 };
          });
        }
        if (!dailyStats[today][emotionKey]) {
          dailyStats[today][emotionKey] = { attempts: 0, correct: 0, totalTime: 0 };
        }
        dailyStats[today][emotionKey].attempts++;
        dailyStats[today][emotionKey].correct++;
        await DB.set('mimic_advanced_stats_daily', dailyStats);
      },
      getAggregated: () => {
        const aggregated = {};
        EMOTION_KEYS.forEach(key => {
          aggregated[key] = { attempts: 0, correct: 0 };
        });
        for (const dayData of Object.values(dailyStats)) {
          EMOTION_KEYS.forEach(key => {
            if (dayData[key]) {
              aggregated[key].attempts += dayData[key].attempts;
              aggregated[key].correct += dayData[key].correct;
            }
          });
        }
        return aggregated;
      }
    };

    // Модуль прогресса
    const Progress = {
      saveSession: async (sessionData) => {
        const history = await DB.get('mimic_progress_history') || [];
        history.push(sessionData);
        if (history.length > 100) history.shift();
        await DB.set('mimic_progress_history', history);
      },
      getHistory: async () => {
        return await DB.get('mimic_progress_history') || [];
      }
    };

    // Модуль ошибок
    const Errors = {
      addError: async (target, shown) => {
        const errors = await DB.get('mimic_errors') || [];
        errors.push({ target, shown, time: Date.now() });
        if (errors.length > 500) errors.shift();
        await DB.set('mimic_errors', errors);
      },
      getErrors: async () => {
        return await DB.get('mimic_errors') || [];
      }
    };

    // Модуль дневника
    const Diary = {
      save: async (emotion) => {
        const entries = await DB.get('mimicEmotionDiary') || [];
        entries.unshift({
          emotion,
          emoji: '😊',
          timestamp: Date.now(),
          date: new Date().toISOString()
        });
        if (entries.length > 100) entries.length = 100;
        await DB.set('mimicEmotionDiary', entries);
      },
      getAll: async () => {
        return await DB.get('mimicEmotionDiary') || [];
      }
    };

    return { DB, Stats, Progress, Errors, Diary };
  }

  let system;

  beforeEach(() => {
    system = createFullSystem();
  });

  it('должен проходить полный цикл тренировки', async () => {
    // 1. Пользователь начинает тренировку
    const sessionStart = Date.now();
    
    // 2. Пользователь правильно распознаёт 5 эмоций
    for (let i = 0; i < 5; i++) {
      await system.Stats.recordSuccess('happy');
    }
    
    // 3. Пользователь ошибается 2 раза
    await system.Errors.addError('happy', 'surprised');
    await system.Errors.addError('sad', 'angry');
    
    // 4. Завершаем сессию
    const sessionDuration = Math.round((Date.now() - sessionStart) / 1000);
    await system.Progress.saveSession({
      date: new Date().toISOString(),
      mode: 'training',
      time: sessionDuration,
      accuracy: 71, // 5 из 7
      streak: 5,
      score: 50,
      total: 7,
      correct: 5
    });
    
    // 5. Пользователь записывает эмоцию в дневник
    await system.Diary.save('happy');
    
    // 6. Проверяем статистику
    const aggregated = system.Stats.getAggregated();
    expect(aggregated.happy.correct).toBe(5);
    expect(aggregated.happy.attempts).toBe(5);
    
    // 7. Проверяем историю
    const history = await system.Progress.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].accuracy).toBe(71);
    
    // 8. Проверяем ошибки
    const errors = await system.Errors.getErrors();
    expect(errors).toHaveLength(2);
    expect(errors[0].target).toBe('happy');
    expect(errors[0].shown).toBe('surprised');
    
    // 9. Проверяем дневник
    const diary = await system.Diary.getAll();
    expect(diary).toHaveLength(1);
    expect(diary[0].emotion).toBe('happy');
  });

  it('должен сохранять данные между сессиями', async () => {
    // Сессия 1
    await system.Stats.recordSuccess('happy');
    await system.Progress.saveSession({
      date: '2024-01-01',
      time: 120,
      accuracy: 85
    });
    
    // Сессия 2
    await system.Stats.recordSuccess('sad');
    await system.Progress.saveSession({
      date: '2024-01-02',
      time: 150,
      accuracy: 90
    });
    
    // Проверяем накопление
    const history = await system.Progress.getHistory();
    expect(history).toHaveLength(2);
    
    const aggregated = system.Stats.getAggregated();
    expect(aggregated.happy.correct).toBe(1);
    expect(aggregated.sad.correct).toBe(1);
  });

  it('должен мигрировать данные из localStorage', async () => {
    // Имитируем старые данные
    localStorage.setItem('mimic_progress_history', JSON.stringify([
      { date: '2024-01-01', accuracy: 80 }
    ]));
    
    localStorage.setItem('mimic_errors', JSON.stringify([
      { target: 'happy', shown: 'sad' }
    ]));
    
    // Читаем через новый модуль
    const history = await system.Progress.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].accuracy).toBe(80);
    
    const errors = await system.Errors.getErrors();
    expect(errors).toHaveLength(1);
    
    // Проверяем, что localStorage очищен
    expect(localStorage.getItem('mimic_progress_history')).toBeNull();
    expect(localStorage.getItem('mimic_errors')).toBeNull();
  });

  it('должен ограничивать размер истории', async () => {
    // Добавляем 150 сессий
    for (let i = 0; i < 150; i++) {
      await system.Progress.saveSession({
        date: `2024-01-${String(i + 1).padStart(2, '0')}`,
        time: 120,
        accuracy: 80 + (i % 20)
      });
    }
    
    const history = await system.Progress.getHistory();
    expect(history.length).toBeLessThanOrEqual(100);
  });

  it('должен ограничивать размер списка ошибок', async () => {
    // Добавляем 600 ошибок
    for (let i = 0; i < 600; i++) {
      await system.Errors.addError('happy', 'sad');
    }
    
    const errors = await system.Errors.getErrors();
    expect(errors.length).toBeLessThanOrEqual(500);
  });
});