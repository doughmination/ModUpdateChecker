FROM node:25-alpine

WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies AND dotenvx globally
RUN npm i && npm install -g @dotenvx/dotenvx

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Make start script executable
RUN chmod +x start.sh

# Deploy commands and run the bot
CMD ["sh", "start.sh"]