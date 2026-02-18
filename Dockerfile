FROM node:current-slim

# Install OpenSSL and dependencies
RUN apt-get update -y && \
    apt-get install -y openssl libssl-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy dependency files first (for better cache)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Clean previous build
RUN rm -rf .next


# Build the app
RUN npm run build

# Expose ports
EXPOSE 7000


# Run migrations and start both processes
CMD ["sh", "-c", "npm start"]
