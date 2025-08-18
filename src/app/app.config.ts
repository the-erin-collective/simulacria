import { ApplicationConfig, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';

import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';
import { reducers } from './store';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes), 
    provideClientHydration(),
    provideStore(reducers),
    provideEffects([]),
    provideStoreDevtools({ 
      maxAge: 25, 
      logOnly: !isDevMode() 
    })
  ]
};
