import { money } from '../../lib/format';
import type { Digest } from './digest';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const names = (rows: { name: string }[]) => rows.map((r) => r.name).join(', ');

/** The digest as short lines: only what happened, one line per part of life. */
export function digestLines(d: Digest): { key: string; title: string; text: string }[] {
  const lines: { key: string; title: string; text: string }[] = [];
  const { places, outfits, work, other } = d;
  if (places.checkins > 0) {
    const fresh = places.newPlaces.length;
    lines.push({
      key: 'places',
      title: 'Places',
      text: `${plural(places.checkins, 'check-in')} at ${plural(places.distinctPlaces, 'place')}${fresh ? `, ${fresh} new` : ''} (${places.previousCheckins} the week before)`,
    });
  }
  if (outfits.daysLogged > 0) {
    const top = outfits.outfits[0];
    lines.push({ key: 'outfits', title: 'Outfits', text: `Logged ${outfits.daysLogged} of ${d.period.days} days${top ? `, most worn: ${top.name}${top.times > 1 ? ` ×${top.times}` : ''}` : ''}` });
  }
  if (work.officeDays + work.homeDays + work.tripDays > 0) {
    const parts = [work.officeDays && `${work.officeDays} office`, work.homeDays && `${work.homeDays} home`, work.tripDays && `${work.tripDays} trip`].filter(Boolean);
    lines.push({ key: 'work', title: 'Work', text: `${parts.join(' · ')}${work.averageAtOffice ? `, ${work.averageAtOffice} a day at the office` : ''}` });
  }
  if (other.takeout) lines.push({ key: 'takeout', title: 'Takeout', text: `${plural(other.takeout.orders, 'order')}, ${money(other.takeout.spentEur)}${other.takeout.places[0] ? ` · ${names(other.takeout.places)}` : ''}` });
  if (other.rides) lines.push({ key: 'rides', title: 'Rides', text: `${plural(other.rides.rides, 'ride')}, ${money(other.rides.spentEur)}` });
  if (other.groceries) lines.push({ key: 'groceries', title: 'Groceries', text: `${plural(other.groceries.receipts, 'receipt')}, ${money(other.groceries.spent)} · ${names(other.groceries.stores)}` });
  if (other.watching) lines.push({ key: 'watching', title: 'Watching', text: `${plural(other.watching.plays, 'play')} · ${names(other.watching.top)}` });
  if (other.music) lines.push({ key: 'music', title: 'Music', text: `${other.music.hours} h, ${other.music.plays} plays${other.music.topArtists[0] ? ` · ${names(other.music.topArtists)}` : ''}` });
  if (other.games) lines.push({ key: 'games', title: 'Games', text: `${plural(other.games.games, 'game')} on ${plural(other.games.days, 'day')} · ${names(other.games.titles)}` });
  return lines;
}

