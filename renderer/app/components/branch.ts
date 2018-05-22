import { ChangeDetectionStrategy, Component, Input } from '@angular/core';

import { FSStateModel } from '../state/fs';
import { Tab } from '../state/layout';
import { View } from '../state/views';

/**
 * Branch component
 */

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'elfile-branch',
  templateUrl: 'branch.html',
  styleUrls: ['branch.scss']
})

export class BranchComponent {

  @Input() fs = { } as FSStateModel;
  @Input() tab = { } as Tab;
  @Input() view = { } as View;

}
