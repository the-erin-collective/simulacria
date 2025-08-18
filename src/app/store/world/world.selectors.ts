import { createSelector, createFeatureSelector } from '@ngrx/store';
import { GameState } from '../../shared/models/game.model';
import { AppState } from '../index';

export const selectGameState = createFeatureSelector<GameState>('game');
export const selectWorldState = createSelector(selectGameState, (state) => state.world);

export const selectBlocks = createSelector(selectWorldState, (state) => state.blocks);
export const selectRenderDistance = createSelector(selectWorldState, (state) => state.renderDistance);
export const selectPlayerPosition = createSelector(selectWorldState, (state) => state.playerPosition);
export const selectGeneratedBounds = createSelector(selectWorldState, (state) => state.generatedBounds);

export const selectVisibleBlocks = createSelector(
  selectBlocks,
  selectPlayerPosition,
  selectRenderDistance,
  (blocks, playerPos, renderDistance) => {
    const visibleBlocks = new Map();
    
    for (const [key, block] of blocks.entries()) {
      const distance = Math.sqrt(
        Math.pow(block.position.x - playerPos.x, 2) +
        Math.pow(block.position.y - playerPos.y, 2) +
        Math.pow(block.position.z - playerPos.z, 2)
      );
      
      if (distance <= renderDistance && block.isVisible) {
        visibleBlocks.set(key, block);
      }
    }
    
    return visibleBlocks;
  }
);

export const selectBlockAtPosition = createSelector(
  selectBlocks,
  (blocks) => (x: number, y: number, z: number) => {
    const key = `${x},${y},${z}`;
    return blocks.get(key) || null;
  }
);
