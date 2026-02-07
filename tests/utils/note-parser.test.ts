import { describe, expect, test } from 'bun:test';
import { parseNote, assembleNote, appendToNoteBody } from '../../src/utils/note-parser.js';

const SAMPLE_NOTE = `---
captured: 2026-02-04T14:34
source: telegram
status: inbox
categories:
  - "[[Captures]]"
  - "[[Ideas]]"
topics:
  - "[[Consciousness]]"
---
This is the body of the note.
`;

describe('parseNote', () => {
  test('parses frontmatter and body from a valid note', () => {
    const result = parseNote(SAMPLE_NOTE);
    expect(result.frontmatter).toContain('captured: 2026-02-04T14:34');
    expect(result.frontmatter).toContain('source: telegram');
    expect(result.frontmatter).toContain('[[Captures]]');
    expect(result.body).toBe('This is the body of the note.\n');
  });

  test('returns empty frontmatter and full body when no frontmatter', () => {
    const content = 'Just plain text with no frontmatter.';
    const result = parseNote(content);
    expect(result.frontmatter).toBe('');
    expect(result.body).toBe(content);
  });

  test('handles empty string', () => {
    const result = parseNote('');
    expect(result.frontmatter).toBe('');
    expect(result.body).toBe('');
  });

  test('handles note with empty body', () => {
    const content = '---\nkey: value\n---\n';
    const result = parseNote(content);
    expect(result.frontmatter).toBe('key: value');
    expect(result.body).toBe('');
  });
});

describe('assembleNote', () => {
  test('reassembles a note from frontmatter and body', () => {
    const parsed = parseNote(SAMPLE_NOTE);
    const reassembled = assembleNote(parsed);
    expect(reassembled).toBe(SAMPLE_NOTE);
  });

  test('roundtrip: parse then assemble produces original', () => {
    const notes = [
      SAMPLE_NOTE,
      '---\nfoo: bar\n---\nBody text\n',
      '---\na: 1\nb: 2\n---\nLine 1\nLine 2\n',
    ];
    for (const note of notes) {
      expect(assembleNote(parseNote(note))).toBe(note);
    }
  });
});

describe('appendToNoteBody', () => {
  test('appends text to note body with double newline separator', () => {
    const note = '---\nkey: value\n---\nOriginal body';
    const result = appendToNoteBody(note, 'Appended content');
    expect(result).toContain('Original body');
    expect(result).toContain('Appended content');
    expect(result).toContain('key: value');
  });

  test('appends with single newline when body ends with newline', () => {
    const note = '---\nkey: value\n---\nOriginal body\n';
    const result = appendToNoteBody(note, 'Appended content');
    const parsed = parseNote(result);
    expect(parsed.body).toBe('Original body\n\nAppended content\n');
  });

  test('preserves frontmatter exactly', () => {
    const frontmatter = 'captured: 2026-01-01T00:00\nsource: telegram';
    const note = `---\n${frontmatter}\n---\nBody\n`;
    const result = appendToNoteBody(note, 'Extra');
    const parsed = parseNote(result);
    expect(parsed.frontmatter).toBe(frontmatter);
  });
});
