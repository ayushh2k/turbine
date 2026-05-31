import { describe, it, expect } from 'vitest';
import { RingBuffer } from './ringBuffer';

describe('RingBuffer', () => {
  it('starts empty with size 0', () => {
    const buf = new RingBuffer<number>(10);
    expect(buf.size).toBe(0);
    expect(buf.getAll()).toEqual([]);
  });

  it('pushes entries and reports correct size', () => {
    const buf = new RingBuffer<number>(5);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    expect(buf.size).toBe(3);
    expect(buf.getAll()).toEqual([1, 2, 3]);
  });

  it('discards oldest entries when capacity is exceeded', () => {
    const buf = new RingBuffer<number>(3);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.push(4); // discards 1
    buf.push(5); // discards 2
    expect(buf.size).toBe(3);
    expect(buf.getAll()).toEqual([3, 4, 5]);
  });

  it('returns entries in insertion order (oldest to newest)', () => {
    const buf = new RingBuffer<string>(4);
    buf.push('a');
    buf.push('b');
    buf.push('c');
    buf.push('d');
    buf.push('e'); // wraps around, discards 'a'
    expect(buf.getAll()).toEqual(['b', 'c', 'd', 'e']);
  });

  it('clear resets the buffer to empty', () => {
    const buf = new RingBuffer<number>(5);
    buf.push(1);
    buf.push(2);
    buf.push(3);
    buf.clear();
    expect(buf.size).toBe(0);
    expect(buf.getAll()).toEqual([]);
  });

  it('getFiltered returns only matching entries in order', () => {
    const buf = new RingBuffer<number>(10);
    for (let i = 1; i <= 8; i++) buf.push(i);
    const evens = buf.getFiltered((n) => n % 2 === 0);
    expect(evens).toEqual([2, 4, 6, 8]);
  });

  it('getFiltered works after wrap-around', () => {
    const buf = new RingBuffer<number>(4);
    for (let i = 1; i <= 6; i++) buf.push(i); // buffer has [3, 4, 5, 6]
    const greaterThan4 = buf.getFiltered((n) => n > 4);
    expect(greaterThan4).toEqual([5, 6]);
  });

  it('handles capacity of 1', () => {
    const buf = new RingBuffer<string>(1);
    buf.push('a');
    expect(buf.size).toBe(1);
    expect(buf.getAll()).toEqual(['a']);
    buf.push('b');
    expect(buf.size).toBe(1);
    expect(buf.getAll()).toEqual(['b']);
  });

  it('throws on invalid capacity', () => {
    expect(() => new RingBuffer(0)).toThrow();
    expect(() => new RingBuffer(-1)).toThrow();
  });

  it('exposes capacity getter', () => {
    const buf = new RingBuffer<number>(100);
    expect(buf.capacity).toBe(100);
  });

  it('size never exceeds capacity after many pushes', () => {
    const buf = new RingBuffer<number>(5);
    for (let i = 0; i < 100; i++) buf.push(i);
    expect(buf.size).toBe(5);
    expect(buf.getAll()).toEqual([95, 96, 97, 98, 99]);
  });
});
