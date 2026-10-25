import { useState, type FormEvent } from 'react';
import { newId } from '../../lib/db';
import { today } from '../../lib/format';
import { navigate } from '../../lib/router';
import type { Trip } from './types';

interface Props {
  existing?: Trip;
  onSave: (t: Trip) => Promise<void>;
}

export function TripForm({ existing, onSave }: Props) {
  const [name, setName] = useState(existing?.name ?? '');
  const [destination, setDestination] = useState(existing?.destination ?? '');
  const [startDate, setStartDate] = useState(existing?.startDate ?? today());
  const [endDate, setEndDate] = useState(existing?.endDate ?? today());
  const back = existing ? `/packing/${existing.id}` : '/packing';

  async function submit(e: FormEvent) {
    e.preventDefault();
    const now = new Date().toISOString();
    const trip: Trip = {
      outfitPlan: {},
      itemIds: [],
      extras: [],
      packed: [],
      ...existing,
      id: existing?.id ?? newId(),
      name: name.trim(),
      destination: destination.trim() || undefined,
      startDate,
      endDate,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await onSave(trip);
    navigate(`/packing/${trip.id}`);
  }

  return (
    <form className="form" onSubmit={submit}>
      <h1>{existing ? 'Edit trip' : 'New trip'}</h1>
      <label className="field">
        <span>Name</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Long weekend in Lisbon" />
      </label>
      <label className="field">
        <span>Destination (optional)</span>
        <input value={destination} onChange={(e) => setDestination(e.target.value)} />
      </label>
      <div className="field-grid">
        <label className="field">
          <span>From</span>
          <input
            type="date"
            required
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value);
              if (endDate < e.target.value) setEndDate(e.target.value);
            }}
          />
        </label>
        <label className="field">
          <span>To</span>
          <input type="date" required min={startDate} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      </div>
      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={() => navigate(back)}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={!name.trim() || !startDate || !endDate}>
          Save
        </button>
      </div>
    </form>
  );
}
