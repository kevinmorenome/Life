import { useState, type FormEvent } from 'react';
import { newId } from '../../lib/db';
import { today } from '../../lib/format';
import { resizeImage } from '../../lib/image';
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
  const [photo, setPhoto] = useState(existing?.photo);
  const [photoError, setPhotoError] = useState('');
  const back = existing ? `/trips/${existing.id}` : '/trips';

  async function pickPhoto(file: File | undefined) {
    if (!file) return;
    try {
      setPhoto(await resizeImage(file, 1000, 0.75));
      setPhotoError('');
    } catch {
      setPhotoError('Couldn’t read that picture.');
    }
  }

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
      photo,
      startDate,
      endDate,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await onSave(trip);
    navigate(`/trips/${trip.id}`);
  }

  return (
    <form className="form" onSubmit={submit}>
      <h1>{existing ? 'Edit trip' : 'New trip'}</h1>
      <div className="field trip-photo-field">
        <span>Picture (optional)</span>
        {photo && <img className="trip-photo" src={photo} alt="" />}
        <div className="trip-photo-actions">
          <label className="btn btn-ghost">
            {photo ? 'Change picture' : 'Choose a picture'}
            <input type="file" accept="image/*" hidden onChange={(e) => pickPhoto(e.target.files?.[0])} />
          </label>
          {photo && (
            <button type="button" className="btn btn-ghost" onClick={() => setPhoto(undefined)}>
              Remove
            </button>
          )}
        </div>
        {photoError && <p className="muted small" role="alert">{photoError}</p>}
      </div>
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
