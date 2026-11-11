import { useRef, useState } from 'react';
import { resizeImage } from '../../lib/image';

/**
 * Two hidden file inputs (camera and library) that turn the chosen photo into a recipe picture: a dish photo is kept
 * whole (no background removal), downscaled to 1000 px as a JPEG. Render `inputs` once.
 */
export function usePhotoPicker(onPhoto: (photo: string) => Promise<void> | void) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function fromFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await onPhoto(await resizeImage(file, 1000, 0.82));
    } catch {
      setError('Could not use that photo.');
    }
    setBusy(false);
  }

  const inputs = (
    <>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { void fromFile(e.target.files?.[0]); e.target.value = ''; }} />
      <input ref={library} type="file" accept="image/*" hidden onChange={(e) => { void fromFile(e.target.files?.[0]); e.target.value = ''; }} />
    </>
  );
  return { inputs, busy, error, takePhoto: () => camera.current?.click(), choosePhoto: () => library.current?.click() };
}
