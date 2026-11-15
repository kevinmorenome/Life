import { describe, expect, it } from 'vitest';
import { statsEntries } from './StatsPage';
import { ENTERTAINMENT, type LifeModule } from './modules/types';

const mod = (id: string, stats?: LifeModule['stats']): LifeModule => ({ id, title: id, icon: '', description: '', render: () => null, actions: [], stats });
const st = (label: string, group?: LifeModule['stats'] extends infer S ? (S extends { group?: infer G } ? G : never) : never) => ({ label, group, render: () => null });

describe('statsEntries', () => {
  it('merges the Entertainment modules into one tab at the first one’s place', () => {
    const entries = statsEntries([mod('a', st('A')), mod('x'), mod('watching', st('Watching', ENTERTAINMENT)), mod('b', st('B')), mod('music', st('Music', ENTERTAINMENT)), mod('books', st('Books', ENTERTAINMENT))]);
    expect(entries.map((e) => [e.id, e.label, e.members.map((m) => m.id)])).toEqual([
      ['a', 'A', ['a']],
      ['entertainment', 'Entertainment', ['watching', 'music', 'books']],
      ['b', 'B', ['b']],
    ]);
  });
});
