import { checkinsModule } from './checkins';
import { watchingModule } from './watching';
import { booksModule } from './books';
import { clothesModule } from './clothes';
import { countriesModule } from './countries';
import { foodModule } from './food';
import { gamesModule } from './games';
import { musicModule } from './music';
import { tripsModule } from './trips';
import type { LifeModule } from './types';
import { woltModule } from './wolt';
import { ridesModule } from './rides';
import { recipesModule } from './recipes';
import { workModule } from './work';

// Register new feature modules here; they show up on Home and in the nav.
export const MODULES: LifeModule[] = [clothesModule, tripsModule, workModule, checkinsModule, countriesModule, gamesModule, foodModule, woltModule, ridesModule, watchingModule, musicModule, recipesModule, booksModule];
