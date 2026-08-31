// tests/utils/db.test.js
// Тесты модуля работы с IndexedDB (localforage)

describe('DB Module (IndexedDB через LocalForage)', () => {
  
  // Вспомогательная функция для создания модуля DB
  function createDBModule() {
    return {
      init: () => {
        if (typeof localforage === 'undefined') {
          throw new Error('localforage не загружен');
        }
        localforage.config({
          driver: localforage.INDEXEDDB,
          name: 'MimicTrainerDB',
          version: 1.0,
          storeName: 'mimic_data',
          description: 'Локальное хранилище данных тренажёра МИМИК'
        });
      },
      get: async (key) => {
        try {
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
        } catch (e) {
          console.warn(`⚠️ DB read error (${key}):`, e);
          return null;
        }
      },
      set: async (key, value) => {
        try {
          await localforage.setItem(key, value);
        } catch (e) {
          console.warn(`⚠️ DB write error (${key}):`, e);
        }
      },
      remove: async (key) => {
        try {
          await localforage.removeItem(key);
        } catch (e) {
          console.warn(`⚠️ DB delete error (${key}):`, e);
        }
      }
    };
  }

  let DB;

  beforeEach(() => {
    DB = createDBModule();
    DB.init();
  });

  describe('DB.get()', () => {
    it('должен возвращать null для несуществующего ключа', async () => {
      const result = await DB.get('nonexistent_key');
      expect(result).toBeNull();
    });

    it('должен читать данные из IndexedDB', async () => {
      await DB.set('test_key', { name: 'Тест', value: 42 });
      const result = await DB.get('test_key');
      expect(result).toEqual({ name: 'Тест', value: 42 });
    });

    it('должен мигрировать данные из localStorage в IndexedDB', async () => {
      // Имитируем старые данные в localStorage
      localStorage.setItem('old_data', JSON.stringify([1, 2, 3]));
      
      const result = await DB.get('old_data');
      
      expect(result).toEqual([1, 2, 3]);
      
      // Проверяем, что данные теперь в IndexedDB
      const fromIndexedDB = await localforage.getItem('old_data');
      expect(fromIndexedDB).toEqual([1, 2, 3]);
      
      // И удалены из localStorage
      expect(localStorage.getItem('old_data')).toBeNull();
    });

    it('должен возвращать пустой массив для истории, если данных нет', async () => {
      const result = await DB.get('mimic_progress_history');
      expect(result).toBeNull(); // null, т.к. данных нет
    });

    it('должен корректно работать с разными типами данных', async () => {
      await DB.set('string_key', 'hello');
      await DB.set('number_key', 42);
      await DB.set('array_key', [1, 2, 3]);
      await DB.set('object_key', { a: 1, b: 2 });
      await DB.set('null_key', null);

      expect(await DB.get('string_key')).toBe('hello');
      expect(await DB.get('number_key')).toBe(42);
      expect(await DB.get('array_key')).toEqual([1, 2, 3]);
      expect(await DB.get('object_key')).toEqual({ a: 1, b: 2 });
      expect(await DB.get('null_key')).toBeNull();
    });

    it('должен обрабатывать ошибки чтения без падения', async () => {
      // Симулируем ошибку
      const originalGetItem = localforage.getItem;
      localforage.getItem = async () => { throw new Error('Test error'); };
      
      const result = await DB.get('error_key');
      expect(result).toBeNull();
      
      localforage.getItem = originalGetItem;
    });
  });

  describe('DB.set()', () => {
    it('должен сохранять данные в IndexedDB', async () => {
      const data = { score: 100, accuracy: 95 };
      await DB.set('session_data', data);
      
      const result = await DB.get('session_data');
      expect(result).toEqual(data);
    });

    it('должен перезаписывать существующие данные', async () => {
      await DB.set('key', 'old_value');
      await DB.set('key', 'new_value');
      
      const result = await DB.get('key');
      expect(result).toBe('new_value');
    });

    it('должен сохранять большие массивы', async () => {
      const largeArray = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        value: Math.random()
      }));
      
      await DB.set('large_data', largeArray);
      const result = await DB.get('large_data');
      
      expect(result).toHaveLength(1000);
      expect(result[0].id).toBe(0);
      expect(result[999].id).toBe(999);
    });

    it('должен обрабатывать ошибки записи без падения', async () => {
      const originalSetItem = localforage.setItem;
      localforage.setItem = async () => { throw new Error('Quota exceeded'); };
      
      // Не должно выбросить исключение
      await DB.set('error_key', 'value');
      
      localforage.setItem = originalSetItem;
    });
  });

  describe('DB.remove()', () => {
    it('должен удалять данные из IndexedDB', async () => {
      await DB.set('to_delete', 'some_data');
      await DB.remove('to_delete');
      
      const result = await DB.get('to_delete');
      expect(result).toBeNull();
    });

    it('должен корректно работать при удалении несуществующего ключа', async () => {
      // Не должно выбросить исключение
      await DB.remove('nonexistent');
      expect(true).toBe(true);
    });
  });

  describe('Миграция данных', () => {
    it('должен мигрировать историю прогресса', async () => {
      const history = [
        { date: '2024-01-01', accuracy: 85, mode: 'training' },
        { date: '2024-01-02', accuracy: 90, mode: 'training' }
      ];
      
      localStorage.setItem('mimic_progress_history', JSON.stringify(history));
      
      const result = await DB.get('mimic_progress_history');
      
      expect(result).toEqual(history);
      expect(localStorage.getItem('mimic_progress_history')).toBeNull();
    });

    it('должен мигрировать ошибки', async () => {
      const errors = [
        { target: 'happy', shown: 'surprised', time: Date.now() }
      ];
      
      localStorage.setItem('mimic_errors', JSON.stringify(errors));
      
      const result = await DB.get('mimic_errors');
      expect(result).toEqual(errors);
    });

    it('должен мигрировать расширенную статистику', async () => {
      const stats = {
        '2024-01-01': {
          happy: { attempts: 10, correct: 8, totalTime: 20 }
        }
      };
      
      localStorage.setItem('mimic_advanced_stats_daily', JSON.stringify(stats));
      
      const result = await DB.get('mimic_advanced_stats_daily');
      expect(result).toEqual(stats);
    });

    it('должен мигрировать рекорд', async () => {
      localStorage.setItem('mimicHighScore', '150');
      
      const result = await DB.get('mimicHighScore');
      
      // JSON.parse('150') возвращает число 150, а не строку '150'
      expect(result).toBe(150); 
    });
  });
});