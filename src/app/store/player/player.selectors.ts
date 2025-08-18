import { createSelector } from '@ngrx/store';
import { selectGameState } from '../world/world.selectors';

export const selectPlayerState = createSelector(selectGameState, (state) => state.player);

export const selectPlayerPos = createSelector(selectPlayerState, (state) => state.position);
export const selectPlayerRotation = createSelector(selectPlayerState, (state) => state.rotation);
export const selectPlayerInventory = createSelector(selectPlayerState, (state) => state.inventory);
export const selectSelectedSlot = createSelector(selectPlayerState, (state) => state.selectedSlot);
export const selectEquippedTool = createSelector(selectPlayerState, (state) => state.equippedTool);
export const selectPlayerHealth = createSelector(selectPlayerState, (state) => state.health);

export const selectSelectedItem = createSelector(
  selectPlayerInventory,
  selectSelectedSlot,
  (inventory, selectedSlot) => inventory[selectedSlot] || null
);

export const selectToolbarItems = createSelector(
  selectPlayerInventory,
  (inventory) => inventory.slice(0, 9) // First 9 items for toolbar
);
