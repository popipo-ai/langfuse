# Langfuse ECS 部署与运维（popipo-ai fork）

本文档描述阿里云 ECS 上 Langfuse 自托管实例的目录、Compose 方案 A、日常运维与本次会话固化的规则。

**仓库远程**：`https://github.com/popipo-ai/langfuse`（非官方 `langfuse/langfuse`）。

---

## 1. 方案 A：Compose 叠加文件

生产环境**不要**直接改 `docker-compose.yml` 里 `langfuse-web` 的三行（`build` / `image: langfuse-web:custom` / `ports: 3000:3000`）。定制放在叠加文件 `docker-compose.prod.yml`。

| 环境 | COMPOSE_FILE | langfuse-web |
|------|----------------|--------------|
| 本地开发 | `docker-compose.yml`（默认） | 本地 `build` → `langfuse-web:custom`，端口 `3000` |
| ECS 生产 | `docker-compose.yml:docker-compose.prod.yml` | GHCR 拉取 `ghcr.io/popipo-ai/langfuse-web:custom`，`127.0.0.1:3001:3000`，`pull_policy: always`，无本地 build |

在 ECS 的 `.env` 或 shell 中设置：

```bash
export COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
```

也可写入 `/opt/langfuse/.env`（与 `.env.prod.example` 注释一致）。

### 1.1 `LANGFUSE_UI_CUSTOM_HEAD_TAGS`

生产 web 镜像通过该变量向页面 `<head>` 注入脚本（Session 页 Chat Preview 拦截 `blob:` 跳转）。内容与仓库根目录 `chat-preview-inject.js` 一致。

在 `/opt/langfuse/.env` 中设置（单行，注意引号转义）：

```bash
LANGFUSE_UI_CUSTOM_HEAD_TAGS='<script>(function(){'"'"'use strict'"'"';function isSessionPage(){return/\/project\/[^/]+\/sessions\/[^/]+/.test(location.pathname)&&!/\/chat-preview/.test(location.pathname)}function getSessionId(){var m=location.pathname.match(/\/sessions\/([^/?]+)/);return m?decodeURIComponent(m[1]):null}function getProjectId(){var m=location.pathname.match(/\/project\/([^/]+)/);return m?m[1]:null}function buildUrl(){var projectId=getProjectId(),sessionId=getSessionId();if(!projectId||!sessionId)return null;return'"'"'/chat-preview.html?projectId='"'"'+encodeURIComponent(projectId)+'"'"'&sessionId='"'"'+encodeURIComponent(sessionId)}var _origOpen=window.open;window.open=function(url){if(isSessionPage()&&typeof url==='"'"'string'"'"'&&url.indexOf('"'"'blob:'"'"')===0){var newUrl=buildUrl();if(newUrl){try{URL.revokeObjectURL(url)}catch(e){}return _origOpen.call(window,newUrl,'"'"'_blank'"'"')}}return _origOpen.apply(window,arguments)}})();</script>'
```

更新 `chat-preview-inject.js` 后同步修改 `.env` 并 `docker compose up -d langfuse-web`。

更完整的 Chat Preview / API Key 行为见 [fork-specs/0001-chat-preview-cross-project-auth-fix.md](../fork-specs/0001-chat-preview-cross-project-auth-fix.md)。

---

## 2. 路径与 anlop 分离

| 路径 | 用途 |
|------|------|
| `/opt/langfuse` | Langfuse Docker Compose、`.env`、数据卷 |
| `/opt/anlop` | anlop 应用（独立部署） |

anlop 上报 Langfuse 时使用：

```bash
LANGFUSE_HOST=https://langfuse.d5render.cn
```

（公网域名经 Nginx 反代到 `127.0.0.1:3001`。）

---

## 3. Git 更新流程（无需 stash 主 compose）

```bash
cd /opt/langfuse
export COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml

git fetch origin
git pull origin feat/dark-mode-reskin   # 或当前生产跟踪分支

# 仅更新 web（拉 GHCR，不本地 build）
docker compose pull langfuse-web
docker compose up -d langfuse-web

# 或一次性拉起全部（按变更选择）
docker compose up -d
```

**禁止**：为生产改 `docker-compose.yml` 里 web 的 build/ports 并 `git stash` 来回切换。冲突时只改 `docker-compose.prod.yml` 或 ECS `.env`。

---

## 4. 常用运维命令

### 4.1 仅重建 ClickHouse（应用配置或 TTL 变更）

```bash
cd /opt/langfuse
export COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
docker compose up -d --force-recreate clickhouse
```

`./clickhouse-config/system_log_ttl.xml` 为 `system.*` 日志表设置 **3 天 TTL**，并声明 `<listen_host>0.0.0.0</listen_host>`（挂载 `config.d` 覆盖默认配置时必须，见 §8.1）。主因是 system 日志撑盘，不是业务 `traces` 表。

### 4.2 一次性清空 system 日志表（应急腾盘）

```bash
docker exec -it langfuse-clickhouse-1 clickhouse-client --query "
TRUNCATE TABLE system.query_log;
TRUNCATE TABLE system.trace_log;
TRUNCATE TABLE system.text_log;
TRUNCATE TABLE system.metric_log;
TRUNCATE TABLE system.part_log;
"
```

容器名以 `docker compose ps` 为准。清空后依赖 TTL 防止再次撑满；`clickhouse` 服务已设 `mem_limit: 4g`。

### 4.3 热更新静态 `chat-preview.html`（无需重建镜像）

源文件路径：**`web/public/chat-preview.html`**（Next 以 `/chat-preview.html` 提供）。勿使用仓库根目录旧版（含 jsDelivr `marked` / Google Fonts，会被 `web/next.config.mjs` CSP 拦截导致页面空白）。

```bash
curl -sL "https://raw.githubusercontent.com/popipo-ai/langfuse/feat/dark-mode-reskin/web/public/chat-preview.html" \
  -o /tmp/chat-preview.html
docker cp /tmp/chat-preview.html langfuse-langfuse-web-1:/app/web/public/chat-preview.html

# 验证已部署 v3（无外部 script/font）
curl -sS http://127.0.0.1:3001/chat-preview.html | grep -E 'v3-csp-self|jsdelivr|googleapis|marked.min'
# 期望：匹配 v3-csp-self；不应匹配 jsdelivr / googleapis / marked.min
```

容器名以实际为准。镜像重建后需重做 `docker cp`。CSP 说明见 [fork-specs/0001-chat-preview-cross-project-auth-fix.md](../fork-specs/0001-chat-preview-cross-project-auth-fix.md)「修复四」。

### 4.4 内存诊断

```bash
docker stats --no-stream
docker compose ps
```

经验值：**Redis ~35MB 正常**；ClickHouse 占用高时优先查 `system.*` 表大小与 TTL，而非假设 `traces` 业务表失控。

---

## 5. 迁移到方案 A（三步）

在 ECS 上执行：

```bash
# 1) 进入目录并启用叠加 compose
cd /opt/langfuse
echo 'COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml' >> .env
set -a && source .env && set +a

# 2) 拉取代码与生产镜像（配置 LANGFUSE_UI_CUSTOM_HEAD_TAGS 见上文 §1.1）
git pull origin feat/dark-mode-reskin
docker compose pull langfuse-web

# 3) 用叠加配置启动 web（127.0.0.1:3001，无本地 build）
docker compose up -d langfuse-web
```

确认 Nginx upstream 指向 `127.0.0.1:3001`，且 `curl -sI http://127.0.0.1:3001` 正常。

---

## 6. 长期运维规则（会话固化）

### 6.1 Langfuse 项目与 API Key

- 实例上可有 **dev / prod 等多个 project**。
- **一套 API Key 只对应一个 project**；在 prod Session 用 dev key 会 404。
- 静态 `chat-preview.html` 的 localStorage 按 `projectId` 隔离：`lf-chat-preview-keys-{PROJECT_ID}`（见 fork-spec 0001）。

### 6.2 Trace sessionId 与 anlop

- Langfuse **trace / session 的 `sessionId`** = anlop 的 **`agentSessionId`**。
- **不是** anlop 的 loop project id。查 Session 列表时按 agent 会话 ID 过滤。

### 6.3 tool_args 与 Chat Preview

- **anlop**：tool 参数上报在 dev 分支修复（写入 trace output）。
- **Langfuse UI**：`ChatPreviewPage` / `web/public/chat-preview.html` 的 `extractToolArgs` 兼容 `tool_args`、`arguments`、`args` 等字段（commit `a89443480`）。

### 6.4 内存与 ClickHouse

- 磁盘/内存压力常见主因：**ClickHouse `system.*` 日志表**，不是业务 traces 大表。
- 缓解：`clickhouse-config` TTL + 必要时 TRUNCATE（§4.2）；`mem_limit: 4g` 已写在主 compose。

### 6.5 变更冲突原则

- **生产定制** → 仅 `docker-compose.prod.yml` + ECS `.env`。
- **禁止**为生产改主 `docker-compose.yml` 的 web 三行并提交或长期 stash。

### 6.6 生产 web 镜像

- ECS **不**在服务器上 `docker compose build langfuse-web`。
- 使用 **GHCR**：`ghcr.io/popipo-ai/langfuse-web:custom`，由 CI 构建推送。

---

## 7. 相关文件

| 文件 | 说明 |
|------|------|
| `docker-compose.yml` | Fork 默认；本地 build + 3000 |
| `docker-compose.prod.yml` | 生产叠加 |
| `clickhouse-config/system_log_ttl.xml` | system 表 3 天 TTL + `listen_host` |
| `chat-preview-inject.js` | HEAD 注入脚本源码 |
| `web/public/chat-preview.html` | 静态 Chat Preview |
| `fork-specs/0001-chat-preview-cross-project-auth-fix.md` | 跨项目鉴权说明 |

---

## 8. Troubleshooting

### 8.1 ClickHouse：web 连 9000 被拒（Connection refused）

**根因**：Compose 将 `./clickhouse-config` 挂载到 `/etc/clickhouse-server/config.d/` 时，会**覆盖/替换**官方镜像在 `config.d` 中自动生成的 `docker_related_config.xml`。该默认片段含 `<listen_host>::</listen_host>`，使 ClickHouse 监听所有网卡。挂载后目录内只剩自定义文件（如 `system_log_ttl.xml`）；若未再声明 `<listen_host>`，ClickHouse 回退为仅监听 `127.0.0.1`。

**症状**：

- 容器内 `clickhouse-client` 正常（走 localhost）
- `langfuse-web` 从 Docker 网络连 `clickhouse:9000`（如 `172.18.0.x:9000`）报 `Connection refused`
- web 在 ClickHouse migration 阶段 crash loop

**诊断**：

```bash
# 容器内 localhost 可连
docker exec -it langfuse-clickhouse-1 clickhouse-client --query "SELECT 1"

# 从 web 容器测 Docker 网络（需容器内有 nc；或直接看 web 日志）
docker exec -it langfuse-langfuse-web-1 bash -c "nc -zv clickhouse 9000" 2>&1 || true
docker compose logs langfuse-web --tail 50
```

**修复**：在 `clickhouse-config/system_log_ttl.xml`（或任意挂载进 `config.d` 的文件）的 `</clickhouse>` 前加入：

```xml
<listen_host>0.0.0.0</listen_host>
```

> **注意**：须用 `0.0.0.0`，**不要用 `::`**。阿里云 ECS 无 IPv6 时，`::` 会导致 ClickHouse 反复重启、healthcheck unhealthy（2026-05 生产故障）。

变更后重建 ClickHouse：

```bash
cd /opt/langfuse
export COMPOSE_FILE=docker-compose.yml:docker-compose.prod.yml
docker compose up -d --force-recreate clickhouse
```

确认 web 恢复：

```bash
docker compose ps
docker compose logs langfuse-web --tail 20
```
