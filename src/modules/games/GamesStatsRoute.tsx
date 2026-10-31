import { useState } from 'react';
import { shortDate, today } from '../../lib/format';
import { useCollection } from '../../lib/useCollection';
import { Columns, Empty, HBars, Section, Tile, TONES } from '../clothes/charts';
import { bonusStats, isCatan } from './catan';
import { allMatches, headToHead, playerRecords, playsPerMonth, titleStats } from './games';
import { isWaterdeep, lordStats } from './waterdeep';
import type { GameNight, GameTitle, Player } from './types';

const pct = (n: number) => `${Math.round(n * 100)}%`;
const monthTick = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short' });

export function GamesStatsRoute() {
  const players = useCollection<Player>('players');
  const titles = useCollection<GameTitle>('gametitles');
  const nights = useCollection<GameNight>('gamenights');
  const [selMonth, setSelMonth] = useState(today().slice(0, 7));
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  if (players.loading || titles.loading || nights.loading) return <p className="muted">Loading…</p>;

  const name = (id: string) => players.items.find((p) => p.id === id)?.name ?? '?';
  const records = playerRecords(nights.items);
  const total = nights.items.reduce((n, x) => n + x.matches.length, 0);
  if (total === 0) return <Empty>No games logged yet. Log a game on a game night and the stats show up here.</Empty>;

  const withStreak = [...records].sort((x, y) => y.bestStreak - x.bestStreak);
  const ties = records.filter((r) => r.played >= 3).sort((x, y) => y.winRate - x.winRate);
  const tStats = titleStats(nights.items, titles.items);
  const months = playsPerMonth(nights.items, today());
  const pa = a || records[0]?.id || '';
  const pb = b || records[1]?.id || '';
  const catanIds = new Set(titles.items.filter((t) => isCatan(t)).map((t) => t.id));
  const bonus = bonusStats(allMatches(nights.items).filter((m) => catanIds.has(m.titleId)));
  const wdIds = new Set(titles.items.filter((t) => isWaterdeep(t)).map((t) => t.id));
  const lords = lordStats(allMatches(nights.items).filter((m) => wdIds.has(m.titleId)));
  const h2h = pa && pb && pa !== pb ? headToHead(nights.items, pa, pb) : undefined;

  return (
    <>
      <div className="tiles">
        <Tile value={String(nights.items.length)} label="Game nights" tone={0} />
        <Tile value={String(total)} label="Games played" tone={1} />
        <Tile value={records[0] ? name(records[0].id) : '–'} label="Most wins" tone={2} />
      </div>

      <Section title="Leaderboard" note="Wins over games each person played in.">
        <HBars
          rows={records.map((r, i) => {
            const gap = i > 0 ? records[i - 1].wins - r.wins : 0;
            const catchUp = i === 0 ? '' : gap === 0 ? ` · level with ${name(records[i - 1].id)}` : ` · ${gap} ${gap === 1 ? 'win' : 'wins'} behind ${name(records[i - 1].id)}`;
            return { key: r.id, label: name(r.id), value: r.wins, shown: `${r.wins} / ${r.played}`, sub: `${pct(r.winRate)} win rate${catchUp}` };
          })}
        />
      </Section>

      {ties.length > 0 && (
        <Section title="Win rate" note="Players with at least 3 games.">
          <HBars rows={ties.map((r, i) => ({ key: r.id, label: name(r.id), value: r.winRate, shown: pct(r.winRate), color: TONES[i % TONES.length] }))} />
        </Section>
      )}

      <Section title="Streaks" note="Wins in a row across the games each person played.">
        <ul className="game-list">
          {withStreak.map((r) => (
            <li key={r.id} className="game-line">
              <strong>{name(r.id)}</strong>
              <span className="muted small">
                {r.streak > 0 ? `🔥 on ${r.streak} · ` : ''}best {r.bestStreak}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {players.items.length >= 2 && (
        <Section title="Head to head">
          <div className="game-add">
            <select value={pa} onChange={(e) => setA(e.target.value)} aria-label="First player">
              {players.items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select value={pb} onChange={(e) => setB(e.target.value)} aria-label="Second player">
              {players.items.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {h2h ? (
            h2h.games ? (
              <p>
                <strong>
                  {name(pa)} {h2h.aWins} – {h2h.bWins} {name(pb)}
                </strong>{' '}
                <span className="muted small">in {h2h.games} games together</span>
              </p>
            ) : (
              <Empty>These two haven’t played a game together yet.</Empty>
            )
          ) : (
            <Empty>Pick two different players.</Empty>
          )}
        </Section>
      )}

      {bonus.length > 0 && (
        <Section title="Catan: road and army" note="Who held Longest Road and Largest Army, and how often they won with it.">
          <ul className="game-list">
            {bonus.map((b) => (
              <li key={b.id} className="game-line">
                <strong>{name(b.id)}</strong>
                <span className="muted small">
                  Road {b.road}{b.road ? ` (${b.roadWins} won)` : ''} · Army {b.army}{b.army ? ` (${b.armyWins} won)` : ''} · {b.games} {b.games === 1 ? 'game' : 'games'}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {lords.length > 0 && (
        <Section title="Lords of Waterdeep: Lords" note="How often each Lord was drawn and won, and the average points its bonus added (needs the points before the Lord).">
          <ul className="game-list">
            {lords.map((l) => (
              <li key={l.lord} className="game-line">
                <strong>{l.lord}</strong>
                <span className="muted small">
                  {l.games} {l.games === 1 ? 'game' : 'games'} · {l.wins} won
                  {l.avgBonus !== undefined ? ` · avg +${Math.round(l.avgBonus * 10) / 10}` : ''}
                  {l.turnarounds ? ` · ${l.turnarounds} comeback${l.turnarounds === 1 ? '' : 's'}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Games">
        <ul className="game-list">
          {tStats.map((s) => {
            const t = titles.items.find((x) => x.id === s.id);
            return (
              <li key={s.id} className="game-row">
                <strong>{t?.name ?? 'Game'}</strong>
                <span className="muted small">
                  {s.plays} {s.plays === 1 ? 'play' : 'plays'} · last {shortDate(s.lastPlayed)}
                </span>
                {s.topWinner && (
                  <span className="muted small">
                    Wins most: {name(s.topWinner.playerId)} ({s.topWinner.wins})
                  </span>
                )}
                {s.bestScore && (
                  <span className="muted small">
                    Best score: {s.bestScore.value} by {name(s.bestScore.playerId)}, {shortDate(s.bestScore.date)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Games per month" note={`${months.find((m) => m.month === selMonth)?.plays ?? 0} games in ${monthTick(selMonth)}`}>
        <Columns
          bars={months.map((m) => ({ key: m.month, tick: monthTick(m.month), value: m.plays }))}
          selected={selMonth}
          onSelect={setSelMonth}
          describe={(bar) => `${bar.value} games in ${bar.tick}`}
        />
      </Section>
    </>
  );
}
