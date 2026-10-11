import nbformat
from nbclient import NotebookClient
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent
path = project_root / "notebooks" / "Bad Debt.ipynb"
nb = nbformat.read(path, as_version=4)
client = NotebookClient(nb, timeout=600)
client.execute(cwd=project_root)
nbformat.write(nb, path)
print("EXECUTED")
