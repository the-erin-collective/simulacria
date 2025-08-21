import { Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { of } from 'rxjs';
import { map, switchMap, catchError, tap } from 'rxjs/operators';
import { WorldService } from '../../core/services/world.service';
import * as WorldActions from './world.actions';
import * as UIActions from '../ui/ui.actions';

@Injectable()
export class WorldEffects {
  constructor(
    private actions$: Actions,
    private worldService: WorldService,
    private store: Store
  ) {}

  // Load available worlds effect
  loadAvailableWorlds$ = createEffect(() =>
    this.actions$.pipe(
      ofType(WorldActions.loadAvailableWorlds),
      switchMap(() =>
        this.worldService.loadAvailableWorlds().pipe(
          map(worlds => WorldActions.availableWorldsLoaded({ worlds })),
          catchError(error => of(WorldActions.loadWorldFailed({ error: error.message })))
        )
      )
    )
  );

  // Load world effect
  loadWorld$ = createEffect(() =>
    this.actions$.pipe(
      ofType(WorldActions.loadWorld),
      switchMap(({ worldId, worldName }) =>
        this.worldService.loadWorld(worldId, worldName).pipe(
          map(worldData => WorldActions.worldLoaded({ worldData, worldId })),
          catchError(error => of(WorldActions.loadWorldFailed({ error: error.message })))
        )
      )
    )
  );

  // Create new world effect
  createNewWorld$ = createEffect(() =>
    this.actions$.pipe(
      ofType(WorldActions.createNewWorld),
      switchMap(({ worldName, settings }) =>
        this.worldService.createNewWorld(worldName, settings).pipe(
          map(world => WorldActions.newWorldCreated({ worldId: world.id, worldName: world.name })),
          catchError(error => of(WorldActions.createWorldFailed({ error: error.message })))
        )
      )
    )
  );

  // Delete world effect
  deleteWorld$ = createEffect(() =>
    this.actions$.pipe(
      ofType(WorldActions.deleteWorld),
      switchMap(({ worldId, worldName }) =>
        this.worldService.deleteWorld(worldId, worldName).pipe(
          map(() => WorldActions.worldDeleted({ worldId })),
          catchError(error => of(WorldActions.loadWorldFailed({ error: error.message })))
        )
      )
    )
  );

  // Handle world generation with loading
  generateWorld$ = createEffect(() =>
    this.actions$.pipe(
      ofType(WorldActions.generateWorld),
      tap(() => {
        this.store.dispatch(UIActions.startLoading({
          operation: 'generateWorld',
          message: 'Generating world...',
          details: 'Creating terrain...',
          showProgress: true
        }));
      }),
      switchMap(({ startPosition, generationLimit }) => {
        // Simulate world generation progress
        return of(null).pipe(
          tap(() => {
            // Simulate generation steps
            setTimeout(() => this.store.dispatch(UIActions.updateLoadingProgress({ progress: 25, details: 'Generating heightmap...' })), 500);
            setTimeout(() => this.store.dispatch(UIActions.updateLoadingProgress({ progress: 50, details: 'Placing blocks...' })), 1000);
            setTimeout(() => this.store.dispatch(UIActions.updateLoadingProgress({ progress: 75, details: 'Adding details...' })), 1500);
            setTimeout(() => {
              this.store.dispatch(UIActions.updateLoadingProgress({ progress: 100, details: 'World generation complete!' }));
              this.store.dispatch(WorldActions.worldGenerated({ blocks: new Map() }));
              setTimeout(() => this.store.dispatch(UIActions.stopLoading()), 500);
            }, 2000);
          }),
          map(() => ({ type: 'NO_ACTION' })) // No immediate action needed
        );
      })
    )
  );

  // Error handling effect
  handleWorldErrors$ = createEffect(() =>
    this.actions$.pipe(
      ofType(
        WorldActions.loadWorldFailed,
        WorldActions.createWorldFailed
      ),
      tap(({ error }) => {
        this.store.dispatch(UIActions.setLoadingError({ error }));
      })
    ), { dispatch: false }
  );
}
