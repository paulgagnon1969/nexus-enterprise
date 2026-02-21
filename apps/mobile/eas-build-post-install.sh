#!/bin/bash
# EAS Build post-install hook
# Build workspace dependencies that the mobile app needs
# (We skip root postinstall via --ignore-scripts to avoid prisma/argon2 issues)

echo ">>> Building @repo/types for mobile..."
npm --workspace @repo/types run build
