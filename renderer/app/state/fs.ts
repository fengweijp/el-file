import * as Mode from 'stat-mode';
import * as fs from 'fs';

import { Action, NgxsOnInit, State, StateContext } from '@ngxs/store';

import { ElectronService } from 'ngx-electron';
import async from 'async-es';
import { nextTick } from 'ellib';

/** NOTE: actions must come first because of AST */

export class DirLoaded {
  static readonly type = '[FS] dir loaded';
  constructor(public readonly payload: { path: string, descs: Descriptor[] }) { }
}

export class DirUnloaded {
  static readonly type = '[FS] dir unloaded';
  constructor(public readonly payload: { path: string }) { }
}

export class ForceLoadDirs {
  static readonly type = '[FS] force load dirs';
  constructor(public readonly payload: { paths: string[] }) { }
}

export class LoadDirs {
  static readonly type = '[FS] load dirs';
  constructor(public readonly payload: { paths: string[] }) { }
}

export class UlimitExceeded {
  static readonly type = '[FS] ulimit exceeded';
  constructor(public readonly payload: { limit: number }) { }
}

export class UnloadDirs {
  static readonly type = '[FS] unload dirs';
  constructor(public readonly payload: { paths: string[] }) { }
}

export interface Descriptor {
  atime: Date;
  btime: Date;
  color: string;
  icon: string;
  isDirectory: boolean;
  isFile: boolean;
  isSymlink: boolean;
  mode: string;
  mtime: Date;
  name: string;
  path: string;
  size: number;
}

export interface FSStateModel {
  [path: string]: Descriptor[];
}

@State<FSStateModel>({
  name: 'fs',
  defaults: { }
}) export class FSState implements NgxsOnInit {

  colorByExt = { };
  fs: any;
  path: any;
  watcher: any;

  /** ctor */
  constructor(private electron: ElectronService) {
    const colorByExt = window.localStorage.getItem('colorByExt');
    this.colorByExt = colorByExt? JSON.parse(colorByExt) : { };
    this.fs = this.electron.remote.require('fs');
    this.path = this.electron.remote.require('path');
    this.watcher = this.electron.remote.require('filewatcher')();
  }

  @Action(ForceLoadDirs)
  forceloaddirs(ctx: StateContext<FSStateModel>,
                action: ForceLoadDirs) {
    this.loaddirs(ctx, action, true);
  }

  @Action(LoadDirs)
  loaddirs({ dispatch, getState, patchState }: StateContext<FSStateModel>,
           { payload }: LoadDirs,
           force = false) {
    const { paths } = payload;
    paths.forEach(path => {
      this.fs.readdir(path, (err, names) => {
        if (err)
          dispatch(new UnloadDirs({ paths: [path] }));
        else if (force || !getState()[path]) {
          const dirs = names.map(name => this.path.join(path, name));
          async.map(dirs, this.fs.lstat, (err, stats) => {
            const descs: Descriptor[] = names.reduce((acc, name, ix) => {
              const stat = stats[ix];
              if (stat.isDirectory() || stat.isFile() || stat.isSymbolicLink())
                acc.push(this.makeDescriptor(name, path, stat));
              return acc;
            }, []);
            patchState({ [path]: descs });
            // start watching this directory
            this.watcher.add(path);
            // sync model
            nextTick(() => dispatch(new DirLoaded({ path, descs })));
          });
        }
      });
    });
  }

  @Action(UnloadDirs)
  unloaddirs({ dispatch, getState, setState }: StateContext<FSStateModel>,
             { payload }: UnloadDirs) {
    const { paths } = payload;
    const updated = { ...getState() };
    paths.forEach(path => {
      delete updated[path];
      setState(updated);
      // stop watching this directory
      this.watcher.remove(path);
      // sync model
      nextTick(() => dispatch(new DirUnloaded({ path })));
    });
  }

  // lifecycle methods

  ngxsOnInit(ctx: StateContext<FSStateModel>) {
    // watch for changes
    this.watcher.on('change', (path, stat) => {
      ctx.dispatch(stat? new ForceLoadDirs({ paths: [path] }) : new DirUnloaded({ path }));
    });
    // watch out for fallback
    this.watcher.on('fallback', function(limit) {
      console.log(`Ran out of file handles after watching ${limit} files`);
      console.log('Falling back to polling which uses more CPU');
      console.log('Run ulimit -n 10000 to increase the limit for open files');
      ctx.dispatch(new UlimitExceeded({ limit }));
    });

  }

  // private methods

  private makeColor(name: string,
                    stat: fs.Stats): string {
    if (stat.isDirectory())
      return 'var(--mat-deep-orange-a100)';
    else if (stat.isFile()) {
      const ix = name.lastIndexOf('.');
      if (ix <= 0)
        return 'var(--mat-blue-grey-400)';
      else {
        const ext = name.substring(ix + 1).toLowerCase();
        let color = this.colorByExt[ext];
        if (!color) {
          color = COLORS[Math.trunc(Math.random() * COLORS.length)];
          this.colorByExt[ext] = color;
          window.localStorage.setItem('colorByExt', JSON.stringify(this.colorByExt));
        }
        return color;
      }
    }
    else if (stat.isSymbolicLink())
      return 'var(--mat-brown-400)';
  }

  private makeDescriptor(name: string,
                         path: string,
                         stat: fs.Stats): Descriptor {
    return {
      atime: stat.atime,
      btime: stat.birthtime,
      color: this.makeColor(name, stat),
      icon: this.makeIcon(name, stat),
      isDirectory: stat.isDirectory(),
      isFile: stat.isFile(),
      isSymlink: stat.isSymbolicLink(),
      mode: new Mode(stat).toString(),
      mtime: stat.mtime,
      name: name,
      path: this.path.join(path, name),
      size: stat.size
    } as Descriptor;
  }

  private makeIcon(name: string,
                   stat: fs.Stats): string {
    if (stat.isDirectory())
      return 'fas folder';
    else if (stat.isFile()) {
      let icon = null;
      const ix = name.lastIndexOf('.');
      if (ix <= 0)
        icon = ICON_BY_NAME[name.toLowerCase()];
      else {
        const ext = name.substring(ix + 1).toLowerCase();
        icon = ICON_BY_EXT[ext];
      }
      return icon? icon : 'far file';
    }
    else if (stat.isSymbolicLink())
      return 'fas external-link-alt';
    else return 'far file';
  }

}

