import { ApplicationConfig, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { withComponentInputBinding } from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideBrowserGlobalErrorListeners } from '@angular/core';
import { withEventReplay } from '@angular/platform-browser';

import { routes } from './app.routes';
import { provideClientHydration } from '@angular/platform-browser';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withComponentInputBinding()), 
    provideClientHydration(withEventReplay()),
    // Enable zoneless mode in Angular 20
    provideZonelessChangeDetection(),
    // Provide browser global error listeners for better error handling
    provideBrowserGlobalErrorListeners()
  ]
};
