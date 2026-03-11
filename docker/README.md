# Docker 测试环境（M3 / Linux）

用途：快速进入 Ubuntu 22.04 / Debian 12 的 shell，做脚本/依赖探测的基础验证。

> 注意：容器里通常没有 systemd，`install-service-linux.sh` 无法完整验证是预期行为。

## 使用方式

在仓库根目录执行：

```bash
docker compose -f docker/compose.yml build

# 进入 Ubuntu 22.04
docker compose -f docker/compose.yml run --rm ubuntu22 bash

# 进入 Debian 12
docker compose -f docker/compose.yml run --rm debian12 bash
```

进入容器后：

```bash
ls -la /opt/openclaw/scripts
bash -n /opt/openclaw/scripts/install-linux.sh
bash -n /opt/openclaw/scripts/install-service-linux.sh
```

