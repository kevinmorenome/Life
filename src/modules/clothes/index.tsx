import type { LifeModule } from '../types';
import { ClothesRoot } from './ClothesRoot';

export const clothesModule: LifeModule = {
  id: 'clothes',
  title: 'Clothes',
  icon: '👕',
  description: 'Your wardrobe, what you wear, and what it costs per wear.',
  render: (subroute) => <ClothesRoot subroute={subroute} />,
};
