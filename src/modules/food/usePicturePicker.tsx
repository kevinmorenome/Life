import { useRef, useState } from 'react';
import { foodPhoto } from './productPhoto';

/**
 * The shared part of adding a picture: two hidden file inputs (camera and library), turning the chosen file into a
 * tile picture (background removed on-device when possible, which takes a while the first time), and the busy and
 * error state. Render `inputs` once, call `takePhoto` / `choosePhoto` from buttons.
 */
export function usePicturePicker(onPhoto: (photo: string) => Promise<void> | void) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function fromFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await onPhoto(await foodPhoto(file));
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
