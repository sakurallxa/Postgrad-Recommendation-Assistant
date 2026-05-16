import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { BaoyantongzhiMirrorService } from './baoyantongzhi-mirror.service';

/**
 * 镜像数据快照服务（阶段 3：自建数据回流）
 *
 * 用途：
 *  - 每天 03:00 将所有镜像源（baoyantongzhi-*）写入的 CampInfo 导出为 JSON 文件
 *  - 保留最近 7 天，作为"baoyantongzhi 失联时的灾备"
 *  - 提供 admin 端点查看快照健康度
 *
 * 文件路径：backend/data/mirror-backups/YYYY-MM-DD.json
 */
@Injectable()
export class MirrorSnapshotService {
  private readonly logger = new Logger(MirrorSnapshotService.name);
  private readonly BACKUP_DIR = path.join(process.cwd(), 'data', 'mirror-backups');
  private readonly RETENTION_DAYS = 7;

  constructor(
    private readonly configService: ConfigService,
    private readonly mirrorService: BaoyantongzhiMirrorService,
  ) {
    this.ensureBackupDir();
  }

  // 每天 03:00 跑 snapshot（避开两次自爬时段 06:00/20:00 和镜像同步 :00/:30）
  @Cron('0 0 3 * * *')
  async runDailySnapshot() {
    if (this.configService.get<string>('MIRROR_SNAPSHOT_ENABLED') === 'false') {
      this.logger.log('MIRROR_SNAPSHOT_ENABLED=false, 跳过');
      return;
    }
    await this.snapshot();
    await this.purgeOld();
  }

  /** 实际写文件 */
  async snapshot(): Promise<{ file: string; count: number; sizeKb: number }> {
    this.ensureBackupDir();
    const camps = await this.mirrorService.listMirrorCamps(10000);
    const today = new Date().toISOString().slice(0, 10);
    const file = path.join(this.BACKUP_DIR, `${today}.json`);
    const payload = {
      snapshotAt: new Date().toISOString(),
      count: camps.length,
      records: camps,
    };
    fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
    const stat = fs.statSync(file);
    const sizeKb = Math.round(stat.size / 1024);
    this.logger.log(`[snapshot] 写入 ${file}: ${camps.length} 条, ${sizeKb} KB`);
    return { file, count: camps.length, sizeKb };
  }

  /** 清理 N 天前的旧快照 */
  async purgeOld(): Promise<{ purged: number }> {
    this.ensureBackupDir();
    const cutoff = Date.now() - this.RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const entries = fs.readdirSync(this.BACKUP_DIR);
    let purged = 0;
    for (const name of entries) {
      if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(name)) continue;
      const full = path.join(this.BACKUP_DIR, name);
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(full);
        purged++;
        this.logger.log(`[snapshot] purged ${name}`);
      }
    }
    return { purged };
  }

  /** admin 端点：查看现有快照 */
  listSnapshots() {
    this.ensureBackupDir();
    const entries = fs
      .readdirSync(this.BACKUP_DIR)
      .filter((n) => /^\d{4}-\d{2}-\d{2}\.json$/.test(n))
      .sort()
      .reverse();
    return entries.map((name) => {
      const full = path.join(this.BACKUP_DIR, name);
      const stat = fs.statSync(full);
      return {
        date: name.replace('.json', ''),
        sizeKb: Math.round(stat.size / 1024),
        mtime: stat.mtime,
      };
    });
  }

  /** admin 端点：综合健康度 = mirror sync + snapshot */
  getHealth() {
    const mirror = this.mirrorService.getHealth();
    const snapshots = this.listSnapshots();
    return {
      mirror,
      snapshots: {
        total: snapshots.length,
        latest: snapshots[0] || null,
      },
    };
  }

  private ensureBackupDir() {
    if (!fs.existsSync(this.BACKUP_DIR)) {
      fs.mkdirSync(this.BACKUP_DIR, { recursive: true });
    }
  }
}
