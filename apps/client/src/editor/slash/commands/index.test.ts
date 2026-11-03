import { describe, expect, it } from 'vitest';
import { COMMANDS, filterCommands } from './index';

const titles = (cmds: typeof COMMANDS) => cmds.map((c) => c.title);

describe('slash commands', () => {
  it('exposes every block command with the required fields', () => {
    expect(titles(COMMANDS)).toEqual([
      'Text',
      'Heading 1',
      'Heading 2',
      'Heading 3',
      'Bulleted list',
      'Numbered list',
      'To-do list',
      'Quote',
      'Code',
      'Divider',
    ]);
    for (const c of COMMANDS) {
      expect(c.title).toBeTruthy();
      expect(c.description).toBeTruthy();
      expect(c.icon).toBeTruthy();
      expect(Array.isArray(c.keywords)).toBe(true);
      expect(typeof c.run).toBe('function');
    }
  });

  it('uses unique titles and icons', () => {
    expect(new Set(titles(COMMANDS)).size).toBe(COMMANDS.length);
    expect(new Set(COMMANDS.map((c) => c.icon)).size).toBe(COMMANDS.length);
  });
});

describe('filterCommands', () => {
  it('returns every command for an empty query', () => {
    expect(filterCommands('')).toEqual(COMMANDS);
  });

  it('matches on the title case-insensitively', () => {
    expect(titles(filterCommands('HEAD'))).toEqual(['Heading 1', 'Heading 2', 'Heading 3']);
  });

  it('matches on a keyword prefix', () => {
    expect(titles(filterCommands('todo'))).toEqual(['To-do list']);
    expect(titles(filterCommands('ul'))).toEqual(['Bulleted list']);
  });

  it('only matches keywords at their start', () => {
    expect(filterCommands('nordered')).toEqual([]);
  });

  it('returns nothing when no command matches', () => {
    expect(filterCommands('zzzz')).toEqual([]);
  });
});
