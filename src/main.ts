import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';

// Angular 20 zoneless bootstrapping
bootstrapApplication(AppComponent, appConfig)
  .catch((err) => console.error('Application bootstrap error:', err));
