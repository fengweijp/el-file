import { AddPathToSelection, ClearSelection, ReplacePathsInSelection, SelectionStateModel, TogglePathInSelection } from '../state/selection';
import { AddPathToTab, AddPathsToTab, RemovePathFromTab, Tab } from '../state/layout';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, ElementRef, Input, NgZone, OnDestroy, OnInit } from '@angular/core';
import { PrefsState, PrefsStateModel } from '../state/prefs';

import { Alarm } from '../state/status';
import { ClipboardStateModel } from '../state/clipboard';
import { ContextMenuComponent } from 'ngx-contextmenu';
import { Descriptor } from '../state/fs';
import { Dictionary } from '../services/dictionary';
import { FSService } from '../services/fs';
import { FSStateModel } from '../state/fs';
import { Hydrateable } from './hydrateable';
import { MoveOperation } from '../services/move';
import { Store } from '@ngxs/store';
import { TreeComponent } from './tree';
import { config } from '../config';

/**
 * Row component
 */

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'elfile-row',
  templateUrl: 'row.html',
  styleUrls: ['row.scss']
})

export class RowComponent implements Hydrateable, OnDestroy, OnInit {

  @Input() clipboard = { } as ClipboardStateModel;
  @Input() contextMenu: ContextMenuComponent;
  @Input() desc: Descriptor;
  @Input() dictionary: Dictionary[] = [];
  @Input() fs = { } as FSStateModel;
  @Input() hydrated = false;
  @Input() isOpRunning = false;
  @Input() level = 0;
  @Input() path: string;
  @Input() prefs = { } as PrefsStateModel;
  @Input() selection = { } as SelectionStateModel;
  @Input() tab = { } as Tab;

  /** ctor */
  constructor(private cdf: ChangeDetectorRef,
              public element: ElementRef,
              private fsSvc: FSService,
              public tree: TreeComponent,
              private store: Store,
              private zone: NgZone) { }

  /** @see Hydrateable */
  repaint(): void {
    this.cdf.detectChanges();
  }

  // event handlers

  onContextMenu(event: MouseEvent,
                desc: Descriptor): void {
    // if the context isn't part of the selection,
    // then it becomes the selection
    if (!this.selection.paths.includes(desc.path)) {
      this.store.dispatch([
        new ClearSelection(),
        new AddPathToSelection({ path: desc.path })
      ]);
    }
  }

  onDrop(desc: Descriptor): void {
    if (desc.path !== this.desc.path) {
      if (this.isOpRunning)
        this.store.dispatch(new Alarm({ alarm: true }));
      else {
        // NOTE: if the supplied descriptor is not in the selection,
        // that just means it is about to become the selection
        let paths = this.selection.paths;
        if (!paths.includes(desc.path))
          paths = [desc.path];
        const moveOp = MoveOperation.makeInstance(paths, this.desc.path, this.fsSvc);
        this.fsSvc.run(moveOp);
      }
    }
  }

  onExpand(event: MouseEvent,
           desc: Descriptor): void {
    if (this.tab.paths.includes(desc.path))
      this.store.dispatch(new RemovePathFromTab({ path: desc.path, tab: this.tab }));
    else if (event.ctrlKey && !desc.path.match(config.noDirExpansionFor)) {
      this.fsSvc.subdirs(desc.path, (err, paths: string[]) => {
        this.zone.run(() => {
          // NOTE: we must include this path, but we can easily open too many
          // directories, as in mode_modules for instance
          paths = paths.slice(0, config.maxDirExpansion);
          paths.push(desc.path);
          this.store.dispatch(new AddPathsToTab({ paths, tab: this.tab }));
        });
      });
    }
    else this.store.dispatch(new AddPathToTab({ path: desc.path, tab: this.tab }));
    event.stopPropagation();
  }

  onOpen(event: MouseEvent,
         desc: Descriptor): void {
    const ext = this.fsSvc.extname(this.fsSvc.basename(desc.path));
    if (this.prefs.codeEditor && config.codeExts.includes(ext))
      this.fsSvc.exec(PrefsState.getCommandForEditor(this.prefs.codeEditor, desc.path));
    else this.fsSvc.open(desc.path);
  }

  onSelect(event: MouseEvent,
           desc: Descriptor): void {
    const actions = [];
    if (event.shiftKey) {
      if (this.selection.paths.length === 0)
        actions.push(new AddPathToSelection({ path: desc.path }));
      else {
        // get all visible paths, in order
        const paths = Array.from(document.querySelectorAll('elfile-row'))
          .map(row => row.getAttribute('path'))
          .reduce((acc, path) => {
            acc.push(path);
            return acc;
          }, []);
        // find indexes of newly-selected path, and current selection boundaries
        const ix = paths.indexOf(desc.path);
        let lo = Number.MAX_SAFE_INTEGER;
        let hi = Number.MIN_SAFE_INTEGER;
        this.selection.paths.forEach(path => {
          lo = Math.min(lo, paths.indexOf(path));
          hi = Math.max(hi, paths.indexOf(path));
        });
        // extend/contract the selection appropriately
        if (ix < lo)
          lo = ix;
        else if (ix > hi)
          hi = ix;
        else hi = ix;
        actions.push(new ReplacePathsInSelection({ paths: paths.slice(lo, hi + 1) }));
      }
    }
    else if (event.ctrlKey)
      actions.push(new TogglePathInSelection({ path: desc.path }));
    else {
      actions.push(new ClearSelection());
      actions.push(new AddPathToSelection({ path: desc.path }));
    }
    if (actions.length > 0)
      this.store.dispatch(actions);
  }

  // lifecycle methods

  ngOnDestroy(): void {
    this.tree.unregisterHydrateable(this);
  }

  ngOnInit(): void {
    this.element.nativeElement.setAttribute('path', this.path);
    this.tree.registerHydrateable(this);
  }

}
