import { Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { Observable, from, throwError, of, firstValueFrom } from 'rxjs';
import { map, catchError, tap, switchMap } from 'rxjs/operators';
import { DBService } from './db.service';
import * as WorldActions from '../../store/world/world.actions';
import * as UIActions from '../../store/ui/ui.actions';

export interface WorldInfo {
  id: string;
  name: string;
  created: number;
  lastPlayed: number;
  size?: number;
  settings?: any;
}

@Injectable({
  providedIn: 'root'
})
export class WorldService {
  constructor(
    private store: Store,
    private dbService: DBService
  ) {}

  /**
   * Load available worlds from storage
   */
  loadAvailableWorlds(): Observable<WorldInfo[]> {
    this.store.dispatch(UIActions.startLoading({
      operation: 'loadWorlds',
      message: 'Loading available worlds...',
      showProgress: false
    }));

    // Database is already initialized at app startup, no timeout needed
    return from(this.dbService.loadAllWorlds()).pipe(
      map(worlds => worlds.map(world => ({
        id: world.id,
        name: world.name,
        created: world.created,
        lastPlayed: world.lastPlayed,
        size: world.metadata?.blockCount || 0,
        settings: world.settings
      }))),
      tap(() => this.store.dispatch(UIActions.stopLoading())),
      catchError((error) => {
        console.error('Failed to load worlds from database:', error);
        this.store.dispatch(UIActions.setLoadingError({ error: 'Failed to load worlds' }));
        // Return empty array on error to prevent hanging
        return of([]);
      })
    );
  }

  /**
   * Load a specific world
   */
  loadWorld(worldId: string, worldName: string): Observable<any> {
    this.store.dispatch(UIActions.startLoading({
      operation: 'loadWorld',
      message: `Loading "${worldName}"...`,
      details: 'Initializing world data...',
      showProgress: true
    }));

    // Database is already initialized, no timeout needed
    return this.performWorldLoad(worldId, worldName);
  }

  /**
   * Create a new world
   */
  createNewWorld(worldName?: string, settings?: any): Observable<WorldInfo> {
    const finalWorldName = worldName || `New World ${Date.now()}`;
    
    this.store.dispatch(UIActions.startLoading({
      operation: 'createWorld',
      message: `Creating "${finalWorldName}"...`,
      details: 'Generating terrain...',
      showProgress: true
    }));

    // Database is already initialized, no timeout needed
    return this.performWorldCreation(finalWorldName, settings);
  }

  /**
   * Delete a world
   */
  deleteWorld(worldId: string, worldName: string): Observable<void> {
    this.store.dispatch(UIActions.startLoading({
      operation: 'deleteWorld',
      message: `Deleting "${worldName}"...`,
      details: 'Removing world data...',
      showProgress: false
    }));

    return from(this.dbService.deleteWorld(worldId)).pipe(
      tap(() => {
        console.log(`Successfully deleted world: ${worldName} (${worldId})`);
        this.store.dispatch(WorldActions.worldDeleted({ worldId }));
        this.store.dispatch(UIActions.stopLoading());
      }),
      catchError((error) => {
        console.error(`Failed to delete world ${worldName}:`, error);
        this.store.dispatch(UIActions.setLoadingError({ error: 'Failed to delete world' }));
        return throwError(error);
      })
    );
  }

  private performWorldLoad(worldId: string, worldName: string): Observable<any> {
    const steps = [
      { progress: 20, details: 'Loading world metadata...' },
      { progress: 40, details: 'Loading terrain data...' },
      { progress: 60, details: 'Loading player data...' },
      { progress: 80, details: 'Initializing game world...' },
      { progress: 100, details: 'World loaded successfully!' }
    ];

    return new Observable(observer => {
      let currentStep = 0;
      
      const processStep = async () => {
        if (currentStep >= steps.length) {
          try {
            // Actually load world from database
            const world = await this.dbService.loadWorld(worldId);
            if (!world) {
              observer.error(new Error(`World ${worldId} not found`));
              return;
            }

            // Update last played timestamp
            await this.dbService.updateWorldLastPlayed(worldId);

            // World loading complete
            setTimeout(() => {
              this.store.dispatch(WorldActions.worldLoaded({
                worldData: { id: worldId, name: worldName, blocks: new Map() },
                worldId
              }));
              observer.next({ worldId, worldName, world });
              observer.complete();
            }, 300);
          } catch (error) {
            console.error('Failed to load world from database:', error);
            observer.error(error);
          }
          return;
        }

        const step = steps[currentStep];
        this.store.dispatch(UIActions.updateLoadingProgress({
          progress: step.progress,
          details: step.details
        }));

        currentStep++;
        setTimeout(processStep, 600); // 600ms between steps
      };

      processStep();
    });
  }

  private performWorldCreation(worldName: string, settings?: any): Observable<WorldInfo> {
    const steps = [
      { progress: 10, details: 'Initializing world parameters...' },
      { progress: 25, details: 'Creating world database entry...' },
      { progress: 45, details: 'Setting up world structure...' },
      { progress: 65, details: 'Preparing terrain generation...' },
      { progress: 80, details: 'Setting spawn point...' },
      { progress: 95, details: 'Finalizing world creation...' },
      { progress: 100, details: 'World created successfully!' }
    ];

    return new Observable(observer => {
      let currentStep = 0;
      
      const processStep = async () => {
        if (currentStep >= steps.length) {
          try {
            // Actually create world in database
            const worldId = await this.dbService.createWorld({
              name: worldName,
              settings: settings || {},
              metadata: {
                createdBy: 'WorldService',
                terrainGenerated: false
              }
            });

            // World creation complete
            setTimeout(() => {
              const newWorld: WorldInfo = {
                id: worldId,
                name: worldName,
                created: Date.now(),
                lastPlayed: Date.now(),
                settings
              };
              
              this.store.dispatch(WorldActions.newWorldCreated({
                worldId: worldId,
                worldName: worldName
              }));
              observer.next(newWorld);
              observer.complete();
            }, 300);
          } catch (error) {
            console.error('Failed to create world in database:', error);
            observer.error(error);
          }
          return;
        }

        const step = steps[currentStep];
        this.store.dispatch(UIActions.updateLoadingProgress({
          progress: step.progress,
          details: step.details
        }));

        currentStep++;
        setTimeout(processStep, 700); // 700ms between steps for world creation
      };

      processStep();
    });
  }
}