/**
 * Available colors
 */

const COLORS = [
  'var(--mat-red-a100)',
  'var(--mat-pink-a100)',
  'var(--mat-purple-a100)',
  'var(--mat-deep-purple-a100)',
  'var(--mat-indigo-a100)',
  'var(--mat-blue-a100)',
  'var(--mat-light-blue-a100)',
  'var(--mat-cyan-a100)',
  'var(--mat-teal-a100)',
  'var(--mat-green-a100)',
  'var(--mat-light-green-a100)',
  'var(--mat-lime-a100)',
  'var(--mat-yellow-a100)',
  'var(--mat-amber-a100)',
  'var(--mat-orange-a100)',
  'var(--mat-deep-orange-a100)'
];

/**
 * Available icons
 */

const ICON_BY_EXT = {
  '3g2': 'far file-video',
  '3gp': 'far file-video',
  '7z': 'far file-archive',
  'ai': 'far file-image',
  'aif': 'far file-audio',
  'apk': 'fas cube',
  'arj': 'far file-archive',
  'asm': 'far file-code',
  'asp': 'far file-code',
  'aspx': 'far file-code',
  'avi': 'far file-video',
  'bat': 'fas microchip',
  'bin': 'fas cube',
  'bmp': 'far file-image',
  'bz': 'far file-archive',
  'bz2': 'far file-archive',
  'c': 'far file-code',
  'cbl': 'far file-code',
  'cc': 'far file-code',
  'cda': 'far file-audio',
  'cfg': 'fas cog',
  'cfm': 'far file-code',
  'cgi': 'far file-code',
  'cmd': 'fas microchip',
  'com': 'fas microchip',
  'cpp': 'far file-code',
  'cson': 'far file-code',
  'css': 'fab css3-alt',
  'csv': 'far file-excel',
  'dat': 'fas database',
  'db': 'fas database',
  'dbf': 'fas database',
  'deb': 'far file-archive',
  'desktop': 'fas cog',
  'dmg': 'fas cube',
  'doc': 'far file-word',
  'docx': 'far file-word',
  'exe': 'fas microchip',
  'f': 'far file-code',
  'flv': 'far file-video',
  'fnt': 'fas font',
  'fon': 'fas font',
  'for': 'far file-code',
  'fs': 'far file-code',
  'gem': 'far file-archive',
  'gif': 'far file-image',
  'go': 'far file-code',
  'gradle': 'far file-code',
  'groovy': 'far file-code',
  'gz': 'far file-archive',
  'gzip': 'far file-archive',
  'h': 'far file-code',
  'h264': 'far file-video',
  'hh': 'far file-code',
  'htm': 'fab html5',
  'html': 'fab html5',
  'ico': 'far file-image',
  'ini': 'fas cog',
  'iso': 'fas cube',
  'jar': 'far file-archive',
  'java': 'fab java',
  'jpeg': 'far file-image',
  'jpg': 'far file-image',
  'js': 'fab js',
  'json': 'far file-code',
  'jsp': 'far file-code',
  'less': 'fab less',
  'log': 'fas database',
  'lua': 'far file-code',
  'm4v': 'far file-video',
  'mak': 'far file-code',
  'md': 'far file-code',
  'mdb': 'fas database',
  'mid': 'far file-audio',
  'midi': 'far file-audio',
  'mkv': 'far file-video',
  'mov': 'far file-video',
  'mp4': 'far file-video',
  'mpa': 'far file-audio',
  'mpeg': 'far file-video',
  'mpg': 'far file-video',
  'old': 'fas database',
  'ogg': 'far file-audio',
  'otf': 'fas font',
  'pdf': 'far file-pdf',
  'pkg': 'far file-archive',
  'pl': 'far file-code',
  'png': 'far file-image',
  'ppt': 'far file-powerpoint',
  'pptx': 'far file-powerpoint',
  'ps': 'far file-image',
  'psd': 'far file-image',
  'py': 'fab python',
  'rar': 'far file-archive',
  'rb': 'far file-code',
  'rc': 'far file-code',
  'rm': 'far file-video',
  'rpm': 'far file-archive',
  'sass': 'fab sass',
  'sav': 'fas database',
  'scss': 'fab sass',
  'sh': 'fas microchip',
  'so': 'fas database',
  'sql': 'fas database',
  'svg': 'far file-image',
  'swf': 'far file-video',
  'tar': 'far file-archive',
  'tcl': 'far file-code',
  'tif': 'far file-image',
  'tiff': 'far file-image',
  'toast': 'fas cube',
  'ts': 'far file-code',
  'ttf': 'fas font',
  'txt': 'far file-alt',
  'vb': 'far file-code',
  'vcd': 'fas cube',
  'vob': 'far file-video',
  'wav': 'far file-audio',
  'wma': 'far file-audio',
  'wmv': 'far file-video',
  'woff': 'fas font',
  'wpl': 'far file-audio',
  'wsf': 'fas microchip',
  'xhtml': 'fab html5',
  'xls': 'far file-excel',
  'xlsx': 'far file-excel',
  'xml': 'far file-code',
  'xsd': 'far file-code',
  'yaml': 'far file-code',
  'yml': 'far file-code',
  'z': 'far file-archive',
  'zip': 'far file-archive',
  'zzz': 'far file'
};

const ICON_BY_NAME = {
  '.config': 'fas cog',
  '.dockerignore': 'fab docker',
  '.gitattributes': 'fab github',
  '.gitignore': 'fab github',
  '.gitconfig': 'fab github',
  '.npmignore': 'fab node-js',
  '.npmrc': 'fab node-js',
  'dockerfile': 'fab docker',
};
