import { createAction, props } from '@ngrx/store';
import { Block, Vector3 } from '../../shared/models/block.model';

export const generateWorld = createAction(
  '[World] Generate World',
  props<{ startPosition: Vector3; generationLimit: number }>()
);

export const worldGenerated = createAction(
  '[World] World Generated',
  props<{ blocks: Map<string, Block> }>()
);

export const breakBlock = createAction(
  '[World] Break Block',
  props<{ position: Vector3 }>()
);

export const blockBroken = createAction(
  '[World] Block Broken',
  props<{ position: Vector3; droppedItems: any[] }>()
);

export const placeBlock = createAction(
  '[World] Place Block',
  props<{ position: Vector3; block: Block }>()
);

export const updatePlayerPosition = createAction(
  '[World] Update Player Position',
  props<{ position: Vector3 }>()
);

export const setRenderDistance = createAction(
  '[World] Set Render Distance',
  props<{ distance: number }>()
);
