"""Application configuration."""
import json
import os
import shutil
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent.parent
CONFIG_PATH = APP_DIR / "config.json"
CONFIG_EXAMPLE_PATH = APP_DIR / "config.json.example"

# Fallback: parent of the app directory
_DEFAULT_BASE_DIR = str(Path(__file__).resolve().parent.parent.parent)

DEFAULT_NOTE_TEMPLATE = """# {{title}}

> **作者**: {{authors}}
> **年份**: {{year}}
> **期刊/会议**: {{journal}}

---

## 1. 论文基本信息

| 项目 | 内容 |
|------|------|
| 标题(中) | {{title_zh}} |
| 标题(英) | {{title_en}} |
| 作者 | {{authors}} |
| 年份 | {{year}} |
| 期刊/会议 | {{journal}} |
| DOI | {{doi}} |
| 关键词 | {{keywords}} |

## 2. 研究背景与动机

（待填写）

## 3. 核心方法与技术路线

（待填写）

## 4. 实验设计与结果

（待填写）

## 5. 创新点与贡献

（待填写）

## 6. 局限性与未来工作

（待填写）

## 7. 个人评价与笔记

（待填写）
"""

DEFAULT_CONFIG = {
    "base_dir": "",
    "llm_providers": [],
    "ui_preferences": {"language": "zh-CN", "theme": "light"},
    "note_template": "",
}


def _ensure_config():
    """If config.json does not exist, create from example or defaults."""
    if not CONFIG_PATH.exists():
        if CONFIG_EXAMPLE_PATH.exists():
            shutil.copy2(CONFIG_EXAMPLE_PATH, CONFIG_PATH)
        else:
            save_config(DEFAULT_CONFIG.copy())


def load_config() -> dict:
    _ensure_config()
    if CONFIG_PATH.exists():
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            config = json.load(f)
        # Auto-fill missing keys from DEFAULT_CONFIG (handles upgrades)
        updated = False
        for key, default_val in DEFAULT_CONFIG.items():
            if key not in config:
                config[key] = default_val
                updated = True
        if updated:
            save_config(config)
        return config
    return DEFAULT_CONFIG.copy()


def save_config(config: dict):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(config, f, ensure_ascii=False, indent=2)


def get_base_dir() -> Path:
    """Return the workspace root directory.

    Priority: config.json > LR_BASE_DIR env var > app parent directory.
    """
    config = load_config()
    configured = config.get("base_dir", "").strip()
    if configured:
        return Path(configured)
    env = os.environ.get("LR_BASE_DIR", "").strip()
    if env:
        return Path(env)
    return Path(_DEFAULT_BASE_DIR)
