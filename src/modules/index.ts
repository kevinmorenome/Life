import { checkinsModule } from './checkins';
import { watchingModule } from './watching';
import { clothesModule } from './clothes';
import { countriesModule } from './countries';
import { foodModule } from './food';
import { gamesModule } from './games';
import { musicModule } from './music';
import { packingModule } from './packing';
import type { LifeModule } from './types';
import { woltModule } from './wolt';
import { ridesModule } from './rides';
import { workModule } from './work';

// Register new feature modules here; they show up on Home and in the nav.
export const MODULES: LifeModule[] = [clothesModule, packingModule, workModule, checkinsModule, countriesModule, gamesModule, foodModule, woltModule, ridesModule, watchingModule, musicModule];
