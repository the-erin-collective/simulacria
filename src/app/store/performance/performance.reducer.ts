import { createReducer, on } from '@ngrx/store';
import { PerformanceState } from '../../shared/models/game.model';
import * as PerformanceActions from './performance.actions';

export const initialPerformanceState: PerformanceState = {
  fps: 60,
  blocksRendered: 0,
  chunksLoaded: 0,
  lastFrameTime: 0
};

export const performanceReducer = createReducer(
  initialPerformanceState,

  on(PerformanceActions.updateFPS, (state, { fps }) => ({
    ...state,
    fps
  })),

  on(PerformanceActions.updateBlocksRendered, (state, { count }) => ({
    ...state,
    blocksRendered: count
  })),

  on(PerformanceActions.updateChunksLoaded, (state, { count }) => ({
    ...state,
    chunksLoaded: count
  })),

  on(PerformanceActions.updateFrameTime, (state, { frameTime }) => ({
    ...state,
    lastFrameTime: frameTime
  }))
);
