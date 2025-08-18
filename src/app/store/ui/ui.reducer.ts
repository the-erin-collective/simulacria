import { createReducer, on } from '@ngrx/store';
import { UIState } from '../../shared/models/game.model';
import * as UIActions from './ui.actions';

export const initialUIState: UIState = {
  gameMode: 'menu',
  showInventory: false,
  showCraftingTable: false,
  targetBlock: undefined,
  breakingProgress: 0,
  isBreaking: false,
  selectedCraftingSlots: Array(3).fill(null).map(() => Array(3).fill(null))
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
  }))
);
