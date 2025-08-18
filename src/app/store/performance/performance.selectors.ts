import { createSelector } from '@ngrx/store';
import { selectGameState } from '../world/world.selectors';

export const selectPerformanceState = createSelector(selectGameState, (state) => state.performance);

export const selectFPS = createSelector(selectPerformanceState, (state) => state.fps);
export const selectBlocksRendered = createSelector(selectPerformanceState, (state) => state.blocksRendered);
export const selectChunksLoaded = createSelector(selectPerformanceState, (state) => state.chunksLoaded);
export const selectLastFrameTime = createSelector(selectPerformanceState, (state) => state.lastFrameTime);
