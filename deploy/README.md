# comics-crawler 部署说明

## 1. 前置条件

| 项目 | 要求 |
| --- | --- |
| Bun | `bun >= 1.x`；仓库当前通过 `.mise.toml` 固定为 `1.3.14`。 |
| 容器运行时 | 推荐 `podman 5.x` + `podman compose`；也可用 Docker / Docker Compose。 |
| 远端机器 | Linux + systemd；示例远端为 `colin@192.168.10.25`。 |
| 配置文件 | 首次部署先执行 `cp .env.example .env`，再按生产路径调整 `DB_FILE_NAME`、`MCP_PORT` 和 crawler 限流参数。 |

镜像固定使用 `comics-crawler:dev`，不要用 `latest` 标签。

## 2. 本地起一次（前台）

先构建镜像：

```bash
podman build -t comics-crawler:dev .
```

跑一次 crawler（前台输出日志，不 daemonize）：

```bash
podman compose up crawler
```

如果只是做容器 smoke test、不想访问目标站，可以改跑 probe 脚本并跳过网络：

```bash
PRODUCTION_CRAWLER_SCRIPT=production:probe \
PRODUCTION_CRAWLER_SKIP_NETWORK=true \
PRODUCTION_CRAWLER_SKIP_BROWSER_INSTALL=true \
podman compose up crawler
```

成功后摘要会写到容器数据卷内的 `/app/data/last-production-summary.json`。

## 3. 后台跑

后台启动 crawler：

```bash
podman compose up -d crawler
```

查看日志：

```bash
podman compose logs -f crawler
```

启动 MCP HTTP 服务：

```bash
podman compose up -d mcp-server
curl http://localhost:${MCP_PORT:-3000}/health
```

## 4. 停止

停止并移除 compose 容器（不会删除命名卷数据）：

```bash
podman compose down
```

如需只停单个服务：

```bash
podman compose stop crawler
podman compose stop mcp-server
```

## 5. 升级

拉取新代码、无缓存重建镜像、再重启服务：

```bash
git pull && podman compose build --no-cache && podman compose up -d
```

如果远端使用 systemd timer，升级后无需改 unit；确认 timer 仍启用即可：

```bash
systemctl list-timers comics-crawler.timer
```

## 6. 数据与备份

Compose 使用命名卷：

| 卷 | 容器路径 | 用途 |
| --- | --- | --- |
| `comics-data` | `/app/data` | SQLite、备份、`last-production-summary.json`。 |
| `comics-storage` | `/app/storage` | Crawlee 运行时存储。 |
| `comics-logs` | `/app/logs` | production runner 日志目录。 |

查看 `comics-data` 在宿主机上的真实路径：

```bash
podman volume inspect comics-data --format '{{ .Mountpoint }}'
```

把 SQLite 拷出来：

```bash
mkdir -p ./data-export
podman run --rm -v comics-data:/data:ro -v "$PWD/data-export:/out" alpine \
  sh -c 'cp -a /data/comics.sqlite* /out/ 2>/dev/null || true'
```

手动跑一次备份 sidecar：

```bash
podman compose --profile backup up backup
```

清理旧备份 / 旧 SQLite 派生文件前先停止服务并确认已有备份：

```bash
podman compose stop crawler mcp-server
MOUNT=$(podman volume inspect comics-data --format '{{ .Mountpoint }}')
sudo find "$MOUNT/backups" -type f -mtime +30 -delete
sudo find "$MOUNT" -maxdepth 1 -name 'comics.sqlite-*' -mtime +7 -delete
```

production runner 也会按环境变量 `PRODUCTION_CRAWLER_KEEP_BACKUP_DAYS`、`PRODUCTION_CRAWLER_KEEP_STORAGE_DAYS` 和 `PRODUCTION_CRAWLER_KEEP_LOG_DAYS` 清理旧产物。

## 7. systemd 启用（远端）

`deploy/systemd/comics-crawler.service` 是 `Type=oneshot`，`deploy/systemd/comics-crawler.timer` 默认每天 03:00 触发，并带 15 分钟随机延迟。调整频率时只改 timer 的 `OnCalendar`。

复制并启用 unit：

```bash
scp deploy/systemd/* colin@192.168.10.25:/tmp/comics-deploy/ && \
ssh colin@192.168.10.25 'sudo cp /tmp/comics-deploy/*.service /tmp/comics-deploy/*.timer /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now comics-crawler.timer'
```

远端目录约定：

```bash
sudo mkdir -p /opt/comics-crawler
sudo chown -R colin:colin /opt/comics-crawler
cd /opt/comics-crawler
git pull
cp .env.example .env
bun install --frozen-lockfile
```

手动跑一次 service：

```bash
sudo systemctl start comics-crawler.service
```

## 8. 故障排查

查看 systemd 最近日志：

```bash
journalctl -u comics-crawler.service -n 200 --no-pager
journalctl -u comics-crawler.timer -n 200 --no-pager
```

查看容器日志：

```bash
podman compose logs --tail=200 crawler
podman compose logs --tail=200 mcp-server
```

常见检查：

```bash
podman ps -a
podman images | grep comics-crawler
podman volume inspect comics-data
curl -v http://localhost:${MCP_PORT:-3000}/health
```

如 crawler 卡住，先确认锁文件是否来自仍在运行的进程：`/app/data/crawler-production.lock`（容器内）或 `PRODUCTION_CRAWLER_LOCK_FILE` 指向的位置（systemd）。

## 9. 生产 cron 频率建议

默认频率在 `/deploy/systemd/comics-crawler.timer`：

```ini
OnCalendar=*-*-* 03:00:00
RandomizedDelaySec=900
Persistent=true
```

建议生产保持每天凌晨一次；如果目标站限流或远端资源紧张，优先增大 `RandomizedDelaySec` 或改成隔天运行，而不是提高并发。
