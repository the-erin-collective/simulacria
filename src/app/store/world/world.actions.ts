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

// World loading/creation actions
export const loadWorld = createAction(
  '[World] Load World',
  props<{ worldId: string; worldName: string }>()
);

export const worldLoaded = createAction(
  '[World] World Loaded',
  props<{ worldData: any; worldId: string }>()
);

export const loadWorldFailed = createAction(
  '[World] Load World Failed',
  props<{ error: string }>()
);

export const createNewWorld = createAction(
  '[World] Create New World',
  props<{ worldName?: string; settings?: any }>()
);

export const newWorldCreated = createAction(
  '[World] New World Created',
  props<{ worldId: string; worldName: string }>()
);

export const createWorldFailed = createAction(
  '[World] Create World Failed',
  props<{ error: string }>()
);

export const loadAvailableWorlds = createAction('[World] Load Available Worlds');

export const availableWorldsLoaded = createAction(
  '[World] Available Worlds Loaded',
  props<{ worlds: any[] }>()
);

export const deleteWorld = createAction(
  '[World] Delete World',
  props<{ worldId: string; worldName: string }>()
);

export const worldDeleted = createAction(
  '[World] World Deleted',
  props<{ worldId: string }>()
);
