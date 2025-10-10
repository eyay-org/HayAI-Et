#!/usr/bin/env python3
import os
import subprocess
import sys

print("🚀 Starting Frontend...")

# Check dependencies
if not os.path.exists("frontend/node_modules"):
    print("❌ Dependencies not found! Run 'npm install' first.")
    exit(1)

# Start server
os.chdir("frontend")

# Use shell=True for Windows compatibility
if sys.platform == "win32":
    subprocess.run("npm start", shell=True)
else:
    subprocess.run(["npm", "start"])
