"""Writing service — manages paper writing projects."""
import json
import shutil
import asyncio
import time
from datetime import datetime
from pathlib import Path

from config import get_base_dir

WRITING_SUFFIX = "_论文写作"
TEMPLATES_DIR = Path(__file__).resolve().parent.parent / "templates"


def get_project_path(name: str) -> Path:
    """Return the Path object for a writing project."""
    base_dir = get_base_dir()
    return base_dir / f"{name}{WRITING_SUFFIX}"


def list_projects() -> list[dict]:
    """Scan base_dir for writing project directories."""
    base_dir = get_base_dir()
    projects = []
    if not base_dir.exists():
        return projects
    for entry in sorted(base_dir.iterdir()):
        if entry.is_dir() and entry.name.endswith(WRITING_SUFFIX):
            project_name = entry.name[: -len(WRITING_SUFFIX)]
            meta = _read_meta(entry)
            stat = entry.stat()
            projects.append(
                {
                    "name": project_name,
                    "path": str(entry),
                    "created_at": meta.get("created_at", datetime.fromtimestamp(stat.st_ctime).isoformat()),
                    "updated_at": meta.get("updated_at", ""),
                    "main_file": meta.get("main_file", "main.tex"),
                    "compile_status": meta.get("compile_status", ""),
                }
            )
    return projects


def create_project(name: str, template: str = "default") -> dict:
    """Create a new writing project directory."""
    base_dir = get_base_dir()
    proj_dir = base_dir / f"{name}{WRITING_SUFFIX}"
    if proj_dir.exists():
        raise FileExistsError(f"写作项目 '{name}' 已存在")
    proj_dir.mkdir(parents=True)
    (proj_dir / "output").mkdir()

    # Copy template
    if template == "default":
        tpl = TEMPLATES_DIR / "default_paper.tex"
        if tpl.exists():
            shutil.copy2(tpl, proj_dir / "main.tex")
        else:
            (proj_dir / "main.tex").write_text(
                "\\documentclass{article}\n\\begin{document}\nHello\n\\end{document}\n",
                encoding="utf-8",
            )
    else:
        (proj_dir / "main.tex").write_text(
            "\\documentclass{article}\n\\begin{document}\n\n\\end{document}\n",
            encoding="utf-8",
        )

    now = datetime.now().isoformat()
    meta = {
        "name": name,
        "created_at": now,
        "updated_at": now,
        "main_file": "main.tex",
        "compile_status": "",
        "compile_log": "",
    }
    _write_meta(proj_dir, meta)

    return {
        "name": name,
        "path": str(proj_dir),
        "created_at": now,
        "updated_at": now,
        "main_file": "main.tex",
        "compile_status": "",
    }


def get_project(name: str) -> dict | None:
    """Get a specific writing project by name."""
    proj_dir = get_project_path(name)
    if not proj_dir.exists():
        return None
    meta = _read_meta(proj_dir)
    stat = proj_dir.stat()
    return {
        "name": name,
        "path": str(proj_dir),
        "created_at": meta.get("created_at", datetime.fromtimestamp(stat.st_ctime).isoformat()),
        "updated_at": meta.get("updated_at", ""),
        "main_file": meta.get("main_file", "main.tex"),
        "compile_status": meta.get("compile_status", ""),
        "compile_log": meta.get("compile_log", ""),
    }


def delete_project(name: str) -> bool:
    """Delete a writing project."""
    proj_dir = get_project_path(name)
    if not proj_dir.exists():
        return False
    shutil.rmtree(proj_dir)
    return True


def list_files(name: str) -> list[dict]:
    """List all files in a writing project."""
    proj_dir = get_project_path(name)
    if not proj_dir.exists():
        return []
    files = []
    for f in sorted(proj_dir.rglob("*")):
        if f.is_file() and f.name != "writing.json":
            rel = f.relative_to(proj_dir)
            files.append({
                "path": str(rel),
                "size": f.stat().st_size,
            })
    return files


def read_file(name: str, path: str) -> str:
    """Read a file from a writing project with path safety check."""
    proj_dir = get_project_path(name)
    target = (proj_dir / path).resolve()
    if not str(target).startswith(str(proj_dir.resolve())):
        raise ValueError("路径不合法")
    if not target.exists():
        raise FileNotFoundError(f"文件不存在: {path}")
    return target.read_text(encoding="utf-8")


def write_file(name: str, path: str, content: str) -> dict:
    """Write a file in a writing project with path safety check."""
    proj_dir = get_project_path(name)
    target = (proj_dir / path).resolve()
    if not str(target).startswith(str(proj_dir.resolve())):
        raise ValueError("路径不合法")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")
    # Update meta timestamp
    meta = _read_meta(proj_dir)
    meta["updated_at"] = datetime.now().isoformat()
    _write_meta(proj_dir, meta)
    return {"path": path, "size": len(content.encode("utf-8"))}


async def compile_latex(name: str) -> dict:
    """Compile main.tex with xelatex."""
    proj_dir = get_project_path(name)
    if not proj_dir.exists():
        raise FileNotFoundError(f"项目不存在: {name}")

    if not shutil.which("xelatex"):
        return {
            "success": False,
            "pdf_path": "",
            "log": "xelatex 未安装。请安装 texlive-xetex 和 texlive-lang-chinese。\n"
                   "Ubuntu/Debian: sudo apt install texlive-xetex texlive-lang-chinese",
            "duration_ms": 0,
        }

    meta = _read_meta(proj_dir)
    main_file = meta.get("main_file", "main.tex")
    output_dir = proj_dir / "output"
    output_dir.mkdir(exist_ok=True)

    start = time.time()
    log_text = ""

    # Run xelatex twice for cross-references
    for run_idx in range(2):
        try:
            proc = await asyncio.create_subprocess_exec(
                "xelatex",
                "-interaction=nonstopmode",
                "-halt-on-error",
                f"-output-directory={output_dir}",
                main_file,
                cwd=str(proj_dir),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.STDOUT,
            )
            stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=120)
            log_text = stdout.decode("utf-8", errors="replace")
            if proc.returncode != 0 and run_idx == 0:
                break
        except asyncio.TimeoutError:
            return {
                "success": False,
                "pdf_path": "",
                "log": "编译超时（120秒）",
                "duration_ms": int((time.time() - start) * 1000),
            }
        except Exception as e:
            return {
                "success": False,
                "pdf_path": "",
                "log": f"编译异常: {str(e)}",
                "duration_ms": int((time.time() - start) * 1000),
            }

    duration = int((time.time() - start) * 1000)
    pdf_name = Path(main_file).stem + ".pdf"
    pdf_path = output_dir / pdf_name
    success = pdf_path.exists()

    # Update meta
    meta["compile_status"] = "success" if success else "error"
    meta["compile_log"] = log_text[-5000:] if log_text else ""
    meta["updated_at"] = datetime.now().isoformat()
    _write_meta(proj_dir, meta)

    return {
        "success": success,
        "pdf_path": f"output/{pdf_name}" if success else "",
        "log": log_text[-5000:] if log_text else "",
        "duration_ms": duration,
    }


def _read_meta(proj_dir: Path) -> dict:
    meta_file = proj_dir / "writing.json"
    if meta_file.exists():
        try:
            return json.loads(meta_file.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, KeyError):
            pass
    return {}


def _write_meta(proj_dir: Path, meta: dict):
    meta_file = proj_dir / "writing.json"
    meta_file.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
