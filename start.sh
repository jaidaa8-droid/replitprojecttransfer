#!/bin/bash
set -e

# Start Python FastAPI server on port 8000 (proxied from Vite on 5000)
PYTHON_PORT=8000 python server.py &
PYTHON_PID=$!

# Start Vite dev server on port 5000 (the only exposed port)
npx vite --host 0.0.0.0 --port 5000 &
VITE_PID=$!

# Wait for either process to exit
wait $PYTHON_PID $VITE_PID
