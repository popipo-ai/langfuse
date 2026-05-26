# Chat Preview 跨项目鉴权缓存修复

## 背景

Langfuse 自托管实例中，自定义 Chat Preview 功能存在两个入口：

1. **静态 HTML 页面**（`/chat-preview.html`）：使用 Public API + Basic 认证，需要用户手动输入 API Key
2. **React 路由**（`/project/{pid}/sessions/{sid}/chat-preview`）：使用 tRPC + Cookie 认证，登录即可访问

当前部署中，Session 页面的 Chat Preview 按钮通过 Nginx 注入的 `chat-preview-inject.js` 脚本拦截 `window.open` blob URL，重定向到静态 HTML 页面。该页面将用户输入的 API Key 缓存到 `localStorage`。

## 问题

### 现象

在 prod 项目的 Session 页面点击 Chat Preview，弹出 "Could not fetch trace details" 错误。dev 项目正常。

### 根因

1. **localStorage Key 无项目隔离**：静态页面用固定 key `lf-chat-preview-keys` 缓存 API Key，用户在 dev 项目首次输入 dev key 后，切到 prod 项目时复用了 dev key，导致 Public API 返回 404（trace 不属于该 key 对应的项目）
2. **404 未触发重新鉴权**：代码只处理了 401/403，404 时不清缓存也不重新提示，用户无法察觉 key 不匹配

### 排查过程

1. 确认 Langfuse SDK 版本一致（dev/prod 均为 4.5.1）
2. 确认 ClickHouse 中 prod traces 数据完整、project_id 正确
3. 确认 PostgreSQL `api_keys` 表中 public_key 与 project_id 映射正确
4. 服务端直接 curl 返回 HTTP 200，证明 Langfuse 服务端无问题
5. 检查浏览器 Network 面板中 `Authorization` header，Base64 解码后发现使用的是 **dev 项目的 API Key**

## 技术方案

### 修复一：localStorage Key 按项目隔离（chat-preview.html）

```javascript
// 旧：全局共享
var SKEY = 'lf-chat-preview-keys';

// 新：按 PROJECT_ID 隔离
var SKEY = 'lf-chat-preview-keys-' + PROJECT_ID;
```

### 修复二：404 错误触发重新鉴权（chat-preview.html）

在 `showAuth` 验证回调和 `startApp` 数据拉取中增加 404 处理：

```javascript
// showAuth 中
if (r.status === 404) {
  showAuth('Session not found — key may belong to a different project');
  return;
}

// startApp 中
if (r.status === 404) {
  localStorage.removeItem(SKEY);
  showAuth('Session not found — API key may belong to a different project');
  throw new Error('auth');
}
```

### 修复三：绕过 Basic 认证，直接使用 React 路由（_temp_chunk.js）

修改 Nginx 注入脚本编译后的 `openChatPreview()` 函数，不再调用 Public API + Basic 认证，而是直接跳转到已有的 React 页面路由：

```javascript
// 旧：调用 Public API，需要 API Key
async function openChatPreview() {
  // ... prompt for keys, fetch via Basic auth, build blob ...
}

// 新：直接打开 React 路由（Cookie 认证，登录即可）
function openChatPreview() {
  var sessionId = getSessionId();
  var projectId = getProjectId();
  window.open(
    '/project/' + projectId + '/sessions/' +
    encodeURIComponent(sessionId) + '/chat-preview',
    '_blank'
  );
}
```

## 变更清单

| 文件 | 类型 | 改动 |
| --- | --- | --- |
| `web/public/chat-preview.html` | 修改 | localStorage key 加 PROJECT_ID 后缀；showAuth 和 startApp 增加 404 处理 |
| `_temp_chunk.js` | 新增 | openChatPreview() 改为打开 React 路由 |

## 部署步骤

由于 Langfuse Docker 镜像无法本地构建（详见 SKILL.md 9.1），采用 `docker cp` 热更新：

```bash
# 1. 在服务器上下载最新文件
curl -sL "https://ghfast.top/https://raw.githubusercontent.com/popipo-ai/langfuse/feat/dark-mode-reskin/web/public/chat-preview.html" \
  -o /tmp/chat-preview.html
curl -sL "https://ghfast.top/https://raw.githubusercontent.com/popipo-ai/langfuse/feat/dark-mode-reskin/_temp_chunk.js" \
  -o /tmp/_temp_chunk.js

# 2. 复制进容器
docker cp /tmp/chat-preview.html langfuse-langfuse-web-1:/app/web/public/chat-preview.html

# 3. 找到 _temp_chunk.js 对应的编译产物路径并替换
#    具体路径需在容器内确认：
#    docker exec langfuse-langfuse-web-1 find /app -name "*.js" | head -20
#    替换对应的 chunk 文件

# 4. 验证：打开 prod 项目 Session → Chat Preview，应直接在新标签页显示对话
```

### 修复四：静态页遵守 Next.js CSP（`web/public/chat-preview.html` v3）

Langfuse 在 `web/next.config.mjs` 为全站设置 CSP：`script-src` / `font-src` 仅允许 `'self'`（无 jsDelivr、无 Google Fonts）。

旧版静态页在 `<head>` 中加载：

- `https://cdn.jsdelivr.net/npm/marked/marked.min.js` → 被 CSP 拦截，`marked` 未定义，后续渲染脚本报错，**会话数据无法展示**
- `https://fonts.googleapis.com/...` → 被 `font-src 'self'` 拦截

**v3 做法（不放宽 CSP）：**

- Markdown 使用页面内联 `renderMd()`，不依赖 marked
- 字体使用系统栈（`-apple-system`, `Segoe UI` 等），不请求外部字体
- 数据拉取（`/api/public/sessions`、`/api/public/traces`）在同页内联脚本中，与外部 CDN 无关

**部署后验证：**

```bash
curl -sS http://127.0.0.1:3001/chat-preview.html | grep -E 'v3-csp-self|jsdelivr|googleapis|marked.min'
# 应看到 v3-csp-self，且不应出现 jsdelivr / googleapis / marked.min
```

浏览器控制台应出现：`[chat-preview] v3-csp-self init`。

Widget iframe 的 `srcdoc` 内嵌 CSP 仅作用于沙箱 iframe，不影响主文档；勿将仓库根目录的旧 `chat-preview.html`（含 CDN）复制到容器。

## 已知限制

- `_temp_chunk.js` 是对编译产物的手动 patch，下次重建镜像后需重新应用或确认源码已包含此修复
- `chat-preview.html` 的 localStorage 修复仍保留，作为直接访问静态页面时的降级方案
- 容器重建后两个文件均需重新 `docker cp`（非持久化）
- GHCR 镜像若未重建，生产可能仍为旧静态页，需按 §部署步骤热更新 `web/public/chat-preview.html`

## 后续优化

- 修复 GitHub Actions 构建流程，从源码构建镜像后 `openChatPreview()` 将自动使用 React 路由，无需手动 patch
- 考虑将 `chat-preview.html` 和 `chat-preview-inject.js` 通过 Dockerfile COPY 指令固化到镜像中
