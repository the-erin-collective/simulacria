import { ApplicationConfig, isDevMode, ApplicationRef } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';
import { withComponentInputBinding } from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideBrowserGlobalErrorListeners } from '@angular/core';

import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { reducers } from './store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding()), 
    provideClientHydration(),
    provideStore(reducers),
    provideEffects([]),
    provideStoreDevtools({ 
      maxAge: 25, 
      logOnly: !isDevMode() 
    }),
    // Enable zoneless mode in Angular 20
    provideZonelessChangeDetection(),
    // Provide browser global error listeners for better error handling
    provideBrowserGlobalErrorListeners()
  ]
};
