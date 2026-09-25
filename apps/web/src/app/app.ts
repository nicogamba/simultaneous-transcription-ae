import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { GlobalNavComponent } from './nav/global-nav.component';

@Component({
  imports: [RouterModule, GlobalNavComponent],
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {}