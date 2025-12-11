FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (including devDependencies for build)
RUN npm ci

# Copy source files and config
COPY src ./src
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build

# Debug: Show what was built
RUN echo "=== Build output ===" && \
    ls -la && \
    echo "=== dist directory ===" && \
    ls -la dist/ && \
    echo "=== Checking server.js ===" && \
    test -f dist/server.js && echo "✓ server.js exists" || (echo "✗ server.js NOT FOUND!" && exit 1)

# Production stage
FROM node:20-alpine AS runtime

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install production dependencies only
RUN npm ci --only=production

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Debug: Verify dist exists and server.js is present
RUN echo "=== Runtime: Checking dist ===" && \
    ls -la /app/ && \
    echo "=== dist contents ===" && \
    ls -la dist/ && \
    echo "=== Checking server.js ===" && \
    test -f dist/server.js && echo "✓ server.js exists in runtime" || (echo "✗ server.js NOT FOUND in runtime!" && exit 1)

# Copy public files
COPY public ./public

# Copy images directory
COPY images ./images

# Copy storage directory structure
COPY storage ./storage

# Create necessary directories
RUN mkdir -p storage/temp

# Expose port
EXPOSE 3000

# Start server
CMD ["npm", "start"]
