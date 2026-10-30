import { checkinsModule } from './checkins';
import { clothesModule } from './clothes';
import { packingModule } from './packing';
import type { LifeModule } from './types';
import { workModule } from './work';

// Register new feature modules here; they show up on Home and in the nav.
export const MODULES: LifeModule[] = [clothesModule, packingModule, workModule, checkinsModule];
