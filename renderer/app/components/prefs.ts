import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { DrawerPanelComponent, LifecycleComponent, OnChange } from 'ellib';
import { FormBuilder, FormGroup } from '@angular/forms';
import { PrefsState, PrefsStateModel } from '../state/prefs';

/**
 * Prefs component
 */

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'elfile-prefs',
  templateUrl: 'prefs.html',
  styleUrls: ['prefs.scss']
})

export class PrefsComponent extends LifecycleComponent {

  @Input() prefs = { } as PrefsStateModel;

  prefsForm: FormGroup;

  editors = PrefsState.getCodeEditors();

  size = 259673;
  today = Date.now();

  /** ctor */
  constructor(private drawerPanel: DrawerPanelComponent,
              private formBuilder: FormBuilder) {
    super();
    // create prefs form controls
    this.prefsForm = this.formBuilder.group({
      codeEditor: '',
      dateFormat: '',
      quantityFormat: '',
      showGridLines: false,
      showHiddenFiles: false,
      showOnlyWritableFiles: false,
      sortDirectories: '',
      timeFormat: ''
    });
  }

  /** Close drawer */
  close(): void {
    this.drawerPanel.close();
  }

  // bind OnChange handlers

  @OnChange('prefs') patchPrefs(): void {
    if (this.prefs)
      this.prefsForm.patchValue(this.prefs, { emitEvent: false });
  }

}
