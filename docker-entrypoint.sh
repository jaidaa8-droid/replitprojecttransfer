#!/bin/sh
set -e

echo "Running database migrations..."
npm run db:push
echo "Migrations complete."

echo "Starting server..."
exec node dist/index.cjs
