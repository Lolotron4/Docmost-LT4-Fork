// LT4-Fork: eigenständige Implementierung (AGPL-3.0). Kein Docmost-Enterprise-Code.
//
// Sicherungen aus der Oberfläche: Datenbank (pg_dump) und Anhänge (lokaler
// Speicher) in einer .tar.gz-Datei, geplant oder per Klick, mit Download,
// Hochladen und Wiederherstellen.
//
// Alles Wichtige liegt bewusst NICHT in der Datenbank, sondern als Dateien im
// Sicherungsordner (Einstellungen, Liste der Sicherungen). Sonst würde eine
// Wiederherstellung den Zeitplan und die Liste mit überschreiben.
//
// Aufbau einer Sicherung (tar.gz):
//   manifest.json     Metadaten (Version, Zeitpunkt, Postgres-Version, ...)
//   database.dump     pg_dump im Custom-Format
//   storage/...       Inhalt des lokalen Speichers (ohne den Sicherungsordner)
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { LOCAL_STORAGE_PATH } from '../../common/helpers';

export const BACKUP_FORMAT = 1;
const BACKUP_DIR_NAME = 'lt4-backups';
const SETTINGS_FILE = 'settings.json';
const FILE_RE = /^lt4-backup-[0-9A-Za-z_-]+\.tar\.gz$/;
const CHECK_INTERVAL_MS = 60 * 1000;

export type BackupKind = 'manual' | 'scheduled' | 'pre-restore' | 'uploaded';

export interface BackupInfo {
  id: string; // = Dateiname ohne .tar.gz
  fileName: string;
  kind: BackupKind;
  createdAt: string;
  size: number;
  includesFiles: boolean;
  createdBy: string | null;
  postgresVersion: string | null;
  docmostVersion: string | null;
  lastMigration: string | null;
  format: number;
  /** Bei hochgeladenen Sicherungen: wann sie ursprünglich erstellt wurde */
  originalCreatedAt?: string | null;
}

export interface BackupSettings {
  enabled: boolean;
  frequency: 'daily' | 'weekly';
  hour: number; // 0-23, in timeZone
  weekday: number; // 0 = Sonntag ... 6 = Samstag (nur weekly)
  timeZone: string;
  keep: number; // so viele geplante Sicherungen behalten
  includeFiles: boolean;
  lastScheduledKey: string | null;
  lastScheduledAt: string | null;
  lastError: string | null;
}

export interface BackupStatus {
  state: 'idle' | 'backup' | 'restore';
  step: string | null;
  startedAt: string | null;
  error: string | null;
  finishedAt: string | null;
  lastAction: 'backup' | 'restore' | null;
  restartPending: boolean;
}

const DEFAULT_SETTINGS: BackupSettings = {
  enabled: false,
  frequency: 'daily',
  hour: 3,
  weekday: 0,
  timeZone: 'Europe/Berlin',
  keep: 7,
  includeFiles: true,
  lastScheduledKey: null,
  lastScheduledAt: null,
  lastError: null,
};

/** Startet ein Programm und sammelt stderr. Wirft bei Exit-Code != 0. */
function run(
  cmd: string,
  args: string[],
  opts: { env?: NodeJS.ProcessEnv; stdout?: fs.WriteStream | 'pipe'; cwd?: string } = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, ...opts.env },
      cwd: opts.cwd,
      stdio: ['ignore', opts.stdout ? 'pipe' : 'ignore', 'pipe'],
    });
    let out = '';
    let err = '';
    child.stderr.on('data', (d) => {
      err += d.toString();
      if (err.length > 20000) err = err.slice(-20000);
    });
    if (opts.stdout === 'pipe') child.stdout!.on('data', (d) => (out += d.toString()));
    else if (opts.stdout) child.stdout!.pipe(opts.stdout);
    child.on('error', (e) => reject(new Error(`${cmd}: ${e.message}`)));
    child.on('close', (code) => {
      if (code === 0) resolve(out);
      else reject(new Error(`${path.basename(cmd)} exit ${code}: ${err.trim().slice(-2000)}`));
    });
  });
}

/** Teile einer Datenbank-URL als libpq-Umgebungsvariablen (Passwort nicht in der Prozessliste). */
function pgEnv(databaseUrl: string): NodeJS.ProcessEnv {
  const u = new URL(databaseUrl);
  const env: NodeJS.ProcessEnv = {
    PGHOST: decodeURIComponent(u.hostname),
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, '')),
  };
  const sslmode = u.searchParams.get('sslmode');
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

