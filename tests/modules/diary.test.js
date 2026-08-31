// tests/modules/diary.test.js
// Тесты модуля эмоционального дневника

describe('EmotionDiary', () => {
  
  function createDiaryModule() {
    const STORAGE_KEY = 'mimicEmotionDiary';
    const MAX_ENTRIES = 100;
    const EMOJI_MAP = {
      happy: '😊',
      sad: '',
      angry: '😠',
      surprised: '😮',
      fearful: '',
      neutral: '😐'
    };

    async function getAll() {
      const data = await localforage.getItem(STORAGE_KEY);
      return Array.isArray(data) ? data : [];
    }

    async function save(emotionKey) {
      const entries = await getAll();
      entries.unshift({
        emotion: emotionKey,
        emoji: EMOJI_MAP[emotionKey] || '😐',
        timestamp: Date.now(),
        date: new Date().toISOString()
      });
      
      if (entries.length > MAX_ENTRIES) {
        entries.length = MAX_ENTRIES;
      }
      
      await localforage.setItem(STORAGE_KEY, entries);
      return entries;
    }

    async function clear() {
      await localforage.removeItem(STORAGE_KEY);
    }

    return { getAll, save, clear };
  }

  let diary;

  beforeEach(() => {
    diary = createDiaryModule();
  });

  describe('getAll()', () => {
    it('должен возвращать пустой массив при отсутствии данных', async () => {
      const entries = await diary.getAll();
      expect(entries).toEqual([]);
    });

    it('должен возвращать сохранённые записи', async () => {
      await diary.save('happy');
      await diary.save('sad');
      
      const entries = await diary.getAll();
      
      expect(entries).toHaveLength(2);
      expect(entries[0].emotion).toBe('sad'); // Новые записи в начале
      expect(entries[1].emotion).toBe('happy');
    });
  });

  describe('save()', () => {
    it('должен создавать запись с правильными полями', async () => {
      const entries = await diary.save('happy');
      
      expect(entries).toHaveLength(1);
      expect(entries[0].emotion).toBe('happy');
      expect(entries[0].emoji).toBe('😊');
      expect(entries[0].timestamp).toBeDefined();
      expect(entries[0].date).toBeDefined();
    });

    it('должен добавлять записи в начало списка', async () => {
      await diary.save('happy');
      await diary.save('sad');
      await diary.save('angry');
      
      const entries = await diary.getAll();
      
      expect(entries[0].emotion).toBe('angry');
      expect(entries[1].emotion).toBe('sad');
      expect(entries[2].emotion).toBe('happy');
    });

    it('должен ограничивать количество записей до 100', async () => {
      for (let i = 0; i < 110; i++) {
        await diary.save('happy');
      }
      
      const entries = await diary.getAll();
      
      expect(entries.length).toBeLessThanOrEqual(100);
    });

    it('должен корректно работать с разными эмоциями', async () => {
      const emotions = ['happy', 'sad', 'angry', 'surprised', 'fearful', 'neutral'];
      
      for (const emotion of emotions) {
        await diary.save(emotion);
      }
      
      const entries = await diary.getAll();
      
      expect(entries).toHaveLength(6);
      expect(entries[0].emotion).toBe('neutral');
      expect(entries[5].emotion).toBe('happy');
    });

    it('должен использовать emoji по умолчанию для неизвестных эмоций', async () => {
      const entries = await diary.save('unknown');
      
      expect(entries[0].emoji).toBe('😐');
    });
  });

  describe('clear()', () => {
    it('должен удалять все записи', async () => {
      await diary.save('happy');
      await diary.save('sad');
      
      await diary.clear();
      
      const entries = await diary.getAll();
      expect(entries).toEqual([]);
    });

    it('должен корректно работать при пустом дневнике', async () => {
      await diary.clear();
      
      const entries = await diary.getAll();
      expect(entries).toEqual([]);
    });
  });
});