import { logger } from '../../utils/logger.js';

/**
 * 報名／請假進鎖前查詢用的 in-memory 讀取快取（ADR 0020）。只給 repository 內部用，
 * handler 不能直接讀，一律透過 repository 的函式（CLAUDE.md：Notion 存取一律走 repository）。
 *
 * 寫入與讀取交錯時的規則：每次讀取開始前先拿一個序號 `readSeq`，寫入前後各呼叫一次
 * `invalidate`（也會遞增序號）。讀取完成時，只要那筆資料在這次讀取開始之後被寫過，
 * 結果就丟掉不存，避免寫入前讀到的舊資料蓋回快取。寫入前後都要失效：寫入前失效，讓寫入
 * 期間的讀取改查 Notion；寫入後再失效，丟掉寫入期間開始、可能讀到舊值的那些讀取結果。
 *
 * `null`（查無）一律不存：查無的對象之後可能被建立（例如新使用者的 USERS 頁由 trackUser 建立）。
 */
export class ReadCache<V> {
  private entries = new Map<string, { value: V; fetchedAt: number; readSeq: number }>();
  /** versionKey → 最後一次 invalidate 時的序號 */
  private readonly lastWriteSeq = new Map<string, number>();
  private readonly inFlight = new Map<string, Promise<V | null>>();
  private seq = 0;
  /** 最後一次 clear 時的序號：在這之前開始的查詢，完成時不能存回來（可能是清除前的舊資料）。 */
  private clearedAtSeq = 0;

  /**
   * @param name log 用的快取名稱
   * @param maxAgeMs 超過這個年齡的項目視同沒有；定時重載失敗時，這是資料最舊的上限
   * @param versionKey 寫入時用來辨識「同一筆資料」的 key。USERS 以 userId 查詢、以 pageId 寫入，
   *   兩者不同，所以失效要用 pageId 比對
   */
  constructor(
    private readonly name: string,
    private readonly maxAgeMs: number,
    private readonly versionKey: (value: V) => string,
  ) {
    registry.add(this);
  }

  /**
   * 命中就回傳複本（呼叫端改了也不會污染快取），沒命中就呼叫 `load` 查 Notion。
   * 同一個 key 同時有多個呼叫時共用同一次查詢，搶報時不會每則各打一次；代價是那次查詢
   * 失敗時，共用它的呼叫一起失敗。
   */
  async getOrLoad(key: string, load: () => Promise<V | null>): Promise<V | null> {
    const hit = this.get(key);
    if (hit !== undefined) {
      logger.debug({ cache: this.name, key }, 'Read cache hit');
      return hit;
    }
    const pending = this.inFlight.get(key);
    if (pending) {
      logger.debug({ cache: this.name, key }, 'Read cache joined in-flight load');
      return cloneOrNull(await pending);
    }

    const readSeq = ++this.seq;
    const promise = load();
    this.inFlight.set(key, promise);
    try {
      const value = await promise;
      if (value !== null) this.store(key, value, readSeq, Date.now());
      return cloneOrNull(value);
    } finally {
      // invalidate 可能已經清掉這個 key 並換成新的查詢，只移除自己這一次
      if (this.inFlight.get(key) === promise) this.inFlight.delete(key);
    }
  }

  /**
   * 用整張表的查詢結果換掉快取。這次查詢開始後才存進來的項目保留（比快照新），
   * 快照裡沒有、又比快照舊的項目丟掉（Notion 那邊可能已經刪除）。
   */
  async replaceAll(load: () => Promise<Array<[string, V]>>): Promise<number> {
    const readSeq = ++this.seq;
    const fetchedAt = Date.now();
    const items = await load();
    const next = new Map<string, { value: V; fetchedAt: number; readSeq: number }>();
    for (const [key, entry] of this.entries) {
      if (entry.readSeq > readSeq) next.set(key, entry);
    }
    this.entries = next;
    for (const [key, value] of items) this.store(key, value, readSeq, fetchedAt);
    return this.entries.size;
  }

  /** 寫入 `versionKey` 這筆資料的前後各呼叫一次，見檔案開頭的說明。 */
  invalidate(versionKey: string): void {
    this.lastWriteSeq.set(versionKey, ++this.seq);
    for (const [key, entry] of this.entries) {
      if (this.versionKey(entry.value) === versionKey) this.entries.delete(key);
    }
    // 進行中的查詢可能在寫入前就送出了，不能再讓新的呼叫共用它；它的結果也會被 store 擋下。
    // 清掉的是所有 key，不只寫入的那筆：查詢完成前不知道它的 versionKey。代價是批次寫入
    // （例如每週的顯示名稱更新）期間，同時進行的查詢可能重複打 Notion，刻意接受。
    this.inFlight.clear();
  }

  /**
   * 寫入成功後，用寫入 API 回傳的頁面直接存進快取（寫入後的 invalidate 之後呼叫）。
   * 不靠下一次查詢補：剛 PATCH 完，database query 是否馬上反映新值沒有實測過（ADR 0017），
   * 查回舊值的話會一直留到下次重載。序號比所有進行中的查詢新，它們完成時不會蓋掉這筆。
   */
  put(key: string, value: V): void {
    this.entries.set(key, { value, fetchedAt: Date.now(), readSeq: ++this.seq });
  }

  /**
   * `/logs` 的「清除快取」按鈕和測試用。不重設序號，並記下清除時的序號：清除前就開始、清除後
   * 才完成的查詢或整表重載，結果不能存回來。
   */
  clear(): void {
    this.entries.clear();
    this.lastWriteSeq.clear();
    this.inFlight.clear();
    this.clearedAtSeq = ++this.seq;
  }

  private get(key: string): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.fetchedAt > this.maxAgeMs) {
      this.entries.delete(key);
      return undefined;
    }
    return structuredClone(entry.value);
  }

  private store(key: string, value: V, readSeq: number, fetchedAt: number): void {
    if (readSeq < this.clearedAtSeq) return;
    if ((this.lastWriteSeq.get(this.versionKey(value)) ?? 0) > readSeq) return;
    const current = this.entries.get(key);
    if (current && current.readSeq > readSeq) return;
    this.entries.set(key, { value, fetchedAt, readSeq });
  }
}

function cloneOrNull<V>(value: V | null): V | null {
  return value === null ? null : structuredClone(value);
}

const registry = new Set<{ clear(): void }>();

/**
 * 清空所有快取。`/logs` 的「清除快取」按鈕經 `clearAndReloadReadCaches`（schedulers/read-cache-refresh.ts）
 * 呼叫；測試在每個測試前呼叫（`src/test-utils/setup.ts`），避免測試之間互相污染。
 */
export function clearAllReadCaches(): void {
  for (const cache of registry) cache.clear();
}