@Injectable()
export class BackupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupService.name);
  private timer: NodeJS.Timeout | null = null;
  private status: BackupStatus = {
    state: 'idle',
    step: null,
    startedAt: null,
    error: null,
    finishedAt: null,
    lastAction: null,
    restartPending: false,
  };

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly env: EnvironmentService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.checkSchedule(), CHECK_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // ------------------------------------------------------------------ Ordner

  get backupDir(): string {
    return process.env.LT4_BACKUP_DIR
      ? path.resolve(process.env.LT4_BACKUP_DIR)
      : path.join(LOCAL_STORAGE_PATH, BACKUP_DIR_NAME);
  }

  get storageRoot(): string {
    return LOCAL_STORAGE_PATH;
  }

  /** Anhänge können nur beim lokalen Speicher mitgesichert werden. */
  get filesSupported(): boolean {
    return this.env.getStorageDriver().toLowerCase() === 'local';
  }

  private async ensureDir() {
    await fsp.mkdir(this.backupDir, { recursive: true });
  }

  /** Pfad einer Sicherung; prüft den Namen, damit niemand aus dem Ordner ausbricht. */
  filePath(id: string): string {
    const fileName = `${id}.tar.gz`;
    if (!FILE_RE.test(fileName)) throw new Error('Invalid backup id');
    return path.join(this.backupDir, fileName);
  }

  private metaPath(id: string) {
    return this.filePath(id).replace(/\.tar\.gz$/, '.json');
  }

  // ------------------------------------------------------------ Einstellungen

  async getSettings(): Promise<BackupSettings> {
    try {
      const raw = await fsp.readFile(path.join(this.backupDir, SETTINGS_FILE), 'utf8');
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  async saveSettings(patch: Partial<BackupSettings>): Promise<BackupSettings> {
    await this.ensureDir();
    const next = { ...(await this.getSettings()), ...patch };
    const file = path.join(this.backupDir, SETTINGS_FILE);
    await fsp.writeFile(file + '.tmp', JSON.stringify(next, null, 2));
    await fsp.rename(file + '.tmp', file);
    return next;
  }

  getStatus(): BackupStatus {
    return { ...this.status };
  }

  // ------------------------------------------------------------------- Liste

  async list(): Promise<BackupInfo[]> {
    await this.ensureDir();
    const names = await fsp.readdir(this.backupDir);
    const items: BackupInfo[] = [];
    for (const name of names) {
      if (!FILE_RE.test(name)) continue;
      const id = name.replace(/\.tar\.gz$/, '');
      try {
        const stat = await fsp.stat(path.join(this.backupDir, name));
        let meta: Partial<BackupInfo> = {};
        try {
          meta = JSON.parse(await fsp.readFile(this.metaPath(id), 'utf8'));
        } catch {
          // Ohne Begleitdatei (z. B. von Hand in den Ordner kopiert)
        }
        items.push({
          id,
          fileName: name,
          kind: meta.kind ?? 'uploaded',
          createdAt: meta.createdAt ?? stat.mtime.toISOString(),
          size: stat.size,
          includesFiles: meta.includesFiles ?? false,
          createdBy: meta.createdBy ?? null,
          postgresVersion: meta.postgresVersion ?? null,
          docmostVersion: meta.docmostVersion ?? null,
          lastMigration: meta.lastMigration ?? null,
          format: meta.format ?? BACKUP_FORMAT,
          originalCreatedAt: meta.originalCreatedAt ?? null,
        });
      } catch {
        // Datei verschwand gerade (z. B. gelöscht)
      }
    }
    items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return items;
  }

  async find(id: string): Promise<BackupInfo | undefined> {
    return (await this.list()).find((b) => b.id === id);
  }

  async remove(id: string) {
    await fsp.rm(this.filePath(id), { force: true });
    await fsp.rm(this.metaPath(id), { force: true });
  }

  /** Neuer, eindeutiger Name einer Sicherung (UTC-Zeitstempel). */
  newId(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const stamp = `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
    return `lt4-backup-${stamp}-${randomBytes(3).toString('hex')}`;
  }

  // ------------------------------------------------------------- Postgres

  private async serverVersion(): Promise<{ num: number; text: string }> {
    const r = await sql<{ num: string; text: string }>`
      select current_setting('server_version_num') as num, current_setting('server_version') as text
    `.execute(this.db);
    return { num: Number(r.rows[0].num), text: r.rows[0].text };
  }

  /**
   * Passende pg_dump/pg_restore-Programme: gleiche Hauptversion wie der Server,
   * sonst die nächsthöhere, sonst die höchste vorhandene. Das Image bringt
   * mehrere Versionen mit (/usr/lib/postgresql/<n>/bin).
   */
  async pgBinDir(serverMajor: number): Promise<string> {
    if (process.env.LT4_PG_BIN_DIR) return process.env.LT4_PG_BIN_DIR;
    const base = '/usr/lib/postgresql';
    let versions: number[] = [];
    try {
      versions = (await fsp.readdir(base))
        .map(Number)
        .filter((n) => Number.isFinite(n) && fs.existsSync(path.join(base, String(n), 'bin', 'pg_dump')))
        .sort((a, b) => a - b);
    } catch {
      // kein /usr/lib/postgresql
    }
    const pick =
      versions.find((v) => v === serverMajor) ??
      versions.find((v) => v > serverMajor) ??
      versions[versions.length - 1];
    if (pick === undefined) {
      throw new Error(
        'pg_dump not found. Use the LT4 image (it contains the PostgreSQL client tools) or set LT4_PG_BIN_DIR.',
      );
    }
    if (pick < serverMajor) {
      throw new Error(
        `PostgreSQL ${serverMajor} is newer than the newest pg_dump in the image (${pick}). Please update the LT4 image.`,
      );
    }
    return path.join(base, String(pick), 'bin');
  }

  private async lastMigration(): Promise<string | null> {
    try {
      const r = await sql<{ name: string }>`
        select name from kysely_migration order by name desc limit 1
      `.execute(this.db);
      return r.rows[0]?.name ?? null;
    } catch {
      return null;
    }
  }

  // --------------------------------------------------------------- Sichern

  private begin(state: 'backup' | 'restore', step: string) {
    if (this.status.state !== 'idle') {
      throw new Error('Another backup or restore is already running');
    }
    if (this.status.restartPending) {
      throw new Error('The server restarts after a restore. Please wait.');
    }
    this.status = {
      state,
      step,
      startedAt: new Date().toISOString(),
      error: null,
      finishedAt: null,
      lastAction: state,
      restartPending: false,
    };
  }

  private finish(error: string | null) {
    this.status = {
      ...this.status,
      state: 'idle',
      step: null,
      error,
      finishedAt: new Date().toISOString(),
    };
  }

  /** Startet eine Sicherung im Hintergrund. Wirft sofort, wenn schon etwas läuft. */
  startBackup(opts: { kind: BackupKind; includeFiles: boolean; createdBy: string | null }): string {
    this.begin('backup', 'database');
    const id = this.newId();
    void this.createBackup(id, opts)
      .then(() => this.finish(null))
      .catch((err) => {
        this.logger.error(`Backup failed: ${err?.message ?? err}`);
        this.finish(String(err?.message ?? err));
      });
    return id;
  }

  /** Erstellt eine Sicherung (ohne Statusverwaltung). */
  async createBackup(
    id: string,
    opts: { kind: BackupKind; includeFiles: boolean; createdBy: string | null },
  ): Promise<BackupInfo> {
    await this.ensureDir();
    const includeFiles = opts.includeFiles && this.filesSupported;
    const work = path.join(this.backupDir, `.work-${id}`);
    const target = this.filePath(id);
    const partial = target + '.partial';
    await fsp.mkdir(work, { recursive: true });
    try {
      const version = await this.serverVersion();
      const major = Math.floor(version.num / 10000);
      const bin = await this.pgBinDir(major);

      this.status.step = 'database';
      await run(
        path.join(bin, 'pg_dump'),
        ['--format=custom', '--no-owner', '--no-privileges', '--file', path.join(work, 'database.dump')],
        { env: pgEnv(this.env.getDatabaseURL()) },
      );

      const manifest = {
        format: BACKUP_FORMAT,
        app: 'docmost-lt4',
        kind: opts.kind,
        createdAt: new Date().toISOString(),
        createdBy: opts.createdBy,
        includesFiles: includeFiles,
        postgresVersion: version.text,
        docmostVersion: this.docmostVersion(),
        lastMigration: await this.lastMigration(),
      };
      await fsp.writeFile(path.join(work, 'manifest.json'), JSON.stringify(manifest, null, 2));

      this.status.step = includeFiles ? 'files' : 'archive';
      const args = ['-czf', partial, '-C', work, 'manifest.json', 'database.dump'];
      if (includeFiles) {
        await fsp.mkdir(this.storageRoot, { recursive: true });
        const rel = path.relative(this.storageRoot, this.backupDir);
        args.push(
          '-C',
          this.storageRoot,
          // Sicherungsordner selbst und halbfertige Uploads nicht mitsichern
          ...(rel && !rel.startsWith('..') ? [`--exclude=./${rel}`] : []),
          '--exclude=./*.tmp',
          '--transform=s,^\\.,storage,',
          '.',
        );
      }
      await run('tar', args);
      await fsp.rename(partial, target);

      const stat = await fsp.stat(target);
      const info: BackupInfo = {
        id,
        fileName: path.basename(target),
        kind: opts.kind,
        createdAt: manifest.createdAt,
        size: stat.size,
        includesFiles: includeFiles,
        createdBy: opts.createdBy,
        postgresVersion: version.text,
        docmostVersion: manifest.docmostVersion,
        lastMigration: manifest.lastMigration,
        format: BACKUP_FORMAT,
      };
      await fsp.writeFile(this.metaPath(id), JSON.stringify(info, null, 2));
      this.logger.log(`Backup created: ${info.fileName} (${stat.size} bytes)`);
      return info;
    } catch (err) {
      await fsp.rm(partial, { force: true }).catch(() => undefined);
      throw err;
    } finally {
      await fsp.rm(work, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private docmostVersion(): string | null {
    try {
      // Arbeitsverzeichnis ist apps/server
      const pkg = JSON.parse(
        fs.readFileSync(path.resolve(process.cwd(), 'package.json'), 'utf8'),
      );
      return pkg.version ?? null;
    } catch {
      return null;
    }
  }

  /** Liest manifest.json aus einer Sicherung, ohne sie ganz zu entpacken. */
  async readManifest(file: string): Promise<any> {
    let manifest: any;
    try {
      const out = await run('tar', ['-xzOf', file, 'manifest.json'], { stdout: 'pipe' });
      manifest = JSON.parse(out);
    } catch {
      throw new Error('This file is not an LT4 backup');
    }
    if (manifest?.app !== 'docmost-lt4' || typeof manifest.format !== 'number') {
      throw new Error('This file is not an LT4 backup');
    }
    if (manifest.format > BACKUP_FORMAT) {
      throw new Error('This backup was made by a newer LT4 version. Please update first.');
    }
    return manifest;
  }

  /** Registriert eine hochgeladene Datei als Sicherung. */
  async registerUploaded(id: string, createdBy: string | null): Promise<BackupInfo> {
    const file = this.filePath(id);
    let manifest: any;
    try {
      manifest = await this.readManifest(file);
    } catch (err) {
      await fsp.rm(file, { force: true });
      throw err;
    }
    const stat = await fsp.stat(file);
    const info: BackupInfo = {
      id,
      fileName: path.basename(file),
      kind: 'uploaded',
      createdAt: new Date().toISOString(),
      size: stat.size,
      includesFiles: !!manifest.includesFiles,
      createdBy: createdBy,
      postgresVersion: manifest.postgresVersion ?? null,
      docmostVersion: manifest.docmostVersion ?? null,
      lastMigration: manifest.lastMigration ?? null,
      format: manifest.format,
      // Ursprünglicher Zeitpunkt der Sicherung bleibt sichtbar
      originalCreatedAt: manifest.createdAt ?? null,
    };
    await fsp.writeFile(this.metaPath(id), JSON.stringify(info, null, 2));
    return info;
  }

  // -------------------------------------------------------- Wiederherstellen

  startRestore(
    id: string,
    opts: { restoreFiles: boolean; createdBy: string | null },
    onSuccess?: () => Promise<void> | void,
  ) {
    const file = this.filePath(id);
    if (!fs.existsSync(file)) throw new Error('Backup not found');
    this.begin('restore', 'check');
    void this.restore(id, opts)
      .then(async () => {
        try {
          await onSuccess?.();
        } catch {
          // z. B. Audit-Log: Person/Workspace gibt es im alten Stand nicht
        }
        this.finish(null);
        this.scheduleRestart();
      })
      .catch((err) => {
        this.logger.error(`Restore failed: ${err?.message ?? err}`);
        this.finish(String(err?.message ?? err));
      });
  }

  private async restore(id: string, opts: { restoreFiles: boolean; createdBy: string | null }) {
    const file = this.filePath(id);
    const manifest = await this.readManifest(file);

    // 1. Sicherheitskopie des aktuellen Stands
    this.status.step = 'safety-backup';
    await this.createBackup(this.newId(), {
      kind: 'pre-restore',
      includeFiles: opts.restoreFiles && !!manifest.includesFiles,
      createdBy: opts.createdBy,
    });

    // 2. Entpacken
    this.status.step = 'extract';
    const work = path.join(this.backupDir, `.restore-${randomBytes(4).toString('hex')}`);
    await fsp.mkdir(work, { recursive: true });
    try {
      await run('tar', ['-xzf', file, '-C', work, '--no-same-owner']);

      // 3. Datenbank in EINER Transaktion ersetzen: Schema leeren und
      //    das Skript von pg_restore einspielen. Schlägt etwas fehl, bleibt
      //    die Datenbank unverändert.
      this.status.step = 'database';
      const version = await this.serverVersion();
      const bin = await this.pgBinDir(Math.floor(version.num / 10000));
      const sqlFile = path.join(work, 'restore.sql');
      await fsp.writeFile(
        sqlFile,
        [
          "SET lock_timeout = '60s';",
          'DROP SCHEMA IF EXISTS public CASCADE;',
          'CREATE SCHEMA public;',
          'GRANT ALL ON SCHEMA public TO CURRENT_USER;',
          'GRANT USAGE ON SCHEMA public TO PUBLIC;',
          '',
        ].join('\n'),
      );
      await new Promise<void>((resolve, reject) => {
        const append = fs.createWriteStream(sqlFile, { flags: 'a' });
        append.on('error', reject);
        const child = spawn(
          path.join(bin, 'pg_restore'),
          ['--no-owner', '--no-privileges', '--file=-', path.join(work, 'database.dump')],
          { stdio: ['ignore', 'pipe', 'pipe'] },
        );
        let err = '';
        child.stderr.on('data', (d) => (err += d.toString()));
        child.stdout.pipe(append);
        child.on('error', reject);
        child.on('close', (code) => {
          append.end(() => {
            if (code === 0) resolve();
            else reject(new Error(`pg_restore exit ${code}: ${err.trim().slice(-2000)}`));
          });
        });
      });
      await this.stripPublicSchema(sqlFile);
      await run(
        path.join(bin, 'psql'),
        ['--no-psqlrc', '--quiet', '--set=ON_ERROR_STOP=1', '--single-transaction', '--file', sqlFile],
        { env: pgEnv(this.env.getDatabaseURL()) },
      );

      // 4. Anhänge: aktuellen Inhalt beiseite legen, gesicherten einsetzen
      if (opts.restoreFiles && manifest.includesFiles && this.filesSupported) {
        this.status.step = 'files';
        await this.swapStorage(path.join(work, 'storage'), work);
      }
      this.logger.log(`Restore finished from ${path.basename(file)}`);
    } finally {
      await fsp.rm(work, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /**
   * pg_dump legt "CREATE SCHEMA public" nur an, wenn das Schema verändert
   * wurde. Wir erstellen es selbst, darum fliegt die Zeile raus.
   */
  private async stripPublicSchema(sqlFile: string) {
    const content = await fsp.readFile(sqlFile, 'utf8');
    const lines = content.split('\n');
    let changed = false;
    for (let i = 5; i < lines.length; i++) {
      if (/^CREATE SCHEMA public;\s*$/.test(lines[i])) {
        lines[i] = '-- (LT4) ' + lines[i];
        changed = true;
      }
    }
    if (changed) await fsp.writeFile(sqlFile, lines.join('\n'));
  }

  private async swapStorage(restored: string, work: string) {
    const root = this.storageRoot;
    const keep = new Set([path.relative(root, this.backupDir).split(path.sep)[0]]);
    const old = path.join(work, 'old-storage');
    await fsp.mkdir(old, { recursive: true });
    const moved: string[] = [];
    try {
      for (const name of await fsp.readdir(root)) {
        if (keep.has(name)) continue;
        await fsp.rename(path.join(root, name), path.join(old, name));
        moved.push(name);
      }
      if (fs.existsSync(restored)) {
        for (const name of await fsp.readdir(restored)) {
          if (keep.has(name)) continue;
          await fsp.rename(path.join(restored, name), path.join(root, name));
        }
      }
    } catch (err) {
      // Zurückrollen
      for (const name of moved) {
        await fsp.rm(path.join(root, name), { recursive: true, force: true }).catch(() => undefined);
        await fsp.rename(path.join(old, name), path.join(root, name)).catch(() => undefined);
      }
      throw err;
    }
  }

  /**
   * Nach dem Wiederherstellen startet der Server neu, damit Migrationen
   * laufen und alle Zwischenspeicher frisch geladen werden. Docker startet
   * den Container dank "restart: unless-stopped" wieder.
   */
  private scheduleRestart() {
    if (process.env.LT4_BACKUP_RESTART === 'false') return;
    this.status.restartPending = true;
    setTimeout(() => {
      this.logger.warn('Restarting after restore');
      process.exit(0);
    }, 3000);
  }

  // ------------------------------------------------------------ Zeitplan

  /** Datum/Stunde/Wochentag in der Zeitzone der Einstellung. */
  private localParts(date: Date, timeZone: string) {
    let tz = timeZone;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz });
    } catch {
      tz = 'UTC';
    }
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
      weekday: 'short',
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    return {
      key: `${get('year')}-${get('month')}-${get('day')}`,
      hour: Number(get('hour')),
      weekday,
    };
  }

  async checkSchedule(now = new Date()) {
    let settings: BackupSettings;
    try {
      settings = await this.getSettings();
    } catch {
      return;
    }
    if (!settings.enabled || this.status.state !== 'idle' || this.status.restartPending) return;
    const local = this.localParts(now, settings.timeZone);
    if (local.hour !== settings.hour) return;
    if (settings.frequency === 'weekly' && local.weekday !== settings.weekday) return;
    if (settings.lastScheduledKey === local.key) return;

    await this.saveSettings({ lastScheduledKey: local.key });
    try {
      this.begin('backup', 'database');
    } catch {
      return;
    }
    try {
      await this.createBackup(this.newId(), {
        kind: 'scheduled',
        includeFiles: settings.includeFiles,
        createdBy: null,
      });
      await this.applyRetention(settings.keep);
      await this.saveSettings({ lastScheduledAt: new Date().toISOString(), lastError: null });
      this.finish(null);
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      this.logger.error(`Scheduled backup failed: ${msg}`);
      await this.saveSettings({ lastError: msg }).catch(() => undefined);
      this.finish(msg);
    }
  }

  /** Nur geplante Sicherungen werden automatisch gelöscht. */
  async applyRetention(keep: number) {
    const scheduled = (await this.list()).filter((b) => b.kind === 'scheduled');
    for (const b of scheduled.slice(Math.max(1, keep))) {
      await this.remove(b.id);
    }
  }

  /** Nächster geplanter Lauf (für die Anzeige), ungefähr auf die Stunde. */
  nextRun(settings: BackupSettings, from = new Date()): string | null {
    if (!settings.enabled) return null;
    const start = new Date(from);
    start.setUTCMinutes(0, 0, 0);
    for (let h = 0; h <= 24 * 8; h++) {
      const t = new Date(start.getTime() + h * 3600_000);
      if (t.getTime() < from.getTime() - 3600_000) continue;
      const l = this.localParts(t, settings.timeZone);
      if (l.hour !== settings.hour) continue;
      if (settings.frequency === 'weekly' && l.weekday !== settings.weekday) continue;
      if (settings.lastScheduledKey === l.key) continue;
      return t.toISOString();
    }
    return null;
  }

  async diskInfo(): Promise<{ free: number | null; total: number | null }> {
    try {
      await this.ensureDir();
      const s = await fsp.statfs(this.backupDir);
      return { free: s.bavail * s.bsize, total: s.blocks * s.bsize };
    } catch {
      return { free: null, total: null };
    }
  }
}
