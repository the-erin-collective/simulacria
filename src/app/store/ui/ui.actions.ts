import { createAction, props } from '@ngrx/store';
import { GameMode } from '../../shared/models/game.model';
import { Vector3 } from '../../shared/models/block.model';

export const setGameMode = createAction(
  '[UI] Set Game Mode',
  props<{ mode: GameMode }>()
);

export const toggleInventory = createAction('[UI] Toggle Inventory');

export const showCraftingTable = createAction('[UI] Show Crafting Table');
export const hideCraftingTable = createAction('[UI] Hide Crafting Table');

export const setTargetBlock = createAction(
  '[UI] Set Target Block',
  props<{ position?: Vector3 }>()
);

export const startBreaking = createAction('[UI] Start Breaking');
export const stopBreaking = createAction('[UI] Stop Breaking');

export const updateBreakingProgress = createAction(
  '[UI] Update Breaking Progress',
  props<{ progress: number }>()
);

export const selectCraftingSlot = createAction(
  '[UI] Select Crafting Slot',
  props<{ row: number; col: number; itemId: string | null }>()
);

export const clearCraftingSlots = createAction('[UI] Clear Crafting Slots');
