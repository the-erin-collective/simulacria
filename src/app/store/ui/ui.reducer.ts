import { createReducer, on } from '@ngrx/store';
import { UIState } from '../../shared/models/game.model';
import * as UIActions from './ui.actions';

export const initialUIState: UIState = {
  gameMode: 'menu',
  showInventory: false,
  showCraftingTable: false,
  showSettings: false,
  targetBlock: undefined,
  breakingProgress: 0,
  isBreaking: false,
  selectedCraftingSlots: Array(3).fill(null).map(() => Array(3).fill(null)),
  loading: {
    isLoading: false,
    operation: null,
    message: null,
    details: null,
    progress: -1,
    showProgress: false,
    cancellable: false,
    error: null
  }
};

export const uiReducer = createReducer(
  initialUIState,

  on(UIActions.setGameMode, (state, { mode }) => ({
    ...state,
    gameMode: mode
  })),

  on(UIActions.toggleInventory, (state) => ({
    ...state,
    showInventory: !state.showInventory
  })),

  on(UIActions.showCraftingTable, (state) => ({
    ...state,
    showCraftingTable: true
  })),

  on(UIActions.hideCraftingTable, (state) => ({
    ...state,
    showCraftingTable: false,
    selectedCraftingSlots: Array(3).fill(null).map(() => Array(3).fill(null))
  })),

  on(UIActions.setTargetBlock, (state, { position }) => ({
    ...state,
    targetBlock: position
  })),

  on(UIActions.startBreaking, (state) => ({
    ...state,
    isBreaking: true,
    breakingProgress: 0
  })),

  on(UIActions.stopBreaking, (state) => ({
    ...state,
    isBreaking: false,
    breakingProgress: 0
  })),

  on(UIActions.updateBreakingProgress, (state, { progress }) => ({
    ...state,
    breakingProgress: Math.min(100, Math.max(0, progress))
  })),

  on(UIActions.selectCraftingSlot, (state, { row, col, itemId }) => {
    const newSlots = state.selectedCraftingSlots.map((rowArray, rowIndex) =>
      rowArray.map((slot, colIndex) => 
        rowIndex === row && colIndex === col ? itemId : slot
      )
    );
    
    return {
      ...state,
      selectedCraftingSlots: newSlots
    };
  }),

  on(UIActions.clearCraftingSlots, (state) => ({
    ...state,
    selectedCraftingSlots: Array(3).fill(null).map(() => Array(3).fill(null))
  })),

  // Settings actions
  on(UIActions.toggleSettings, (state) => ({
    ...state,
    showSettings: !state.showSettings
  })),

  on(UIActions.showSettings, (state) => ({
    ...state,
    showSettings: true
  })),

  on(UIActions.hideSettings, (state) => ({
    ...state,
    showSettings: false
  })),

  // Loading actions
  on(UIActions.startLoading, (state, { operation, message, details, showProgress, cancellable }) => ({
    ...state,
    loading: {
      isLoading: true,
      operation,
      message: message || 'Loading...',
      details: details || null,
      progress: showProgress ? 0 : -1,
      showProgress: showProgress || false,
      cancellable: cancellable || false,
      error: null
    }
  })),

  on(UIActions.updateLoadingProgress, (state, { progress, details }) => ({
    ...state,
    loading: {
      ...state.loading,
      progress,
      details: details || state.loading.details
    }
  })),

  on(UIActions.stopLoading, (state) => ({
    ...state,
    loading: {
      isLoading: false,
      operation: null,
      message: null,
      details: null,
      progress: -1,
      showProgress: false,
      cancellable: false,
      error: null
    }
  })),

  on(UIActions.setLoadingError, (state, { error }) => ({
    ...state,
    loading: {
      ...state.loading,
      error,
      isLoading: false
    }
  }))
);
