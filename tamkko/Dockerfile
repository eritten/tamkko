FROM node:20-alpine

# Create non-root user early
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app

# Install all dependencies (devDeps needed for TypeScript build)
COPY package.json package-lock.json ./
RUN npm ci

# Copy source and compile
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Drop devDependencies and source to keep image lean
RUN npm prune --production && rm -rf src/ tsconfig.json

# Hand ownership to non-root user and switch
RUN chown -R app:app /app
USER app

EXPOSE 5000

CMD ["node", "dist/index.js"]
