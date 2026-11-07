import type { Ride } from './types';

const PLACES = ['Ilica 12, Zagreb', 'Trg bana Jelačića 1, Zagreb', 'Zračna luka Franjo Tuđman, Velika Gorica', 'Savska cesta 41, Zagreb', 'Jarun, Zagreb', 'Glavni kolodvor, Zagreb', 'Avenija Dubrovnik 16, Zagreb'];
const HOURS = ['08:10', '12:40', '18:25', '21:05', '23:15', '00:40'];
const day = (now: Date, back: number) => {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * Made-up rides for trying out the calendar and Stats → Rides in a PR preview (previews never push).
 * Dates are relative to `now`; ids are fixed so adding them twice changes nothing.
 */
export function sampleRides(now: Date): Ride[] {
  const stamp = now.toISOString();
  const out: Ride[] = [];
  for (let i = 0; i < 48; i++) {
    const km = 2 + ((i * 7) % 13) + (i % 3) * 0.4;
    out.push({
      id: `sample-ride-${i}`,
      provider: i % 3 === 0 ? 'uber' : 'bolt',
      date: day(now, 1 + i * 3 + (i % 2)),
      time: HOURS[i % HOURS.length],
      from: PLACES[i % PLACES.length],
      to: PLACES[(i * 3 + 1) % PLACES.length],
      fare: Math.round((3.5 + km * 0.95 + (i % 4) * 0.5) * 100) / 100,
      currency: 'EUR',
      distanceKm: Math.round(km * 10) / 10,
      durationMin: Math.round(6 + km * 2.2),
      city: 'Zagreb',
      createdAt: stamp,
      updatedAt: stamp,
    });
  }
  // One ride abroad, to see the "other currency" note.
  out.push({ id: 'sample-ride-pln', provider: 'bolt', date: day(now, 20), time: '22:10', from: 'Chopin Airport, Warsaw', to: 'Marszałkowska 10, Warsaw', fare: 45, currency: 'PLN', distanceKm: 11, durationMin: 25, city: 'Warsaw', createdAt: stamp, updatedAt: stamp });
  return out;
}
