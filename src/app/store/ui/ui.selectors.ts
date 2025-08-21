import { createSelector } from '@ngrx/store';
import { selectGameState } from '../world/world.selectors';

export const selectUIState = createSelector(selectGameState, (state) => state.ui);

export const selectGameMode = createSelector(selectUIState, (state) => state.gameMode);
export const selectShowInventory = createSelector(selectUIState, (state) => state.showInventory);
export const selectShowCraftingTable = createSelector(selectUIState, (state) => state.showCraftingTable);
export const selectShowSettings = createSelector(selectUIState, (state) => state.showSettings);
export const selectTargetBlock = createSelector(selectUIState, (state) => state.targetBlock);
export const selectBreakingProgress = createSelector(selectUIState, (state) => state.breakingProgress);
export const selectIsBreaking = createSelector(selectUIState, (state) => state.isBreaking);
export const selectSelectedCraftingSlots = createSelector(selectUIState, (state) => state.selectedCraftingSlots);

export const selectIsInGame = createSelector(
  selectGameMode,
  (mode) => mode === 'playing'
);

export const selectIsInMenu = createSelector(
  selectGameMode,
  (mode) => mode === 'menu'
);

// Loading selectors
export const selectLoadingState = createSelector(selectUIState, (state) => state.loading);

export const selectIsLoading = createSelector(selectLoadingState, (loading) => loading.isLoading);

export const selectLoadingOperation = createSelector(selectLoadingState, (loading) => loading.operation);

export const selectLoadingMessage = createSelector(selectLoadingState, (loading) => loading.message);

export const selectLoadingDetails = createSelector(selectLoadingState, (loading) => loading.details);

export const selectLoadingProgress = createSelector(selectLoadingState, (loading) => loading.progress);

export const selectShowLoadingProgress = createSelector(selectLoadingState, (loading) => loading.showProgress);

export const selectLoadingCancellable = createSelector(selectLoadingState, (loading) => loading.cancellable);

export const selectLoadingError = createSelector(selectLoadingState, (loading) => loading.error);
