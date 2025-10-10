#!/usr/bin/env python3
import os
import subprocess

print("🚀 Starting Frontend...")

# Check dependencies
if not os.path.exists("frontend/node_modules"):
    print("❌ Dependencies not found! Run 'npm install' first.")
    exit(1)

# Start server
os.chdir("frontend")
subprocess.run(["npm", "start"])
