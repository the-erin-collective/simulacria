import { createAction, props } from '@ngrx/store';

export const updateFPS = createAction(
  '[Performance] Update FPS',
  props<{ fps: number }>()
);

export const updateBlocksRendered = createAction(
  '[Performance] Update Blocks Rendered',
  props<{ count: number }>()
);

export const updateChunksLoaded = createAction(
  '[Performance] Update Chunks Loaded',
  props<{ count: number }>()
);

export const updateFrameTime = createAction(
  '[Performance] Update Frame Time',
  props<{ frameTime: number }>()
);
