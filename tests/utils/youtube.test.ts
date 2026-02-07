import { describe, expect, test } from 'bun:test';
import { extractVideoId, isYouTubeUrl } from '../../src/utils/youtube.js';

describe('extractVideoId', () => {
  test('extracts ID from youtube.com/watch?v=ID', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('extracts ID from youtube.com/watch with extra params', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=abc123def45&list=PLxyz')).toBe('abc123def45');
  });

  test('extracts ID from youtu.be/ID', () => {
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('extracts ID from youtube.com/embed/ID', () => {
    expect(extractVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('extracts ID from youtube.com/shorts/ID', () => {
    expect(extractVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('extracts ID without www prefix', () => {
    expect(extractVideoId('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  test('returns null for non-YouTube URLs', () => {
    expect(extractVideoId('https://example.com/watch?v=abc')).toBeNull();
    expect(extractVideoId('https://vimeo.com/123456')).toBeNull();
  });

  test('returns null for empty string', () => {
    expect(extractVideoId('')).toBeNull();
  });

  test('returns null for YouTube URL without video ID', () => {
    expect(extractVideoId('https://www.youtube.com/')).toBeNull();
    expect(extractVideoId('https://www.youtube.com/channel/UCxyz')).toBeNull();
  });
});

describe('isYouTubeUrl', () => {
  test('returns true for YouTube watch URLs', () => {
    expect(isYouTubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
  });

  test('returns true for youtu.be short URLs', () => {
    expect(isYouTubeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
  });

  test('returns true for YouTube embed URLs', () => {
    expect(isYouTubeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(true);
  });

  test('returns true for YouTube shorts URLs', () => {
    expect(isYouTubeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(true);
  });

  test('returns false for non-YouTube URLs', () => {
    expect(isYouTubeUrl('https://example.com')).toBe(false);
    expect(isYouTubeUrl('https://vimeo.com/123')).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(isYouTubeUrl('')).toBe(false);
  });
});
