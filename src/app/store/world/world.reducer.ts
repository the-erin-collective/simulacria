import { createReducer, on } from '@ngrx/store';
import { WorldState } from '../../shared/models/game.model';
import { RENDER_DISTANCE } from '../../shared/models/game.model';
import * as WorldActions from './world.actions';

export const initialWorldState: WorldState = {
  blocks: new Map(),
  renderDistance: RENDER_DISTANCE,
  playerPosition: { x: 0, y: 0, z: 0 },
  generatedBounds: {
    minX: -RENDER_DISTANCE,
    maxX: RENDER_DISTANCE,
    minY: -RENDER_DISTANCE,
    maxY: RENDER_DISTANCE,
    minZ: -RENDER_DISTANCE,
    maxZ: RENDER_DISTANCE
  }
};

export const worldReducer = createReducer(
  initialWorldState,
  
  on(WorldActions.worldGenerated, (state, { blocks }) => ({
    ...state,
    blocks: new Map(blocks)
  })),

  on(WorldActions.blockBroken, (state, { position }) => {
    const newBlocks = new Map(state.blocks);
    const blockKey = `${position.x},${position.y},${position.z}`;
    newBlocks.delete(blockKey);
    
    return {
      ...state,
      blocks: newBlocks
    };
  }),

  on(WorldActions.placeBlock, (state, { position, block }) => {
    const newBlocks = new Map(state.blocks);
    const blockKey = `${position.x},${position.y},${position.z}`;
    newBlocks.set(blockKey, block);
    
    return {
      ...state,
      blocks: newBlocks
    };
  }),

  on(WorldActions.updatePlayerPosition, (state, { position }) => ({
    ...state,
    playerPosition: position
  })),

  on(WorldActions.setRenderDistance, (state, { distance }) => ({
    ...state,
    renderDistance: distance,
    generatedBounds: {
      minX: state.playerPosition.x - distance,
      maxX: state.playerPosition.x + distance,
      minY: state.playerPosition.y - distance,
      maxY: state.playerPosition.y + distance,
      minZ: state.playerPosition.z - distance,
      maxZ: state.playerPosition.z + distance
    }
  }))
);
