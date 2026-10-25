import { useEffect, useState } from 'react';

// Hash routing (#/clothes/123) so the app works on any static host.

function currentPath(): string {
  return window.location.hash.replace(/^#/, '') || '/';
}

export function useRoute(): string[] {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const onChange = () => {
      setPath(currentPath());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return path.split('/').filter(Boolean);
}

export function navigate(path: string): void {
  window.location.hash = path;
}

export function href(path: string): string {
  return `#${path}`;
}
