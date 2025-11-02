# Use Node.js 18 LTS on Alpine for small image size
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files first (for caching)
COPY package*.json ./

# Install all dependencies (including devDeps for build)
RUN npm ci

# Copy rest of the source code
COPY . .

# Build TypeScript using npx to ensure local tsc is used
RUN npx tsc

# ---------------------------
# Production image
# ---------------------------
FROM node:18-alpine AS runner

# Set working directory
WORKDIR /app

# Copy only built files and production deps
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

# Expose app port
EXPOSE 3000

# Start the production server
CMD ["node", "dist/index.js"]
