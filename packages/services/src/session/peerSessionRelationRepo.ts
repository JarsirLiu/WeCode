import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import {
  resolveWorkspaceKey,
  type PeerSessionCreation,
  type PeerSessionRelation,
} from "@zcode/shared";
import { getTasksIndexDatabasePath } from "#src/paths.js";
import { runTasksDatabaseMigrations } from "#src/session/tasksDatabase/migrations.js";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
type DatabaseSyncInstance = InstanceType<typeof DatabaseSync>;

/**
 * AI peer-session 创建关系的唯一持久化 owner。
 *
 * 它与 task index 共用同一数据库及迁移账本，但不把审批授权字段塞进 task meta：
 * task meta 是 UI 投影，关系账本则是后续授权与审计的事实来源。
 */
export class PeerSessionRelationRepo {
  constructor(private readonly startupDbPath?: string) {}

  private db: DatabaseSyncInstance | null = null;
  private initializePromise: Promise<void> | null = null;

  async recordCreatedSession(
    input: Omit<PeerSessionRelation, "workspaceKey" | "createdBy">,
  ): Promise<void> {
    await this.ensureReady();
    const workspaceKey = resolveWorkspaceKey(input);
    this.getDatabase()
      .prepare(
        `INSERT INTO peer_session_relations (
          workspace_key, target_session_id, creator_session_id, workspace_path,
          workspace_identity, remote_session_id, created_by, approval_policy, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'ai', ?, ?)
        ON CONFLICT(workspace_key, target_session_id) DO NOTHING`,
      )
      .run(
        workspaceKey,
        input.targetSessionId,
        input.creatorSessionId,
        input.workspacePath,
        input.workspaceIdentity ?? null,
        input.remoteSessionId ?? null,
        input.approvalPolicy,
        input.createdAt,
      );
  }

  async findCreatedSession(input: {
    workspacePath: string;
    workspaceIdentity?: string;
    targetSessionId: string;
  }): Promise<PeerSessionRelation | null> {
    await this.ensureReady();
    const row = this.getDatabase()
      .prepare(
        `SELECT workspace_key, target_session_id, creator_session_id, workspace_path,
          workspace_identity, remote_session_id, approval_policy, created_at
         FROM peer_session_relations WHERE workspace_key = ? AND target_session_id = ?`,
      )
      .get(resolveWorkspaceKey(input), input.targetSessionId) as
      | {
          workspace_key: string;
          target_session_id: string;
          creator_session_id: string;
          workspace_path: string;
          workspace_identity: string | null;
          remote_session_id: string | null;
          approval_policy: PeerSessionRelation["approvalPolicy"];
          created_at: number;
        }
      | undefined;
    if (!row) return null;
    return {
      workspaceKey: row.workspace_key,
      targetSessionId: row.target_session_id,
      creatorSessionId: row.creator_session_id,
      workspacePath: row.workspace_path,
      ...(row.workspace_identity ? { workspaceIdentity: row.workspace_identity } : {}),
      ...(row.remote_session_id ? { remoteSessionId: row.remote_session_id } : {}),
      createdBy: "ai",
      approvalPolicy: row.approval_policy,
      createdAt: row.created_at,
    };
  }

  close(): void {
    this.db?.close();
    this.db = null;
    this.initializePromise = null;
  }

  private async ensureReady(): Promise<void> {
    if (!this.initializePromise) this.initializePromise = this.initialize();
    await this.initializePromise;
  }

  private async initialize(): Promise<void> {
    const path = this.startupDbPath ?? getTasksIndexDatabasePath();
    await mkdir(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA synchronous = NORMAL");
    runTasksDatabaseMigrations(this.db);
  }

  private getDatabase(): DatabaseSyncInstance {
    if (!this.db) throw new Error("Peer session relation repository is not initialized");
    return this.db;
  }
}

/**
 * 创建关系写入是短事务：不在 task adapter 保留第二个 SQLite 连接或可变状态。
 * createTask 已先持久化 session/task；这里失败时调用方不会获得成功结果，目标会话仍按
 * 没有委托关系的默认 manual 语义保留给用户。
 */
export async function persistPeerSessionCreation(
  relation: PeerSessionCreation,
  task: Pick<
    PeerSessionRelation,
    "targetSessionId" | "workspacePath" | "workspaceIdentity" | "createdAt"
  >,
): Promise<void> {
  const repo = new PeerSessionRelationRepo();
  try {
    await repo.recordCreatedSession({
      ...relation,
      targetSessionId: task.targetSessionId,
      workspacePath: task.workspacePath,
      ...(task.workspaceIdentity ? { workspaceIdentity: task.workspaceIdentity } : {}),
      createdAt: task.createdAt,
    });
  } finally {
    repo.close();
  }
}
