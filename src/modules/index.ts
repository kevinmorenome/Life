import { clothesModule } from './clothes';
import type { LifeModule } from './types';

// Register new feature modules here; they show up on Home and in the nav.
export const MODULES: LifeModule[] = [clothesModule];
