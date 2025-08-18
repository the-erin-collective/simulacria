import { ActionReducerMap } from '@ngrx/store';
import { GameState } from '../shared/models/game.model';
import { worldReducer } from './world/world.reducer';
import { playerReducer } from './player/player.reducer';
import { uiReducer } from './ui/ui.reducer';
import { performanceReducer } from './performance/performance.reducer';

export interface AppState {
  game: GameState;
}

export const reducers: ActionReducerMap<AppState> = {
  game: (state, action) => ({
    world: worldReducer(state?.world, action),
    player: playerReducer(state?.player, action),
    ui: uiReducer(state?.ui, action),
    performance: performanceReducer(state?.performance, action)
  })
};

export * from './world/world.actions';
export * from './world/world.selectors';
export * from './player/player.actions';
export { 
  selectPlayerState,
  selectPlayerInventory,
  selectSelectedSlot,
  selectEquippedTool,
  selectPlayerHealth,
  selectSelectedItem,
  selectToolbarItems
} from './player/player.selectors';
export * from './ui/ui.actions';
export * from './ui/ui.selectors';
export * from './performance/performance.actions';
export * from './performance/performance.selectors';
