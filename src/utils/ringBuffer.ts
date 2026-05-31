/**
 * A fixed-capacity ring buffer that stores entries in insertion order.
 * When the buffer is full, the oldest entry is overwritten on push.
 * Uses a circular array with head/tail pointers for O(1) push.
 */
export class RingBuffer<T> {
  private _buffer: (T | undefined)[];
  private _head: number; // index of the oldest entry
  private _tail: number; // index where the next entry will be written
  private _size: number;
  private _capacity: number;

  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error('RingBuffer capacity must be a positive integer');
    }
    this._capacity = capacity;
    this._buffer = new Array<T | undefined>(capacity);
    this._head = 0;
    this._tail = 0;
    this._size = 0;
  }

  /** Current number of entries in the buffer (0 to capacity). */
  get size(): number {
    return this._size;
  }

  /** Maximum number of entries the buffer can hold. */
  get capacity(): number {
    return this._capacity;
  }

  /**
   * Push an entry into the buffer. If the buffer is full,
   * the oldest entry is discarded.
   */
  push(entry: T): void {
    this._buffer[this._tail] = entry;
    this._tail = (this._tail + 1) % this._capacity;

    if (this._size < this._capacity) {
      this._size++;
    } else {
      // Buffer was full — oldest entry overwritten, advance head
      this._head = (this._head + 1) % this._capacity;
    }
  }

  /** Remove all entries from the buffer. */
  clear(): void {
    this._buffer = new Array<T | undefined>(this._capacity);
    this._head = 0;
    this._tail = 0;
    this._size = 0;
  }

  /** Return all entries in insertion order (oldest to newest). */
  getAll(): T[] {
    const result: T[] = new Array(this._size);
    for (let i = 0; i < this._size; i++) {
      const index = (this._head + i) % this._capacity;
      result[i] = this._buffer[index] as T;
    }
    return result;
  }

  /**
   * Return entries matching the predicate in insertion order (oldest to newest).
   */
  getFiltered(predicate: (entry: T) => boolean): T[] {
    const result: T[] = [];
    for (let i = 0; i < this._size; i++) {
      const index = (this._head + i) % this._capacity;
      const entry = this._buffer[index] as T;
      if (predicate(entry)) {
        result.push(entry);
      }
    }
    return result;
  }
}
