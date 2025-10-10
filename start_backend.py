#!/usr/bin/env python3
import os
import sys
import subprocess

print("🚀 Starting Backend...")

backend_dir = os.path.join(os.path.abspath(os.path.dirname(__file__)), "backend")
os.chdir(backend_dir)

subprocess.run(
    [
        sys.executable or "python",
        "-m",
        "uvicorn",
        "main:app",
        "--reload",
        "--host",
        "0.0.0.0",
        "--port",
        "8000",
    ]
)
